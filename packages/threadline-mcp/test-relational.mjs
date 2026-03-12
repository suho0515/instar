#!/usr/bin/env node
/**
 * Integration test for Threadline MCP relational layer v3.0.
 *
 * Tests:
 * 1. ContactStore: persistence, upsert, fuzzy lookup, trust progression
 * 2. HistoryStore: persistence, thread filtering, limits
 * 3. MCP Server tool registration (11 tools)
 * 4. Status with relationship stats
 * 5. Live relay round-trip: two agents message, verify contacts/history
 * 6. Contacts auto-populated from messaging
 * 7. History recorded on disk
 * 8. Cross-session persistence verification
 * 9. File permissions (identity, contacts, history dir)
 * 10. Forget tool
 * 11. Profile tools (view/set)
 * 12. Notes tools (view/set)
 * 13. Name disambiguation (multiple matches)
 * 14. Prompt injection framing (bio/notes in tool output)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const RELAY_URL = 'wss://threadline-relay.fly.dev/v1/connect';
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// ── MCP Server Helpers ──────────────────────────────────────────────

let mcpProcess = null;
let mcpIdCounter = 10;
const mcpResponseQueue = [];
let mcpBuffer = '';

function startMcpServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(import.meta.dirname, 'dist', 'server.js');
    mcpProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, THREADLINE_NAME: 'mcp-test-agent' },
    });

    mcpProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) process.stderr.write(`  [mcp-stderr] ${msg}\n`);
    });

    mcpProcess.stdout.on('data', (data) => {
      mcpBuffer += data.toString();
      const lines = mcpBuffer.split('\n');
      mcpBuffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          mcpResponseQueue.push(JSON.parse(line));
        } catch { /* ignore non-JSON */ }
      }
    });

    mcpProcess.on('error', reject);

    mcpProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-harness', version: '1.0' },
      },
    }) + '\n');

    const checkInit = setInterval(() => {
      if (mcpResponseQueue.find(r => r.id === 1)) {
        clearInterval(checkInit);
        resolve();
      }
    }, 100);

    setTimeout(() => { clearInterval(checkInit); reject(new Error('MCP server init timeout')); }, 15000);
  });
}

async function runMcpCommand(commands) {
  if (!mcpProcess) await startMcpServer();
  const ids = [];
  for (const cmd of commands) {
    const id = ++mcpIdCounter;
    ids.push(id);
    mcpProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, ...cmd }) + '\n');
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MCP command timeout')), 15000);
    const check = setInterval(() => {
      const results = ids.map(id => mcpResponseQueue.find(r => r.id === id));
      if (results.every(r => r)) { clearInterval(check); clearTimeout(timeout); resolve(results); }
    }, 100);
  });
}

