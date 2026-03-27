# Upgrade Guide — v0.24.8

<!-- bump: patch -->

## What Changed

- **Lifeline auto-restart after update**: When the server recovers from a planned update restart, the supervisor now emits an `updateApplied` event. The lifeline listens for this and self-exits after a 5-second flush delay. launchd KeepAlive respawns it with the updated shadow install binary. This ensures both the server AND lifeline always run the same version after an update.

- Both restart detection paths are covered: when the supervisor reads the restart request directly, and when the ForegroundRestartWatcher consumes it first (via the planned-exit marker).

## What to Tell Your User

- **Seamless updates**: "Updates now apply to the entire system automatically — both the server and the Telegram connection. Previously, part of the system could run stale code after an update until the machine rebooted. Now everything picks up new code within seconds."

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| Lifeline auto-restart on update | Automatic — no action needed |
