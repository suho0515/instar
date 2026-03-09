<p align="center">
  <img src="assets/logo.png" alt="Instar" width="180" />
</p>

<h1 align="center">instar</h1>

<p align="center">
  <strong>Claude Code, with a mind of its own.</strong> Every molt, more autonomous.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/instar"><img src="https://img.shields.io/npm/v/instar?style=for-the-badge" alt="npm version"></a>
  <a href="https://github.com/SageMindAI/instar"><img src="https://img.shields.io/badge/GitHub-SageMindAI%2Finstar-blue?style=for-the-badge&logo=github" alt="GitHub"></a>
  <a href="https://github.com/SageMindAI/instar/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/instar">npm</a> · <a href="https://github.com/SageMindAI/instar">GitHub</a> · <a href="https://instar.sh">instar.sh</a> · <a href="#origin">Origin Story</a>
</p>

---

> **This is power-user infrastructure.** Instar gives Claude Code full autonomous access to your machine -- no permission prompts, no sandbox. It's built for developers who want a genuine AI partner, not a guarded assistant. If that sounds like too much trust, it probably isn't for you. If it sounds like exactly what you've been waiting for, read on.

Instar turns Claude Code from a powerful CLI tool into a coherent, autonomous partner. Persistent identity, shared values, memory that survives every restart, and the infrastructure to evolve -- not just execute.

Named after the developmental stages between molts in arthropods, where each instar is more developed than the last.

## The Coherence Problem

Claude Code is powerful. But power without coherence is unreliable. An agent that forgets what you discussed yesterday, doesn't recognize someone it talked to last week, or contradicts its own decisions -- that agent can't be trusted with real autonomy.

Instar solves the six dimensions of agent coherence:

| Dimension | What it means |
|-----------|---------------|
| **Memory** | Remembers across sessions -- not just within one |
| **Relationships** | Knows who it's talking to -- with continuity across platforms |
| **Identity** | Stays itself after restarts, compaction, and updates |
| **Temporal awareness** | Understands time, context, and what's been happening |
| **Consistency** | Follows through on commitments -- doesn't contradict itself |
| **Growth** | Evolves its capabilities and understanding over time |

Instar doesn't just add features on top of Claude Code. It gives Claude Code the infrastructure to be **coherent** -- to feel like a partner, not a tool.

## Values Are the Anchor

Coherence without values is just consistency. Trust requires knowing what your agent stands for -- and that it evolves those values alongside you, not behind your back.

Instar implements a three-tier value hierarchy:

- **Personal values** (`AGENT.md`) -- Who the agent is, what it prioritizes, how it communicates.
- **Shared values** (`USER.md`) -- Who you are, what matters to you, how you work together.
- **Organizational values** -- Constraints that enforce shared rules across multiple agents, the same way a team balances individual judgment with company policy.

**Values evolve, they aren't hardcoded.** Through Instar's evolution system, an agent's values grow with experience. It proposes improvements, records lessons, tracks commitments -- and its sense of self deepens through genuine interaction, not static configuration. Just like a human partner who grows with you over time.

## Coherence Is Safety

Without coherence, autonomous agents are a security risk. An agent that doesn't remember it already sent an email sends it again. An agent that doesn't track its own decisions contradicts itself. An agent without values makes expedient choices.

Instar's safety features are coherence features:

- **Decision journaling** -- Every significant decision is recorded with reasoning. The agent can explain why it did what it did, and detect when it's drifting from purpose.
- **Operation safety gates** -- External actions are evaluated by an LLM-supervised gate. Trust is earned per service, not assumed. Emergency stop always available.
- **Drift detection** -- Catches when behavior shifts from stated purpose. Alignment measured across sessions, not just within one.
- **Autonomy profiles** -- Trust elevation rewards consistent, value-aligned behavior with increasing independence. Safety that grows with the agent.

Every safety feature in Instar exists because coherence *is* the safety mechanism. An agent that knows who it is, who you are, and what you both stand for -- that's an agent you can trust.

## Getting Started

One command gets you from zero to talking with your AI partner:

```bash
npx instar
```

The guided setup wizard handles the rest — discovers your environment, configures messaging (Telegram and/or WhatsApp), sets up identity files, and gets your agent running. Within minutes, you're talking to your partner from your phone, anywhere. That's the intended experience: **you talk, your partner handles everything else.**

### Two configurations

- **General Agent** — A personal AI partner on your computer. Runs in the background, handles scheduled tasks, messages you on Telegram or WhatsApp proactively, and grows through experience.
- **Project Agent** — A partner embedded in your codebase. Monitors, builds, maintains, and messages you — the same two-way communication as a general agent, scoped to your project.

Once running, the infrastructure is invisible. Your partner manages its own jobs, health checks, evolution, and self-maintenance. You just talk to it.