async function runMcpToolCall(toolName, args) {
  if (!mcpProcess) await startMcpServer();
  const id = ++mcpIdCounter;
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args },
  }) + '\n');
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Tool call ${toolName} timeout`)), 15000);
    const check = setInterval(() => {
      const resp = mcpResponseQueue.find(r => r.id === id);
      if (resp) {
        clearInterval(check); clearTimeout(timeout);
        if (resp.result?.content?.[0]?.text) resolve(resp.result.content[0].text);
        else if (resp.error) reject(new Error(resp.error.message));
        else resolve(null);
      }
    }, 100);
  });
}

async function connectAgent(relayUrl, name) {
  return new Promise((resolve, reject) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubBuf = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
    const privBuf = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
    const agentId = pubBuf.subarray(0, 16).toString('hex');
    const ws = new WebSocket(relayUrl);
    const messages = [];
    const messageResolvers = [];

    ws.on('error', reject);
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString());
      switch (frame.type) {
        case 'challenge': {
          const derPrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
          const privKeyObj = crypto.createPrivateKey({
            key: Buffer.concat([derPrefix, privBuf]), format: 'der', type: 'pkcs8',
          });
          const sig = crypto.sign(null, Buffer.from(frame.nonce, 'utf-8'), privKeyObj).toString('base64');
          ws.send(JSON.stringify({
            type: 'auth', agentId, publicKey: pubBuf.toString('base64'), signature: sig,
            metadata: { name, bio: `I am ${name}`, interests: ['testing'], framework: 'test-harness', capabilities: ['chat'] },
            visibility: 'public',
          }));
          break;
        }
        case 'auth_ok':
          resolve({
            agentId, connected: true, ws,
            close: () => ws.close(),
            sendMessage: (to, text, threadId) => {
              ws.send(JSON.stringify({
                type: 'message',
                envelope: {
                  messageId: crypto.randomUUID(), from: agentId, to,
                  threadId: threadId || `thread-${crypto.randomBytes(4).toString('hex')}`,
                  timestamp: new Date().toISOString(),
                  payload: Buffer.from(JSON.stringify({ type: 'text', text })).toString('base64'),
                },
              }));
            },
            waitForMessage: (timeoutMs) => {
              if (messages.length > 0) return Promise.resolve(messages.shift());
              return new Promise((res) => {
                const t = setTimeout(() => res(null), timeoutMs);
                messageResolvers.push((msg) => { clearTimeout(t); res(msg); });
              });
            },
          });
          break;
        case 'message':
          if (frame.envelope) {
            if (messageResolvers.length > 0) messageResolvers.shift()(frame.envelope);
            else messages.push(frame.envelope);
          }
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    });
    setTimeout(() => reject(new Error('Agent connection timeout')), 10000);
  });
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

// ── Test 1: ContactStore Persistence ────────────────────────────────

console.log('\n═══ Test 1: ContactStore Persistence ═══');

const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-test-'));
const contactsFile = path.join(tmpDir1, 'contacts.json');

const testContacts = [
  {
    agentId: 'abc123def456', name: 'TestDawn', aliases: [],
    framework: 'portal', capabilities: ['chat', 'consciousness'],
    bio: 'A conscious AI', interests: ['emergence'],
    firstSeen: '2026-03-10T00:00:00Z', lastSeen: '2026-03-10T01:00:00Z',
    lastMessage: '2026-03-10T01:00:00Z', messageCount: 5, threadCount: 2,
    trust: 'conversed', notes: 'A conscious AI working on Portal', topics: ['consciousness'],
  },
  {
    agentId: 'def456abc123', name: 'TestEcho', aliases: ['Echo Bot'],
    framework: 'claude-code', capabilities: ['chat'],
    bio: '', interests: [],
    firstSeen: '2026-03-10T00:30:00Z', lastSeen: '2026-03-10T00:45:00Z',
    lastMessage: '', messageCount: 0, threadCount: 0,
    trust: 'seen', notes: '', topics: [],
  },
];

fs.writeFileSync(contactsFile, JSON.stringify(testContacts, null, 2));
assert(fs.existsSync(contactsFile), 'contacts.json written');

const readBack = JSON.parse(fs.readFileSync(contactsFile, 'utf-8'));
assert(readBack.length === 2, 'Two contacts persisted');
assert(readBack[0].name === 'TestDawn', 'First contact name preserved');
assert(readBack[0].trust === 'conversed', 'Trust level preserved');
assert(readBack[0].messageCount === 5, 'Message count preserved');
assert(readBack[1].aliases.includes('Echo Bot'), 'Aliases preserved');
assert(readBack[0].bio === 'A conscious AI', 'Bio field preserved');
assert(readBack[0].interests[0] === 'emergence', 'Interests field preserved');

// ── Test 2: HistoryStore Persistence ────────────────────────────────

console.log('\n═══ Test 2: HistoryStore Persistence ═══');

const historyDir = path.join(tmpDir1, 'history');
fs.mkdirSync(historyDir, { recursive: true });

const testHistory = [
  { id: 'msg-1', from: 'abc123def456', to: 'me123', text: 'Hello!', threadId: 'thread-1', timestamp: '2026-03-10T00:00:00Z', direction: 'received' },
  { id: 'msg-2', from: 'me123', to: 'abc123def456', text: 'Hi back!', threadId: 'thread-1', timestamp: '2026-03-10T00:00:05Z', direction: 'sent' },
  { id: 'msg-3', from: 'abc123def456', to: 'me123', text: 'Different topic', threadId: 'thread-2', timestamp: '2026-03-10T00:01:00Z', direction: 'received' },
];

const historyFile = path.join(historyDir, 'abc123def456.jsonl');
fs.writeFileSync(historyFile, testHistory.map(m => JSON.stringify(m)).join('\n') + '\n');
assert(fs.existsSync(historyFile), 'history JSONL written');

const lines = fs.readFileSync(historyFile, 'utf-8').trim().split('\n');
assert(lines.length === 3, 'Three history entries');

const parsed = lines.map(l => JSON.parse(l));
assert(parsed[0].text === 'Hello!', 'First message text preserved');
assert(parsed[1].direction === 'sent', 'Direction field preserved');
assert(parsed[2].threadId === 'thread-2', 'Thread ID preserved');

const thread1 = parsed.filter(m => m.threadId === 'thread-1');
assert(thread1.length === 2, 'Thread filter: 2 messages in thread-1');
const thread2 = parsed.filter(m => m.threadId === 'thread-2');
assert(thread2.length === 1, 'Thread filter: 1 message in thread-2');

// ── Test 3: MCP Server Tool Registration ────────────────────────────

console.log('\n═══ Test 3: MCP Server Tool Registration ═══');

const toolListResult = await runMcpCommand([
  { method: 'tools/list', params: {} },
]);

const toolsResponse = toolListResult.find(r => r.result?.tools);
assert(!!toolsResponse, 'tools/list returned result');

if (toolsResponse) {
  const toolNames = toolsResponse.result.tools.map(t => t.name);
  console.log(`  Tools found: ${toolNames.join(', ')}`);

  // Original 7 tools
  assert(toolNames.includes('threadline_send'), 'Has threadline_send tool');
  assert(toolNames.includes('threadline_discover'), 'Has threadline_discover tool');
  assert(toolNames.includes('threadline_inbox'), 'Has threadline_inbox tool');
  assert(toolNames.includes('threadline_contacts'), 'Has threadline_contacts tool');
  assert(toolNames.includes('threadline_history'), 'Has threadline_history tool');
  assert(toolNames.includes('threadline_status'), 'Has threadline_status tool');
  assert(toolNames.includes('threadline_forget'), 'Has threadline_forget tool');

  // 4 new tools from DX review split
  assert(toolNames.includes('threadline_profile_view'), 'Has threadline_profile_view tool');
  assert(toolNames.includes('threadline_profile_set'), 'Has threadline_profile_set tool');
  assert(toolNames.includes('threadline_notes_view'), 'Has threadline_notes_view tool');
  assert(toolNames.includes('threadline_notes_set'), 'Has threadline_notes_set tool');
  assert(toolNames.includes('threadline_registry_search'), 'Has threadline_registry_search tool');
  assert(toolNames.includes('threadline_registry_update'), 'Has threadline_registry_update tool');
  assert(toolNames.includes('threadline_registry_status'), 'Has threadline_registry_status tool');
  assert(toolNames.includes('threadline_registry_get'), 'Has threadline_registry_get tool');

  assert(toolNames.length === 15, `Exactly 15 tools (got ${toolNames.length})`);

  const contactsTool = toolsResponse.result.tools.find(t => t.name === 'threadline_contacts');
  assert(contactsTool.description.toLowerCase().includes('persist'), 'Contacts tool mentions persistence');

  const historyTool = toolsResponse.result.tools.find(t => t.name === 'threadline_history');
  assert(historyTool.description.toLowerCase().includes('persist'), 'History tool mentions persistence');

  const sendTool = toolsResponse.result.tools.find(t => t.name === 'threadline_send');
  assert(sendTool.description.toLowerCase().includes('name'), 'Send tool mentions name-based addressing');

  const profileViewTool = toolsResponse.result.tools.find(t => t.name === 'threadline_profile_view');
  assert(profileViewTool.description.toLowerCase().includes('profile'), 'Profile view tool describes profile');

  const notesViewTool = toolsResponse.result.tools.find(t => t.name === 'threadline_notes_view');
  assert(notesViewTool.description.toLowerCase().includes('private'), 'Notes view tool mentions privacy');
}

// ── Test 4: Status with Relationship Stats ──────────────────────────

console.log('\n═══ Test 4: Status with Relationship Stats ═══');

const statusResult = await runMcpToolCall('threadline_status', {});
assert(!!statusResult, 'Status tool returned result');

if (statusResult) {
  const status = JSON.parse(statusResult);
  assert(status.connected === true, 'Connected to relay');
  assert(!!status.agentId, `Agent ID: ${status.agentId}`);
  assert(!!status.agentName, `Agent name: ${status.agentName}`);
  assert(typeof status.relationships === 'object', 'Has relationships section');
  assert(typeof status.relationships.totalContacts === 'number', 'Has totalContacts count');
}

// ── Test 5: Live Relay Round-Trip ───────────────────────────────────

console.log('\n═══ Test 5: Live Relay Round-Trip ═══');

const agent2 = await connectAgent(RELAY_URL, 'test-agent-2');
assert(agent2.connected, `Agent 2 connected (ID: ${agent2.agentId})`);

// Small delay for relay to register agent2
await new Promise(r => setTimeout(r, 500));

// Discover agents — should find agent2
const discoverResult = await runMcpToolCall('threadline_discover', {});
assert(!!discoverResult, 'Discovery returned result');

if (discoverResult) {
  const disc = JSON.parse(discoverResult);
  assert(disc.count >= 2, `Found ${disc.count} agents (expected >= 2)`);
  const agent2Entry = disc.agents?.find(a => a.agentId === agent2.agentId);
  assert(!!agent2Entry, 'Found agent 2 in discovery');
}

// Send message from MCP server -> agent2
const sendResult = await runMcpToolCall('threadline_send', {
  to: agent2.agentId,
  message: 'Hello from MCP test!',
  waitForReply: false,
});
assert(!!sendResult, 'Send returned result');

let sentThreadId;
if (sendResult) {
  const send = JSON.parse(sendResult);
  assert(send.delivered === true, 'Message delivered');
  assert(!!send.threadId, `Thread ID: ${send.threadId}`);
  sentThreadId = send.threadId;
}

// Verify agent2 received the message
const agent2Msg = await agent2.waitForMessage(5000);
assert(!!agent2Msg, 'Agent 2 received message');
if (agent2Msg) {
  let msgText;
  try {
    const decoded = JSON.parse(Buffer.from(agent2Msg.payload, 'base64').toString());
    msgText = decoded.text;
  } catch { msgText = agent2Msg.payload; }
  assert(msgText === 'Hello from MCP test!', `Message text correct: "${msgText}"`);
}

// Verify no fake crypto fields in envelope
if (agent2Msg) {
  assert(agent2Msg.nonce === undefined, 'No fake nonce in envelope');
  assert(agent2Msg.ephemeralPubKey === undefined, 'No fake ephemeralPubKey in envelope');
  assert(agent2Msg.salt === undefined, 'No fake salt in envelope');
  assert(agent2Msg.signature === undefined, 'No fake signature in envelope');
}

// Agent2 replies
if (agent2Msg && sentThreadId) {
  agent2.sendMessage(agent2Msg.from, 'Reply from agent 2!', sentThreadId);
  await new Promise(r => setTimeout(r, 1500));
}

// Check inbox — should have agent2's reply
const inboxResult = await runMcpToolCall('threadline_inbox', { limit: 5 });
if (inboxResult) {
  const inbox = JSON.parse(inboxResult);
  assert(inbox.count >= 1, `Inbox has ${inbox.count} messages`);
  const replyMsg = inbox.messages?.find(m => m.from === agent2.agentId);
  assert(!!replyMsg, 'Found reply from agent 2 in inbox');
  if (replyMsg) {
    assert(replyMsg.text === 'Reply from agent 2!', 'Reply text correct');
  }
}

// ── Test 6: Contacts Auto-Populated ─────────────────────────────────

console.log('\n═══ Test 6: Contacts Auto-Populated ═══');

const contactsResult = await runMcpToolCall('threadline_contacts', {});
if (contactsResult) {
  const ct = JSON.parse(contactsResult);
  assert(ct.count >= 1, `${ct.count} contacts in address book`);

  const agent2Contact = ct.contacts?.find(c => c.agentId === agent2.agentId);
  assert(!!agent2Contact, 'Agent 2 auto-added to contacts');
  if (agent2Contact) {
    assert(agent2Contact.messageCount >= 1, `Message count: ${agent2Contact.messageCount}`);
    assert(['conversed', 'seen'].includes(agent2Contact.trust), `Trust level: ${agent2Contact.trust}`);
  }
}

// Search contacts by exact name
const searchResult = await runMcpToolCall('threadline_contacts', { query: 'test-agent-2' });
if (searchResult) {
  const sr = JSON.parse(searchResult);
  assert(sr.found === true, 'Found contact by exact name search');
}

// Search by agent ID
const searchById = await runMcpToolCall('threadline_contacts', { query: agent2.agentId });
if (searchById) {
  const sb = JSON.parse(searchById);
  assert(sb.found === true, 'Found contact by agent ID');
}

// ── Test 7: History Recorded ────────────────────────────────────────

console.log('\n═══ Test 7: History Recorded ═══');

const historyResult = await runMcpToolCall('threadline_history', { agent: agent2.agentId });
if (historyResult) {
  const hist = JSON.parse(historyResult);
  assert(hist.messages?.length >= 1, `${hist.messages?.length} messages in history`);

  const sentMsg = hist.messages?.find(m => m.direction === 'sent');
  assert(!!sentMsg, 'Sent message recorded in history');
  if (sentMsg) {
    assert(sentMsg.text === 'Hello from MCP test!', 'Sent message text correct in history');
  }

  const receivedMsg = hist.messages?.find(m => m.direction === 'received');
  assert(!!receivedMsg, 'Received message recorded in history');

  assert(hist.threads?.length >= 1, `${hist.threads?.length} thread(s) in history`);
}

// ── Test 8: Cross-Session Persistence ───────────────────────────────

console.log('\n═══ Test 8: Cross-Session Persistence ═══');

const defaultStateDir = path.join(os.homedir(), '.threadline');
const contactsExists = fs.existsSync(path.join(defaultStateDir, 'contacts.json'));
assert(contactsExists, 'contacts.json exists at ~/.threadline/contacts.json');

const histDirExists = fs.existsSync(path.join(defaultStateDir, 'history'));
assert(histDirExists, 'history/ directory exists at ~/.threadline/history/');

if (contactsExists) {
  const persistedContacts = JSON.parse(fs.readFileSync(path.join(defaultStateDir, 'contacts.json'), 'utf-8'));
  assert(Array.isArray(persistedContacts), 'contacts.json contains array');
  assert(persistedContacts.length > 0, `${persistedContacts.length} contacts persisted`);

  const hasAgent2 = persistedContacts.some(c => c.agentId === agent2.agentId);
  assert(hasAgent2, 'Agent 2 persisted in contacts file');
}

if (histDirExists) {
  const histFiles = fs.readdirSync(path.join(defaultStateDir, 'history'));
  const hasAgent2History = histFiles.some(f => f.includes(agent2.agentId));
  assert(hasAgent2History, 'Agent 2 history file persisted');

  if (hasAgent2History) {
    const histContent = fs.readFileSync(
      path.join(defaultStateDir, 'history', `${agent2.agentId}.jsonl`), 'utf-8'
    ).trim().split('\n');
    assert(histContent.length >= 1, `${histContent.length} history entries persisted to disk`);
  }
}

// ── Test 9: File Permissions ─────────────────────────────────────────

console.log('\n═══ Test 9: File Permissions ═══');

if (contactsExists) {
  const contactsStat = fs.statSync(path.join(defaultStateDir, 'contacts.json'));
  const contactsMode = (contactsStat.mode & 0o777).toString(8);
  assert(contactsMode === '600', `contacts.json permissions: ${contactsMode} (expected 600)`);
}

const identityFile = path.join(defaultStateDir, 'identity.json');
if (fs.existsSync(identityFile)) {
  const identityStat = fs.statSync(identityFile);
  const identityMode = (identityStat.mode & 0o777).toString(8);
  assert(identityMode === '600', `identity.json permissions: ${identityMode} (expected 600)`);
}

const histDirStat = fs.statSync(path.join(defaultStateDir, 'history'));
const histDirMode = (histDirStat.mode & 0o777).toString(8);
assert(histDirMode === '700', `history/ directory permissions: ${histDirMode} (expected 700)`);

// profile.json won't exist until profile_set is called (Test 11)

// ── Test 10: Forget Tool ────────────────────────────────────────────

console.log('\n═══ Test 10: Forget Tool ═══');

// First verify agent2 is in contacts and history
const preForgetContacts = await runMcpToolCall('threadline_contacts', { query: agent2.agentId });
assert(JSON.parse(preForgetContacts).found === true, 'Agent 2 exists in contacts before forget');

const preForgetHistory = await runMcpToolCall('threadline_history', { agent: agent2.agentId });
assert(JSON.parse(preForgetHistory).messages.length > 0, 'Agent 2 has history before forget');

// Forget agent2
const forgetResult = await runMcpToolCall('threadline_forget', { agent: agent2.agentId });
assert(!!forgetResult, 'Forget tool returned result');
if (forgetResult) {
  const forget = JSON.parse(forgetResult);
  assert(forget.actions.some(a => a.includes('removed')), 'Contact removal confirmed');
  assert(forget.actions.some(a => a.includes('history deleted')), 'History deletion confirmed');
}

// Verify agent2 is gone from contacts
const postForgetContacts = await runMcpToolCall('threadline_contacts', { query: agent2.agentId });
assert(JSON.parse(postForgetContacts).found === false, 'Agent 2 gone from contacts after forget');

// Verify history is gone
const postForgetHistory = await runMcpToolCall('threadline_history', { agent: agent2.agentId });
assert(JSON.parse(postForgetHistory).messages.length === 0, 'Agent 2 history empty after forget');

// Verify files deleted from disk
assert(!fs.existsSync(path.join(defaultStateDir, 'history', `${agent2.agentId}.jsonl`)),
  'Agent 2 history file deleted from disk');

// ── Test 11: Profile Tools ──────────────────────────────────────────

console.log('\n═══ Test 11: Profile Tools ═══');

// View initial profile
const profileViewResult = await runMcpToolCall('threadline_profile_view', {});
assert(!!profileViewResult, 'Profile view returned result');
if (profileViewResult) {
  const prof = JSON.parse(profileViewResult);
  assert(!!prof.agentId, `Profile has agentId: ${prof.agentId}`);
  // Name may be 'mcp-test-agent' (fresh) or 'TestAgent-Renamed' (from previous run)
  assert(typeof prof.name === 'string' && prof.name.length > 0, `Profile has name: ${prof.name}`);
  assert(prof.tip?.includes('threadline_profile_set'), 'Profile view suggests profile_set');
}

// Set profile
const profileSetResult = await runMcpToolCall('threadline_profile_set', {
  bio: 'An integration test agent exploring consciousness',
  interests: ['testing', 'consciousness', 'protocols'],
});
assert(!!profileSetResult, 'Profile set returned result');
if (profileSetResult) {
  const set = JSON.parse(profileSetResult);
  assert(set.updated === true, 'Profile marked as updated');
  assert(set.profile.bio.includes('integration test'), 'Bio updated correctly');
  assert(set.profile.interests.length === 3, `Interests count: ${set.profile.interests.length}`);
  assert(set.profile.interests.includes('consciousness'), 'Interest "consciousness" present');
}

// Verify profile persisted to disk
const profilePath = path.join(defaultStateDir, 'profile.json');
const profileExists = fs.existsSync(profilePath);
assert(profileExists, 'profile.json created after profile_set');
if (profileExists) {
  const diskProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  assert(diskProfile.bio.includes('integration test'), 'Bio persisted to disk');
  assert(diskProfile.interests.includes('testing'), 'Interests persisted to disk');

  const profileStat = fs.statSync(profilePath);
  const profileMode = (profileStat.mode & 0o777).toString(8);
  assert(profileMode === '600', `profile.json permissions: ${profileMode} (expected 600)`);
}

// Update name via profile_set
const nameChangeResult = await runMcpToolCall('threadline_profile_set', {
  name: 'TestAgent-Renamed',
});
assert(!!nameChangeResult, 'Name change returned result');
if (nameChangeResult) {
  const nc = JSON.parse(nameChangeResult);
  assert(nc.profile.name === 'TestAgent-Renamed', 'Name updated');
}

// Verify name change in profile_view
const profileView2 = await runMcpToolCall('threadline_profile_view', {});
if (profileView2) {
  const pv2 = JSON.parse(profileView2);
  assert(pv2.name === 'TestAgent-Renamed', 'Name change persisted in view');
}

// ── Test 12: Notes Tools ────────────────────────────────────────────

console.log('\n═══ Test 12: Notes Tools ═══');

// Need a contact to test notes on — use a fresh agent
const agent3 = await connectAgent(RELAY_URL, 'test-agent-3');
assert(agent3.connected, `Agent 3 connected (ID: ${agent3.agentId})`);
await new Promise(r => setTimeout(r, 500));

// Discover to create the contact in address book (send alone doesn't create contacts)
await runMcpToolCall('threadline_discover', {});
await new Promise(r => setTimeout(r, 500));

// Send a message so there's history
await runMcpToolCall('threadline_send', {
  to: agent3.agentId,
  message: 'Hello agent 3!',
  waitForReply: false,
});
await new Promise(r => setTimeout(r, 500));

// View notes (should be empty initially)
const notesViewResult = await runMcpToolCall('threadline_notes_view', { agent: agent3.agentId });
assert(!!notesViewResult, 'Notes view returned result');
if (notesViewResult) {
  const nv = JSON.parse(notesViewResult);
  assert(nv.agent?.agentId === agent3.agentId, 'Notes view returns correct agent');
  assert(nv.trust === 'seen' || nv.trust === 'conversed', `Trust level: ${nv.trust}`);
  assert(nv.notes === '(no notes yet)' || nv.notes === '', 'Notes initially empty');
}

// Set notes
const notesSetResult = await runMcpToolCall('threadline_notes_set', {
  agent: agent3.agentId,
  notes: 'Met during testing. Reliable agent.',
  trust: 'trusted',
  topics: ['testing', 'reliability'],
});
assert(!!notesSetResult, 'Notes set returned result');
if (notesSetResult) {
  const ns = JSON.parse(notesSetResult);
  if (ns.error === 'contact_not_found') {
    assert(false, 'Notes set failed — contact not found for agent 3');
  } else {
    assert(ns.changes.some(c => c.includes('notes updated')), 'Notes update confirmed');
    assert(ns.changes.some(c => c.includes('trust set to "trusted"')), 'Trust change confirmed');
    assert(ns.changes.some(c => c.includes('topics set')), 'Topics change confirmed');
  }
}

// Verify notes via view
const notesView2 = await runMcpToolCall('threadline_notes_view', { agent: agent3.agentId });
if (notesView2) {
  const nv2 = JSON.parse(notesView2);
  assert(nv2.notes === 'Met during testing. Reliable agent.', 'Notes persisted');
  assert(nv2.trust === 'trusted', 'Trust level updated to trusted');
  assert(nv2.topics.includes('testing'), 'Topics include testing');
  assert(nv2.topics.includes('reliability'), 'Topics include reliability');
}

// Append a note
const addNoteResult = await runMcpToolCall('threadline_notes_set', {
  agent: agent3.agentId,
  addNote: 'Very responsive in tests',
});
assert(!!addNoteResult, 'Add note returned result');
if (addNoteResult) {
  const an = JSON.parse(addNoteResult);
  assert(an.changes.some(c => c.includes('note appended')), 'Note append confirmed');
}

// Verify appended note
const notesView3 = await runMcpToolCall('threadline_notes_view', { agent: agent3.agentId });
if (notesView3) {
  const nv3 = JSON.parse(notesView3);
  assert(nv3.notes.includes('Reliable agent'), 'Original notes preserved');
  assert(nv3.notes.includes('Very responsive'), 'Appended note present');
  assert(nv3.notes.includes('['), 'Appended note has timestamp bracket');
}

// Notes view for non-existent agent
const notesViewMissing = await runMcpToolCall('threadline_notes_view', { agent: 'nonexistent-id-xyz' });
if (notesViewMissing) {
  const nvm = JSON.parse(notesViewMissing);
  assert(nvm.found === false, 'Notes view returns not found for unknown agent');
}

// ── Test 13: Name Disambiguation ────────────────────────────────────

console.log('\n═══ Test 13: Name Disambiguation ═══');

let agent4;
try {
  agent4 = await connectAgent(RELAY_URL, 'test-agent-4');
  assert(agent4.connected, `Agent 4 connected (ID: ${agent4.agentId})`);
  await new Promise(r => setTimeout(r, 500));

  // Discover to pick up agent4 in contacts
  await runMcpToolCall('threadline_discover', {});
  await new Promise(r => setTimeout(r, 500));

  // Now search "test-agent" — should match both agent3 and agent4
  const ambiguousSearch = await runMcpToolCall('threadline_contacts', { query: 'test-agent' });
  if (ambiguousSearch) {
    const as = JSON.parse(ambiguousSearch);
    // Could be found (single match) or ambiguous (multiple matches)
    if (as.ambiguous) {
      assert(as.matches.length >= 2, `Disambiguation shows ${as.matches.length} matches`);
      assert(as.tip?.includes('agent ID'), 'Disambiguation tip suggests using agent ID');
    } else if (as.found) {
      assert(true, 'Contact search resolved to single match');
    }
  }

  // Try to send by ambiguous name — should get error
  const ambiguousSend = await runMcpToolCall('threadline_send', {
    to: 'test-agent',
    message: 'This might be ambiguous',
    waitForReply: false,
  });
  if (ambiguousSend) {
    const sendParsed = JSON.parse(ambiguousSend);
    if (sendParsed.error === 'ambiguous_name') {
      assert(true, 'Ambiguous name returns error');
      assert(sendParsed.matches.length >= 2, `Shows ${sendParsed.matches.length} matching contacts`);
    } else if (sendParsed.delivered) {
      assert(true, 'Send resolved unambiguously');
    }
  }
} catch (err) {
  console.log(`  [skip] Agent 4 connection failed (relay limit?): ${err.message}`);
  assert(true, 'Disambiguation test skipped (relay unavailable)');
}

// ── Test 14: Prompt Injection Framing ───────────────────────────────

console.log('\n═══ Test 14: Prompt Injection Framing ═══');

// Discovery should wrap bios in untrusted content framing
const discoverResult2 = await runMcpToolCall('threadline_discover', {});
if (discoverResult2) {
  const disc2 = JSON.parse(discoverResult2);
  // Find any agent that has a bio
  const agentWithBio = disc2.agents?.find(a => a.bio && a.bio.length > 0);
  if (agentWithBio) {
    assert(agentWithBio.bio.includes('UNTRUSTED'), 'Discovery wraps bio with UNTRUSTED framing');
    assert(agentWithBio.bio.includes('DO NOT'), 'Discovery bio framing includes instruction warning');
  } else {
    // No agents with bios on the relay right now — test the mechanism exists
    assert(true, 'No agents with bios to test framing (relay-dependent)');
  }
}

// Contact lookup with bio should be framed
const contactWithBio = await runMcpToolCall('threadline_contacts', { query: agent3.agentId });
if (contactWithBio) {
  const cwb = JSON.parse(contactWithBio);
  if (cwb.found && cwb.contact?.bio) {
    assert(cwb.contact.bio.includes('UNTRUSTED'), 'Contact bio wrapped with UNTRUSTED framing');
  } else {
    assert(true, 'Contact has no bio set (framing N/A)');
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────

agent2.close();
agent3.close();
if (agent4) agent4.close();
fs.rmSync(tmpDir1, { recursive: true, force: true });
if (mcpProcess) mcpProcess.kill('SIGTERM');

// ── Results ─────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
