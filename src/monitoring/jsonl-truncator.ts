/**
 * JSONL Truncator — Programmatic Conversation Rewind
 *
 * Claude Code has no programmatic rewind API. But the JSONL file IS the
 * conversation state. Truncating it is equivalent to rewinding.
 *
 * Always creates a backup before truncating. If resume after truncation fails,
 * the backup can be restored.
 *
 * Part of PROP-session-stall-recovery Phase B
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type TruncationStrategy = 'last_exchange' | 'last_successful_tool' | 'n_exchanges_back';

export interface TruncationResult {
  originalLines: number;
  truncatedLines: number;
  removedLines: number;
  backupPath: string;
  strategy: TruncationStrategy;
}

interface ParsedEntry {
  raw: string;
  parsed: any;
  lineIndex: number;
}

// ============================================================================
// Main Truncation Function
// ============================================================================

/**
 * Truncate a JSONL file to a safe point for resume.
 *
 * @param jsonlPath - Path to the JSONL conversation file
 * @param strategy - How far back to truncate
 * @param nExchanges - Number of exchanges to remove (only for 'n_exchanges_back')
 * @returns TruncationResult with details of what was done
 */
export function truncateJsonlToSafePoint(
  jsonlPath: string,
  strategy: TruncationStrategy = 'last_exchange',
  nExchanges: number = 1,
): TruncationResult {
  // 1. Read the full JSONL file
  const content = fs.readFileSync(jsonlPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error('JSONL file is empty — nothing to truncate');
  }

  // 2. Parse all entries
  const entries: ParsedEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      entries.push({
        raw: lines[i],
        parsed: JSON.parse(lines[i]),
        lineIndex: i,
      });
    } catch {
      // Keep unparseable lines as-is (they'll be included in output)
      entries.push({
        raw: lines[i],
        parsed: null,
        lineIndex: i,
      });
    }
  }

  // 3. Find truncation point based on strategy
  let keepUpTo: number; // Index in entries array — keep entries[0..keepUpTo-1]

  switch (strategy) {
    case 'last_exchange':
      keepUpTo = findLastExchangeStart(entries);
      break;
    case 'last_successful_tool':
      keepUpTo = findLastSuccessfulToolEnd(entries);
      break;
    case 'n_exchanges_back':
      keepUpTo = findNExchangesBack(entries, nExchanges);
      break;
    default:
      throw new Error(`Unknown truncation strategy: ${strategy}`);
  }

  // Safety: never truncate to nothing — keep at least the first entry
  if (keepUpTo <= 0) keepUpTo = 1;

  // 4. Create backup
  const backupPath = `${jsonlPath}.bak.${Date.now()}`;
  fs.copyFileSync(jsonlPath, backupPath);

  // 5. Write truncated content
  const truncatedLines = entries.slice(0, keepUpTo).map(e => e.raw);
  fs.writeFileSync(jsonlPath, truncatedLines.join('\n') + '\n');

  return {
    originalLines: entries.length,
    truncatedLines: keepUpTo,
    removedLines: entries.length - keepUpTo,
    backupPath,
    strategy,
  };
}

// ============================================================================
// Truncation Point Finders
// ============================================================================

/**
 * Find the start of the last exchange (assistant message that may have tool_use).
 * Removes the last assistant message and any following entries.
 */
function findLastExchangeStart(entries: ParsedEntry[]): number {
  // Walk backwards to find the last assistant entry
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i].parsed;
    if (entry && entry.type === 'assistant') {
      return i; // Truncate at this point (exclude this entry and everything after)
    }
  }
  // No assistant entry found — keep everything
  return entries.length;
}

/**
 * Find the end of the last complete tool exchange (tool_use followed by tool_result).
 * Keeps up to and including the last successful tool_result.
 */
function findLastSuccessfulToolEnd(entries: ParsedEntry[]): number {
  // Walk backwards looking for a successful tool_result
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i].parsed;
    if (!entry) continue;

    if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
      const hasSuccessfulResult = entry.message.content.some(
        (b: any) => b.type === 'tool_result' && !b.is_error
      );
      if (hasSuccessfulResult) {
        return i + 1; // Include this entry
      }
    }
  }

  // No successful tool result found — keep just the first entry
  return 1;
}

/**
 * Remove the last N complete exchanges (assistant + tool_result pairs).
 */
function findNExchangesBack(entries: ParsedEntry[], n: number): number {
  let exchangesFound = 0;
  let cutPoint = entries.length;

  // Walk backwards counting complete exchanges
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i].parsed;
    if (!entry) continue;

    // An assistant message marks the start of an exchange
    if (entry.type === 'assistant') {
      exchangesFound++;
      if (exchangesFound >= n) {
        cutPoint = i;
        break;
      }
    }
  }

  return cutPoint;
}

/**
 * Validate that a JSONL file contains valid entries.
 * Returns the number of valid lines.
 */
export function validateJsonl(jsonlPath: string): { valid: number; invalid: number } {
  const content = fs.readFileSync(jsonlPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  let valid = 0;
  let invalid = 0;

  for (const line of lines) {
    try {
      JSON.parse(line);
      valid++;
    } catch {
      invalid++;
    }
  }

  return { valid, invalid };
}
