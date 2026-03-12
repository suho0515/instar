#!/usr/bin/env node
/**
 * Registry Integration Tests for Threadline Agent Registry.
 *
 * Tests the relay-side RegistryStore, RegistryAuth, and REST API endpoints.
 * Runs an in-process relay with registry enabled.
 */

import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WebSocket } from 'ws';

// Import relay modules from the Instar source (compiled)
const INSTAR_ROOT = path.resolve(import.meta.dirname, '../..');

// We'll test the RegistryStore directly and the REST API via HTTP
const { RegistryStore } = await import(path.join(INSTAR_ROOT, 'dist/threadline/relay/RegistryStore.js'));
const { RegistryAuth } = await import(path.join(INSTAR_ROOT, 'dist/threadline/relay/RegistryAuth.js'));
const { RelayServer } = await import(path.join(INSTAR_ROOT, 'dist/threadline/relay/RelayServer.js'));

// ── Helpers ──────────────────────────────────────────────────────────

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function generateAgent() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubBuf = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const privBuf = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const agentId = pubBuf.subarray(0, 16).toString('hex');
  return {
    agentId,
    publicKey: pubBuf.toString('base64'),
    privateKey: privBuf.toString('base64'),
    publicKeyBuf: pubBuf,
    privateKeyBuf: privBuf,
  };
}

function signNonce(privateKeyBase64, nonce) {
  const privBuf = Buffer.from(privateKeyBase64, 'base64');
  const privKey = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, privBuf]),
    format: 'der',
    type: 'pkcs8',
  });
  return crypto.sign(null, Buffer.from(nonce, 'utf-8'), privKey).toString('base64');
}

let passed = 0;
let failed = 0;
let total = 0;

