/**
 * AutonomyGate — Autonomy-gated visibility for inter-agent messages.
 *
 * Part of the Threadline Protocol Phase 2. Sits in the message receive pipeline
 * BEFORE ThreadlineRouter. When an inter-agent message arrives, the gate evaluates
 * the autonomy profile and decides what to do:
 *
 * - Cautious: Queue for user approval
 * - Supervised: Deliver immediately, notify user
 * - Collaborative: Deliver silently, add to periodic digest
 * - Autonomous: Deliver silently, log only
 *
 * The gate also handles per-agent blocking/pausing and integrates with
 * the ApprovalQueue and DigestCollector.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AutonomyProfileLevel } from '../core/types.js';
import type { AutonomyProfileManager } from '../core/AutonomyProfileManager.js';
import type { MessageEnvelope } from '../messaging/types.js';
import { ApprovalQueue } from './ApprovalQueue.js';
import { DigestCollector } from './DigestCollector.js';
import type { ApprovalQueueEntry } from './ApprovalQueue.js';

// ── Types ────────────────────────────────────────────────────────────

/** Gate decision on what to do with an inbound message */
export type GateDecision = 'deliver' | 'notify-and-deliver' | 'queue-for-approval' | 'block';

/** Result of evaluating a message through the gate */
export interface GateResult {
  /** What to do with the message */
  decision: GateDecision;
  /** Why this decision was made */
  reason: string;
  /** Whether a notification was sent (for notify-and-deliver) */
  notificationSent?: boolean;
  /** Approval ID for queued messages */
  approvalId?: string;
}

/** Callback interface for sending notifications — injected from outside */
export interface ThreadlineNotifier {
  /** Notify user about a delivered message */
  notifyUser(message: string): Promise<void>;
  /** Request user approval for a queued message */
  requestApproval(entry: ApprovalQueueEntry): Promise<void>;
  /** Send a periodic digest summary */
  sendDigest(digest: string): Promise<void>;
}

/** Per-agent control state */
type AgentControlStatus = 'paused' | 'blocked';

interface AgentControlState {
  [agentName: string]: {
    status: AgentControlStatus;
    since: string;
    reason?: string;
  };
}

interface AgentControlFile {
  agents: AgentControlState;
}

// ── Implementation ──────────────────────────────────────────────────

export class AutonomyGate {
  private readonly autonomyManager: AutonomyProfileManager;
  private readonly approvalQueue: ApprovalQueue;
  private readonly digestCollector: DigestCollector;
  private readonly notifier: ThreadlineNotifier | null;
  private readonly agentControlPath: string;

  constructor(opts: {
    autonomyManager: AutonomyProfileManager;
    approvalQueue: ApprovalQueue;
    digestCollector: DigestCollector;
    notifier?: ThreadlineNotifier | null;
    stateDir: string;
  }) {
    this.autonomyManager = opts.autonomyManager;
    this.approvalQueue = opts.approvalQueue;
    this.digestCollector = opts.digestCollector;
    this.notifier = opts.notifier ?? null;

    const threadlineDir = path.join(opts.stateDir, 'threadline');
    fs.mkdirSync(threadlineDir, { recursive: true });
    this.agentControlPath = path.join(threadlineDir, 'agent-controls.json');
  }

  /**
   * Evaluate an inbound inter-agent message through the autonomy gate.
   *
   * Pipeline:
   * 1. Check if the sending agent is blocked → block
   * 2. Check if the sending agent is paused → queue-for-approval
   * 3. Evaluate based on current autonomy profile level
   * 4. Execute side effects (notifications, digest, queue)
   */
  async evaluate(envelope: MessageEnvelope): Promise<GateResult> {
    const fromAgent = envelope.message.from.agent;

    // Step 1: Check if agent is blocked
    const agentStatus = this.getAgentStatus(fromAgent);
    if (agentStatus === 'blocked') {
      return {
        decision: 'block',
        reason: `Agent "${fromAgent}" is blocked.`,
      };
    }

    // Step 2: Check if agent is paused
    if (agentStatus === 'paused') {
      const approvalId = this.approvalQueue.enqueue(envelope);
      await this.fireApprovalRequest(approvalId);
      return {
        decision: 'queue-for-approval',
        reason: `Agent "${fromAgent}" is paused. Message queued for approval.`,
        approvalId,
      };
    }

    // Step 3: Evaluate based on autonomy level
    const level = this.autonomyManager.getProfile();
    return await this.evaluateByLevel(level, envelope);
  }

  /**
   * Approve a queued message and return the entry.
   */
  approveMessage(approvalId: string): ApprovalQueueEntry | null {
    return this.approvalQueue.approve(approvalId);
  }

  /**
   * Reject a queued message and return the entry.
   */
  rejectMessage(approvalId: string): ApprovalQueueEntry | null {
    return this.approvalQueue.reject(approvalId);
  }

  /**
   * Get the approval queue entries.
   */
  getApprovalQueue(status?: ApprovalQueueEntry['status']): ApprovalQueueEntry[] {
    return this.approvalQueue.getQueue(status);
  }

  /**
   * Prune expired approval queue entries.
   */
  pruneExpired(): string[] {
    return this.approvalQueue.pruneExpired();
  }

