#!/bin/bash
# Remove the boot-time worker service installed by install-system.sh.
#   sudo bash worker/uninstall-system.sh

set -euo pipefail

PLIST="/Library/LaunchDaemons/com.fbem.worker.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo:  sudo bash worker/uninstall-system.sh"
  exit 1
fi

launchctl bootout system "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "System service removed."