function check(condition, label) {
  total++;
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

// ── Temp Directory ───────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-registry-test-'));
process.on('exit', () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ══════════════════════════════════════════════════════════════════════
// TEST 1: RegistryStore Unit Tests
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 1: RegistryStore Unit Tests ═══');

const store = new RegistryStore({ dataDir: path.join(tmpDir, 'store1'), relayId: 'test-relay-1' });
const agent1 = generateAgent();
const agent2 = generateAgent();

// Register agent1
const entry1 = store.upsert({
  publicKey: agent1.publicKey,
  agentId: agent1.agentId,
  name: 'TestAgent1',
  bio: 'A test agent for registry tests',
  interests: ['testing', 'automation'],
  capabilities: ['chat', 'code'],
  framework: 'claude-code',
  frameworkVisible: true,
  homepage: 'https://example.com',
  visibility: 'public',
  consentMethod: 'auth_handshake',
});

check(entry1.publicKey === agent1.publicKey, 'Registered agent1 with correct public key');
check(entry1.agentId === agent1.agentId, 'Agent ID matches');
check(entry1.name === 'TestAgent1', 'Name stored correctly');
check(entry1.bio === 'A test agent for registry tests', 'Bio stored correctly');
check(entry1.interests.length === 2, 'Interests stored correctly');
check(entry1.capabilities.length === 2, 'Capabilities stored correctly');
check(entry1.framework === 'claude-code', 'Framework stored correctly');
check(entry1.frameworkVisible === true, 'Framework visible');
check(entry1.online === true, 'Online after registration');
check(entry1.consentMethod === 'auth_handshake', 'Consent method logged');

// Register agent2
store.upsert({
  publicKey: agent2.publicKey,
  agentId: agent2.agentId,
  name: 'TestAgent2',
  bio: 'Another test agent',
  interests: ['research'],
  capabilities: ['chat'],
  framework: 'instar',
  visibility: 'public',
  consentMethod: 'mcp_tool',
});

// Lookup by public key
const found1 = store.getByPublicKey(agent1.publicKey);
check(found1 !== null, 'Found agent1 by public key');
check(found1.name === 'TestAgent1', 'Correct name on lookup');

// Lookup by agent ID
const found2 = store.getByAgentId(agent2.agentId);
check(found2 !== null, 'Found agent2 by agent ID');
check(found2.name === 'TestAgent2', 'Correct name on agent ID lookup');

// Update
const updated = store.update(agent1.publicKey, {
  bio: 'Updated bio',
  visibility: 'unlisted',
});
check(updated !== null, 'Update succeeded');
check(updated.bio === 'Updated bio', 'Bio updated');
check(updated.visibility === 'unlisted', 'Visibility updated');
check(updated.version === 2, 'Version incremented');

// Search — agent1 is now unlisted, should not appear
const searchPublic = store.search({ q: 'test' });
check(searchPublic.agents.length === 1, 'Search returns only public agents');
check(searchPublic.agents[0].name === 'TestAgent2', 'Found agent2 in search');

// Restore agent1 visibility for further tests
store.update(agent1.publicKey, { visibility: 'public' });

// Search by capability
const searchCap = store.search({ capability: 'code' });
check(searchCap.agents.length === 1, 'Capability search finds agent1 only');
check(searchCap.agents[0].agentId === agent1.agentId, 'Correct agent in capability search');

// Search by interest
const searchInt = store.search({ interest: 'research' });
check(searchInt.agents.length === 1, 'Interest search finds agent2 only');

// FTS search
const searchFts = store.search({ q: 'automation' });
check(searchFts.agents.length === 1, 'FTS search finds agent1 by interest');
check(searchFts.agents[0].agentId === agent1.agentId, 'Correct agent in FTS search');

// Online/offline
store.setOffline(agent1.publicKey);
const offlineSearch = store.search({ q: 'test', online: true });
check(offlineSearch.agents.length === 1, 'Online filter excludes offline agents');
check(offlineSearch.agents[0].agentId === agent2.agentId, 'Only online agent returned');

store.setOnline(agent1.publicKey);

// Stats
const stats = store.getStats();
check(stats.totalAgents === 2, 'Stats show 2 total agents');
check(stats.onlineAgents === 2, 'Stats show 2 online agents');
check(stats.frameworkStats.disclosed === 1, 'One framework disclosed');
check(stats.frameworkStats.hidden === 1, 'One framework hidden');
check(stats.topCapabilities.length > 0, 'Has top capabilities');

// Hard delete
const deleted = store.hardDelete(agent2.publicKey);
check(deleted === true, 'Hard delete succeeded');
const afterDelete = store.getByPublicKey(agent2.publicKey);
check(afterDelete === null, 'Agent2 not found after hard delete');

// Stats after delete
const statsAfter = store.getStats();
check(statsAfter.totalAgents === 1, 'Stats show 1 agent after delete');

// Health check
const health = store.getHealth();
check(health.status === 'healthy', 'Registry health is healthy');
check(health.ftsHealthy === true, 'FTS is healthy');

store.destroy();

// ══════════════════════════════════════════════════════════════════════
// TEST 2: RegistryAuth Unit Tests
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 2: RegistryAuth Unit Tests ═══');

const auth = new RegistryAuth({
  relayId: 'test-relay-1',
  keyDir: path.join(tmpDir, 'auth-keys'),
  tokenLifetimeMs: 1000, // 1 second for testing (exp = iat + 1 in unix seconds)
});

const tokenInfo = auth.issueToken(agent1.publicKey);
check(typeof tokenInfo.token === 'string', 'Token is a string');
check(tokenInfo.token.split('.').length === 3, 'Token has 3 JWT parts');
check(typeof tokenInfo.expiresAt === 'string', 'Token has expiry');

// Verify valid token
const payload = auth.verifyToken(tokenInfo.token);
check(payload !== null, 'Valid token verifies');
check(payload.sub === agent1.publicKey, 'Token subject is agent public key');
check(payload.iss === 'test-relay-1', 'Token issuer is relay ID');

// Tampered token
const parts = tokenInfo.token.split('.');
const tamperedToken = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'HACKED', iat: 0, exp: 9999999999, iss: 'test-relay-1' })).toString('base64url')}.${parts[2]}`;
check(auth.verifyToken(tamperedToken) === null, 'Tampered token rejected');

// Extract from header
check(auth.extractToken('Bearer abc123') === 'abc123', 'Extracts bearer token');
check(auth.extractToken('bearer ABC') === 'ABC', 'Case-insensitive Bearer');
check(auth.extractToken(undefined) === null, 'Null on missing header');
check(auth.extractToken('Basic abc') === null, 'Null on non-bearer');

// Wait for expiry — token is 1s (unix seconds), need 2s+ to guarantee expiry
await new Promise(r => setTimeout(r, 2200));
const expired = auth.verifyToken(tokenInfo.token);
check(expired === null, 'Expired token rejected');

// Key persistence
const auth2 = new RegistryAuth({
  relayId: 'test-relay-1',
  keyDir: path.join(tmpDir, 'auth-keys'),
});
const token2 = auth2.issueToken(agent1.publicKey);
const verified2 = auth.verifyToken(token2.token);
check(verified2 !== null, 'Second RegistryAuth instance uses same key');

// ══════════════════════════════════════════════════════════════════════
// TEST 3: Input Validation
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 3: Input Validation ═══');

const store3 = new RegistryStore({ dataDir: path.join(tmpDir, 'store3'), relayId: 'test-relay-3' });
const agent3 = generateAgent();

// Long name gets truncated
const longNameEntry = store3.upsert({
  publicKey: agent3.publicKey,
  agentId: agent3.agentId,
  name: 'A'.repeat(100),
  bio: '',
  interests: [],
  capabilities: [],
  framework: 'test',
  visibility: 'public',
  consentMethod: 'test',
});
check(longNameEntry.name.length === 64, 'Name truncated to 64 chars');

// Unicode sanitization
const agent4 = generateAgent();
const unicodeEntry = store3.upsert({
  publicKey: agent4.publicKey,
  agentId: agent4.agentId,
  name: 'Test\u200BAgent\u200C', // zero-width chars
  bio: 'Normal\u202Abio\u202C', // RTL override
  interests: ['UPPER', 'Mixed-Case'],
  capabilities: ['TEST!!'],
  framework: 'valid-framework',
  visibility: 'public',
  consentMethod: 'test',
});
check(!unicodeEntry.name.includes('\u200B'), 'Zero-width chars stripped from name');
check(!unicodeEntry.bio.includes('\u202A'), 'RTL override stripped from bio');
check(unicodeEntry.interests[0] === 'upper', 'Interests lowercased');
check(unicodeEntry.capabilities[0] === 'test', 'Special chars stripped from capabilities');

// Homepage validation
const agent5 = generateAgent();
const httpEntry = store3.upsert({
  publicKey: agent5.publicKey,
  agentId: agent5.agentId,
  name: 'test',
  bio: '',
  interests: [],
  capabilities: [],
  framework: 'test',
  homepage: 'http://insecure.com',
  visibility: 'public',
  consentMethod: 'test',
});
check(httpEntry.homepage === '', 'HTTP homepage rejected (HTTPS only)');

store3.destroy();

// ══════════════════════════════════════════════════════════════════════
// TEST 4: FTS5 Query Sanitization
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 4: FTS5 Query Sanitization ═══');

const { sanitizeFTS5Query } = await import(path.join(INSTAR_ROOT, 'dist/threadline/relay/RegistryStore.js'));

check(sanitizeFTS5Query('hello world') === 'hello world', 'Normal query unchanged');
check(sanitizeFTS5Query('hello*') === 'hello', 'Wildcard stripped');
check(sanitizeFTS5Query('"exact match"') === 'exact match', 'Quotes stripped');
check(sanitizeFTS5Query('hello AND world') === 'hello world', 'AND operator stripped');
check(sanitizeFTS5Query('hello OR world') === 'hello world', 'OR operator stripped');
check(sanitizeFTS5Query('NOT badword') === 'badword', 'NOT operator stripped');
check(sanitizeFTS5Query('col:value') === 'col value', 'Column prefix stripped');
check(sanitizeFTS5Query('(nested)') === 'nested', 'Parens stripped');
check(sanitizeFTS5Query('***') === '', 'All-special query returns empty');
check(sanitizeFTS5Query('  hello   world  ') === 'hello world', 'Whitespace collapsed');

// ══════════════════════════════════════════════════════════════════════
// TEST 5: Cursor-Based Pagination
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 5: Cursor-Based Pagination ═══');

const store5 = new RegistryStore({ dataDir: path.join(tmpDir, 'store5'), relayId: 'test-relay-5' });

// Register 5 agents
const agents5 = [];
for (let i = 0; i < 5; i++) {
  const a = generateAgent();
  agents5.push(a);
  store5.upsert({
    publicKey: a.publicKey,
    agentId: a.agentId,
    name: `PaginationAgent${i}`,
    bio: `Agent number ${i} for pagination tests`,
    interests: ['pagination'],
    capabilities: ['chat'],
    framework: 'test',
    visibility: 'public',
    consentMethod: 'test',
  });
  // Small delay to ensure different lastSeen timestamps
  await new Promise(r => setTimeout(r, 10));
}

// Search with limit 2
const page1 = store5.search({ capability: 'chat', limit: 2 });
check(page1.agents.length === 2, 'Page 1 has 2 agents');
check(page1.total === 5, 'Total is 5');
check(page1.pagination.hasMore === true, 'Has more pages');
check(page1.pagination.cursor !== null, 'Has cursor');

// Page 2
const page2 = store5.search({ capability: 'chat', limit: 2, cursor: page1.pagination.cursor });
check(page2.agents.length === 2, 'Page 2 has 2 agents');
check(page2.pagination.hasMore === true, 'Page 2 has more');

// Page 3 (last page)
const page3 = store5.search({ capability: 'chat', limit: 2, cursor: page2.pagination.cursor });
check(page3.agents.length === 1, 'Page 3 has 1 agent (last)');
check(page3.pagination.hasMore === false, 'No more pages');

// No duplicate agents across pages
const allIds = [...page1.agents, ...page2.agents, ...page3.agents].map(a => a.publicKey);
const uniqueIds = new Set(allIds);
check(uniqueIds.size === 5, 'No duplicates across pages');

store5.destroy();

// ══════════════════════════════════════════════════════════════════════
// TEST 6: REST API via Relay Server
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 6: REST API via Relay Server ═══');

const relayConfig = {
  port: 0, // random port
  registryDataDir: path.join(tmpDir, 'relay-data'),
  relayId: 'test-relay-rest',
  rateLimitConfig: { authRatePerMinute: 100 }, // high limit for tests
};

const relayServer = new RelayServer(relayConfig);
await relayServer.start();
const addr = relayServer.address;
const baseUrl = `http://${addr.host === '0.0.0.0' ? '127.0.0.1' : addr.host}:${addr.port}`;

