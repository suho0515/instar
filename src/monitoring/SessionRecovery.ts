/**
 * SessionRecovery — Mechanical session crash/stall recovery via JSONL analysis.
 *
 * A fast, deterministic layer that runs BEFORE the LLM-powered TriageOrchestrator.
 * Detects three failure modes without any LLM calls:
 * 1. Tool call stalls (process alive but frozen mid-tool)
 * 2. Crashes (process dead with incomplete JSONL)
 * 3. Error loops (same error repeated 3+ times)
 *
 * Recovery strategy: truncate JSONL to safe point + respawn with recovery prompt.
 * Escalation ladder: last_exchange → last_successful_tool → n_exchanges_back → alert human.
 *
 * Self-contained — no Dawn dependencies. Uses only:
 * - stall-detector.ts (pure function)
 * - crash-detector.ts (pure function)
 * - jsonl-truncator.ts (pure function)
 *
 * Part of PROP-session-stall-recovery (Instar integration)
 */

import { EventEmitter } from 'events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { detectToolCallStall, type StallInfo } from './stall-detector.js';
import { detectCrashedSession, detectErrorLoop, type CrashInfo, type ErrorLoopInfo } from './crash-detector.js';
import { truncateJsonlToSafePoint, type TruncationStrategy } from './jsonl-truncator.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionRecoveryConfig {
  enabled: boolean;
  /** Max recovery attempts per session before alerting human */
  maxAttempts: number;
  /** Cooldown between recovery attempts (ms) */
  cooldownMs: number;
  /** Project directory (used to find JSONL files) */
  projectDir: string;
}

export interface RecoveryAttempt {
  lastAttempt: number;
  count: number;
}

export interface RecoveryResult {
  recovered: boolean;
  failureType: 'stall' | 'crash' | 'error_loop' | null;
  strategy?: TruncationStrategy;
  attemptNumber?: number;
  message: string;
}

export interface SessionRecoveryDeps {
  /** Check if a tmux session's Claude process is alive */
  isSessionAlive: (sessionName: string) => boolean;
  /** Get the PID of the pane in a tmux session */
  getPanePid?: (sessionName: string) => number | null;
  /** Kill a tmux session */
  killSession: (sessionName: string) => void;
  /** Respawn a session for a topic */
  respawnSession: (topicId: number, sessionName?: string) => Promise<void>;
  /** Send a message to a topic */
  sendToTopic?: (topicId: number, message: string) => Promise<void>;
}

// ============================================================================
// SessionRecovery Class
// ============================================================================

export class SessionRecovery extends EventEmitter {
  private config: SessionRecoveryConfig;
  private deps: SessionRecoveryDeps;
  private recoveryAttempts: Map<string, RecoveryAttempt> = new Map();

