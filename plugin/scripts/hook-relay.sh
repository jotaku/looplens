#!/bin/bash
# LoopLens — Hook Relay
# Reads hook JSON from stdin, adds the event name, POSTs to analytics server.
# Usage: hook-relay.sh <event_name>
# Example: echo '{"session_id":"..."}' | hook-relay.sh PostToolUse

EVENT_NAME="${1:-unknown}"
INPUT=$(cat)

# Inject hook_event_name into the JSON payload
PAYLOAD=$(echo "$INPUT" | jq -c ". + {\"hook_event_name\": \"$EVENT_NAME\"}" 2>/dev/null)

# Fallback if jq fails — wrap raw input
if [ -z "$PAYLOAD" ] || [ "$PAYLOAD" = "null" ]; then
  PAYLOAD="{\"hook_event_name\":\"$EVENT_NAME\",\"raw\":$(echo "$INPUT" | head -c 4096)}"
fi

# Fire-and-forget POST to analytics server
curl -s -X POST http://localhost:4244/api/ingest/hook \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --connect-timeout 1 \
  --max-time 2 \
  > /dev/null 2>&1 &

# Exit immediately — don't block Claude Code
exit 0
