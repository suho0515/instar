/**
 * ClaudeCliIntelligenceProvider — Default IntelligenceProvider using the Claude CLI.
 *
 * Uses `claude -p` (print mode) to make judgment calls via the user's existing
 * Claude subscription. Zero extra cost — the subscription is already paid for.
 *
 * This is the DEFAULT provider for Instar agents. The Anthropic API provider
 * (AnthropicIntelligenceProvider) is an explicit opt-in alternative for users
 * who intentionally choose direct API access.
 *
 * Preference hierarchy:
 *   1. Claude CLI (subscription) — default, always available
 *   2. Anthropic API — explicit user choice only
 */

import { execFile } from 'node:child_process';
import type { IntelligenceProvider, IntelligenceOptions } from './types.js';

/** Model mapping: abstract tiers → Claude CLI model flags */
const MODEL_MAP: Record<string, string> = {
  fast: 'haiku',
  balanced: 'sonnet',
  capable: 'opus',
};

const DEFAULT_MODEL = 'fast';
const DEFAULT_TIMEOUT_MS = 30_000;

export class ClaudeCliIntelligenceProvider implements IntelligenceProvider {
  private claudePath: string;

  constructor(claudePath: string) {
    this.claudePath = claudePath;
  }

  async evaluate(prompt: string, options?: IntelligenceOptions): Promise<string> {
    const model = MODEL_MAP[options?.model ?? DEFAULT_MODEL] ?? MODEL_MAP[DEFAULT_MODEL];
    const maxTokens = options?.maxTokens ?? 100;

    return new Promise((resolve, reject) => {
      const args = [
        '-p', prompt,
        '--model', model,
        '--max-turns', '1',
        '--output-format', 'text',
      ];

      if (maxTokens) {
        args.push('--max-tokens', String(maxTokens));
      }

      const child = execFile(this.claudePath, args, {
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        if (error) {
          // Timeout or other error — return empty so caller can fall back
          reject(new Error(`Claude CLI error: ${error.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ''}`));
          return;
        }

        resolve(stdout.trim());
      });

      // Write prompt via stdin for very long prompts (belt and suspenders)
      child.stdin?.end();
    });
  }
}
