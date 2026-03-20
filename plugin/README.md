# LoopLens Plugin

Sends real-time session data (cost, tokens, model, tool usage) from Claude Code to the LoopLens analytics dashboard.

## Components

### HTTP Hooks (`hooks/hooks.json`)
Fires on these events, POSTing JSON to `http://localhost:4244/api/ingest/hook`:
- **SessionStart** — captures model, session ID, working directory
- **PostToolUse** — tracks every tool call (file edits, bash commands, etc.)
- **Stop** — captures final assistant message as session summary
- **StopFailure** — captures error type (rate limit, auth, billing, etc.)
- **SessionEnd** — marks session as ended

### StatusLine Script (`scripts/statusline.sh`)
Runs on every status update, POSTing full session JSON (cost, tokens, context window, model) to `http://localhost:4244/api/ingest/statusline`. Also displays a compact status line in Claude Code's TUI.

## Prerequisites

- The LoopLens server must be running: `npm start`
- `jq` and `curl` must be available on PATH (for the statusline script)

## Installation

Automatic:
```bash
npx looplens install
```

Manual:
1. Copy this `plugin/` directory to `~/.claude/plugins/looplens/`
2. Add statusline to `~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/plugins/looplens/scripts/statusline.sh"
  }
}
```
