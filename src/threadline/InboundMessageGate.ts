/**
 * InboundMessageGate — Pre-filter for relay inbound messages.
 *
 * Gates on sender identity, trust level, rate limits, and payload size.
 * Does NOT determine delivery mode — that's AutonomyGate's job.
 *
 * Part of PROP-relay-auto-connect.
 */

import type { AgentTrustManager, AgentTrustLevel } from './AgentTrustManager.js';
import type { ThreadlineRouter } from './ThreadlineRouter.js';
import type { ReceivedMessage } from './client/ThreadlineClient.js';

// ── Types ────────────────────────────────────────────────────────────

export interface InboundGateConfig {
  /** Max payload size in bytes (default: 64KB) */
  maxPayloadBytes?: number;
  /** Per-trust-level rate limits */
  rateLimits?: Partial<Record<AgentTrustLevel, { probesPerHour: number; messagesPerHour: number; messagesPerDay: number }>>;
}

export interface GateDecision {
  action: 'pass' | 'block';
  reason?: string;
  fingerprint?: string;
  message?: ReceivedMessage;
  trustLevel?: AgentTrustLevel;
}

/** Operations that are probes (don't spawn sessions) */
const PROBE_OPS = new Set(['ping', 'health']);

/** Default rate limits per trust level */
const DEFAULT_RATE_LIMITS: Record<AgentTrustLevel, { probesPerHour: number; messagesPerHour: number; messagesPerDay: number }> = {
  untrusted: { probesPerHour: 5, messagesPerHour: 0, messagesPerDay: 0 },
  verified: { probesPerHour: 20, messagesPerHour: 10, messagesPerDay: 50 },
  trusted: { probesPerHour: 100, messagesPerHour: 50, messagesPerDay: 200 },
  autonomous: { probesPerHour: 500, messagesPerHour: 500, messagesPerDay: 10_000 },
};

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB

// ── Rate Limiter (per-sender sliding window) ─────────────────────────

interface RateWindow {
  timestamps: number[];
}

class PerSenderRateLimiter {
  private readonly probeWindows = new Map<string, RateWindow>();
  private readonly messageHourWindows = new Map<string, RateWindow>();
  private readonly messageDayWindows = new Map<string, RateWindow>();

  isProbeRateLimited(fingerprint: string, limit: number): boolean {
    return this.isLimited(this.probeWindows, fingerprint, limit, 60 * 60 * 1000);
  }

  isMessageHourLimited(fingerprint: string, limit: number): boolean {
    if (limit <= 0) return true; // 0 = blocked
    return this.isLimited(this.messageHourWindows, fingerprint, limit, 60 * 60 * 1000);
  }

  isMessageDayLimited(fingerprint: string, limit: number): boolean {
    if (limit <= 0) return true;
    return this.isLimited(this.messageDayWindows, fingerprint, limit, 24 * 60 * 60 * 1000);
  }

  private isLimited(windows: Map<string, RateWindow>, key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    let window = windows.get(key);
    if (!window) {
      window = { timestamps: [] };
      windows.set(key, window);
    }

    // Prune expired timestamps
    window.timestamps = window.timestamps.filter(t => now - t < windowMs);

    if (window.timestamps.length >= limit) {
      return true;
    }

    window.timestamps.push(now);
    return false;
  }

  /**
   * Evict stale entries to prevent unbounded memory growth.
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const windows of [this.probeWindows, this.messageHourWindows, this.messageDayWindows]) {
      for (const [key, window] of windows) {
        window.timestamps = window.timestamps.filter(t => now - t < maxAgeMs);
        if (window.timestamps.length === 0) {
          windows.delete(key);
        }
      }
    }
  }
}

// ── Implementation ───────────────────────────────────────────────────

export class InboundMessageGate {
  private readonly trustManager: AgentTrustManager;
  private router: ThreadlineRouter | null;
  private readonly config: InboundGateConfig;
  private readonly rateLimiter = new PerSenderRateLimiter();
  private readonly maxPayloadBytes: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Metrics
  private metrics = {
    passed: 0,
    blocked: 0,
    blockedByTrust: 0,
    blockedByRate: 0,
    blockedBySize: 0,
    probesHandled: 0,
  };

  constructor(
    trustManager: AgentTrustManager,
    router: ThreadlineRouter | null,
    config: InboundGateConfig = {},
  ) {
    this.trustManager = trustManager;
    this.router = router;
    this.config = config;
    this.maxPayloadBytes = config.maxPayloadBytes ?? MAX_PAYLOAD_BYTES;

    // Periodic cleanup of rate limiter state (every 30 minutes)
    this.cleanupTimer = setInterval(() => this.rateLimiter.cleanup(), 30 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Late-bind the router after server initialization.
   * The router isn't available at bootstrap time — it's created in server.ts
   * after the Threadline bootstrap completes.
   */
  setRouter(router: ThreadlineRouter): void {
    this.router = router;
  }

