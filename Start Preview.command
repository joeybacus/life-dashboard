#!/bin/bash
# Double-click this file in Finder to preview Life Dashboard.
# A Terminal window opens and the app opens in your browser.
# Keep the Terminal window open while previewing; close it to stop.
cd "$(dirname "$0")"
PORT=8000
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "The preview is already running."
  open "http://localhost:$PORT"
  exit 0
fi
(sleep 1.5 && open "http://localhost:$PORT") &
exec python3 tools/serve.py --port $PORT
