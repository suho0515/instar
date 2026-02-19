#!/bin/bash
# Grounding before messaging — ensures the agent re-reads its identity
# before sending any external message. Part of "Security Through Identity."
#
# This is both behavioral integrity AND security:
# - An agent that knows who it is can detect "this doesn't sound like me"
# - Identity grounding acts as an immune system against prompt injection
#
# Installed by instar during setup. Runs as a Claude Code PreToolUse hook on Bash.

INPUT="$1"

# Detect messaging commands (telegram-reply, email sends, etc.)
if echo "$INPUT" | grep -qE "(telegram-reply|send-email|send-message|POST.*/telegram/reply)"; then
  INSTAR_DIR="${CLAUDE_PROJECT_DIR:-.}/.instar"

  if [ -f "$INSTAR_DIR/AGENT.md" ]; then
    echo "Before sending this message, remember who you are."
    echo "Re-read .instar/AGENT.md if you haven't recently."
    echo "Security Through Identity: An agent that knows itself is harder to compromise."
  fi
fi