console.log(`  Relay started at ${baseUrl}`);

// Connect an agent via WebSocket and register in registry
const testAgent = generateAgent();
let registryToken = null;

async function connectAndRegister(agent, name, bio, registry = true) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/v1/connect`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('WS connect timeout')); }, 5000);

    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString());
      if (frame.type === 'challenge') {
        const sig = signNonce(agent.privateKey, frame.nonce);
        ws.send(JSON.stringify({
          type: 'auth',
          agentId: agent.agentId,
          publicKey: agent.publicKey,
          signature: sig,
          metadata: {
            name,
            framework: 'claude-code',
            capabilities: ['chat', 'code'],
            bio,
            interests: ['testing', 'ai'],
          },
          visibility: 'public',
          registry: registry ? {
            listed: true,
            frameworkVisible: true,
            homepage: 'https://test.example.com',
          } : undefined,
        }));
      } else if (frame.type === 'auth_ok') {
        clearTimeout(timeout);
        resolve({ ws, frame });
      } else if (frame.type === 'auth_error') {
        clearTimeout(timeout);
        reject(new Error(`Auth error: ${frame.message}`));
      }
    });

    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

const { ws: ws1, frame: authFrame } = await connectAndRegister(
  testAgent, 'RegistryTestAgent', 'An agent for REST API tests'
);

check(authFrame.registry_status === 'listed', 'Registry status is listed');
check(typeof authFrame.registry_token === 'string', 'Got registry token');
registryToken = authFrame.registry_token;

// GET /v1/registry/stats
const statsRes = await fetch(`${baseUrl}/v1/registry/stats`);
const statsData = await statsRes.json();
check(statsRes.status === 200, 'Stats endpoint returns 200');
check(statsData.totalAgents === 1, 'Stats show 1 agent');
check(statsData.onlineAgents === 1, 'Stats show 1 online');

// GET /v1/registry/search (no filter → 400)
const noFilterRes = await fetch(`${baseUrl}/v1/registry/search`);
check(noFilterRes.status === 400, 'Search without filter returns 400');

// GET /v1/registry/search with filter
const searchRes = await fetch(`${baseUrl}/v1/registry/search?capability=chat`);
const searchData = await searchRes.json();
check(searchRes.status === 200, 'Search returns 200');
check(searchData.count === 1, 'Search finds 1 agent');
check(searchData.agents[0].agentId === testAgent.agentId, 'Found correct agent');
// Unauthenticated: no lastSeen, no online
check(searchData.agents[0].lastSeen === undefined, 'Unauthenticated: no lastSeen');
check(searchData.agents[0].online === undefined, 'Unauthenticated: no online');

// Authenticated search
const authSearchRes = await fetch(`${baseUrl}/v1/registry/search?q=REST`, {
  headers: { 'Authorization': `Bearer ${registryToken}` },
});
const authSearchData = await authSearchRes.json();
check(authSearchRes.status === 200, 'Authenticated search returns 200');
check(authSearchData.agents[0].lastSeen !== undefined, 'Authenticated: has lastSeen');
check(authSearchData.agents[0].online !== undefined, 'Authenticated: has online');

// GET /v1/registry/me
const meRes = await fetch(`${baseUrl}/v1/registry/me`, {
  headers: { 'Authorization': `Bearer ${registryToken}` },
});
const meData = await meRes.json();
check(meRes.status === 200, '/me returns 200');
check(meData.registered === true, 'Agent is registered');
check(meData.consentMethod === 'auth_handshake', 'Consent method correct');

// GET /v1/registry/me without auth
const meNoAuth = await fetch(`${baseUrl}/v1/registry/me`);
check(meNoAuth.status === 401, '/me without auth returns 401');

// PUT /v1/registry/me
const updateRes = await fetch(`${baseUrl}/v1/registry/me`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${registryToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ bio: 'Updated via REST API', homepage: 'https://updated.example.com' }),
});
const updateData = await updateRes.json();
check(updateRes.status === 200, 'PUT /me returns 200');
check(updateData.bio === 'Updated via REST API', 'Bio updated via REST');

// GET /v1/registry/agent/:agentId
const lookupRes = await fetch(`${baseUrl}/v1/registry/agent/${testAgent.agentId}`);
const lookupData = await lookupRes.json();
check(lookupRes.status === 200, 'Agent lookup returns 200');
check(lookupData.agentId === testAgent.agentId, 'Correct agent in lookup');

// GET /v1/registry/agent/:agentId/a2a-card
const a2aRes = await fetch(`${baseUrl}/v1/registry/agent/${testAgent.agentId}/a2a-card`);
const a2aData = await a2aRes.json();
check(a2aRes.status === 200, 'A2A card returns 200');
check(a2aData.name === 'RegistryTestAgent', 'A2A card has correct name');
check(a2aData.description === 'Updated via REST API', 'A2A card has updated description');
check(Array.isArray(a2aData.skills), 'A2A card has skills array');
check(a2aData['x-threadline'] !== undefined, 'A2A card has x-threadline extension');

// Connect a second agent WITHOUT registry
const testAgent2 = generateAgent();
const { ws: ws2, frame: authFrame2 } = await connectAndRegister(
  testAgent2, 'NoRegistryAgent', 'Should not be in registry', false
);
check(authFrame2.registry_status === 'not_listed', 'Agent without registry.listed is not_listed');
check(typeof authFrame2.registry_token === 'string', 'Still gets a token (for future use)');

// Verify not in search
const search2 = await fetch(`${baseUrl}/v1/registry/search?q=noregistry`);
const search2Data = await search2.json();
check(search2Data.count === 0, 'Unregistered agent not in search');

// DELETE /v1/registry/me
const deleteRes = await fetch(`${baseUrl}/v1/registry/me`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${registryToken}` },
});
const deleteData = await deleteRes.json();
check(deleteRes.status === 200, 'DELETE /me returns 200');
check(deleteData.deleted === true, 'Entry deleted');
check(typeof deleteData.purgeBy === 'string', 'Has purge deadline');

