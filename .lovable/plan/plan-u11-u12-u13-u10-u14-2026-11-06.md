# Plan: U11 → U12 → U13 → U10 → U14

These are built in order. Each one is checked before the next starts, and the work stops at the first one that is blocked or fails a check. U3 and the 218 evidence files are not touched. Nothing already built is rebuilt. Migrations continue from 0045. Evidence content stays on DarkNight. The portal stores only identifiers, decisions, access lists, logs and references. No outside connections.

## U11 Narrative and coordination detection
- **Screens:** staff `/narratives` with a cluster list, a narrative timeline (volume, platforms, new accounts) and coordination findings. Content is read live from the fake gateway, using staff-only Sample data. When the gateway is down, the screen shows "Temporarily unavailable, please try again later".
- **Thresholds:** similarity is a whole number from 1 to 20, and each time window has its own range of 1 minute to 72 hours. When either is unset, the screen shows "Threshold not set", and the database refuses to label a cluster or feed it to U7.
- **Database (append-only):** cluster references, analyst name/confirm decisions, links to myths and scenarios in the universal standard, and coordination decisions.
  - A guard refuses the "coordinated" label without an analyst confirmation.
  - Every finding must cite at least one capture.
  - Every result records the standard version.
  - Confirmed coordination writes U9 link references and U7 signals through the existing functions.
- **Docs:** extend the gateway contract to cover narrative and coordination endpoints.

## U12 Unified evidence search
- **Screen:** staff `/search` with keyword, meaning-based and image modes, and filters for platform, date, engagement, narrative, entity and verification level. Results come from the fake gateway. Each result links to its capture and custody log.
- **Access checks:** the portal filters every result through the database access functions before showing it. A check refuses any ID the user cannot see.
- **Saved searches:** stored in the portal. Promoting one to a monitoring requirement needs Curator approval, enforced by the database. Approval goes through the U4 register.
- **Staff setting:** a content-type index list that starts empty and shows "No content types chosen yet".

## U13 Wider source coverage
- **New connectors:** registry rows for Telegram channels/groups, WhatsApp channels, YouTube, Reddit, a generic "Local forum (unnamed)", News sites and Blogs. Each starts as "Not certified" and "Not configured".
- **Collection guards (database):** refuse collection unless the connector is certified and configured, and refuse sources outside the brief's approved sources.
- **Certification:** append-only certification records.

## U10 Analyst browser capture (portal side only)
- **Connector:** a manual registry row.
- **Capture intake:** a capture-intake contract that requires an engagement, an approved requirement ID, the analyst as collector, a SHA-256 hash for each artefact and an optional session log. Intake uses the existing quarantine and validation, and the hash is re-checked on vault write.
- **Docs:** `docs/extension/` documents the browser extension. The extension itself is built outside Lovable.

## U14 Executive agent gateway (portal side only)
- **Access list:** an append-only executive access list that starts empty ("No executives have access") and has a staff screen.
- **Logs:** an append-only question and answer log, written by the service-role worker only.
- **Contract:** `docs/agent/gateway-contract.md` covers the read-only scope, permission checks, citations with confidence and the U8 standard. The agent gets no write access and there is no chat view.

## Each step
- Save SQL checks to `tests/sql/u1X_*.sql` and run the structural part. Behavioral checks stay unrun until the test connection that can create test accounts exists.
- Take screenshots at desktop and phone size in all three themes, and keyboard-check every new dialog.
- Update `roadmap.md` and `AGENTS.md`.
- Report what was built, which rules sit outside the database and why, and the decisions needed.

## Assumptions to confirm
1. U11 time windows run from 1 minute to 72 hours.
2. U11 similarity uses the existing 1–20 scale, read as 5% steps.
3. U13 uses one unnamed "Local forum" placeholder row.
