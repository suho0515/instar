/**
 * WhatsApp Setup Issues — Regression Tests
 *
 * Covers three critical issues discovered during real-world WhatsApp setup (2026-03-07):
 *
 * Issue 1: Baileys peer dependency not resolvable via require.resolve() in npx context
 * Issue 2: Baileys 405 Connection Failure causes infinite reconnect loop
 * Issue 3: Dashboard QR polling fails silently when auth is missing/invalid
 *
 * These tests verify the fixes and prevent regression.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Issue 1: Baileys peer dep resolution ─────────────────────────

describe('Issue 1: Baileys peer dependency resolution', () => {
  const whatsappPath = path.join(process.cwd(), 'src/commands/whatsapp.ts');
  const baileysBackendPath = path.join(process.cwd(), 'src/messaging/backends/BaileysBackend.ts');
  const encryptedAuthStorePath = path.join(process.cwd(), 'src/messaging/shared/EncryptedAuthStore.ts');

  let whatsappSrc: string;
  let baileysBackendSrc: string;
  let encryptedAuthStoreSrc: string;

  beforeEach(() => {
    whatsappSrc = fs.readFileSync(whatsappPath, 'utf-8');
    baileysBackendSrc = fs.readFileSync(baileysBackendPath, 'utf-8');
    encryptedAuthStoreSrc = fs.readFileSync(encryptedAuthStorePath, 'utf-8');
  });

  it('whatsapp.ts does NOT use require.resolve for Baileys detection', () => {
    // require.resolve fails in npx context because it resolves relative
    // to the file location (npx cache), not the user's project directory.
    const requireResolvePattern = /require\.resolve\(['"]@whiskeysockets\/baileys['"]\)/;
    const matches = whatsappSrc.match(new RegExp(requireResolvePattern, 'g'));
    expect(matches).toBeNull();
  });

  it('whatsapp.ts has an isBaileysInstalled helper using dynamic import', () => {
    expect(whatsappSrc).toContain('async function isBaileysInstalled');
    expect(whatsappSrc).toContain("await import('@whiskeysockets/baileys')");
    expect(whatsappSrc).toContain("await import('baileys')");
  });

  it('whatsapp.ts isBaileysInstalled tries both v6 and v7 package names', () => {
    // v6: @whiskeysockets/baileys, v7: baileys
    const fnStart = whatsappSrc.indexOf('async function isBaileysInstalled');
    const fnEnd = whatsappSrc.indexOf('\n}', fnStart);
    const fnBody = whatsappSrc.substring(fnStart, fnEnd);

    expect(fnBody).toContain("@whiskeysockets/baileys");
    expect(fnBody).toContain("'baileys'");
    // v6 should be tried first
    const v6Index = fnBody.indexOf("@whiskeysockets/baileys");
    const v7Index = fnBody.indexOf("'baileys'");
    expect(v6Index).toBeLessThan(v7Index);
  });

  it('whatsapp.ts uses isBaileysInstalled in addWhatsApp', () => {
    const addWhatsAppSection = whatsappSrc.substring(
      whatsappSrc.indexOf('// Check if Baileys is installed'),
      whatsappSrc.indexOf("console.log('Next steps:"),
    );
    expect(addWhatsAppSection).toContain('isBaileysInstalled()');
    expect(addWhatsAppSection).not.toContain('require.resolve');
  });

  it('whatsapp.ts uses isBaileysInstalled in channelLogin', () => {
    const channelLoginSection = whatsappSrc.substring(
      whatsappSrc.indexOf('export async function channelLogin'),
      whatsappSrc.indexOf('Dynamic import of BaileysBackend'),
    );
    expect(channelLoginSection).toContain('isBaileysInstalled()');
    expect(channelLoginSection).not.toContain('require.resolve');
  });

  it('whatsapp.ts uses isBaileysInstalled in channelDoctor', () => {
    const doctorSection = whatsappSrc.substring(
      whatsappSrc.indexOf("if (currentBackend === 'baileys')"),
    );
    expect(doctorSection).toContain('isBaileysInstalled()');
    expect(doctorSection).not.toContain('require.resolve');
  });

  it('BaileysBackend.ts tries both v6 and v7 package names on connect', () => {
    expect(baileysBackendSrc).toContain("await import('@whiskeysockets/baileys')");
    expect(baileysBackendSrc).toContain("await import('baileys')");

    // Verify v6 is tried first
    const v6Index = baileysBackendSrc.indexOf("await import('@whiskeysockets/baileys')");
    const v7Index = baileysBackendSrc.indexOf("await import('baileys')");
    expect(v6Index).toBeLessThan(v7Index);
  });

  it('EncryptedAuthStore.ts tries both v6 and v7 package names', () => {
    expect(encryptedAuthStoreSrc).toContain("await import('@whiskeysockets/baileys')");
    expect(encryptedAuthStoreSrc).toContain("await import('baileys')");
  });

  it('no file uses require.resolve for Baileys anywhere in src/', () => {
    // Comprehensive check across all source files
    const srcDir = path.join(process.cwd(), 'src');
    const tsFiles = findTsFiles(srcDir);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const hasRequireResolve = /require\.resolve\(['"](@whiskeysockets\/baileys|baileys)['"]\)/.test(content);
      expect(hasRequireResolve, `${path.relative(srcDir, file)} still uses require.resolve for Baileys`).toBe(false);
    }
  });
});

// ── Issue 2: Baileys 405 Connection Failure ──────────────────────

describe('Issue 2: Baileys 405 error handling', () => {
  const baileysBackendPath = path.join(process.cwd(), 'src/messaging/backends/BaileysBackend.ts');
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(baileysBackendPath, 'utf-8');
  });

  it('BaileysBackend handles 405 status code specifically', () => {
    expect(src).toContain('statusCode === 405');
  });

  it('405 handler logs a clear error message about version incompatibility', () => {
    const section405 = src.substring(
      src.indexOf('statusCode === 405'),
      src.indexOf("// Don't reconnect"),
    );
    expect(section405).toContain('405');
    expect(section405).toContain('outdated');
    expect(section405).toContain('npm install');
  });

  it('405 does NOT trigger reconnect (reconnecting would be pointless)', () => {
    // After 405 handling, the code should NOT call scheduleReconnect
    const connectionCloseSection = src.substring(
      src.indexOf("if (connection === 'close')"),
      src.indexOf('// Message events'),
    );

    // Find the 405 block
    const block405Start = connectionCloseSection.indexOf('statusCode === 405');
    const block405End = connectionCloseSection.indexOf("} else {", block405Start);
    const block405 = connectionCloseSection.substring(block405Start, block405End);

    expect(block405).not.toContain('scheduleReconnect');
  });

  it('405 handler calls onError with descriptive message', () => {
    const section405 = src.substring(
      src.indexOf('statusCode === 405'),
      src.indexOf("// Don't reconnect"),
    );
    expect(section405).toContain('onError');
    expect(section405).toContain('405');
  });

  it('reconnect backoff delays are defined', () => {
    expect(src).toContain('BASE_DELAYS');
    // Should have escalating delays
    const delayMatch = src.match(/BASE_DELAYS\s*=\s*\[([\d,\s]+)\]/);
    expect(delayMatch).not.toBeNull();
    const delays = delayMatch![1].split(',').map(d => parseInt(d.trim()));
    // Verify delays are escalating
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });
});

// ── Issue 3: Dashboard QR polling ────────────────────────────────

describe('Issue 3: Dashboard QR polling error handling', () => {
  const dashboardPath = path.join(process.cwd(), 'dashboard/index.html');
  let dashboardSrc: string;

  beforeEach(() => {
    dashboardSrc = fs.readFileSync(dashboardPath, 'utf-8');
  });

  it('pollWaQr handles 401/403 errors with a visible message', () => {
    expect(dashboardSrc).toContain('r.status === 401');
    expect(dashboardSrc).toContain('r.status === 403');
    expect(dashboardSrc).toContain('Authentication failed');
  });

  it('pollWaQr handles non-ok responses with error info instead of silently returning null', () => {
    // The old code just had: if (!r.ok) return null;
    // The new code should show an error message
    const pollSection = dashboardSrc.substring(
      dashboardSrc.indexOf('function pollWaQr()'),
      dashboardSrc.indexOf('function updateWaButton'),
    );
    // Should show HTTP status in error message
    expect(pollSection).toContain("'Error fetching QR code (HTTP '");
  });

  it('pollWaQr catch block surfaces network errors', () => {
    const pollSection = dashboardSrc.substring(
      dashboardSrc.indexOf('function pollWaQr()'),
      dashboardSrc.indexOf('function updateWaButton'),
    );
    // Old code had: .catch(() => {});
    // New code should show connection error
    expect(pollSection).toContain('Connection error');
    expect(pollSection).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });

  it('dashboard has WhatsApp QR panel with proper auth flow', () => {
    // Dashboard should fetch /whatsapp/qr with Bearer token
    expect(dashboardSrc).toContain("'Authorization': `Bearer ${token}`");
    expect(dashboardSrc).toContain('/whatsapp/qr');
  });

  it('dashboard PIN input is visible (not hidden by CSS)', () => {
    // The PIN input element itself should not have display:none or visibility:hidden
    const pinIdx = dashboardSrc.indexOf('id="pinInput"');
    // Extract just the <input ...> tag containing the pinInput id
    const tagStart = dashboardSrc.lastIndexOf('<input', pinIdx);
    const tagEnd = dashboardSrc.indexOf('>', pinIdx) + 1;
    const pinTag = dashboardSrc.substring(tagStart, tagEnd);
    expect(pinTag).not.toContain('display:none');
    expect(pinTag).not.toContain('display: none');
    expect(pinTag).not.toContain('visibility:hidden');
    expect(pinTag).not.toContain('visibility: hidden');
  });
});

// ── Server-side dashboard auth ───────────────────────────────────

describe('Server dashboard unlock endpoint', () => {
  const serverPath = path.join(process.cwd(), 'src/server/AgentServer.ts');
  let serverSrc: string;

  beforeEach(() => {
    serverSrc = fs.readFileSync(serverPath, 'utf-8');
  });

  it('logs a warning when dashboardPin or authToken is missing', () => {
    expect(serverSrc).toContain('Missing dashboardPin or authToken');
  });

  it('/dashboard/unlock endpoint uses timing-safe comparison for PIN', () => {
    expect(serverSrc).toContain('timingSafeEqual');
  });

  it('/dashboard/unlock endpoint has rate limiting', () => {
    expect(serverSrc).toContain('MAX_ATTEMPTS');
    expect(serverSrc).toContain('status(429)');
  });
});

// ── Helpers ──────────────────────────────────────────────────────

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...findTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}
