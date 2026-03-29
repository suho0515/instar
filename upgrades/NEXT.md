# Upgrade Guide — v0.24.22

<!-- bump: patch -->

## What Changed

### Fix: Slack Message Injection Failure (tmux session targeting)

The tmux `send-keys` command for injecting follow-up Slack messages into existing sessions was using `=sessionName` instead of `=sessionName:` (with trailing colon). On tmux 3.6+, session names ending in digits were being misinterpreted as window indices, causing the injection to silently fail. This meant follow-up messages in a Slack conversation would be received by the server but never delivered to the Claude session.

### Slack Event Subscription Check in `instar add slack`

The `instar add slack` CLI command now verifies that event subscriptions are configured after validating tokens. If events aren't set up, it prints clear instructions for enabling them in the Slack app settings. Previously, users could complete setup with valid tokens but no event subscriptions, resulting in a bot that could send but never receive messages.

## What to Tell Your User

If your Slack bot was responding to the first message but ignoring follow-ups in the same channel, that's fixed. Also, `instar add slack` now checks if your Slack app has event subscriptions configured and tells you exactly what to add if they're missing.

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| Event subscription check | Runs automatically during `instar add slack` |
