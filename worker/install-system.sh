#!/bin/bash
# Install the capture worker as a macOS SYSTEM service (LaunchDaemon).
# Unlike install.sh (which starts the worker when you log in), this version
# starts the worker at BOOT — before anyone logs in — so the worker comes
# back on its own after a macOS restart or power cut. It also restarts
# automatically after any crash.
#
#   sudo bash worker/install-system.sh
#
# Run from the project root (the folder containing worker/).
# To go back to the login-based service:
#   sudo bash worker/uninstall-system.sh && bash worker/install.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo:  sudo bash worker/install-system.sh"
  exit 1
fi

# The service runs as the user who owns the project folder, so it can read
# the venv, worker/.env and the saved Facebook session.
RUN_AS="$(stat -f '%Su' "$ROOT")"
PY="$ROOT/worker/.venv/bin/python"
LOGS="/Users/$RUN_AS/fbem"
PLIST="/Library/LaunchDaemons/com.fbem.worker.plist"

if [ ! -x "$PY" ]; then
  echo "Missing $PY — run the setup in worker/README.md first (venv + requirements)."
  exit 1
fi
if [ ! -f "$ROOT/worker/.env" ]; then
  echo "Missing worker/.env — copy .env.example to .env and fill it in first."
  exit 1
fi

# Remove the login-based agent if present so we don't run two copies.
su "$RUN_AS" -c "launchctl unload '/Users/$RUN_AS/Library/LaunchAgents/com.fbem.worker.plist'" 2>/dev/null || true
rm -f "/Users/$RUN_AS/Library/LaunchAgents/com.fbem.worker.plist"

mkdir -p "$LOGS"
chown "$RUN_AS" "$LOGS"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>com.fbem.worker</string>
  <key>UserName</key><string>$RUN_AS</string>
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

chown root:wheel "$PLIST"
chmod 644 "$PLIST"

launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"

echo "Installed as a system service. The worker now starts at boot — no login needed —"
echo "and restarts itself after any crash. Logs: $LOGS/worker.log"
echo "To stop it:   sudo launchctl bootout system $PLIST"
