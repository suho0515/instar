# Upgrade Guide — NEXT

<!-- bump: patch -->

## What Changed

- **Dashboard session management**: Create and kill sessions directly from the dashboard UI. New `POST /sessions/create` endpoint supports headless or Telegram-linked sessions. `DELETE /sessions/:id` now also accepts tmux session names.

## What to Tell Your User

You can now create and manage sessions from the dashboard — no terminal required. Hit the + button to spin up a new session, and use the kill button to stop any running session.

## Summary of New Capabilities

- Dashboard session creation modal with Telegram topic toggle
- Session kill by tmux name (fallback from UUID lookup)
- Input validation for session names (non-empty, max 128 chars)
