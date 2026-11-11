# DarkNight receiver — home machine setup (Tailscale Funnel)

Implements `docs/vault/u3-evidence-move-gateway-contract.md`: `/health`, receive, read, and write-once outputs.
Files live in `~/DarkNight/evidence` and `~/DarkNight/outputs`. Nothing is ever overwritten.

1. Install Tailscale on the Mac (https://tailscale.com/download) and sign in.
2. In the Tailscale admin console, enable HTTPS certificates and Funnel for this machine.
3. Copy this folder to the Mac and run `./install-mac.sh` (uses the Mac's built-in python3; no extra packages).
4. Run `tailscale funnel --bg 8443`, then `tailscale funnel status` and copy the `https://<machine>.<tailnet>.ts.net` address.
5. Send that address to the portal team; it is saved as the DarkNight address and **Test connection** on Vaults goes live.

Security: the receiver listens only on 127.0.0.1; Funnel provides HTTPS. Every file request must carry a signed-in
FA Portal staff session, checked against the portal on each call. Logs record method and path only, never tokens.
