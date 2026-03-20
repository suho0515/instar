# Upgrade Guide — NEXT

<!-- bump: patch -->

## What Changed

- **Session auto-recovery hardening**: Recovery prompts now passed through to respawned sessions so they know what went wrong. JSONL file discovery hardened (lsof-only, no unsafe fallback). Backup files auto-cleaned after 24h. JSONL truncation uses tail-scan (256KB) instead of full file reads. Recovery state persists to disk across server restarts. Unicode sanitization added for prompt injection prevention.
- **Subagent-aware zombie cleanup**: Sessions waiting on subagent results are no longer killed as zombies. Instar session IDs bridged to Claude Code session IDs via hook events. 60-minute safety cap prevents stale subagent holds.
- **Dashboard terminal history**: Terminal scrollback increased to 50K lines. Dashboard supports loading additional history on scroll. WebSocket initial capture increased to 2000 lines.
- **Job scheduler priority**: High-priority jobs now take precedence during missed-run catch-up.

## What to Tell Your User

Session recovery is smarter — recovered sessions now know what went wrong and how to avoid repeating the failure. Sessions running subagents are no longer incorrectly killed as zombies. Dashboard terminal now shows more history.

## Summary of New Capabilities

- Recovery prompts for stall, crash, and error loop recovery
- Tail-scan JSONL truncation (no full file reads)
- Persistent recovery state (`.instar/recovery-state.json`)
- Subagent-aware zombie cleanup with safety cap
- Session ID bridging (Instar ↔ Claude Code) via hook events
- Post-update migration for hook URL session ID injection
- Dashboard terminal history scrollback (50K lines)
- High-priority job scheduling during catch-up