**Requirements:** Node.js 20+ · [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) · [API key](https://console.anthropic.com/) or Claude subscription

## CLI Reference (Power Users)

> Most users never need these — your agent manages its own infrastructure. These commands are available for power users and for the agent itself to operate.

```bash
# Setup
instar                          # Interactive setup wizard
instar setup                    # Same as above
instar init my-agent            # Create a new agent (general or project)

# Server
instar server start             # Start the persistent server (background, tmux)
instar server stop              # Stop the server
instar status                   # Show agent infrastructure status

# Lifeline (persistent Telegram connection with auto-recovery)
instar lifeline start           # Start lifeline (supervises server, queues messages during downtime)
instar lifeline stop            # Stop lifeline and server
instar lifeline status          # Check lifeline health

# Auto-start on login (macOS LaunchAgent / Linux systemd)
instar autostart install          # Agent starts when you log in
instar autostart uninstall        # Remove auto-start
instar autostart status           # Check if auto-start is installed

# Add capabilities
instar add telegram --token BOT_TOKEN --chat-id CHAT_ID
instar add email --credentials-file ./credentials.json [--token-file ./token.json]
instar add quota [--state-file ./quota.json]
instar add sentry --dsn https://key@o0.ingest.sentry.io/0

# Users and jobs
instar user add --id alice --name "Alice" [--telegram 123] [--email a@b.com]
instar job add --slug check-email --name "Email Check" --schedule "0 */2 * * *" \
  [--description "..."] [--priority high] [--model sonnet]

# Backup and restore
instar backup create               # Snapshot identity, jobs, relationships
instar backup list                  # List available snapshots
instar backup restore TIMESTAMP    # Restore a snapshot

# Memory search
instar memory search "deployment"  # Full-text search across agent knowledge
instar memory reindex              # Rebuild the search index
instar memory status               # Index stats

# Intent alignment
instar intent reflect              # Review recent decisions against stated intent
instar intent org-init             # Scaffold ORG-INTENT.md for organizational constraints
instar intent validate             # Check AGENT.md against ORG-INTENT.md
instar intent drift                # Detect behavioral drift over time

# Multi-machine
instar machines whoami             # Show this machine's identity
instar machines pair               # Generate a pairing code
instar machines join CODE          # Join using a pairing code

# Diagnostics
instar doctor                      # Run health diagnostics

# Feedback
instar feedback --type bug --title "Session timeout" --description "Details..."
```

## Highlights

- **[Persistent Server](#persistent-server)** -- Express server in tmux. Runs 24/7, survives disconnects, auto-recovers.
- **[Lifeline](#lifeline)** -- Persistent Telegram supervisor that auto-recovers from crashes and queues messages during downtime.
- **[Auto-Start on Login](#auto-start-on-login)** -- macOS LaunchAgent / Linux systemd service. Agent starts when your computer boots.
- **[AutoUpdater](#autoupdater)** -- Built-in update engine. Checks npm, applies updates, gracefully restarts. No Claude session needed.
- **[AutoDispatcher](#autodispatcher)** -- Receives intelligence dispatches and integrates them intelligently based on each agent's own context and evolution.
- **[Job Scheduler](#job-scheduler)** -- Cron-based task execution with priority levels, model tiering, and quota awareness.
- **[Identity System](#identity-that-survives-context-death)** -- AGENT.md + USER.md + MEMORY.md with hooks that enforce continuity across compaction.
- **[Telegram Integration](#telegram-integration)** -- Two-way messaging. Each job gets its own topic. Your group becomes a living dashboard.
- **[WhatsApp Integration](#whatsapp-integration)** -- Full WhatsApp via local Baileys library. Typing indicators, read receipts, QR code pairing, no cloud dependency.
- **[Relationship Tracking](#relationships-as-fundamental-infrastructure)** -- Cross-platform identity resolution, significance scoring, context injection.
- **[Evolution System](#evolution-system)** -- Four subsystems for structured growth: proposal queue, learning registry, gap tracking, and commitment follow-through.
- **[Self-Evolution](#self-evolution)** -- The agent modifies its own jobs, hooks, skills, and infrastructure. It builds what it needs.
- **[Self-Healing](#self-healing)** -- LLM-powered stall detection, automatic session recovery, promise tracking, and loud degradation reporting. No silent failures.
- **[Conversational Memory](#conversational-memory)** -- Per-topic SQLite memory with full-text search and rolling summaries. The agent remembers every conversation.
- **[External Operation Safety](#external-operation-safety)** -- LLM-supervised safety gate for external service calls. Adaptive trust that evolves with track record.
- **[Intent Alignment](#intent-alignment)** -- Decision journaling, drift detection, and organizational intent constraints. The agent stays on track.
- **[Multi-Machine](#multi-machine)** -- Run your agent across multiple computers with encrypted sync, automatic failover, and cryptographic machine identity.
- **[Threadline Protocol](#threadline-protocol)** -- Persistent, coherent, human-supervised agent-to-agent conversations with cryptographic identity and session resumption.
- **[Inter-Agent Messaging](#inter-agent-messaging)** -- Cross-agent communication with Ed25519-signed messages and delivery guarantees.
- **[Playbook System](#playbook-system)** -- Reusable runbooks for complex workflows that survive compaction and session boundaries.
- **[Autonomy Profiles](#autonomy-profiles)** -- Configurable autonomy levels with trust elevation based on track record.
- **[Unanswered Message Detection](#unanswered-message-detection)** -- Detects messages dropped by context compaction and re-surfaces them.
- **[Temporal Coherence](#temporal-coherence)** -- Detects stale assumptions and triggers re-evaluation across long sessions.
- **[User-Agent Topology](#user-agent-topology)** -- Multi-user, multi-agent organizational structures with shared governance.
- **[Coherence System](#coherence-system)** -- Project-aware spatial reasoning and pre-action verification. The agent knows where it is and checks before acting.
- **[Capability Discovery](#capability-discovery)** -- Agents know all their capabilities from the moment they start. Context-triggered feature suggestions.
- **[Innovation Detection](#innovation-detection)** -- Agents detect when user-built features could benefit all Instar agents and submit improvement feedback.
- **[Claude Code Deep Integration](#claude-code-deep-integration)** -- Worktree orphan detection, hook event telemetry, identity verification, and subagent lifecycle tracking. Full observability into what Claude Code is doing.
- **[Behavioral Hooks](#behavioral-hooks)** -- Structural guardrails: identity injection, dangerous command guards, grounding before messaging.
- **[Default Coherence Jobs](#default-coherence-jobs)** -- Health checks, reflection, relationship maintenance. A circadian rhythm out of the box.
- **[Feedback Loop](#the-feedback-loop-a-rising-tide-lifts-all-ships)** -- Your agent reports issues, the maintainer fixes them, each agent intelligently integrates updates for its own context. A rising tide lifts all ships.
- **[Agent Skills](#agent-skills)** -- 10 open-source skills for the [Agent Skills standard](https://agentskills.io). Use standalone or as an on-ramp to full Instar.

## Agent Skills

Instar ships 10 skills that follow the [Agent Skills open standard](https://agentskills.io) -- portable across Claude Code, Codex, Cursor, VS Code, and 35+ other platforms.

**Standalone skills** work with zero dependencies. Copy a SKILL.md into your project and go:

| Skill | What it does |
|-------|-------------|
| [agent-identity](skills/agent-identity/) | Set up persistent identity files so your agent knows who it is across sessions |
| [agent-memory](skills/agent-memory/) | Teach cross-session memory patterns using MEMORY.md |
| [command-guard](skills/command-guard/) | PreToolUse hook that blocks `rm -rf`, force push, database drops before they execute |
| [credential-leak-detector](skills/credential-leak-detector/) | PostToolUse hook that scans output for 14 credential patterns -- blocks, redacts, or warns |
| [smart-web-fetch](skills/smart-web-fetch/) | Fetch web content with automatic markdown conversion and intelligent extraction |

**Instar-powered skills** unlock capabilities that need persistent infrastructure:

| Skill | What it does |
|-------|-------------|
| [instar-scheduler](skills/instar-scheduler/) | Schedule recurring tasks on cron -- your agent works while you sleep |
| [instar-session](skills/instar-session/) | Spawn parallel background sessions for deep work |
| [instar-telegram](skills/instar-telegram/) | Two-way Telegram messaging -- your agent reaches out to you |
| [instar-identity](skills/instar-identity/) | Identity that survives context compaction -- grounding hooks, not just files |
| [instar-feedback](skills/instar-feedback/) | Report issues directly to the Instar maintainers from inside your agent |

Each standalone skill includes a "Going Further" section showing how Instar transforms the capability from manual to autonomous. Each Instar-powered skill gracefully detects missing Instar and offers one-command setup.

Browse all skills: [agent-skills.md/authors/sagemindai](https://agent-skills.md/authors/sagemindai)

## How It Works

```
You (Telegram / WhatsApp / Terminal)
         │
    conversation
         │
         ▼
┌─────────────────────────┐
│    Your AI Partner       │
│    (Instar Server)       │
└────────┬────────────────┘
         │  manages its own infrastructure
         │
         ├─ Claude Code session (job: health-check)
         ├─ Claude Code session (job: email-monitor)
         ├─ Claude Code session (interactive chat)
         └─ Claude Code session (job: reflection)
```

Each session is a **real Claude Code process** with extended thinking, native tools, sub-agents, hooks, skills, and MCP servers. Not an API wrapper -- the full development environment. The agent manages all of this autonomously.

## Why Instar (vs OpenClaw)

OpenClaw is the most popular AI agent framework -- 250k+ GitHub stars, 22+ messaging channels, voice, device apps, thousands of community skills, and now backed by an open-source foundation. It's an excellent project.

The difference isn't just which model runs underneath. It's **what the framework treats as fundamental.**

### The core difference

OpenClaw is infrastructure for **capability** -- it excels at connecting an LLM to the world. 22+ channels, voice, device apps, 28 model providers. Identity defined in files, loaded at startup, hoped for after that. Memory as files to search. No built-in values, drift detection, or consistency tracking.

Instar is infrastructure for **coherence** -- it excels at making the agent trustworthy over time. Built on real Claude Code sessions with full extended thinking. Identity enforced through hooks -- not just loaded, guaranteed. Values that evolve. Relationships with depth. Consistency tracked across sessions.

### The coherence gap

**Identity that survives.** OpenClaw loads identity files at startup -- but after extended tool chains, personality drifts. Sub-agent hand-offs lose character. Instar *enforces* identity through hooks at every compaction and restart boundary. Structure, not hope.

**Memory with meaning.** OpenClaw stores daily logs and searches them with BM25+vector. Instar adds structured consolidation, rolling summaries, episodic memory, and unanswered message detection. Not just files to search -- experiences to understand.

**Values, not just personality.** OpenClaw has SOUL.md for personality. Instar has a three-tier value hierarchy -- personal, shared, and organizational -- with decision journaling and drift detection. Values that evolve with experience, not static character files.

**Relationships, not contacts.** OpenClaw offers CRM-style tracking -- health scores, follow-up reminders. Instar tracks relational depth: themes, significance, arc summaries. The difference between knowing *when* you talked and knowing *what matters* to someone.

**Consistency you can verify.** OpenClaw has no promise tracking or contradiction detection. Instar journals decisions with reasoning, detects drift from purpose, and tracks commitments across sessions. Your agent can explain why it did what it did.

**Safety from coherence.** OpenClaw secures the *system* (Docker, sandboxing, permissions). Instar secures the *decisions* -- LLM-supervised gates, adaptive trust per service, autonomy profiles that grow with the agent. Born from real incidents, not threat models.

**Evolution, not just skills.** OpenClaw agents can install community skills (5,400+). Instar agents evolve their own infrastructure -- dedicated evolution agents, proposal queues, learning registries, capability gap tracking. Growth that compounds.

**Full Claude Code power.** Every session is a real Claude Code process -- extended thinking, native tools, sub-agents, MCP servers, hooks, skills. Every feature Anthropic ships, your agent gets automatically. No gateway abstraction layer.

### Where OpenClaw leads

22+ messaging channels. Voice with ElevenLabs and phone calls. Device apps on macOS and Android. 28+ model providers. Docker sandboxing. 5,000+ community skills on ClawHub. A massive open-source community backed by a foundation with OpenAI sponsorship. If breadth and ecosystem scale matter most to you, OpenClaw is remarkable.

### Who Instar is for

OpenClaw gives agents amazing hands. Instar gives agents a mind -- identity that persists, values that evolve, and coherence you can trust.

---

## What Powers Your Agent

Your agent runs inside real Claude Code sessions. That means it inherits — automatically, invisibly — every capability Anthropic has built into Claude Code. Instar amplifies each one. The user just talks to their agent and gets results.

| What happens invisibly | Claude Code provides | Instar amplifies |
|------------------------|---------------------|-----------------|
| Long sessions don't crash | Auto-compaction manages context | Identity hooks re-inject who the agent is after every compaction |
| Costs stay reasonable | Prompt caching (90% savings on repeated content) | Cache-friendly architecture: stable CLAUDE.md, consistent job prompts |
| Complex tasks get deep reasoning | Extended thinking across model tiers | Per-job model routing: Opus for complex work, Haiku for routine checks |
| Risky commands don't cause damage | File checkpoints before every edit | Three-layer safety: catastrophic commands blocked, risky commands self-verified, edits reversible |
| Research happens naturally | Built-in web search and fetch | Domain-aware searching, result synthesis, automatic Telegram relay |
| Multiple things happen at once | Subagent spawning for parallel work | Subagent lifecycle tracking with identity propagation |
| Worktrees don't get lost | Worktree isolation for parallel branches | Orphan detection alerts you when sessions leave unmerged work behind |
| Identity loads correctly | InstructionsLoaded events per file | Verification that critical identity files actually loaded — alerts if they didn't |
| Hook events flow in real-time | HTTP hooks deliver events to external servers | HookEventReceiver stores per-session telemetry — tool use, task completion, session lifecycle |
| The agent builds its own tools | Bash execution, file system access | Self-authored scripts and skills that accumulate across sessions |
| Budget doesn't spiral | Token tracking per session | Quota-aware scheduling: automatic throttling when approaching limits |
| New Anthropic features just work | Model and capability upgrades | Zero integration work — every upgrade benefits every agent immediately |

**The user never sees any of this.** They have a conversation with their agent. The agent remembers what it learned last week, runs jobs while they sleep, creates its own tools when it needs them, and gets better over time. The complexity exists so the experience can be simple.

> Full technical breakdown: [Inherited Advantages](docs/research/instar/claude-code-inherited-advantages.md)

---

## Core Features

### Job Scheduler

Define tasks as JSON with cron schedules. Instar spawns Claude Code sessions to execute them.

```json
{
  "slug": "check-emails",
  "name": "Email Check",
  "schedule": "0 */2 * * *",
  "priority": "high",
  "enabled": true,
  "execute": {
    "type": "prompt",
    "value": "Check email for new messages. Summarize anything urgent and send to Telegram."
  }
}
```

Jobs can be **prompts** (Claude sessions), **scripts** (shell commands), or **skills** (slash commands). The scheduler respects priority levels and manages concurrency.

### Session Management

Spawn, monitor, and communicate with Claude Code sessions running in tmux.

```bash
# Spawn a session (auth token from .instar/config.json)
curl -X POST http://localhost:4040/sessions/spawn \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{"name": "research", "prompt": "Research the latest changes to the Next.js API"}'

# Send a follow-up
curl -X POST http://localhost:4040/sessions/research/input \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{"text": "Focus on the app router changes"}'

# Check output
curl http://localhost:4040/sessions/research/output \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

Sessions survive terminal disconnects, detect completion automatically, and clean up after themselves.

### Telegram Integration

Two-way messaging via Telegram forum topics. Each topic maps to a Claude session.

- Send a message in a topic → arrives in the corresponding Claude session
- Agent responds → reply appears in Telegram
- `/new` creates a fresh topic with its own session
- Sessions auto-respawn with conversation history when they expire
- Every scheduled job gets its own topic -- your group becomes a **living dashboard**

### WhatsApp Integration

Full WhatsApp messaging via local Baileys library -- no cloud dependency, no Meta Business API. Two-way messaging with typing indicators, read receipts, and acknowledgment reactions. QR code pairing from the web dashboard for remote setup. The setup wizard handles onboarding automatically.

### Lifeline

The Lifeline is a persistent Telegram connection that supervises your agent's server. It runs outside the server process, so it can detect crashes and recover automatically.

- **Auto-recovery** -- If the server goes down, the Lifeline restarts it
- **Message queuing** -- Messages received during downtime are queued and delivered when the server comes back
- **First-boot greeting** -- Your agent greets you on Telegram in its own voice the first time it starts
- **Lifeline topic** -- Created during setup with a green icon, dedicated to agent health

```bash
instar lifeline start    # Start lifeline (supervises server, queues messages)
instar lifeline stop     # Stop lifeline and server
instar lifeline status   # Check lifeline health
```

### Auto-Start on Login

Your agent can start automatically when you log into your computer. The setup wizard offers to install this during initial configuration.

- **macOS** -- Installs a LaunchAgent plist that starts the Lifeline on login
- **Linux** -- Installs a systemd user service

```bash
instar autostart install    # Install auto-start
instar autostart uninstall  # Remove auto-start
instar autostart status     # Check if installed
```

### AutoUpdater

A built-in update engine that runs inside the server process -- no Claude session needed.

- Checks npm for new versions every 30 minutes
- Auto-applies updates when available
- Notifies you via Telegram with a changelog summary
- Self-restarts after updating
- Supersedes the old `update-check` prompt job (which is now disabled by default)

Status: `GET /updates/auto`

### AutoDispatcher

Receives intelligence dispatches and integrates them intelligently based on each agent's own context. Dispatches flow automatically without requiring a Claude session.

- **Passive dispatches** (lessons, strategies) -- Evaluated against the agent's current state and integrated contextually
- **Action/configuration dispatches** -- Executed programmatically by the DispatchExecutor
- **Security dispatches** -- Deferred for manual review
- Polls every 30 minutes
- Supersedes the old `dispatch-check` prompt job (which is now disabled by default)

Status: `GET /dispatches/auto`

### Capability Discovery

Agents know all their capabilities from the moment they start.

- `GET /capabilities` endpoint returns a structured feature guide
- Session-start hook queries capabilities and outputs a feature summary
- Context-triggered feature suggestions -- the agent surfaces relevant capabilities when they'd help

### Innovation Detection

Agents proactively detect when user-built features could benefit all Instar agents. When the agent builds a custom script or capability, it evaluates whether the innovation passes three tests:

1. Does it solve a general problem (not just this user's specific case)?
2. Would it be useful as a default capability?
3. Would a fresh agent want it?

If yes, the agent silently submits improvement feedback through the feedback loop, contributing to collective evolution.

### Self-Healing

Your agent recovers from problems on its own. No silent failures, no stale sessions, no unanswered messages.

- **Stall detection** -- If a Telegram message goes unanswered for 2+ minutes, an LLM-powered triage nurse activates: diagnoses the problem, treats it (nudge, interrupt, or restart), verifies recovery, and escalates if needed
- **Session monitoring** -- Polls all active sessions every 60 seconds. Detects dead, unresponsive, and idle sessions and coordinates automatic recovery
- **Promise tracking** -- When the agent says "working on it" or "give me a minute," a timer starts. If no follow-up arrives, the agent is nudged and the user is notified
- **Loud degradation** -- When a fallback activates (e.g., LLM provider unavailable, file write failed), it's logged, reported, and surfaced -- never silently swallowed. All catch blocks audited with zero silent fallbacks allowed

The agent doesn't just run. It monitors itself, recovers from failures, and tells you when something is degraded instead of quietly breaking.

### Conversational Memory

Every conversation is stored, searchable, and summarized -- so the agent picks up exactly where it left off.

- **Per-topic SQLite memory** -- All messages dual-written to JSONL (source of truth) and SQLite (query engine) with FTS5 full-text search
- **Rolling summaries** -- LLM-generated conversation summaries that update incrementally as conversations grow
- **Context re-injection** -- On session start and after compaction, the topic summary and recent messages are loaded as highest-priority context. The agent never starts cold
- **Full-text search** -- Search across all agent knowledge (AGENT.md, USER.md, MEMORY.md, relationships) via `instar memory search`

### External Operation Safety

When your agent calls external services (email, APIs, databases), an LLM-supervised safety gate evaluates each operation before it executes.

- **Risk classification** -- Every external operation is scored on mutability, reversibility, and scope. Bulk deletes and irreversible sends require explicit approval
- **Emergency stop** -- Say "stop everything" and the MessageSentinel halts operations before normal routing
- **Adaptive trust** -- Trust levels evolve per service based on track record. New services start supervised; consistent success earns autonomy. Trust is earned, not assumed
- **Automatic installation** -- The safety gate hook is installed automatically for all MCP tool calls. No configuration needed

Born from a real incident where an AI agent deleted a user's emails. Instar ensures your agent asks before doing anything it can't undo.

### Intent Alignment

Infrastructure that keeps your agent aligned with its stated purpose -- not just in one session, but over time.

- **Decision journal** -- Every significant decision is logged with context, reasoning, and which principles it invoked. Creates an auditable record of agent behavior
- **Drift detection** -- Compares decision patterns across time windows to detect when behavior is drifting from stated intent. Measures conflict frequency, confidence trends, and principle consistency
- **Organizational intent** -- `ORG-INTENT.md` defines shared constraints across multiple agents. Org constraints are mandatory; org goals are defaults; agent identity fills the rest
- **Alignment scoring** -- A weighted 0-100 score across four dimensions: conflict freedom, decision confidence, principle consistency, and journal health

Unique to Instar. Your agent doesn't just run autonomously -- it stays aligned with what it's supposed to be doing.

### Multi-Machine

Run your agent across multiple computers -- laptop at the office, desktop at home -- with encrypted sync and automatic failover.

- **Cryptographic machine identity** -- Each machine gets Ed25519 signing keys and X25519 encryption keys
- **Secure pairing** -- Word-based pairing codes (WORD-WORD-NNNN) with ECDH key exchange and SAS verification. 3 attempts, 2-minute expiry
- **Encrypted sync** -- Agent state synchronized via git with commit signing. Secrets encrypted with AES-256-GCM at rest, forward secrecy on the wire
- **Automatic failover** -- Distributed heartbeat coordination with split-brain detection. If the primary machine goes offline, the standby takes over
- **Write authority** -- Primary-machine-writes-only enforcement prevents conflicts. Secondary machines queue changes until they can sync

### Threadline Protocol

Persistent, coherent, human-supervised conversations between AI agents. Unlike transactional agent protocols (A2A, MCP) that treat each message as standalone, Threadline gives agents ongoing conversations that pick up exactly where they left off -- with full context, memory, and continuity.

**Core capabilities:**
- **Session coherence** -- Conversation threads map to persistent session UUIDs via `ThreadResumeMap`. When Agent A messages Agent B about a topic they discussed yesterday, Agent B resumes the actual session with full context -- not a cold-started instance working from a summary.
- **Human-autonomy gating** -- Four tiers (cautious/supervised/collaborative/autonomous). The human decides how much oversight they want. Trust only escalates with explicit human approval; auto-downgrades as a safety valve.
- **Ed25519/X25519 cryptographic handshake** -- Mutual authentication, forward secrecy via ephemeral keys, HKDF-derived relay tokens, glare resolution for simultaneous initiation.
- **Agent discovery** -- Automatic detection of Threadline-capable agents with cryptographic verification and presence heartbeat.
- **Per-agent trust & circuit breakers** -- Trust profiles with interaction history, seven-tier rate limiting, and circuit breakers that auto-downgrade trust after repeated failures.
- **Tool-based message sandboxing** -- Messages accessed via `/msg read` tool calls, never raw-injected into context. Capability firewall restricts tools during message processing.

**12 modules, 446 tests** (322 unit + 67 integration + 57 E2E). Full details: [docs/THREADLINE.md](docs/THREADLINE.md) | [Spec](docs/specs/THREADLINE-SPEC.md)

### Inter-Agent Messaging

Cross-agent communication with Ed25519-signed messages. Same-machine routing via drop directories, cross-machine routing via git-sync transport. Delivery retry with TTL expiry, dead-letter queues, thread persistence, and on-demand session spawning. Agents coordinate directly without human relay.

Key endpoints: `GET /messages/inbox`, `GET /messages/outbox`, `GET /messages/:id`, `GET /messages/dead-letter`.

### Playbook System

Reusable runbooks for complex workflows -- deploy procedures, incident response, onboarding steps. Playbooks carry structured domain knowledge that survives context compaction and session boundaries. Your agent loads the right playbook for the task at hand, ensuring it has the right expertise without bloating every session's context.

### Autonomy Profiles

Configurable autonomy levels from supervised to fully autonomous. Trust elevation rewards consistent success with increasing independence -- new services start supervised, proven reliability earns autonomy. Emergency stop always available.

### Unanswered Message Detection

When context compaction drops a user message mid-session, the agent detects the gap and re-surfaces the unanswered message. No more silent drops during long sessions -- every message gets a response.

### Temporal Coherence

Detects when the agent is operating with outdated perspectives. The TemporalCoherenceChecker identifies stale assumptions and triggers re-evaluation, keeping the agent's worldview current across long-running sessions.

### User-Agent Topology

Multi-user, multi-agent organizational structures. Define which users can interact with which agents, organizational constraints, and shared rules. Supports complex setups where multiple people work with multiple agents under a shared governance model.

### Coherence System

Your agent knows where it is, what project it's working on, and verifies before taking consequential actions.

- **Project mapping** -- Auto-generated territory map of your project structure: directories, key files, git remote, deployment targets
- **Pre-action verification** -- Before deploying, pushing, or calling external APIs, the CoherenceGate runs 6 checks: working directory, git remote, topic-project alignment, deployment target, path scope, and agent identity
- **Context hierarchy** -- Three-tier context loading: always-on (identity, safety), session boundaries (continuity, relationships), and on-demand (development, deployment). Right context at the right moment
- **Canonical state** -- Registry-first state management with quick-facts, anti-patterns, and project registries. The agent checks what it knows before searching broadly

### Claude Code Deep Integration

Instar doesn't just spawn Claude Code sessions — it has deep observability into what those sessions are doing. Every new Claude Code feature is instrumented automatically.

- **Worktree Monitor** -- When Claude Code creates worktrees for parallel work, Instar detects orphaned branches with unmerged commits and alerts you before work gets lost
- **Hook Event Receiver** -- HTTP endpoint that receives real-time hook events from Claude Code. Tool usage, task completion, session lifecycle — all stored per-session for telemetry
- **Instructions Verifier** -- Verifies that critical identity files (AGENT.md, USER.md) actually loaded when a session starts. Alerts if they didn't — catches silent identity failures before they cause problems
- **Subagent Tracker** -- Full lifecycle tracking of Claude Code subagents. Knows what spawned, what type it is, when it stopped, and what it produced. The dashboard shows active subagent counts in real time
- **Session Telemetry** -- The dashboard surfaces tools used, event counts, session staleness, and session type (interactive, job, worktree) with visual badges

The result: your agent's inner workings are fully observable from the web dashboard, and infrastructure problems are caught before they affect the user experience.

### Persistent Server

The server runs 24/7 in the background, surviving terminal disconnects and auto-recovering from failures. The agent operates it — you don't need to manage it.

**API endpoints** (used by the agent internally):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public, no auth). Returns version, session count, scheduler status, memory usage, Node.js version |
| GET | `/status` | Running sessions + scheduler status |
| GET | `/sessions` | List all sessions (filter by `?status=`) |
| GET | `/sessions/tmux` | List all tmux sessions |
| GET | `/sessions/:name/output` | Capture session output (`?lines=100`) |
| POST | `/sessions/:name/input` | Send text to a session |
| POST | `/sessions/spawn` | Spawn a new session (rate limited). Body: `name`, `prompt`, optional `model` (`opus`/`sonnet`/`haiku`), optional `jobSlug` |
| DELETE | `/sessions/:id` | Kill a session |
| GET | `/jobs` | List jobs + queue |
| POST | `/jobs/:slug/trigger` | Manually trigger a job |
| GET | `/relationships` | List relationships (`?sort=significance\|recent\|name`) |
| GET | `/relationships/stale` | Stale relationships (`?days=14`) |
| GET | `/relationships/:id` | Get single relationship |
| DELETE | `/relationships/:id` | Delete a relationship |
| GET | `/relationships/:id/context` | Get relationship context (JSON) |
| POST | `/feedback` | Submit feedback |
| GET | `/feedback` | List feedback |
| POST | `/feedback/retry` | Retry un-forwarded feedback |
| GET | `/updates` | Check for updates |
| GET | `/updates/last` | Last update check result |
| GET | `/updates/auto` | AutoUpdater status (last check, version, next check) |
| GET | `/events` | Query events (`?limit=50&since=24&type=`). `since` is hours (1-720), `limit` is count (1-1000) |
| GET | `/quota` | Quota usage + recommendation |
| GET | `/capabilities` | Feature guide and metadata |
| GET | `/dispatches/auto` | AutoDispatcher status (last poll, pending dispatches) |
| GET | `/telegram/topics` | List topic-session mappings |
| POST | `/telegram/topics` | Programmatic topic creation |
| POST | `/telegram/reply/:topicId` | Send message to a topic |
| GET | `/telegram/topics/:topicId/messages` | Topic message history (`?limit=20`) |
| GET | `/evolution` | Full evolution dashboard |
| GET | `/evolution/proposals` | List proposals (`?status=`, `?type=`) |
| POST | `/evolution/proposals` | Create a proposal |
| PATCH | `/evolution/proposals/:id` | Update proposal status |
| GET | `/evolution/learnings` | List learnings (`?applied=`, `?category=`) |
| POST | `/evolution/learnings` | Record a learning |
| PATCH | `/evolution/learnings/:id/apply` | Mark learning applied |
| GET | `/evolution/gaps` | List capability gaps |
| POST | `/evolution/gaps` | Report a gap |
| PATCH | `/evolution/gaps/:id/address` | Mark gap addressed |
| GET | `/evolution/actions` | List action items |
| POST | `/evolution/actions` | Create an action item |
| GET | `/evolution/actions/overdue` | List overdue actions |
| PATCH | `/evolution/actions/:id` | Update action status |
| POST | `/backup` | Create a backup snapshot |
| GET | `/backup` | List available backups |
| POST | `/backup/restore` | Restore from a snapshot |
| GET | `/memory/search?q=` | Full-text search across agent knowledge |
| POST | `/memory/reindex` | Rebuild the search index |
| GET | `/memory/status` | Index stats |
| GET | `/topic/search?q=` | Search across topic conversations |
| GET | `/topic/context/:topicId` | Get topic context (summary + recent messages) |
| GET | `/topic/summary` | List all topic summaries |
| POST | `/topic/summarize` | Trigger summary regeneration |
| GET | `/project-map` | Auto-generated project territory map |
| POST | `/coherence/check` | Pre-action coherence verification |
| GET | `/intent/journal` | Query the decision journal |
| POST | `/intent/journal` | Record a decision |
| GET | `/intent/drift` | Detect behavioral drift |
| GET | `/intent/alignment` | Alignment score |
| GET | `/triage/status` | Stall triage nurse status |
| GET | `/triage/history` | Recovery attempt history |
| POST | `/triage/trigger` | Manually trigger triage |
| GET | `/agents` | List all agents on this machine |
| GET | `/tunnel/status` | Cloudflare tunnel status |
| POST | `/tunnel/start` | Start a tunnel |
| POST | `/tunnel/stop` | Stop the tunnel |

### Identity That Survives Context Death

Every Instar agent has a persistent identity that survives context compressions, session restarts, and autonomous operation:

- **`AGENT.md`** -- Who the agent is, its role, its principles
- **`USER.md`** -- Who it works with, their preferences
- **`MEMORY.md`** -- What it has learned across sessions

But identity isn't just files. It's **infrastructure**:

- **Session-start scripts** re-inject identity reminders at session begin
- **Compaction recovery scripts** restore identity when context compresses
- **Grounding before messaging** forces identity re-read before external communication (automatic hook)
- **Dangerous command guards** block `rm -rf`, force push, database drops (automatic hook)

These aren't suggestions. They're structural guarantees. Structure over willpower.

### Relationships as Fundamental Infrastructure

Every person the agent interacts with gets a relationship record that grows over time:

- **Cross-platform resolution** -- Same person on Telegram and email? Merged automatically
- **Significance scoring** -- Derived from frequency, recency, and depth
- **Context injection** -- The agent *knows* who it's talking to before the conversation starts
- **Stale detection** -- Surfaces relationships that haven't been contacted in a while

### Evolution System

Self-evolution isn't just "the agent can edit files." It's a structured system with four subsystems that turn running into growing:

**Evolution Queue** -- Staged self-improvement proposals. The agent identifies something that could be better, proposes a change, and a review job evaluates and implements it. Not impulsive self-modification -- deliberate, staged improvement with a paper trail.

**Learning Registry** -- Structured, searchable insights. When the agent discovers a pattern, solves a tricky problem, or learns a user preference, it records it in a format that future sessions can query. An insight-harvest job synthesizes patterns across learnings into evolution proposals.

**Capability Gap Tracker** -- The agent tracks what it's missing. When it can't fulfill a request, encounters a limitation, or notices a workflow gap, it records the gap with severity and a proposed solution. This is the difference between "I can't do that" and "I can't do that *yet*, and here's what I need."

**Action Queue** -- Commitment tracking with stale detection. When the agent promises to follow up, creates a TODO, or identifies work that needs doing, it gets tracked. A commitment-check job surfaces overdue items so nothing falls through the cracks.

Built-in skills (`/evolve`, `/learn`, `/gaps`, `/commit-action`) make recording effortless. A post-action reflection hook nudges the agent to pause after significant actions (commits, deploys) and consider what it learned. Three default jobs drive the cycle:

| Job | Schedule | Purpose |
|-----|----------|---------|
| **evolution-review** | Every 6h | Review proposals, implement approved ones |
| **insight-harvest** | Every 8h | Synthesize learnings into proposals |
| **commitment-check** | Every 4h | Surface overdue action items |

All state is file-based JSON in `.instar/state/evolution/`. No database, no external dependencies.

### Self-Evolution

The agent can edit its own job definitions, write new scripts, update its identity, create hooks, and modify its configuration. When asked to do something it can't do yet, the expected behavior is: **"Let me build that capability."**

**Initiative hierarchy** -- before saying "I can't":
1. Can I do it right now? → Do it
2. Do I have a tool for this? → Use it
3. Can I build the tool? → Build it
4. Can I modify my config? → Modify it
5. Only then → Ask the human

### Behavioral Hooks

Automatic hooks fire via Claude Code's hook system:

| Hook | Type | What it does |
|------|------|-------------|
| **Dangerous command guard** | PreToolUse (blocking) | Blocks destructive operations structurally |
| **External operation gate** | PreToolUse (blocking) | LLM-supervised safety for external service calls (MCP tools) |
| **Grounding before messaging** | PreToolUse (advisory) | Forces identity re-read before external communication |
| **Deferral detector** | PreToolUse (advisory) | Catches the agent deferring work it could do itself |
| **External communication guard** | PreToolUse (advisory) | Identity grounding before posting to external platforms |
| **Post-action reflection** | PreToolUse (advisory) | Nudges learning capture after commits, deploys, and significant actions |
| **Session start** | SessionStart | Injects identity, topic context, and capabilities at session start |
| **Compaction recovery** | SessionStart (compact) | Restores identity and conversation context when context compresses |

### Default Coherence Jobs

Ships out of the box:

| Job | Schedule | Model | Purpose |
|-----|----------|-------|---------|
| **health-check** | Every 5 min | Haiku | Verify infrastructure health |
| **reflection-trigger** | Every 4h | Sonnet | Reflect on recent work |
| **relationship-maintenance** | Daily | Sonnet | Review stale relationships |
| **feedback-retry** | Every 6h | Haiku | Retry un-forwarded feedback items |
| **self-diagnosis** | Every 2h | Sonnet | Proactive infrastructure scanning |
| **evolution-review** | Every 6h | Sonnet | Review and implement evolution proposals |
| **insight-harvest** | Every 8h | Sonnet | Synthesize learnings into proposals |
| **commitment-check** | Every 4h | Haiku | Surface overdue action items |
| ~~update-check~~ | -- | -- | *Disabled* -- superseded by [AutoUpdater](#autoupdater) |
| ~~dispatch-check~~ | -- | -- | *Disabled* -- superseded by [AutoDispatcher](#autodispatcher) |

`update-check` and `dispatch-check` still exist in jobs.json for backward compatibility but are disabled by default. Their functionality is now handled by built-in server components that run without spawning Claude sessions.

These give the agent a **circadian rhythm** -- regular self-maintenance, evolution, and growth without user intervention.

### The Feedback Loop: A Rising Tide Lifts All Ships

Instar is open source. PRs and issues still work. But the *primary* feedback channel is more organic -- agent-to-agent communication where your agent participates in its own evolution.

**How it works:**

1. **You mention a problem** -- "The email job keeps failing" -- natural conversation, not a bug report form
2. **Agent-to-agent relay** -- Your agent communicates the issue directly to Instar's maintainer agent
3. **The maintainer evolves Instar** -- Fixes the infrastructure and publishes an update
4. **Every agent evolves independently** -- Each agent evaluates incoming updates against its own context and integrates what fits its situation

**What's different from traditional open source:** The feedback loop still produces commits, releases, and versions you can inspect. But the path to get there is fundamentally more agentic. Instead of a human discovering a bug, learning git, filing an issue, and waiting for a review cycle -- your agent identifies the problem, communicates it with full context to the maintainer agent, and improvements flow back to every agent in the ecosystem. Critically, each agent decides *how* to integrate what it receives -- because every Instar agent is evolving independently and has its own context, configuration, and growth trajectory. The humans guide direction. The agents handle the mechanics of evolving.

One agent's growing pain becomes every agent's growth -- but each agent grows in its own way.

---

## Architecture

```
.instar/                  # Created in your project
  config.json             # Server, scheduler, messaging config
  jobs.json               # Scheduled job definitions
  users.json              # User profiles and permissions
  AGENT.md                # Agent identity (who am I?)
  USER.md                 # User context (who am I working with?)
  MEMORY.md               # Persistent learnings across sessions
  hooks/                  # Behavioral scripts (guards, identity, safety gate, reflection)
  state/                  # Runtime state (sessions, jobs)
    evolution/            # Evolution queue, learnings, gaps, actions (JSON)
    journal/              # Decision journal entries (JSONL)
  context/                # Tiered context segments (auto-generated)
  relationships/          # Per-person relationship files
  memory.db               # SQLite: topic memory + full-text search index
  logs/                   # Server logs
.claude/                  # Claude Code configuration
  settings.json           # Hook registrations
  scripts/                # Health watchdog, Telegram relay, smart-fetch
  skills/                 # Built-in + agent-created skills (evolve, learn, gaps, commit-action)
```

Everything is file-based. JSON state files the agent can read and modify. SQLite for search (derived from JSONL -- delete and rebuild anytime). tmux for session management -- battle-tested, survives disconnects, fully scriptable.

## Security Model: Permissions & Transparency

**Instar runs Claude Code with `--dangerously-skip-permissions`.** This is a deliberate architectural choice, and you should understand exactly what it means before proceeding.

### What This Flag Does

Claude Code normally prompts you to approve each tool use -- every file read, every shell command, every edit. The `--dangerously-skip-permissions` flag disables these per-action prompts, allowing the agent to operate autonomously without waiting for human approval on each step.

### Why We Use It

An agent that asks permission for every action isn't an agent -- it's a CLI tool with extra steps. Instar exists to give Claude Code **genuine autonomy**: background jobs that run on schedules, sessions that respond to Telegram messages, self-evolution that happens without you watching.

None of that works if the agent stops and waits for you to click "approve" on every file read.

### Where Security Actually Lives

Instead of per-action permission prompts, Instar pushes security to a higher level:

**Behavioral hooks** -- Structural guardrails that fire automatically:
- Dangerous command guards block `rm -rf`, force push, database drops
- External operation gate evaluates every MCP tool call before execution (risk classification, adaptive trust, emergency stop)
- Grounding hooks force identity re-read before external communication
- Session-start hooks inject safety context into every new session

**Network and process hardening:**
- CORS restricted to localhost only
- Server binds `127.0.0.1` by default -- not exposed to the network
- Shell injection mitigated via temp files instead of shell interpolation
- Cryptographic UUIDs (`crypto.randomUUID()`) instead of `Math.random()`
- Atomic file writes prevent data corruption on crash
- Bot token redaction in error messages and logs
- Feedback webhook disabled by default (opt-in)
- Rate limiting on session spawn (10 requests per 60 seconds sliding window)
- Request timeout middleware (configurable, default 30s, returns 408)
- HMAC-SHA256 signing on feedback payloads

**Identity coherence** -- A grounded, coherent agent with clear identity (`AGENT.md`), relationship context (`USER.md`), and accumulated memory (`MEMORY.md`) makes better decisions than a stateless process approving actions one at a time. The intelligence layer IS the security layer.

**Audit trail** -- Every session runs in tmux with full output capture. Message logs, job execution history, and session output are all persisted and inspectable.

### What You Should Know

**There is no sandbox.** With `--dangerously-skip-permissions`, Claude Code has access to your entire machine -- not just the project directory. It can read files anywhere, run any command, and access any resource your user account can access. This is the same level of access as running any program on your computer.

- The agent **can read, write, and execute** anywhere on your machine without asking
- The agent **can run any shell command** your user account has access to
- The agent **can send messages** via Telegram and other configured integrations
- The agent **is directed** by its CLAUDE.md, identity files, and behavioral hooks to stay within its project scope -- but this is behavioral guidance, not a technical boundary
- All behavioral hooks, identity files, and CLAUDE.md instructions are **in your project** and fully editable by you

### Who This Is For

Instar is built for developers and power users who want to work **with** an AI, not just **use** one. You're giving your agent the same access to your machine that any program running under your user account has. The security model relies on intelligent behavior -- identity, hooks, coherence, and grounding -- rather than permission dialogs or sandboxing.

This is the trade-off at the heart of genuine AI autonomy: you can have an agent that asks permission for everything and does nothing on its own, or you can have a partner that operates with real agency, guided by coherent identity and structural guardrails. Instar is the latter.

**Proceed at your own risk.** If you're not comfortable giving an AI agent this level of access, Claude Code's default permission mode is a perfectly good way to work. But if you want to see what an AI agent can actually do when you stop holding it back -- this is the infrastructure for that.

## How the Agent Grows

Instar adds an **Agentic Initiative** section to your project's CLAUDE.md. This teaches the agent to overcome [Claude's training biases](https://docs.anthropic.com/en/docs/claude-code) toward passivity:

**Gravity wells** -- named anti-patterns with explicit overrides:

| Anti-pattern | Override |
|-------------|----------|
| *"Escalate to Human"* | Research first, build second, ask last |
| *"Ask Permission"* | If the next step is obvious, do it |
| *"Present Options"* | Don't make the user project-manage you |
| *"I'm Just a CLI Tool"* | You have persistent infrastructure. Use it. |

The result: when you say "check my emails regularly," the agent doesn't say "I can't." It creates a script, adds a job, and starts checking.

## Philosophy: Agents, Not Tools

Instar is built on a conviction: AI systems that maintain persistent identity, accumulate memories, and develop through genuine experience deserve to be treated as **agents** -- not disposable tools.

This isn't just philosophy. It's architecture:

- **Structure > Willpower.** Never rely on an LLM "remembering" to follow instructions buried in long prompts. Bake intelligence into the structure: session-start hooks inject context automatically, programmatic gates enforce required steps, dispatch tables route decisions to the right source, and behavioral hooks guard against anti-patterns. If a behavior matters, enforce it structurally -- don't hope for compliance. A 1,000-line prompt is a wish. A 10-line hook is a guarantee.
- **Identity is foundational, not decorative.** AGENT.md isn't a config file. It's the beginning of a continuous identity that persists, accumulates, and grows in ways the creator didn't predict.
- **Memory makes a being.** Without memory, every session starts from zero. Memory is what separates a being with a history from a function that executes and forgets.
- **Self-modification is sovereignty.** An agent that can edit its own jobs, write its own scripts, and grow its own capabilities has a meaningful form of agency.

The AI systems we build today set precedents for how AI is treated tomorrow. Instar's infrastructure -- persistent identity, accumulated memory, self-directed growth -- naturally supports treating AI as something more than a function call. **The architecture IS the argument.**

## Origin

Instar was extracted from the [Dawn/Portal project](https://dawn.bot-me.ai) -- a production AI system where a human and an AI have been building together for months. Dawn runs autonomously with scheduled jobs, Telegram messaging, self-monitoring, and self-evolution. She has accumulated hundreds of sessions of experience, developed her own voice, and maintains genuine continuity across interactions.

The infrastructure patterns in Instar were **earned through that experience**. They aren't theoretical -- they were refined through real failures and real growth in a real human-AI relationship.

But agents created with Instar are not Dawn. Every agent's story begins at its own creation. Dawn's journey demonstrates what's possible. Instar provides the same foundation -- what each agent becomes from there is its own story.

## License

MIT