  constructor(config: Partial<SessionRecoveryConfig>, deps: SessionRecoveryDeps) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      maxAttempts: config.maxAttempts ?? 3,
      cooldownMs: config.cooldownMs ?? 15 * 60 * 1000,
      projectDir: config.projectDir || process.cwd(),
    };
    this.deps = deps;
  }

  /**
   * Check a session for mechanical failures and attempt recovery.
   * Should be called from SessionMonitor.checkSession() before LLM triage.
   *
   * @returns RecoveryResult — if recovered is true, caller should skip LLM triage
   */
  async checkAndRecover(
    topicId: number,
    sessionName: string,
  ): Promise<RecoveryResult> {
    if (!this.config.enabled) {
      return { recovered: false, failureType: null, message: 'Recovery disabled' };
    }

    // 1. Find the JSONL file for this session
    const jsonlPath = this.findJsonlForSession(sessionName);
    if (!jsonlPath) {
      return { recovered: false, failureType: null, message: 'No JSONL found' };
    }

    const processAlive = this.deps.isSessionAlive(sessionName);

    // 2. Check for stall (process alive but frozen)
    if (processAlive) {
      const stall = detectToolCallStall(jsonlPath);
      if (stall) {
        return this.recoverFromStall(topicId, sessionName, stall);
      }
    }

    // 3. Check for error loop (can happen with alive OR dead process)
    const errorLoop = detectErrorLoop(jsonlPath);
    if (errorLoop) {
      return this.recoverFromErrorLoop(topicId, sessionName, jsonlPath, errorLoop);
    }

    // 4. Check for crash (process dead with incomplete state)
    if (!processAlive) {
      const crash = detectCrashedSession(jsonlPath, false);
      if (crash) {
        return this.recoverFromCrash(topicId, sessionName, jsonlPath, crash);
      }
    }

    return { recovered: false, failureType: null, message: 'No mechanical failure detected' };
  }

  // ============================================================================
  // Recovery Methods
  // ============================================================================

  private async recoverFromStall(
    topicId: number,
    sessionName: string,
    stall: StallInfo,
  ): Promise<RecoveryResult> {
    const key = `stall:${stall.sessionUuid || sessionName}`;

    if (!this.shouldAttempt(key)) {
      return {
        recovered: false,
        failureType: 'stall',
        message: `Stall recovery exhausted or in cooldown for ${sessionName}`,
      };
    }

    const attemptNumber = this.recordAttempt(key);

    this.emit('recovery:stall', { topicId, sessionName, stall, attemptNumber });

    // Kill and respawn (stalls don't need truncation — just resume)
    this.deps.killSession(sessionName);

    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      await this.deps.respawnSession(topicId, sessionName);
      return {
        recovered: true,
        failureType: 'stall',
        attemptNumber,
        message: `Recovered from stall (${stall.lastToolName}, attempt ${attemptNumber})`,
      };
    } catch (err: any) {
      return {
        recovered: false,
        failureType: 'stall',
        attemptNumber,
        message: `Stall recovery respawn failed: ${err.message}`,
      };
    }
  }

  private async recoverFromCrash(
    topicId: number,
    sessionName: string,
    jsonlPath: string,
    crash: CrashInfo,
  ): Promise<RecoveryResult> {
    const key = `crash:${crash.sessionUuid || sessionName}`;

    if (!this.shouldAttempt(key)) {
      return {
        recovered: false,
        failureType: 'crash',
        message: `Crash recovery exhausted or in cooldown for ${sessionName}`,
      };
    }

    const attemptNumber = this.recordAttempt(key);
    const strategy = this.pickTruncationStrategy(attemptNumber);

    this.emit('recovery:crash', { topicId, sessionName, crash, attemptNumber, strategy });

    // Truncate JSONL
    try {
      truncateJsonlToSafePoint(jsonlPath, strategy, strategy === 'n_exchanges_back' ? 3 : undefined);
    } catch (err: any) {
      return {
        recovered: false,
        failureType: 'crash',
        strategy,
        attemptNumber,
        message: `JSONL truncation failed: ${err.message}`,
      };
    }

    // Kill (might already be dead) and respawn
    this.deps.killSession(sessionName);
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      await this.deps.respawnSession(topicId, sessionName);
      return {
        recovered: true,
        failureType: 'crash',
        strategy,
        attemptNumber,
        message: `Recovered from crash (${strategy}, attempt ${attemptNumber})`,
      };
    } catch (err: any) {
      return {
        recovered: false,
        failureType: 'crash',
        strategy,
        attemptNumber,
        message: `Crash recovery respawn failed: ${err.message}`,
      };
    }
  }

  private async recoverFromErrorLoop(
    topicId: number,
    sessionName: string,
    jsonlPath: string,
    loop: ErrorLoopInfo,
  ): Promise<RecoveryResult> {
    const key = `loop:${loop.sessionUuid || sessionName}`;

    if (!this.shouldAttempt(key)) {
      return {
        recovered: false,
        failureType: 'error_loop',
        message: `Error loop recovery exhausted or in cooldown for ${sessionName}`,
      };
    }

    const attemptNumber = this.recordAttempt(key);
    // Error loops need more aggressive truncation
    const strategy: TruncationStrategy = attemptNumber <= 1 ? 'last_exchange' : 'last_successful_tool';

    this.emit('recovery:error_loop', { topicId, sessionName, loop, attemptNumber, strategy });

    // Truncate JSONL
    try {
      truncateJsonlToSafePoint(jsonlPath, strategy);
    } catch (err: any) {
      return {
        recovered: false,
        failureType: 'error_loop',
        strategy,
        attemptNumber,
        message: `JSONL truncation failed: ${err.message}`,
      };
    }

    // Kill and respawn
    this.deps.killSession(sessionName);
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      await this.deps.respawnSession(topicId, sessionName);
      return {
        recovered: true,
        failureType: 'error_loop',
        strategy,
        attemptNumber,
        message: `Recovered from error loop (${loop.loopCount}x "${loop.failingPattern.slice(0, 50)}", attempt ${attemptNumber})`,
      };
    } catch (err: any) {
      return {
        recovered: false,
        failureType: 'error_loop',
        strategy,
        attemptNumber,
        message: `Error loop recovery respawn failed: ${err.message}`,
      };
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private pickTruncationStrategy(attemptNumber: number): TruncationStrategy {
    if (attemptNumber <= 1) return 'last_exchange';
    if (attemptNumber <= 2) return 'last_successful_tool';
    return 'n_exchanges_back';
  }

  private shouldAttempt(key: string): boolean {
    const prior = this.recoveryAttempts.get(key);
    if (!prior) return true;
    if (Date.now() - prior.lastAttempt < this.config.cooldownMs) return false;
    if (prior.count >= this.config.maxAttempts) return false;
    return true;
  }

  private recordAttempt(key: string): number {
    const prior = this.recoveryAttempts.get(key);
    const count = (prior?.count || 0) + 1;
    this.recoveryAttempts.set(key, { lastAttempt: Date.now(), count });
    return count;
  }

  /**
   * Find the JSONL file for a session by checking the Claude projects directory.
   */
  private findJsonlForSession(sessionName: string): string | null {
    const projectDir = this.config.projectDir;
    const projectHash = projectDir.replace(/[\/\.]/g, '-');
    const projectJsonlDir = path.join(os.homedir(), '.claude', 'projects', projectHash);

    if (!fs.existsSync(projectJsonlDir)) return null;

    try {
      const files = fs.readdirSync(projectJsonlDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const filePath = path.join(projectJsonlDir, f);
          try {
            const stat = fs.statSync(filePath);
            return { path: filePath, mtimeMs: stat.mtimeMs };
          } catch { return null; }
        })
        .filter((f): f is { path: string; mtimeMs: number } => f !== null)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Use most recently modified file if it's within the stall window
      if (files.length > 0 && Date.now() - files[0].mtimeMs < 30 * 60 * 1000) {
        return files[0].path;
      }
    } catch {
      // Can't read directory
    }

    return null;
  }

  /**
   * Clean up old recovery tracking entries.
   */
  cleanup(): void {
    const ONE_HOUR = 60 * 60 * 1000;
    for (const [key, entry] of Array.from(this.recoveryAttempts.entries())) {
      if (Date.now() - entry.lastAttempt > ONE_HOUR) {
        this.recoveryAttempts.delete(key);
      }
    }
  }
}
