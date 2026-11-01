#!/usr/bin/env bash
# Installs the DarkNight gateway as a login service on the Mac Studio and
# publishes it on the tailnet. Run from the repository root:
#     bash gateway/deploy/install.sh
set -euo pipefail

GATEWAY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$GATEWAY_DIR/.venv"
LABEL="com.fridayanalytics.darknight-gateway"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ ! -f "$GATEWAY_DIR/.env" ]]; then
  echo "Missing gateway/.env. Copy gateway/.env.example to gateway/.env and fill it in first." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; source "$GATEWAY_DIR/.env"; set +a
STATE_DIR="${GATEWAY_STATE_DIR:-$HOME/darknight-gateway}"
PORT="${GATEWAY_PORT:-8787}"
mkdir -p "$STATE_DIR" "$HOME/Library/LaunchAgents"

echo "1/4 Python environment"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$GATEWAY_DIR/requirements.txt"

echo "2/4 Checking the mapping against DarkNight"
(cd "$GATEWAY_DIR" && "$VENV/bin/python" -m darknight_gateway check) || {
  echo "The mapping check failed. Fix gateway/mapping.yaml, then run this script again." >&2
  exit 1
}

echo "3/4 Login service"
sed -e "s#__VENV__#$VENV#g" -e "s#__GATEWAY_DIR__#$GATEWAY_DIR#g" -e "s#__STATE_DIR__#$STATE_DIR#g" \
  "$GATEWAY_DIR/deploy/$LABEL.plist" > "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 2
curl -fsS "http://127.0.0.1:$PORT/health" && echo

echo "4/4 Publishing on the tailnet (HTTPS, tailnet only)"
tailscale serve --bg --https=8443 "http://127.0.0.1:$PORT"
tailscale serve status
echo
echo "Done. Put the https://…ts.net:8443 address above into Evidence Hub → Sources → DarkNight."
