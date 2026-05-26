#!/bin/bash
PID_FILE="/tmp/blockid-production.pid"
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null && echo "✅ Stopped PID $(cat "$PID_FILE")" || echo "Process already stopped"
  rm -f "$PID_FILE"
else
  fuser -k 4001/tcp 2>/dev/null && echo "✅ Killed process on port 4001" || echo "Nothing running on port 4001"
fi
