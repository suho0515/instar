/**
 * DigestCollector — Aggregates inter-agent message activity for periodic digest reports.
 *
 * Part of the Threadline Protocol Phase 2 (Autonomy-Gated Visibility).
 * In collaborative/autonomous modes, messages are delivered silently but tracked
 * here for periodic summary delivery to the user.
 *
 * Storage: {stateDir}/threadline/digest.json
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MessageEnvelope } from '../messaging/types.js';

// ── Types ────────────────────────────────────────────────────────────

export interface DigestEntry {
  /** Message ID */
  messageId: string;
  /** Who sent it */
  fromAgent: string;
  /** Message subject */
  subject: string;
  /** First 200 chars of body */
  bodyPreview: string;
  /** Thread context */
  threadId?: string;
  /** When received */
  receivedAt: string;
  /** Message type */
  type: string;
}

export interface DigestState {
  /** Entries since last digest */
  entries: DigestEntry[];
  /** When the last digest was sent */
  lastDigestSentAt: string;
  /** How often to send digests (in minutes) */
  digestIntervalMinutes: number;
}

// ── Constants ────────────────────────────────────────────────────────

/** Default digest interval: 60 minutes */
const DEFAULT_DIGEST_INTERVAL = 60;

/** Max body preview length */
const MAX_BODY_PREVIEW = 200;

/** Max entries to accumulate before auto-trimming oldest */
const MAX_DIGEST_ENTRIES = 200;

// ── Implementation ──────────────────────────────────────────────────

export class DigestCollector {
  private readonly filePath: string;

  constructor(stateDir: string) {
    const threadlineDir = path.join(stateDir, 'threadline');
    fs.mkdirSync(threadlineDir, { recursive: true });
    this.filePath = path.join(threadlineDir, 'digest.json');
  }

  /**
   * Track a delivered message for inclusion in the next digest.
   */
  addEntry(envelope: MessageEnvelope): void {
    const state = this.load();

    const entry: DigestEntry = {
      messageId: envelope.message.id,
      fromAgent: envelope.message.from.agent,
      subject: envelope.message.subject,
      bodyPreview: envelope.message.body.slice(0, MAX_BODY_PREVIEW),
      threadId: envelope.message.threadId,
      receivedAt: new Date().toISOString(),
      type: envelope.message.type,
    };

    state.entries.push(entry);

    // Trim if too many entries accumulated
    if (state.entries.length > MAX_DIGEST_ENTRIES) {
      state.entries = state.entries.slice(-MAX_DIGEST_ENTRIES);
    }

    this.save(state);
  }

  /**
   * Generate a human-readable digest summary of recent inter-agent activity.
   * Returns null if there are no entries to report.
   */
  generateDigest(): string | null {
    const state = this.load();

    if (state.entries.length === 0) {
      return null;
    }

    const lines: string[] = [];
    lines.push(`Inter-agent activity digest (${state.entries.length} messages)`);
    lines.push('');

    // Group by agent
    const byAgent = new Map<string, DigestEntry[]>();
    for (const entry of state.entries) {
      const existing = byAgent.get(entry.fromAgent) ?? [];
      existing.push(entry);
      byAgent.set(entry.fromAgent, existing);
    }

    for (const [agent, entries] of byAgent) {
      lines.push(`From ${agent} (${entries.length} messages):`);
      for (const entry of entries) {
        const threadTag = entry.threadId ? ` [thread:${entry.threadId.slice(0, 8)}]` : '';
        lines.push(`  - [${entry.type}] ${entry.subject}${threadTag}`);
        if (entry.bodyPreview) {
          lines.push(`    ${entry.bodyPreview.slice(0, 100)}${entry.bodyPreview.length > 100 ? '...' : ''}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  /**
   * Check if enough time has passed to send a digest.
   */
  shouldSendDigest(): boolean {
    const state = this.load();

    // No entries, no digest
    if (state.entries.length === 0) return false;

    const lastSent = new Date(state.lastDigestSentAt).getTime();
    const intervalMs = state.digestIntervalMinutes * 60 * 1000;

    return Date.now() - lastSent >= intervalMs;
  }

  /**
   * Mark digest as sent — clears accumulated entries and updates timestamp.
   */
  markDigestSent(): void {
    const state = this.load();
    state.entries = [];
    state.lastDigestSentAt = new Date().toISOString();
    this.save(state);
  }

  /**
   * Get the current digest interval in minutes.
   */
  getDigestInterval(): number {
    return this.load().digestIntervalMinutes;
  }

  /**
   * Set the digest interval in minutes.
   */
  setDigestInterval(minutes: number): void {
    const state = this.load();
    state.digestIntervalMinutes = Math.max(1, minutes);
    this.save(state);
  }

  /**
   * Get the number of pending entries.
   */
  entryCount(): number {
    return this.load().entries.length;
  }

  // ── Private ──────────────────────────────────────────────────────

  private load(): DigestState {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      // Corrupted — start fresh
    }
    return {
      entries: [],
      lastDigestSentAt: new Date().toISOString(),
      digestIntervalMinutes: DEFAULT_DIGEST_INTERVAL,
    };
  }

  private save(state: DigestState): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
    } catch {
      // Non-fatal — digest save should never break the system
    }
  }
}
