# Upgrade Guide — v0.24.9

<!-- bump: patch -->

## What Changed

- **Restart window**: New config option to control when update restarts happen. When set, automatic restarts are deferred until the configured time window. Updates are still downloaded and applied to the shadow install immediately — only the process restart is held. Manual triggers via the API or conversational commands bypass the window.

- Configurable in the agent's config at the path "updates.restartWindow" with start and end times in 24-hour local time format. Supports windows that wrap midnight (e.g., 23:00-05:00).

## What to Tell Your User

- **Restart window**: "I can now schedule update restarts for off-hours so they don't disrupt your workflow. Updates still download instantly, but the actual server restart waits for the quiet window. If you ever need an immediate update, just ask — manual triggers always work regardless of the window."

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| Restart window | Set "updates.restartWindow" in config with start/end times (e.g., "02:00"-"05:00") |