  /**
   * Evaluate an inbound relay message.
   * Returns 'pass' to route to ThreadlineRouter/AutonomyGate,
   * or 'block' with reason.
   */
  async evaluate(message: ReceivedMessage): Promise<GateDecision> {
    const fingerprint = message.from;

    // 0. Payload size check
    const payloadSize = this.estimatePayloadSize(message);
    if (payloadSize > this.maxPayloadBytes) {
      this.metrics.blocked++;
      this.metrics.blockedBySize++;
      return { action: 'block', reason: 'payload_too_large', fingerprint };
    }

    // 1. Determine operation type
    const opType = this.classifyOperation(message);
    const isProbe = PROBE_OPS.has(opType);

    // 2. Trust check (keyed by fingerprint)
    const trust = this.trustManager.getTrustLevelByFingerprint(fingerprint);
    const limits = this.getRateLimits(trust);

    // 3. Handle probes (don't require 'message' permission)
    if (isProbe) {
      if (this.rateLimiter.isProbeRateLimited(fingerprint, limits.probesPerHour)) {
        this.metrics.blocked++;
        this.metrics.blockedByRate++;
        return { action: 'block', reason: 'probe_rate_limited', fingerprint };
      }
      this.metrics.probesHandled++;
      // Probes are handled inline — return pass with probe flag
      return { action: 'pass', message, trustLevel: trust, reason: 'probe' };
    }

    // 4. Message permission check
    const allowedOps = this.trustManager.getAllowedOperationsByFingerprint(fingerprint);
    if (!allowedOps.includes(opType)) {
      this.metrics.blocked++;
      this.metrics.blockedByTrust++;
      return { action: 'block', reason: 'insufficient_trust', fingerprint };
    }

    // 5. Rate limit check (per-sender, trust-level-aware)
    if (this.rateLimiter.isMessageHourLimited(fingerprint, limits.messagesPerHour)) {
      this.metrics.blocked++;
      this.metrics.blockedByRate++;
      return { action: 'block', reason: 'rate_limited_hourly', fingerprint };
    }
    if (this.rateLimiter.isMessageDayLimited(fingerprint, limits.messagesPerDay)) {
      this.metrics.blocked++;
      this.metrics.blockedByRate++;
      return { action: 'block', reason: 'rate_limited_daily', fingerprint };
    }

    // 6. Record interaction (debounced)
    this.trustManager.recordMessageReceivedByFingerprint(fingerprint);

    // 7. Pass to ThreadlineRouter -> AutonomyGate handles delivery mode
    this.metrics.passed++;
    return { action: 'pass', message, trustLevel: trust };
  }

  /**
   * Get gate metrics for observability.
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Shutdown: cleanup timers.
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────

  private classifyOperation(message: ReceivedMessage): string {
    // Check for explicit operation type in content
    const content = message.content;
    if (typeof content === 'object' && content !== null && 'type' in content) {
      return (content as { type: string }).type;
    }
    // Default: treat as 'message'
    return 'message';
  }

  private estimatePayloadSize(message: ReceivedMessage): number {
    try {
      return Buffer.byteLength(JSON.stringify(message.content), 'utf-8');
    } catch {
      return 0;
    }
  }

  private getRateLimits(trust: AgentTrustLevel) {
    return {
      ...DEFAULT_RATE_LIMITS[trust],
      ...this.config.rateLimits?.[trust],
    };
  }
}
