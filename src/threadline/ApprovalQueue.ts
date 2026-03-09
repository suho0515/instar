/**
 * ApprovalQueue — Queues inter-agent messages awaiting user approval.
 *
 * Part of the Threadline Protocol Phase 2 (Autonomy-Gated Visibility).
 * When the autonomy gate decides a message needs user approval (cautious mode),
 * it's enqueued here. The user approves/rejects via Telegram or dashboard.
 *
 * Storage: {stateDir}/threadline/approval-queue.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MessageEnvelope } from '../messaging/types.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ApprovalQueueEntry {
  /** Approval request ID */
  id: string;
  /** The message awaiting approval */
  messageId: string;
  /** Thread context */
  threadId?: string;
  /** Who sent it */
  fromAgent: string;
  /** Message subject */
  subject: string;
  /** Message body (truncated for display) */
  body: string;
  /** When received */
  receivedAt: string;
  /** From message envelope TTL */
  ttlMinutes: number;
  /** Approval status */
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** When user decided */
  decidedAt?: string;
  /** Who decided (user ID or 'system' for TTL expiry) */
  decidedBy?: string;
}

interface ApprovalQueueData {
  entries: ApprovalQueueEntry[];
}

// ── Constants ────────────────────────────────────────────────────────

/** Max body preview length for display */
const MAX_BODY_PREVIEW = 500;

/** Max entries to keep in the queue file (including decided) */
const MAX_QUEUE_ENTRIES = 500;

// ── Implementation ──────────────────────────────────────────────────

export class ApprovalQueue {
  private readonly filePath: string;

  constructor(stateDir: string) {
    const threadlineDir = path.join(stateDir, 'threadline');
    fs.mkdirSync(threadlineDir, { recursive: true });
    this.filePath = path.join(threadlineDir, 'approval-queue.json');
  }

  /**
   * Add a message to the approval queue.
   * Returns the approval ID for tracking.
   */
  enqueue(envelope: MessageEnvelope): string {
    const data = this.load();
    const id = crypto.randomUUID();

    const entry: ApprovalQueueEntry = {
      id,
      messageId: envelope.message.id,
      threadId: envelope.message.threadId,
      fromAgent: envelope.message.from.agent,
      subject: envelope.message.subject,
      body: envelope.message.body.slice(0, MAX_BODY_PREVIEW),
      receivedAt: new Date().toISOString(),
      ttlMinutes: envelope.message.ttlMinutes,
      status: 'pending',
    };

    data.entries.push(entry);

    // Keep the queue manageable
    if (data.entries.length > MAX_QUEUE_ENTRIES) {
      // Remove oldest decided entries first
      const decided = data.entries.filter(e => e.status !== 'pending');
      const pending = data.entries.filter(e => e.status === 'pending');
      const keptDecided = decided.slice(-Math.floor(MAX_QUEUE_ENTRIES / 2));
      data.entries = [...keptDecided, ...pending];
    }

    this.save(data);
    return id;
  }

  /**
   * Approve a queued message. Returns the entry if found.
   */
  approve(approvalId: string, decidedBy = 'user'): ApprovalQueueEntry | null {
    const data = this.load();
    const entry = data.entries.find(e => e.id === approvalId);
    if (!entry || entry.status !== 'pending') return null;

    entry.status = 'approved';
    entry.decidedAt = new Date().toISOString();
    entry.decidedBy = decidedBy;

    this.save(data);
    return entry;
  }

  /**
   * Reject a queued message. Returns the entry if found.
   */
  reject(approvalId: string, decidedBy = 'user'): ApprovalQueueEntry | null {
    const data = this.load();
    const entry = data.entries.find(e => e.id === approvalId);
    if (!entry || entry.status !== 'pending') return null;

    entry.status = 'rejected';
    entry.decidedAt = new Date().toISOString();
    entry.decidedBy = decidedBy;

    this.save(data);
    return entry;
  }

  /**
   * Get queue entries, optionally filtered by status.
   */
  getQueue(status?: ApprovalQueueEntry['status']): ApprovalQueueEntry[] {
    const data = this.load();
    if (status) {
      return data.entries.filter(e => e.status === status);
    }
    return [...data.entries];
  }

  /**
   * Get a single entry by approval ID.
   */
  getEntry(approvalId: string): ApprovalQueueEntry | null {
    const data = this.load();
    return data.entries.find(e => e.id === approvalId) ?? null;
  }

  /**
   * Prune expired entries based on TTL.
   * Returns the IDs of entries that were expired.
   */
  pruneExpired(): string[] {
    const data = this.load();
    const now = Date.now();
    const expired: string[] = [];

    for (const entry of data.entries) {
      if (entry.status !== 'pending') continue;

      const receivedAt = new Date(entry.receivedAt).getTime();
      const ttlMs = entry.ttlMinutes * 60 * 1000;

      if (now - receivedAt > ttlMs) {
        entry.status = 'expired';
        entry.decidedAt = new Date().toISOString();
        entry.decidedBy = 'system';
        expired.push(entry.id);
      }
    }

    if (expired.length > 0) {
      this.save(data);
    }

    return expired;
  }

  /**
   * Get the count of pending entries.
   */
  pendingCount(): number {
    const data = this.load();
    return data.entries.filter(e => e.status === 'pending').length;
  }

  // ── Private ──────────────────────────────────────────────────────

  private load(): ApprovalQueueData {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      // Corrupted — start fresh
    }
    return { entries: [] };
  }

  private save(data: ApprovalQueueData): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch {
      // Non-fatal — queue save should never break the system
    }
  }
}
