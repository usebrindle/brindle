#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool cursor|claude|amp] [--model MODEL] [max_iterations]
#
# Default tool is cursor (Cursor CLI `agent` command).
# Install Cursor CLI (Windows PowerShell):
#   irm 'https://cursor.com/install?win32=true' | iex
# Install Cursor CLI (macOS/Linux/WSL):
#   curl https://cursor.com/install -fsS | bash
# Then authenticate:
#   agent login

set -e

# Parse arguments
TOOL="cursor"
MODEL=""
MAX_ITERATIONS=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --model=*)
      MODEL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$TOOL" != "cursor" && "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'cursor', 'amp', or 'claude'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALPH_DIR="$SCRIPT_DIR/ralph"
PRD_FILE="$RALPH_DIR/prd.json"
PROGRESS_FILE="$RALPH_DIR/progress.txt"
ARCHIVE_DIR="$RALPH_DIR/archive"
LAST_BRANCH_FILE="$RALPH_DIR/.last-branch"
AGENTS_FILE="$SCRIPT_DIR/AGENTS.md"

if [[ ! -f "$AGENTS_FILE" ]]; then
  echo "Error: AGENTS.md not found at $AGENTS_FILE"
  exit 1
fi

if [[ ! -f "$PRD_FILE" ]]; then
  echo "Error: prd.json not found at $PRD_FILE"
  exit 1
fi

require_command() {
  if ! command -v "$1" &> /dev/null; then
    echo "Error: '$1' not found in PATH."
    return 1
  fi
}

# Git Bash on Windows often does not see agent.cmd even when Cursor CLI is installed.
# Windows launcher (cursor-agent.ps1) has a known bug: its version-folder regex rejects
# timestamped dirs like 2026.06.16-20-30-07-a07d3ac. Bypass by invoking node.exe directly.
resolve_cursor_agent_node() {
  local base=""
  if [[ -n "$LOCALAPPDATA" ]]; then
    base="$LOCALAPPDATA/cursor-agent"
  elif [[ -n "$USERPROFILE" ]]; then
    base="$USERPROFILE/AppData/Local/cursor-agent"
  else
    return 1
  fi

  [[ -d "$base/versions" ]] || return 1

  local latest=""
  local name dir
  for dir in "$base/versions"/*; do
    [[ -d "$dir" ]] || continue
    name=$(basename "$dir")
    [[ "$name" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}- ]] || continue
    [[ -f "$dir/node.exe" && -f "$dir/index.js" ]] || continue
    if [[ -z "$latest" || "$name" > "$(basename "$latest")" ]]; then
      latest="$dir"
    fi
  done

  [[ -n "$latest" ]] || return 1
  CURSOR_AGENT_NODE="$latest/node.exe"
  CURSOR_AGENT_INDEX="$latest/index.js"
  return 0
}

resolve_cursor_agent() {
  if command -v agent &> /dev/null; then
    echo "agent"
    return 0
  fi

  local candidates=()
  if [[ -n "$LOCALAPPDATA" ]]; then
    candidates+=("$LOCALAPPDATA/cursor-agent/agent.cmd")
    candidates+=("$LOCALAPPDATA/cursor-agent/agent")
  fi
  if [[ -n "$USERPROFILE" ]]; then
    candidates+=("$USERPROFILE/AppData/Local/cursor-agent/agent.cmd")
  fi
  candidates+=("$HOME/AppData/Local/cursor-agent/agent.cmd")

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

run_cursor_agent() {
  local -a cmd

  if resolve_cursor_agent_node; then
    cmd=("$CURSOR_AGENT_NODE" "$CURSOR_AGENT_INDEX" -p --force --trust --workspace "$SCRIPT_DIR" --output-format text)
  else
    local agent_bin
    agent_bin=$(resolve_cursor_agent) || {
      echo "Error: Cursor CLI 'agent' not found."
      echo "Install Cursor CLI:"
      echo "  Windows: irm 'https://cursor.com/install?win32=true' | iex"
      echo "  macOS/Linux/WSL: curl https://cursor.com/install -fsS | bash"
      echo "Then run: agent login"
      echo ""
      echo "If already installed, restart Git Bash or add to PATH:"
      echo "  export PATH=\"\$PATH:\$LOCALAPPDATA/cursor-agent\""
      return 1
    }
    cmd=("$agent_bin" -p --force --trust --workspace "$SCRIPT_DIR" --output-format text)
  fi

  if [[ -n "$MODEL" ]]; then
    cmd+=(--model "$MODEL")
  fi

  "${cmd[@]}" < "$AGENTS_FILE" 2>&1
}

run_amp_agent() {
  require_command amp || {
    echo "Error: 'amp' not found. Install Amp CLI or use --tool cursor."
    exit 1
  }

  if [[ -f "$SCRIPT_DIR/prompt.md" ]]; then
    cat "$SCRIPT_DIR/prompt.md" | amp --dangerously-allow-all 2>&1
  else
    cat "$AGENTS_FILE" | amp --dangerously-allow-all 2>&1
  fi
}

run_claude_agent() {
  require_command claude || {
    echo "Error: 'claude' not found. Install Claude Code CLI or use --tool cursor."
    exit 1
  }

  claude --dangerously-skip-permissions --print < "$AGENTS_FILE" 2>&1
}

run_agent() {
  case "$TOOL" in
    cursor) run_cursor_agent ;;
    amp) run_amp_agent ;;
    claude) run_claude_agent ;;
  esac
}

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed -E 's|^feat/||; s|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"

    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

if [ ! -f "$PROGRESS_FILE" ]; then
  mkdir -p "$RALPH_DIR"
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
if [[ -n "$MODEL" ]]; then
  echo "Model: $MODEL"
fi

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  LAST_OUTPUT="$RALPH_DIR/.last-iteration-output"
  run_agent 2>&1 | tee /dev/stderr "$LAST_OUTPUT"
  AGENT_EXIT=${PIPESTATUS[0]}
  OUTPUT=$(cat "$LAST_OUTPUT" 2>/dev/null || echo "")
  if [[ $AGENT_EXIT -ne 0 ]]; then
    echo ""
    echo "Agent exited with code $AGENT_EXIT. Stopping Ralph."
    exit 1
  fi

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
