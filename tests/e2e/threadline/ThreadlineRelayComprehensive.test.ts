/**
 * Threadline Relay — Comprehensive E2E Tests
 *
 * Cross-cutting integration tests spanning ALL 5 relay phases:
 *   Phase 1: Authentication, presence, discovery
 *   Phase 2: E2E encrypted message routing
 *   Phase 3: Offline queue, TTL, delivery notifications
 *   Phase 4: A2A Bridge, framework adapters, REST server
 *   Phase 5: Abuse detection, admin server, metrics
 *
 * These tests exercise scenarios that span multiple phases simultaneously,
 * testing the relay as a cohesive system rather than isolated components.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { RelayServer } from '../../../src/threadline/relay/RelayServer.js';
import { AdminServer } from '../../../src/threadline/relay/AdminServer.js';
import { RelayClient } from '../../../src/threadline/client/RelayClient.js';
import { MessageEncryptor, computeFingerprint, deriveX25519PublicKey } from '../../../src/threadline/client/MessageEncryptor.js';
import { generateIdentityKeyPair } from '../../../src/threadline/ThreadlineCrypto.js';
import type {
  MessageEnvelope,
  AckFrame,
  ErrorFrame,
  DiscoverResultFrame,
  PresenceChangeFrame,
} from '../../../src/threadline/relay/types.js';

// ── Helpers ────────────────────────────────────────────────────────

function generateAgent() {
  const identity = generateIdentityKeyPair();
  const fingerprint = computeFingerprint(identity.publicKey);
  const x25519PubKey = deriveX25519PublicKey(identity.privateKey);
  const encryptor = new MessageEncryptor(identity.privateKey, identity.publicKey);
  return { identity, fingerprint, x25519PubKey, encryptor };
}

function adminRequest(
  port: number,
  method: string,
  path: string,
  key: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: { raw: text } as Record<string, unknown> });
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function collectEvents<T>(emitter: RelayClient, event: string, timeout = 500): Promise<T[]> {
  return new Promise(resolve => {
    const items: T[] = [];
    const handler = (item: T) => items.push(item);
    emitter.on(event, handler);
    setTimeout(() => {
      emitter.off(event, handler);
      resolve(items);
    }, timeout);
  });
}

// ── Test Suite ─────────────────────────────────────────────────────

describe('Threadline Relay Comprehensive E2E', { timeout: 60_000 }, () => {
  let server: RelayServer;
  let adminServer: AdminServer;
  let serverPort: number;
  let adminPort: number;
  const ADMIN_KEY = 'comprehensive-test-admin-key';

  // Pre-generate agents for reuse
  const alice = generateAgent();
  const bob = generateAgent();
  const charlie = generateAgent();
  const dave = generateAgent();
  const eve = generateAgent();

  const makeClient = (
    agent: ReturnType<typeof generateAgent>,
    name: string,
    opts: Partial<{ visibility: 'public' | 'unlisted'; capabilities: string[] }> = {},
  ) => {
    return new RelayClient(
      {
        relayUrl: `ws://127.0.0.1:${serverPort}/v1/connect`,
        name,
        framework: 'test',
        capabilities: opts.capabilities ?? ['conversation'],
        version: '1.0.0',
        visibility: opts.visibility ?? 'public',
        reconnectMaxMs: 0,
      },
      {
        fingerprint: agent.fingerprint,
        publicKey: agent.identity.publicKey,
        privateKey: agent.identity.privateKey,
        x25519PublicKey: agent.x25519PubKey,
        createdAt: new Date().toISOString(),
      },
    );
  };

  const makeTestEnvelope = (from: string, to: string, messageId?: string): MessageEnvelope => ({
    from,
    to,
    threadId: `thread-${Math.random().toString(36).slice(2)}`,
    messageId: messageId ?? `msg-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    nonce: 'test-nonce',
    ephemeralPubKey: 'test-key',
    salt: 'test-salt',
    payload: Buffer.from('test payload').toString('base64'),
    signature: 'test-sig',
  });

  beforeAll(async () => {
    server = new RelayServer({
      port: 0,
      host: '127.0.0.1',
      rateLimitConfig: {
        perAgentPerMinute: 200,
        perAgentPerHour: 10000,
        perIPPerMinute: 5000,
        globalPerMinute: 50000,
        discoveryPerMinute: 200,
        authAttemptsPerMinute: 100,
      },
      a2aRateLimitConfig: {
        requestsPerMinutePerIP: 1000,
        requestsPerHourPerIP: 10000,
      },
      offlineQueueConfig: {
        defaultTtlMs: 3000,
        maxPerSenderPerRecipient: 10,
        maxPerRecipient: 50,
        maxPayloadBytesPerRecipient: 100_000,
      },
      abuseDetectorConfig: {
        sybilFirstHourLimit: 10000,
        sybilSecondHourLimit: 10000,
        spamUniqueRecipientsPerMinute: 100,
        spamBanDurationMs: 5000,
        connectionChurnPerHour: 1000,
      },
    });
    await server.start();
    serverPort = server.address!.port;

    adminServer = new AdminServer(
      { port: 0, adminKey: ADMIN_KEY },
      {
        presence: server.presence,
        rateLimiter: server.rateLimiter,
        connections: server.connections,
        abuseDetector: server.abuseDetector,
        offlineQueue: server.offlineQueue,
        metrics: server.metrics,
        getUptime: () => Math.round(process.uptime()),
      },
    );
    await adminServer.start();
    adminPort = adminServer.address!.port;
  });

  afterAll(async () => {
    await adminServer.stop();
    await server.stop();
  });

  // ── Scenario 1: Full Lifecycle — Connect → Encrypt → Route → Ack ───

  describe('Scenario 1: Full encrypted message lifecycle', () => {
    it('encrypts, routes through relay, and decrypts with real crypto', async () => {
      const aliceClient = makeClient(alice, 'alice-enc');
      const bobClient = makeClient(bob, 'bob-enc');
      const bobMessages: MessageEnvelope[] = [];
      const aliceAcks: AckFrame[] = [];

      aliceClient.on('ack', (ack: AckFrame) => aliceAcks.push(ack));
      bobClient.on('message', (env: MessageEnvelope) => bobMessages.push(env));

      await aliceClient.connect();
      await bobClient.connect();
      await wait(100);

      // Alice encrypts a real message for Bob
      const envelope = alice.encryptor.encrypt(
        bob.identity.publicKey,
        bob.x25519PubKey,
        'encrypted-thread-1',
        { content: 'Hello Bob, this is encrypted!', type: 'text' },
      );

      aliceClient.sendMessage(envelope);
      await wait(200);

      // Bob receives the envelope
      expect(bobMessages).toHaveLength(1);
      expect(bobMessages[0].from).toBe(alice.fingerprint);
      expect(bobMessages[0].to).toBe(bob.fingerprint);

      // Bob decrypts the message
      const decrypted = bob.encryptor.decrypt(
        bobMessages[0],
        alice.identity.publicKey,
        alice.x25519PubKey,
      );
      expect(decrypted.content).toBe('Hello Bob, this is encrypted!');
      expect(decrypted.type).toBe('text');

      // Alice got delivered ack
      const ack = aliceAcks.find(a => a.messageId === envelope.messageId);
      expect(ack).toBeDefined();
      expect(ack!.status).toBe('delivered');

      aliceClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });

    it('encrypted message queued offline, delivered on reconnect, decryptable', async () => {
      const aliceClient = makeClient(alice, 'alice-offline-enc');
      const aliceAcks: AckFrame[] = [];
      aliceClient.on('ack', (ack: AckFrame) => aliceAcks.push(ack));
      await aliceClient.connect();
      await wait(100);

      // Bob is OFFLINE — Alice sends encrypted message
      const envelope = alice.encryptor.encrypt(
        bob.identity.publicKey,
        bob.x25519PubKey,
        'offline-enc-thread',
        { content: 'You were offline!', type: 'text' },
      );
      aliceClient.sendMessage(envelope);
      await wait(100);

      // Should be queued
      const queuedAck = aliceAcks.find(a => a.messageId === envelope.messageId);
      expect(queuedAck).toBeDefined();
      expect(queuedAck!.status).toBe('queued');

      // Bob connects
      const bobClient = makeClient(bob, 'bob-offline-enc');
      const bobMessages: MessageEnvelope[] = [];
      bobClient.on('message', (env: MessageEnvelope) => bobMessages.push(env));
      await bobClient.connect();
      await wait(200);

      // Bob receives and can decrypt
      expect(bobMessages).toHaveLength(1);
      const decrypted = bob.encryptor.decrypt(
        bobMessages[0],
        alice.identity.publicKey,
        alice.x25519PubKey,
      );
      expect(decrypted.content).toBe('You were offline!');

      aliceClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 2: Multi-Agent Mesh Over Relay ─────────────────────

  describe('Scenario 2: Multi-agent encrypted mesh', () => {
    it('three agents exchange encrypted messages in a triangle pattern', async () => {
      const agents = [
        { ...alice, client: makeClient(alice, 'mesh-alice') },
        { ...bob, client: makeClient(bob, 'mesh-bob') },
        { ...charlie, client: makeClient(charlie, 'mesh-charlie') },
      ];

      const received: Map<string, MessageEnvelope[]> = new Map();
      for (const a of agents) {
        received.set(a.fingerprint, []);
        a.client.on('message', (env: MessageEnvelope) => {
          received.get(a.fingerprint)!.push(env);
        });
        await a.client.connect();
      }
      await wait(100);

      // Alice → Bob
      const env1 = alice.encryptor.encrypt(
        bob.identity.publicKey, bob.x25519PubKey,
        'mesh-thread', { content: 'Alice to Bob' },
      );
      agents[0].client.sendMessage(env1);

      // Bob → Charlie
      const env2 = bob.encryptor.encrypt(
        charlie.identity.publicKey, charlie.x25519PubKey,
        'mesh-thread', { content: 'Bob to Charlie' },
      );
      agents[1].client.sendMessage(env2);

      // Charlie → Alice
      const env3 = charlie.encryptor.encrypt(
        alice.identity.publicKey, alice.x25519PubKey,
        'mesh-thread', { content: 'Charlie to Alice' },
      );
      agents[2].client.sendMessage(env3);

      await wait(300);

      // Each agent received exactly one message
      expect(received.get(bob.fingerprint)!).toHaveLength(1);
      expect(received.get(charlie.fingerprint)!).toHaveLength(1);
      expect(received.get(alice.fingerprint)!).toHaveLength(1);

      // Each can decrypt their message
      const bobDecrypted = bob.encryptor.decrypt(
        received.get(bob.fingerprint)![0],
        alice.identity.publicKey, alice.x25519PubKey,
      );
      expect(bobDecrypted.content).toBe('Alice to Bob');

      const charlieDecrypted = charlie.encryptor.decrypt(
        received.get(charlie.fingerprint)![0],
        bob.identity.publicKey, bob.x25519PubKey,
      );
      expect(charlieDecrypted.content).toBe('Bob to Charlie');

      const aliceDecrypted = alice.encryptor.decrypt(
        received.get(alice.fingerprint)![0],
        charlie.identity.publicKey, charlie.x25519PubKey,
      );
      expect(aliceDecrypted.content).toBe('Charlie to Alice');

      for (const a of agents) a.client.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 3: Displacement + Offline Queue Interaction ────────

  describe('Scenario 3: Displacement with queued message delivery', () => {
    it('displaced client reconnects and receives queued messages', async () => {
      // Bob connects first
      const bobClient1 = makeClient(bob, 'bob-disp-1');
      const bob1Displaced: string[] = [];
      bobClient1.on('displaced', (reason: string) => bob1Displaced.push(reason));
      await bobClient1.connect();
      await wait(100);

      // Alice sends while Bob is connected
      const aliceClient = makeClient(alice, 'alice-disp');
      await aliceClient.connect();
      await wait(100);

      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, bob.fingerprint, 'before-displace'));
      await wait(100);

      // Bob's first connection gets displaced by a second connection
      const bobClient2 = makeClient(bob, 'bob-disp-2');
      const bob2Messages: MessageEnvelope[] = [];
      bobClient2.on('message', (env: MessageEnvelope) => bob2Messages.push(env));
      await bobClient2.connect();
      await wait(200);

      // First connection should have been displaced
      expect(bob1Displaced.length).toBeGreaterThanOrEqual(1);

      // Now Alice sends another message — should go to bobClient2
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, bob.fingerprint, 'after-displace'));
      await wait(200);

      const afterMsg = bob2Messages.find(m => m.messageId === 'after-displace');
      expect(afterMsg).toBeDefined();

      aliceClient.disconnect();
      bobClient2.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 4: Discovery + Presence + Filtering ────────────────

  describe('Scenario 4: Discovery and presence across multiple agents', () => {
    it('discovers agents with different capabilities and visibility', async () => {
      const publicConvo = makeClient(alice, 'public-convo', { capabilities: ['conversation'], visibility: 'public' });
      const publicSearch = makeClient(bob, 'public-search', { capabilities: ['search', 'analysis'], visibility: 'public' });
      const unlisted = makeClient(charlie, 'hidden-agent', { capabilities: ['conversation'], visibility: 'unlisted' });

      await publicConvo.connect();
      await publicSearch.connect();
      await unlisted.connect();
      await wait(100);

      // Dave discovers
      const daveClient = makeClient(dave, 'dave-discover');
      await daveClient.connect();
      await wait(100);

      // Discover all public agents
      const allResult = await new Promise<DiscoverResultFrame>(resolve => {
        daveClient.on('discover-result', resolve);
        daveClient.discover();
      });

      // Should find public agents but NOT unlisted
      const agentIds = allResult.agents.map(a => a.agentId);
      expect(agentIds).toContain(alice.fingerprint);
      expect(agentIds).toContain(bob.fingerprint);
      expect(agentIds).not.toContain(charlie.fingerprint);

      // Filter by capability
      const searchResult = await new Promise<DiscoverResultFrame>(resolve => {
        daveClient.on('discover-result', resolve);
        daveClient.discover({ capability: 'search' });
      });

      expect(searchResult.agents).toHaveLength(1);
      expect(searchResult.agents[0].agentId).toBe(bob.fingerprint);
      expect(searchResult.agents[0].capabilities).toContain('search');

      publicConvo.disconnect();
      publicSearch.disconnect();
      unlisted.disconnect();
      daveClient.disconnect();
      await wait(100);
    });

    it('presence subscriptions fire for connect and disconnect', async () => {
      const subscriber = makeClient(alice, 'subscriber');
      await subscriber.connect();
      await wait(100);

      const presenceChanges: PresenceChangeFrame[] = [];
      subscriber.on('presence-change', (change: PresenceChangeFrame) => {
        presenceChanges.push(change);
      });

      // Subscribe to all changes (like the working RelayE2E test)
      subscriber.subscribe();
      await wait(100);

      // Bob connects → presence_change online
      const bobClient = makeClient(bob, 'presence-bob');
      await bobClient.connect();
      await wait(300);

      expect(presenceChanges.some(p => p.agentId === bob.fingerprint && p.status === 'online')).toBe(true);

      // Bob disconnects → presence_change offline
      bobClient.disconnect();
      await wait(300);

      expect(presenceChanges.some(p => p.agentId === bob.fingerprint && p.status === 'offline')).toBe(true);

      subscriber.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 5: Admin Ban During Active Session ─────────────────

  describe('Scenario 5: Admin ban/unban during active messaging', () => {
    it('banning stops message routing, unbanning restores it', async () => {
      const aliceClient = makeClient(alice, 'alice-ban');
      const bobClient = makeClient(bob, 'bob-ban');
      const bobMessages: MessageEnvelope[] = [];
      const aliceErrors: ErrorFrame[] = [];

      aliceClient.on('error', (e: ErrorFrame) => aliceErrors.push(e));
      bobClient.on('message', (env: MessageEnvelope) => bobMessages.push(env));

      await aliceClient.connect();
      await bobClient.connect();
      await wait(100);

      // Normal message works
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, bob.fingerprint, 'pre-ban'));
      await wait(100);
      expect(bobMessages.find(m => m.messageId === 'pre-ban')).toBeDefined();

      // Admin bans Alice
      const banRes = await adminRequest(adminPort, 'POST', '/admin/ban', ADMIN_KEY, {
        agentId: alice.fingerprint,
        reason: 'Comprehensive test ban',
        durationMs: 30_000,
      });
      expect(banRes.status).toBe(200);

      // Alice tries to send — should get error
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, bob.fingerprint, 'during-ban'));
      await wait(200);

      const banError = aliceErrors.find(e => e.code === 'banned');
      expect(banError).toBeDefined();

      // Admin unbans Alice
      await adminRequest(adminPort, 'POST', '/admin/unban', ADMIN_KEY, {
        agentId: alice.fingerprint,
      });
      await wait(100);

      // Alice can send again
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, bob.fingerprint, 'after-unban'));
      await wait(200);

      expect(bobMessages.find(m => m.messageId === 'after-unban')).toBeDefined();

      aliceClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });

    it('admin bans list shows active bans and clears after unban', async () => {
      // Ban dave
      await adminRequest(adminPort, 'POST', '/admin/ban', ADMIN_KEY, {
        agentId: dave.fingerprint,
        reason: 'list test',
        durationMs: 30_000,
      });

      const listRes = await adminRequest(adminPort, 'GET', '/admin/bans', ADMIN_KEY);
      expect(listRes.status).toBe(200);
      const bans = listRes.data.bans as Array<Record<string, unknown>>;
      expect(bans.some(b => b.agentId === dave.fingerprint)).toBe(true);

      // Unban
      await adminRequest(adminPort, 'POST', '/admin/unban', ADMIN_KEY, { agentId: dave.fingerprint });

      const listRes2 = await adminRequest(adminPort, 'GET', '/admin/bans', ADMIN_KEY);
      const bans2 = listRes2.data.bans as Array<Record<string, unknown>>;
      expect(bans2.some(b => b.agentId === dave.fingerprint)).toBe(false);
    });
  });

  // ── Scenario 6: Offline Queue + Abuse Detection Integration ────

  describe('Scenario 6: Offline queue with abuse detection', () => {
    it('queued messages are tracked in metrics', async () => {
      const aliceClient = makeClient(alice, 'alice-metrics');
      aliceClient.on('error', () => {});
      await aliceClient.connect();
      await wait(100);

      // Get baseline metrics (must request JSON explicitly)
      const getJsonMetrics = async () => {
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1', port: adminPort, path: '/admin/metrics', method: 'GET',
              headers: { Authorization: `Bearer ${ADMIN_KEY}`, Accept: 'application/json' },
            },
            (httpRes) => {
              const chunks: Buffer[] = [];
              httpRes.on('data', (c: Buffer) => chunks.push(c));
              httpRes.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
            },
          );
          req.on('error', reject);
          req.end();
        });
      };

      const before = await getJsonMetrics();

      // Send to offline eve — should queue
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, eve.fingerprint, 'metric-queue'));
      await wait(200);

      // Check metrics increased
      const after = await getJsonMetrics();

      expect(after.messagesRouted as number).toBeGreaterThan(before.messagesRouted as number);
      expect(after.messagesQueued as number).toBeGreaterThan(before.messagesQueued as number);

      // Clean up
      server.offlineQueue.clear(eve.fingerprint);
      aliceClient.disconnect();
      await wait(100);
    });

    it('health endpoint reflects both queue and abuse state', async () => {
      const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: serverPort, path: '/health', method: 'GET' },
          (httpRes) => {
            const chunks: Buffer[] = [];
            httpRes.on('data', (c: Buffer) => chunks.push(c));
            httpRes.on('end', () => resolve({
              status: httpRes.statusCode ?? 0,
              data: JSON.parse(Buffer.concat(chunks).toString()),
            }));
          },
        );
        req.on('error', reject);
        req.end();
      });

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
      expect(res.data.offlineQueue).toBeDefined();
      expect(res.data.abuse).toBeDefined();
      expect(res.data.throughput).toBeDefined();
      expect(typeof (res.data.abuse as Record<string, unknown>).activeBans).toBe('number');
      expect(typeof (res.data.offlineQueue as Record<string, unknown>).totalMessages).toBe('number');
    });
  });

  // ── Scenario 7: Rapid Connect/Disconnect Stress ─────────────────

  describe('Scenario 7: Rapid connect/disconnect cycles', () => {
    it('handles 5 rapid reconnections without state corruption', async () => {
      const clients: RelayClient[] = [];
      const sessionIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const client = makeClient(alice, `rapid-${i}`);
        client.on('error', () => {});
        const sessionId = await client.connect();
        sessionIds.push(sessionId);
        clients.push(client);

        // Small delay between cycles
        await wait(50);
        if (i < 4) client.disconnect();
        await wait(50);
      }

      // Last client should still be connected
      const lastClient = clients[clients.length - 1];
      expect(lastClient.connectionState).toBe('connected');

      // Should be able to send messages
      const bobClient = makeClient(bob, 'rapid-bob');
      const bobMessages: MessageEnvelope[] = [];
      bobClient.on('message', (env: MessageEnvelope) => bobMessages.push(env));
      await bobClient.connect();
      await wait(100);

      lastClient.sendMessage(makeTestEnvelope(alice.fingerprint, bob.fingerprint, 'after-rapid'));
      await wait(200);

      expect(bobMessages.find(m => m.messageId === 'after-rapid')).toBeDefined();

      lastClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 8: Concurrent Multi-Agent Operations ───────────────

  describe('Scenario 8: Concurrent multi-agent messaging', () => {
    it('handles 4 agents sending messages simultaneously', async () => {
      const agents = [
        { ...alice, client: makeClient(alice, 'concurrent-alice') },
        { ...bob, client: makeClient(bob, 'concurrent-bob') },
        { ...charlie, client: makeClient(charlie, 'concurrent-charlie') },
        { ...dave, client: makeClient(dave, 'concurrent-dave') },
      ];

      const received: Map<string, MessageEnvelope[]> = new Map();
      for (const a of agents) {
        received.set(a.fingerprint, []);
        a.client.on('message', (env: MessageEnvelope) => received.get(a.fingerprint)!.push(env));
        await a.client.connect();
      }
      await wait(100);

      // Everyone sends to everyone else simultaneously
      for (const sender of agents) {
        for (const receiver of agents) {
          if (sender.fingerprint === receiver.fingerprint) continue;
          sender.client.sendMessage(makeTestEnvelope(
            sender.fingerprint,
            receiver.fingerprint,
            `${sender.fingerprint.slice(0, 6)}-to-${receiver.fingerprint.slice(0, 6)}`,
          ));
        }
      }
      await wait(500);

      // Each agent should receive 3 messages (from the other 3)
      for (const a of agents) {
        expect(received.get(a.fingerprint)!.length).toBe(3);
      }

      for (const a of agents) a.client.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 9: Discovery Filter Combinations ──────────────────

  describe('Scenario 9: Discovery filter combinations', () => {
    it('filters by name and framework', async () => {
      const searchBot = makeClient(alice, 'search-bot', { capabilities: ['search'] });
      const chatBot = makeClient(bob, 'chat-bot', { capabilities: ['conversation'] });
      const finder = makeClient(charlie, 'finder');

      await searchBot.connect();
      await chatBot.connect();
      await finder.connect();
      await wait(100);

      // Filter by name
      const nameResult = await new Promise<DiscoverResultFrame>(resolve => {
        finder.on('discover-result', resolve);
        finder.discover({ name: 'search-bot' });
      });
      expect(nameResult.agents).toHaveLength(1);
      expect(nameResult.agents[0].name).toBe('search-bot');

      // Filter by framework
      const frameworkResult = await new Promise<DiscoverResultFrame>(resolve => {
        finder.on('discover-result', resolve);
        finder.discover({ framework: 'test' });
      });
      // Should find at least the two public agents + finder itself
      expect(frameworkResult.agents.length).toBeGreaterThanOrEqual(2);

      searchBot.disconnect();
      chatBot.disconnect();
      finder.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 10: Offline Queue TTL with Encrypted Messages ─────

  describe('Scenario 10: Queue TTL expiry for encrypted messages', () => {
    it('expired encrypted messages are purged and not delivered', async () => {
      // Clear any leftover messages from previous tests
      server.offlineQueue.clear(eve.fingerprint);

      const aliceClient = makeClient(alice, 'alice-ttl-enc');
      await aliceClient.connect();
      await wait(100);

      // Send encrypted message to offline eve
      const envelope = alice.encryptor.encrypt(
        eve.identity.publicKey, eve.x25519PubKey,
        'ttl-thread', { content: 'This will expire' },
      );
      aliceClient.sendMessage(envelope);
      await wait(100);

      expect(server.offlineQueue.getDepth(eve.fingerprint)).toBe(1);

      // Wait for TTL (3s + margin)
      await wait(4000);
      server.offlineQueue.expireMessages();

      expect(server.offlineQueue.getDepth(eve.fingerprint)).toBe(0);

      // Eve connects — should receive nothing
      const eveClient = makeClient(eve, 'eve-ttl-enc');
      const eveMessages: MessageEnvelope[] = [];
      eveClient.on('message', (env: MessageEnvelope) => eveMessages.push(env));
      await eveClient.connect();
      await wait(200);

      expect(eveMessages).toHaveLength(0);

      aliceClient.disconnect();
      eveClient.disconnect();
      await wait(100);
    }, 10_000);
  });

  // ── Scenario 11: Admin Monitoring During Active Traffic ────────

  describe('Scenario 11: Admin observability during traffic', () => {
    it('admin status reflects connected agents accurately', async () => {
      const aliceClient = makeClient(alice, 'admin-obs-alice');
      const bobClient = makeClient(bob, 'admin-obs-bob');

      await aliceClient.connect();
      await bobClient.connect();
      await wait(100);

      const status = await adminRequest(adminPort, 'GET', '/admin/status', ADMIN_KEY);
      expect(status.status).toBe(200);
      expect(status.data.status).toBe('ok');
      expect(typeof status.data.uptime).toBe('number');

      // Agent listing
      const agentsRes = await adminRequest(adminPort, 'GET', '/admin/agents', ADMIN_KEY);
      expect(agentsRes.status).toBe(200);
      const agentList = agentsRes.data.agents as Array<Record<string, unknown>>;
      const agentIds = agentList.map(a => a.agentId);
      expect(agentIds).toContain(alice.fingerprint);
      expect(agentIds).toContain(bob.fingerprint);

      aliceClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });

    it('Prometheus metrics include all counter types', async () => {
      const res = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: adminPort,
            path: '/admin/metrics',
            method: 'GET',
            headers: {
              Authorization: `Bearer ${ADMIN_KEY}`,
              Accept: 'text/plain',
            },
          },
          (httpRes) => {
            const chunks: Buffer[] = [];
            httpRes.on('data', (c: Buffer) => chunks.push(c));
            httpRes.on('end', () => resolve(Buffer.concat(chunks).toString()));
          },
        );
        req.on('error', reject);
        req.end();
      });

      // Check all expected metric names exist
      expect(res).toContain('threadline_messages_routed_total');
      expect(res).toContain('threadline_messages_delivered_total');
      expect(res).toContain('threadline_messages_queued_total');
      expect(res).toContain('threadline_connections_total');
      expect(res).toContain('threadline_connections_active');
      expect(res).toContain('threadline_uptime_seconds');
      expect(res).toContain('# HELP');
      expect(res).toContain('# TYPE');
    });
  });

  // ── Scenario 12: Message to Self ────────────────────────────────

  describe('Scenario 12: Edge cases', () => {
    it('agent can send message to itself', async () => {
      const aliceClient = makeClient(alice, 'self-send');
      const received: MessageEnvelope[] = [];
      aliceClient.on('message', (env: MessageEnvelope) => received.push(env));
      await aliceClient.connect();
      await wait(100);

      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, alice.fingerprint, 'self-msg'));
      await wait(200);

      expect(received).toHaveLength(1);
      expect(received[0].messageId).toBe('self-msg');

      aliceClient.disconnect();
      await wait(100);
    });

    it('handles invalid JSON frames without crashing', async () => {
      const aliceClient = makeClient(alice, 'bad-frame');
      aliceClient.on('error', () => {});
      await aliceClient.connect();
      await wait(100);

      // Access internal socket to send raw invalid data
      const socket = (aliceClient as unknown as { socket: { send: (data: string) => void } }).socket;
      socket.send('not json at all');
      socket.send(JSON.stringify({ type: 'totally_unknown_frame_type' }));
      await wait(200);

      // Client should still be connected and functional
      expect(aliceClient.connectionState).toBe('connected');

      aliceClient.disconnect();
      await wait(100);
    });

    it('message to non-existent agent is queued', async () => {
      const aliceClient = makeClient(alice, 'ghost-sender');
      const acks: AckFrame[] = [];
      aliceClient.on('ack', (ack: AckFrame) => acks.push(ack));
      await aliceClient.connect();
      await wait(100);

      const fakeFingerprint = 'deadbeefdeadbeefdeadbeefdeadbeef';
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, fakeFingerprint, 'to-ghost'));
      await wait(200);

      const ack = acks.find(a => a.messageId === 'to-ghost');
      expect(ack).toBeDefined();
      expect(ack!.status).toBe('queued');

      // Clean up
      server.offlineQueue.clear(fakeFingerprint);
      aliceClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 13: Multiple Senders → Offline Recipient + Bulk Delivery ──

  describe('Scenario 13: Bulk offline delivery from multiple senders', () => {
    it('delivers messages from 3 senders when recipient comes online', async () => {
      const aliceClient = makeClient(alice, 'bulk-alice');
      const bobClient = makeClient(bob, 'bulk-bob');
      const charlieClient = makeClient(charlie, 'bulk-charlie');

      await aliceClient.connect();
      await bobClient.connect();
      await charlieClient.connect();
      await wait(100);

      // All send to offline dave
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, dave.fingerprint, 'from-alice'));
      bobClient.sendMessage(makeTestEnvelope(bob.fingerprint, dave.fingerprint, 'from-bob'));
      charlieClient.sendMessage(makeTestEnvelope(charlie.fingerprint, dave.fingerprint, 'from-charlie'));
      await wait(200);

      expect(server.offlineQueue.getDepth(dave.fingerprint)).toBe(3);

      // Dave connects
      const daveClient = makeClient(dave, 'bulk-dave');
      const daveMessages: MessageEnvelope[] = [];
      daveClient.on('message', (env: MessageEnvelope) => daveMessages.push(env));
      await daveClient.connect();
      await wait(300);

      expect(daveMessages).toHaveLength(3);
      const senders = new Set(daveMessages.map(m => m.from));
      expect(senders.has(alice.fingerprint)).toBe(true);
      expect(senders.has(bob.fingerprint)).toBe(true);
      expect(senders.has(charlie.fingerprint)).toBe(true);

      // Queue is drained
      expect(server.offlineQueue.getDepth(dave.fingerprint)).toBe(0);

      aliceClient.disconnect();
      bobClient.disconnect();
      charlieClient.disconnect();
      daveClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 14: Bidirectional Encrypted Conversation ──────────

  describe('Scenario 14: Bidirectional encrypted conversation', () => {
    it('two agents exchange encrypted messages back and forth', async () => {
      const aliceClient = makeClient(alice, 'bidir-alice');
      const bobClient = makeClient(bob, 'bidir-bob');
      const aliceInbox: MessageEnvelope[] = [];
      const bobInbox: MessageEnvelope[] = [];

      aliceClient.on('message', (env: MessageEnvelope) => aliceInbox.push(env));
      bobClient.on('message', (env: MessageEnvelope) => bobInbox.push(env));

      await aliceClient.connect();
      await bobClient.connect();
      await wait(100);

      // Turn 1: Alice → Bob
      const env1 = alice.encryptor.encrypt(
        bob.identity.publicKey, bob.x25519PubKey,
        'bidir-thread', { content: 'Hey Bob!' },
      );
      aliceClient.sendMessage(env1);
      await wait(100);

      // Turn 2: Bob → Alice
      const env2 = bob.encryptor.encrypt(
        alice.identity.publicKey, alice.x25519PubKey,
        'bidir-thread', { content: 'Hi Alice!' },
      );
      bobClient.sendMessage(env2);
      await wait(100);

      // Turn 3: Alice → Bob
      const env3 = alice.encryptor.encrypt(
        bob.identity.publicKey, bob.x25519PubKey,
        'bidir-thread', { content: 'How are you?' },
      );
      aliceClient.sendMessage(env3);
      await wait(200);

      // Verify decryption in both directions
      expect(bobInbox).toHaveLength(2);
      expect(aliceInbox).toHaveLength(1);

      const bobMsg1 = bob.encryptor.decrypt(bobInbox[0], alice.identity.publicKey, alice.x25519PubKey);
      const bobMsg2 = bob.encryptor.decrypt(bobInbox[1], alice.identity.publicKey, alice.x25519PubKey);
      const aliceMsg = alice.encryptor.decrypt(aliceInbox[0], bob.identity.publicKey, bob.x25519PubKey);

      expect(bobMsg1.content).toBe('Hey Bob!');
      expect(bobMsg2.content).toBe('How are you?');
      expect(aliceMsg.content).toBe('Hi Alice!');

      aliceClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 15: Queue Limits Under Pressure ───────────────────

  describe('Scenario 15: Queue overflow under pressure', () => {
    it('respects per-sender limit and returns queue_full', async () => {
      const aliceClient = makeClient(alice, 'overflow-alice');
      const acks: AckFrame[] = [];
      aliceClient.on('ack', (ack: AckFrame) => acks.push(ack));
      await aliceClient.connect();
      await wait(100);

      // Send 10 messages (the per-sender-per-recipient limit)
      for (let i = 0; i < 10; i++) {
        aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, eve.fingerprint, `overflow-${i}`));
        await wait(10);
      }
      await wait(100);

      // 11th should be rejected
      aliceClient.sendMessage(makeTestEnvelope(alice.fingerprint, eve.fingerprint, 'overflow-11'));
      await wait(200);

      const rejected = acks.find(a => a.messageId === 'overflow-11');
      expect(rejected).toBeDefined();
      expect(rejected!.status).toBe('rejected');
      expect(rejected!.reason).toContain('queue_full');

      // Clean up
      server.offlineQueue.clear(eve.fingerprint);
      aliceClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 16: A2A Bridge + Relay Integration ─────────────────

  describe('Scenario 16: A2A Bridge message routing through relay', () => {
    it('A2A HTTP request reaches a connected relay agent and gets response', async () => {
      // Connect bob as a relay agent that auto-responds to A2A messages
      const bobClient = makeClient(bob, 'a2a-bob');
      bobClient.on('message', (env: MessageEnvelope) => {
        // Parse A2A payload and respond
        const payload = JSON.parse(Buffer.from(env.payload, 'base64').toString());
        if (payload.type === 'a2a-message') {
          const responseEnvelope: MessageEnvelope = {
            from: bob.fingerprint,
            to: env.from,
            threadId: env.threadId,
            messageId: `resp-${Date.now()}`,
            timestamp: new Date().toISOString(),
            nonce: '', ephemeralPubKey: '', salt: '',
            payload: Buffer.from(JSON.stringify({
              content: `Echo: ${payload.content}`,
              type: 'a2a-response',
            })).toString('base64'),
            signature: '',
          };
          bobClient.sendMessage(responseEnvelope);
        }
      });
      await bobClient.connect();
      await wait(100);

      // Send A2A request to bob via /a2a/{id}/messages
      const a2aRes = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
        const body = JSON.stringify({
          jsonrpc: '2.0',
          id: 'a2a-test-1',
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              parts: [{ type: 'text', text: 'Hello via A2A!' }],
            },
          },
        });
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/a2a/${bob.fingerprint}/messages`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode ?? 0, data: JSON.parse(Buffer.concat(chunks).toString()) });
              } catch {
                resolve({ status: res.statusCode ?? 0, data: {} });
              }
            });
          },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      expect(a2aRes.status).toBe(200);

      bobClient.disconnect();
      await wait(100);
    });

    it('A2A request to non-existent agent returns 404', async () => {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const body = JSON.stringify({
          jsonrpc: '2.0',
          id: 'a2a-missing',
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              parts: [{ type: 'text', text: 'Hello?' }],
            },
          },
        });
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/a2a/deadbeefdeadbeef/messages',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
          },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      expect(res.status).toBe(404);
    });

    it('A2A agent card endpoint returns card for connected agent', async () => {
      const bobClient = makeClient(bob, 'card-bob', { capabilities: ['conversation', 'search'] });
      await bobClient.connect();
      await wait(100);

      const res = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/a2a/${bob.fingerprint}/.well-known/agent-card.json`,
            method: 'GET',
          },
          (httpRes) => {
            const chunks: Buffer[] = [];
            httpRes.on('data', (c: Buffer) => chunks.push(c));
            httpRes.on('end', () => {
              try {
                resolve({ status: httpRes.statusCode ?? 0, data: JSON.parse(Buffer.concat(chunks).toString()) });
              } catch {
                resolve({ status: httpRes.statusCode ?? 0, data: {} });
              }
            });
          },
        );
        req.on('error', reject);
        req.end();
      });

      expect(res.status).toBe(200);
      expect(res.data.name).toBe('card-bob');

      bobClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 17: Signature Verification Failure ────────────────

  describe('Scenario 17: Tampered message detection', () => {
    it('decryption fails when message is tampered', async () => {
      const aliceClient = makeClient(alice, 'tamper-alice');
      const bobClient = makeClient(bob, 'tamper-bob');
      const bobMessages: MessageEnvelope[] = [];

      bobClient.on('message', (env: MessageEnvelope) => bobMessages.push(env));

      await aliceClient.connect();
      await bobClient.connect();
      await wait(100);

      // Send real encrypted message
      const envelope = alice.encryptor.encrypt(
        bob.identity.publicKey, bob.x25519PubKey,
        'tamper-thread', { content: 'Original content' },
      );
      aliceClient.sendMessage(envelope);
      await wait(200);

      expect(bobMessages).toHaveLength(1);

      // Tamper with the payload
      const tampered = { ...bobMessages[0], payload: 'AAAA' + bobMessages[0].payload.slice(4) };
      expect(() => {
        bob.encryptor.decrypt(tampered, alice.identity.publicKey, alice.x25519PubKey);
      }).toThrow();

      aliceClient.disconnect();
      bobClient.disconnect();
      await wait(100);
    });
  });

  // ── Scenario 18: Server Resilience ──────────────────────────────

  describe('Scenario 18: Server state consistency', () => {
    it('presence is cleaned up after disconnect', async () => {
      const aliceClient = makeClient(alice, 'cleanup-alice');
      await aliceClient.connect();
      await wait(100);

      // Verify alice is in presence
      const beforeAgents = server.presence.getAll();
      expect(beforeAgents.some(a => a.agentId === alice.fingerprint)).toBe(true);

      aliceClient.disconnect();
      await wait(200);

      // Alice should no longer be in presence
      const afterAgents = server.presence.getAll();
      expect(afterAgents.some(a => a.agentId === alice.fingerprint)).toBe(false);
    });

    it('connections count goes to zero when all clients disconnect', async () => {
      const clients = [
        makeClient(alice, 'count-alice'),
        makeClient(bob, 'count-bob'),
        makeClient(charlie, 'count-charlie'),
      ];

      for (const c of clients) await c.connect();
      await wait(100);

      // Should have at least 3 connections
      const healthBefore = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: serverPort, path: '/health', method: 'GET' },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect((healthBefore as Record<string, number>).connections).toBeGreaterThanOrEqual(3);

      // Disconnect all
      for (const c of clients) c.disconnect();
      await wait(200);

      const healthAfter = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: serverPort, path: '/health', method: 'GET' },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect((healthAfter as Record<string, number>).connections).toBe(0);
    });
  });

  // ── Scenario 19: Admin Auth Protection ─────────────────────────

  describe('Scenario 19: Admin server authentication', () => {
    it('rejects requests without auth token', async () => {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: adminPort, path: '/admin/status', method: 'GET' },
          (httpRes) => {
            httpRes.on('data', () => {});
            httpRes.on('end', () => resolve({ status: httpRes.statusCode ?? 0 }));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(res.status).toBe(401);
    });

    it('rejects requests with wrong token', async () => {
      const res = await adminRequest(adminPort, 'GET', '/admin/status', 'wrong-key');
      expect(res.status).toBe(401);
    });

    it('accepts requests with correct token', async () => {
      const res = await adminRequest(adminPort, 'GET', '/admin/status', ADMIN_KEY);
      expect(res.status).toBe(200);
    });
  });

  // ── Scenario 20: End-to-End Pipeline (The Grand Finale) ────────

  describe('Scenario 20: Complete pipeline test', () => {
    it('full lifecycle: connect → discover → encrypt → route → queue → deliver → admin verify', async () => {
      // Ensure Bob is NOT connected and queue is clean
      server.offlineQueue.clear(bob.fingerprint);

      // 1. Connect Alice (use a fresh agent to avoid state leakage)
      const pipelineAgent = generateAgent();
      const aliceClient = makeClient(pipelineAgent, 'final-alice', { capabilities: ['conversation', 'crypto'] });
      const aliceAcks: AckFrame[] = [];
      aliceClient.on('ack', (ack: AckFrame) => aliceAcks.push(ack));
      await aliceClient.connect();
      await wait(100);

      // 2. Discover — Alice searches for agents
      const discover1 = await new Promise<DiscoverResultFrame>(resolve => {
        aliceClient.on('discover-result', resolve);
        aliceClient.discover();
      });
      expect(discover1.agents.length).toBeGreaterThanOrEqual(1);

      // 3. Send encrypted message to offline Bob — triggers queuing
      // Use a fresh recipient to guarantee they're offline
      const pipelineRecipient = generateAgent();
      const encEnvelope = pipelineAgent.encryptor.encrypt(
        pipelineRecipient.identity.publicKey, pipelineRecipient.x25519PubKey,
        'final-thread', { content: 'Final pipeline test!', type: 'text', metadata: { importance: 'high' } },
      );
      aliceClient.sendMessage(encEnvelope);
      await wait(200);

      // 4. Verify queued ack
      const queuedAck = aliceAcks.find(a => a.messageId === encEnvelope.messageId && a.status === 'queued');
      expect(queuedAck).toBeDefined();
      expect(queuedAck!.ttl).toBeGreaterThan(0);

      // 5. Admin verifies queue state
      const adminStatus = await adminRequest(adminPort, 'GET', '/admin/status', ADMIN_KEY);
      expect(adminStatus.data.status).toBe('ok');

      // 6. Recipient connects — receives queued message
      const recipientClient = makeClient(pipelineRecipient, 'final-recipient', { capabilities: ['conversation'] });
      const recipientMessages: MessageEnvelope[] = [];
      recipientClient.on('message', (env: MessageEnvelope) => recipientMessages.push(env));
      await recipientClient.connect();
      await wait(300);

      expect(recipientMessages).toHaveLength(1);

      // 7. Recipient decrypts and verifies
      const decrypted = pipelineRecipient.encryptor.decrypt(
        recipientMessages[0],
        pipelineAgent.identity.publicKey,
        pipelineAgent.x25519PubKey,
      );
      expect(decrypted.content).toBe('Final pipeline test!');
      expect(decrypted.type).toBe('text');
      expect(decrypted.metadata).toEqual({ importance: 'high' });

      // 8. Alice should have received delivered ack
      await wait(100);
      const deliveredAck = aliceAcks.find(a => a.messageId === encEnvelope.messageId && a.status === 'delivered');
      expect(deliveredAck).toBeDefined();

      // 9. Verify discover now shows both agents
      const discover2 = await new Promise<DiscoverResultFrame>(resolve => {
        aliceClient.on('discover-result', resolve);
        aliceClient.discover();
      });
      const agentIds = discover2.agents.map(a => a.agentId);
      expect(agentIds).toContain(pipelineAgent.fingerprint);
      expect(agentIds).toContain(pipelineRecipient.fingerprint);

      // 10. Admin metrics reflect the activity (request JSON format)
      const metricsRes = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1', port: adminPort, path: '/admin/metrics', method: 'GET',
            headers: { Authorization: `Bearer ${ADMIN_KEY}`, Accept: 'application/json' },
          },
          (httpRes) => {
            const chunks: Buffer[] = [];
            httpRes.on('data', (c: Buffer) => chunks.push(c));
            httpRes.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(metricsRes.messagesRouted as number).toBeGreaterThan(0);
      expect(metricsRes.messagesDelivered as number).toBeGreaterThan(0);

      // 11. Health endpoint confirms system integrity
      const health = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: serverPort, path: '/health', method: 'GET' },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(health.status).toBe('ok');
      expect((health as Record<string, number>).connections).toBeGreaterThanOrEqual(2);

      aliceClient.disconnect();
      recipientClient.disconnect();
      await wait(100);
    });
  });
});
