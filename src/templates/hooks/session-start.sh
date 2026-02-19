#!/bin/bash
# Session start hook — injects identity context when a new Claude session begins.
# This is how the agent maintains continuity: every session starts with self-knowledge.
#
# Installed by instar during setup. Runs as a Claude Code PreToolUse hook.

INSTAR_DIR="${CLAUDE_PROJECT_DIR:-.}/.instar"

# Build identity context
CONTEXT=""

# Core identity
if [ -f "$INSTAR_DIR/AGENT.md" ]; then
  CONTEXT="${CONTEXT}Your identity file is at .instar/AGENT.md — read it if you need to remember who you are.\n"
fi

# User context
if [ -f "$INSTAR_DIR/USER.md" ]; then
  CONTEXT="${CONTEXT}Your user context is at .instar/USER.md — read it to know who you're working with.\n"
fi

# Memory
if [ -f "$INSTAR_DIR/MEMORY.md" ]; then
  CONTEXT="${CONTEXT}Your persistent memory is at .instar/MEMORY.md — check it for past learnings.\n"
fi

# Relationships
if [ -d "$INSTAR_DIR/relationships" ]; then
  REL_COUNT=$(ls -1 "$INSTAR_DIR/relationships"/*.json 2>/dev/null | wc -l | tr -d ' ')
  if [ "$REL_COUNT" -gt "0" ]; then
    CONTEXT="${CONTEXT}You have ${REL_COUNT} tracked relationships in .instar/relationships/.\n"
  fi
fi

if [ -n "$CONTEXT" ]; then
  echo "$CONTEXT"
fi
