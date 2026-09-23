#!/bin/bash
# Install the capture worker as a launchd service on the Mac mini.
# It starts at login and restarts automatically if it crashes or exits
# (including when it loses contact with the app and exits for restart).
#
#   bash worker/install.sh
#
# Run from the project root (the folder containing worker/).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PY="$ROOT/worker/.venv/bin/python"
LOGS="$HOME/fbem"
PLIST="$HOME/Library/LaunchAgents/com.fbem.worker.plist"

if [ ! -x "$PY" ]; then
  echo "Missing $PY — run the setup in worker/README.md first (venv + requirements)."
  exit 1
fi
if [ ! -f "$ROOT/worker/.env" ]; then
  echo "Missing worker/.env — copy .env.example to .env and fill it in first."
  exit 1
fi

mkdir -p "$LOGS" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>com.fbem.worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>-m</string><string>worker.main</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/worker.log</string>
  <key>StandardErrorPath</key><string>$LOGS/worker.err.log</string>
</dict></plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed and started. Logs: $LOGS/worker.log"
echo "The worker now starts at login and restarts itself after any crash."
echo "To stop it:   launchctl unload $PLIST"