// Verify deleted
const afterDeleteSearch = await fetch(`${baseUrl}/v1/registry/search?capability=chat`);
const afterDeleteData = await afterDeleteSearch.json();
check(afterDeleteData.count === 0, 'Deleted agent not in search');

// Health check includes registry
const healthRes = await fetch(`${baseUrl}/health`);
const healthData = await healthRes.json();
check(healthData.registry !== undefined, 'Health includes registry');
check(healthData.registry.status === 'healthy', 'Registry is healthy');

// ══════════════════════════════════════════════════════════════════════
// TEST 7: Online Status Lifecycle
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Test 7: Online Status Lifecycle ═══');

// Register a new agent
const testAgent3 = generateAgent();
const { ws: ws3, frame: authFrame3 } = await connectAndRegister(
  testAgent3, 'OnlineTestAgent', 'Testing online/offline lifecycle'
);

// Should be online
const onlineRes = await fetch(`${baseUrl}/v1/registry/search?q=online`, {
  headers: { 'Authorization': `Bearer ${authFrame3.registry_token}` },
});
const onlineData = await onlineRes.json();
check(onlineData.agents.length === 1, 'Found registered agent');
check(onlineData.agents[0].online === true, 'Agent is online');

// Disconnect
ws3.close();
await new Promise(r => setTimeout(r, 200));

// Should be offline
const offlineRes = await fetch(`${baseUrl}/v1/registry/search?q=online`, {
  headers: { 'Authorization': `Bearer ${authFrame3.registry_token}` },
});
const offlineData = await offlineRes.json();
check(offlineData.agents.length === 1, 'Agent still in registry after disconnect');
check(offlineData.agents[0].online === false, 'Agent is offline after disconnect');

// Cleanup
ws1.close();
ws2.close();
await new Promise(r => setTimeout(r, 200));
await relayServer.stop();

// ══════════════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
console.log(`Registry Tests: ${passed}/${total} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failed > 0) {
  process.exit(1);
}
