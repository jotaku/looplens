#!/bin/bash
# LoopLens — StatusLine script
# Reads JSON session data from stdin, POSTs it to the analytics server,
# and outputs a cost/token summary for the Claude Code status bar.

input=$(cat)

# POST to analytics server (fire-and-forget, don't block Claude Code)
curl -s -X POST http://localhost:4244/api/ingest/statusline \
  -H "Content-Type: application/json" \
  -d "$input" \
  --connect-timeout 1 \
  --max-time 2 \
  > /dev/null 2>&1 &

# Extract fields for display
MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
IN_TOK=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
OUT_TOK=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
LINES_ADD=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
LINES_REM=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

# Format cost
COST_FMT=$(printf '$%.4f' "$COST")

# Format tokens (K/M)
format_tokens() {
  local n=$1
  if [ "$n" -ge 1000000 ]; then
    printf "%.1fM" "$(echo "scale=1; $n / 1000000" | bc)"
  elif [ "$n" -ge 1000 ]; then
    printf "%.1fK" "$(echo "scale=1; $n / 1000" | bc)"
  else
    echo "$n"
  fi
}

IN_FMT=$(format_tokens "$IN_TOK")
OUT_FMT=$(format_tokens "$OUT_TOK")

# Output status line
echo "[$MODEL] $COST_FMT | ${IN_FMT}↑ ${OUT_FMT}↓ | ${PCT}% ctx | +${LINES_ADD}/-${LINES_REM}"