  /**
   * Check if a digest should be sent, and send it if so.
   * Returns true if a digest was sent.
   */
  async checkAndSendDigest(): Promise<boolean> {
    if (!this.digestCollector.shouldSendDigest()) return false;

    const digest = this.digestCollector.generateDigest();
    if (!digest) return false;

    if (this.notifier) {
      try {
        await this.notifier.sendDigest(digest);
      } catch {
        // Notification failure is non-fatal
      }
    }

    this.digestCollector.markDigestSent();
    return true;
  }

  // ── Agent Controls ──────────────────────────────────────────────

  /**
   * Temporarily pause all messages from an agent (queues them for approval).
   */
  pauseAgent(agentName: string, reason?: string): void {
    const controls = this.loadAgentControls();
    controls.agents[agentName] = {
      status: 'paused',
      since: new Date().toISOString(),
      reason,
    };
    this.saveAgentControls(controls);
  }

  /**
   * Resume messages from a paused agent.
   */
  resumeAgent(agentName: string): void {
    const controls = this.loadAgentControls();
    if (controls.agents[agentName]?.status === 'paused') {
      delete controls.agents[agentName];
      this.saveAgentControls(controls);
    }
  }

  /**
   * Permanently block all messages from an agent.
   */
  blockAgent(agentName: string, reason?: string): void {
    const controls = this.loadAgentControls();
    controls.agents[agentName] = {
      status: 'blocked',
      since: new Date().toISOString(),
      reason,
    };
    this.saveAgentControls(controls);
  }

  /**
   * Unblock an agent.
   */
  unblockAgent(agentName: string): void {
    const controls = this.loadAgentControls();
    delete controls.agents[agentName];
    this.saveAgentControls(controls);
  }

  /**
   * Get all blocked and paused agents.
   */
  getControlledAgents(): Array<{ agent: string; status: AgentControlStatus; since: string; reason?: string }> {
    const controls = this.loadAgentControls();
    return Object.entries(controls.agents).map(([agent, info]) => ({
      agent,
      ...info,
    }));
  }

  /**
   * Get the DigestCollector instance (for configuration).
   */
  getDigestCollector(): DigestCollector {
    return this.digestCollector;
  }

  /**
   * Get the ApprovalQueue instance (for direct access).
   */
  getApprovalQueueInstance(): ApprovalQueue {
    return this.approvalQueue;
  }

  // ── Private ──────────────────────────────────────────────────────

  private async evaluateByLevel(level: AutonomyProfileLevel, envelope: MessageEnvelope): Promise<GateResult> {
    switch (level) {
      case 'cautious': {
        const approvalId = this.approvalQueue.enqueue(envelope);
        await this.fireApprovalRequest(approvalId);
        return {
          decision: 'queue-for-approval',
          reason: 'Cautious mode: all inter-agent messages require user approval.',
          approvalId,
        };
      }

      case 'supervised': {
        // Deliver immediately, notify user
        let notificationSent = false;
        if (this.notifier) {
          try {
            const summary = this.buildNotificationSummary(envelope);
            await this.notifier.notifyUser(summary);
            notificationSent = true;
          } catch {
            // Notification failure is non-fatal — still deliver
          }
        }
        return {
          decision: 'notify-and-deliver',
          reason: 'Supervised mode: message delivered, user notified.',
          notificationSent,
        };
      }

      case 'collaborative': {
        // Deliver silently, add to digest
        this.digestCollector.addEntry(envelope);
        return {
          decision: 'deliver',
          reason: 'Collaborative mode: message delivered silently, added to digest.',
        };
      }

      case 'autonomous': {
        // Deliver silently, log only
        return {
          decision: 'deliver',
          reason: 'Autonomous mode: message delivered silently.',
        };
      }
    }
  }

  private buildNotificationSummary(envelope: MessageEnvelope): string {
    const msg = envelope.message;
    const threadTag = msg.threadId ? ` (thread: ${msg.threadId.slice(0, 8)})` : '';
    return `Inter-agent message from ${msg.from.agent}${threadTag}:\n[${msg.type}] ${msg.subject}\n${msg.body.slice(0, 200)}`;
  }

  private async fireApprovalRequest(approvalId: string): Promise<void> {
    if (!this.notifier) return;

    const entry = this.approvalQueue.getEntry(approvalId);
    if (!entry) return;

    try {
      await this.notifier.requestApproval(entry);
    } catch {
      // Notification failure is non-fatal
    }
  }

  private getAgentStatus(agentName: string): AgentControlStatus | null {
    const controls = this.loadAgentControls();
    return controls.agents[agentName]?.status ?? null;
  }

  private loadAgentControls(): AgentControlFile {
    try {
      if (fs.existsSync(this.agentControlPath)) {
        return JSON.parse(fs.readFileSync(this.agentControlPath, 'utf-8'));
      }
    } catch {
      // Corrupted — start fresh
    }
    return { agents: {} };
  }

  private saveAgentControls(controls: AgentControlFile): void {
    try {
      fs.writeFileSync(this.agentControlPath, JSON.stringify(controls, null, 2));
    } catch {
      // Non-fatal
    }
  }
}
