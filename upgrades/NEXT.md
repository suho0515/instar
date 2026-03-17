# Upgrade Guide — vNEXT

<!-- bump: patch -->

## What Changed

Added CLI commands for inspecting job execution history and continuity data (`instar job history`, `instar job handoff`). Job execution now supports handoff notes — each execution can leave context for the next one, enabling cross-execution continuity for daemon-style jobs.

A new usage-based reflection metrics system tracks how often the agent reflects, enabling monitoring of reflection health over time.

Test infrastructure improvements: updated message-formatter tests for MCP-based reply instructions, adjusted silent-fallback baselines, fixed hybrid-search E2E mock config, and expanded the flaky test push exclusion list for more reliable CI.

Added a separate publish workflow for the threadline-mcp subpackage.

## What to Tell Your User

- **Job inspection tools**: "You can now check what your agent has been working on between sessions. The new job history and handoff commands show execution records and continuity notes."
- **Reflection monitoring**: "Your agent now tracks reflection frequency, so you can see how often it pauses to learn from its work."
- **Stability improvements**: "Several test reliability fixes make the update process smoother."

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| Job execution history | `instar job history [job-slug]` |
| Job handoff inspection | `instar job handoff [job-slug]` |
| Usage-based reflection metrics | Automatic — tracked during agent operation |
