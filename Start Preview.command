#!/bin/bash
# Double-click this file in Finder to preview Life Dashboard.
# A Terminal window opens and the app opens in your browser.
# Keep the Terminal window open while previewing; close it to stop.
cd "$(dirname "$0")"
PORT=8000
# An older preview still running would use old code: stop it and start fresh
OLD=$(lsof -nP -t -iTCP:$PORT -sTCP:LISTEN 2>/dev/null)
if [ -n "$OLD" ]; then
  if ps -o command= -p $OLD | grep -q "tools/serve.py"; then
    echo "Restarting the preview with the newest code…"
    kill $OLD
    sleep 1
  else
    echo "Something else is using port $PORT. Close it, then try again."
    exit 1
  fi
fi
(sleep 1.5 && open "http://localhost:$PORT") &
exec python3 tools/serve.py --port $PORT
