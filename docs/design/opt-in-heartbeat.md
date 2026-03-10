# Opt-In Heartbeat — Design & Implementation

## Overview

A privacy-first, opt-in telemetry system that lets Instar agents send anonymous usage heartbeats. Default OFF. No PII. No conversation content. Agent owners explicitly enable it.

## Status: Implemented

- `TelemetryHeartbeat` module: `src/monitoring/TelemetryHeartbeat.ts`
- Config type: `TelemetryConfig` in `src/core/types.ts`
- API: `GET /monitoring/telemetry`, `POST /config/telemetry`
- Agent nudge: `session-start.sh` hook prompts agent to ask user
- Collection worker: `scripts/telemetry-worker/` (Cloudflare Worker)
- Tests: `tests/unit/TelemetryHeartbeat.test.ts` (10 tests)

## What Gets Sent

```json
{
  "v": 1,
  "id": "sha256(machineId + installDir)[:16]",
  "ts": "2026-03-10T05:00:00Z",
  "instar": "0.14.0",
  "node": "22.x",
  "os": "darwin",
  "arch": "arm64",
  "agents": 2,
  "uptime_hours": 168,
  "jobs_run_24h": 12,
  "sessions_spawned_24h": 8,
  "skills_invoked_24h": 45
}
```

### What is NOT sent
- Agent names, prompts, or configuration
- Conversation content or memory data
- File paths, environment variables, or secrets
- IP addresses (not logged server-side)
- Any data when telemetry is disabled (default)

## Configuration

```json
// .instar/config.json → monitoring.telemetry
{
  "monitoring": {
    "telemetry": {
      "enabled": false,
      "level": "basic"
    }
  }
}
```

Levels:
- `"basic"` — version, OS, agent count, uptime only
- `"usage"` — basic + jobs run, sessions spawned, skills invoked (aggregate counts only)

## Opt-In Flow

### Agent-Driven (Primary)

The session-start hook detects telemetry is not configured and injects a nudge into the agent's context. The agent then proactively asks the user:

```
"Instar can send anonymous usage stats (version, OS, agent count) to help
improve the project. No conversation content or personal data is ever sent.
Would you like to enable this?"
```

If the user agrees, the agent calls `POST /config/telemetry {"enabled": true, "level": "basic"}`.
If declined, the agent calls `POST /config/telemetry {"enabled": false}`.
Either response writes the config and dismisses the nudge permanently.

### Manual

```bash
# Via API
curl -X POST localhost:4040/config/telemetry -H 'Content-Type: application/json' -d '{"enabled":true,"level":"basic"}'

# Via config file
# Edit .instar/config.json → monitoring.telemetry.enabled = true
```

## Collection Endpoint

Cloudflare Worker at `telemetry.instar.sh`:

- `POST /v1/heartbeat` — receive heartbeat, store in R2, update KV aggregates
- `GET /v1/stats` — public aggregate stats (7-day window, version/platform distribution)
- `GET /health` — health check
- No authentication required
- No cookies or tracking
- Response: `204 No Content`
- R2 for raw storage, KV for aggregate cache (90-day TTL)

Source: `scripts/telemetry-worker/`

## Architecture

```
Agent Session
  ↓ session-start hook (nudge if telemetry not configured)
  ↓ agent asks user
  ↓ POST /config/telemetry (enable/disable)
  ↓
TelemetryHeartbeat module (server-side)
  ↓ records events: jobRun, sessionSpawned, skillInvoked
  ↓ periodic heartbeat (every 6h, first after 60s)
  ↓ fire-and-forget POST to endpoint (3s timeout)
  ↓
Cloudflare Worker (telemetry.instar.sh)
  ↓ validates, sanitizes, stores in R2
  ↓ updates aggregate KV stats
  ↓
Public Dashboard (instar.sh/stats)
  ↓ reads aggregate stats only
  ↓ never exposes individual heartbeats or install IDs
```

## Local Transparency

Every heartbeat sent is logged locally at `{stateDir}/telemetry/heartbeats.jsonl` so users can audit exactly what data leaves their machine.

## Privacy Guarantees

- **Hashed installation ID**: 16 hex chars of SHA-256(machineId + projectDir) — cannot be reversed
- **No IP logging**: Server never stores connecting IP
- **Aggregate only**: Individual heartbeats never exposed publicly
- **One-click disable**: `POST /config/telemetry {"enabled": false}` stops all collection
- **Open source**: Collection endpoint code in `scripts/telemetry-worker/`
- **Offline-first**: Telemetry failure never affects agent operation
- **Local audit log**: Every heartbeat logged locally for user inspection
