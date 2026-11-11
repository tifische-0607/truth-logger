#!/bin/bash
# Installs the DarkNight receiver as a background service on macOS and publishes it with Tailscale Funnel.
set -euo pipefail
DIR="$HOME/DarkNightReceiver"; PLIST="$HOME/Library/LaunchAgents/org.fridayanalytics.darknight.plist"
mkdir -p "$DIR" "$HOME/DarkNight"
cp "$(dirname "$0")/receiver.py" "$DIR/receiver.py"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>org.fridayanalytics.darknight</string>
<key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$DIR/receiver.py</string></array>
<key>EnvironmentVariables</key><dict>
<key>PORTAL_AUTH_URL</key><string>https://aogdbcwqrdnnqvjsrrqn.supabase.co</string>
<key>PORTAL_PUBLISHABLE_KEY</key><string>sb_publishable_VzzG8aOXSPFmnjNEGmxKdg_aupZAl1r</string>
<key>PORTAL_ORIGIN</key><string>https://portal.fridayanalytics.org</string>
<key>EXTRA_ORIGINS</key><string>https://faportal.lovable.app,https://id-preview--a91d8941-73a8-4bf1-b81c-478687c7171c.lovable.app</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardErrorPath</key><string>$DIR/receiver.log</string>
</dict></plist>
P
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 1; curl -fsS http://127.0.0.1:8443/health && echo
echo "Now run:  tailscale funnel --bg 8443"
echo "Then:     tailscale funnel status   (copy the https://….ts.net address into the portal)"
