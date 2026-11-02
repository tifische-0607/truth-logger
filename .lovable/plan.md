# Evidence Hub: projects and two vaults

## Result
Expand Evidence Hub into FridayAnalytics’ shared evidence hub without replacing existing capture, case, integrity, or offline features. Keep existing URLs, evidence records, access rules, and append-only custody working.

## 1. Identity and navigation
- Use **Evidence Hub** and **FridayAnalytics** consistently, including page metadata and the installed app name.
- Keep the requested navy/sky palette and IBM Plex fonts, with 44px touch targets and readable phone layouts.
- Organize the sidebar into Home, Projects, Search, Cases, Collect, Integrity; Sources and Admin remain under System. Phones show the six workspaces along the bottom.
- Add workspace tabs around the existing Collect, Integrity, and Admin pages rather than moving or removing their routes.
- Add a shared case header and tabs for Overview, Evidence, Timeline, People, Comments, Transcripts, Custody, Report, and Dossier. Preserve iPad review and other existing actions.

## 2. Two vaults
- Add sources and immutable home-vault references, seed Cloud and disabled DarkNight, and extend custody with reference-aware source fields.
- Sources lets the owner configure/enable DarkNight and checks gateway health every 30 seconds. Show Cloud/Home badges and source status in the sidebar.
- Search combines accessible cloud items, already-linked references, and live DarkNight results, with filters and Add to case.
- Home-vault records show files, immutable linking baselines, crop warnings, path status, timestamped DarkNight hashes, and custody. Offline records retain references/hashes but disable file access.
- Stream files directly from the gateway to the device, re-hash with WebCrypto, and compare against the linking baseline. Integrate home verification and separate device-only ZIP export into Integrity.

## 3. Clients and projects
- Add the requested clients, projects, memberships, versioned briefs, criteria, case/item links, assessments, outputs, and event log. Evidence remains linked, never copied.
- Enforce membership and lead rules, latest-brief criteria, same-project links, append-only assessments/briefs/logs, and controlled output approval/delivery/sharing in the database.
- Extend case access only for investigator members of projects linked to that case; preserve existing owner/assignment access.
- Keep client portal disabled. Define its narrow future read policies without exposing cases, evidence, assessments, or logs.

## 4. Project screens
- Projects lists clients and projects with counts, review workload, due dates and delivered outputs; owner creates clients; project creation assigns the creator as lead and opens Brief.
- Client details support owner edits/archive; the portal control remains off with a not-built note.
- Project tabs: Overview, Brief & criteria, Evidence, Outputs, Dashboard, Team, Log.
- Save edited briefs as new versions with required change notes and copied/edited criteria. Show superseded versions.
- Link cases and evidence; assess each latest criterion with immutable entries; calculate meets/excluded/to-assess verdicts and filters.
- Build verified bundles, Markdown report skeletons/final attachments, dated dashboard snapshots, and datasets. Store eligible cloud-only output files privately, never overwrite files, and keep home-containing bundles device-only.
- Enforce workflow buttons and hash-checked downloads with logged access. Show criterion/platform/month charts with labels and legends.

## Technical details and assumptions
- Use additive migrations with explicit grants, RLS, indexes, guarded triggers, restricted security-definer helpers, and regenerated database types. No manual edits to generated types.
- Use atomic database numbering for project codes and brief versions, and database guards for role/output transitions, not just UI checks.
- DarkNight is an external, read-only browser integration. Its operator must supply an HTTPS/Tailscale gateway URL reachable from each device, allow this app’s origin via CORS, and validate the signed-in user’s bearer token. No gateway server or NAS changes are included.
- The supplied gateway endpoints are assumed to return JSON records/files with the fields specified in the request; normalize and validate responses and fail closed for unsafe/missing/ambiguous files. Do not send a token to redirects or insecure gateway URLs.
- A home-vault file can only pass verification against a valid SHA-256 saved when it was linked; live gateway hashes never replace that baseline. Viewing an unlinked search result does not imply verified evidence.
- Portal sharing states are recorded for the future portal, but portal access remains unavailable while portal_enabled is off.
- Add tests for concrete permission, verdict, numbering, file-integrity, and output-transition rules. Check existing flows plus signed-in project creation → brief → linking → assessment → output where real data permits. Verify phone/iPad layouts and run the database linter.

## External dependency
Real DarkNight search/download/rehash verification requires the gateway URL and a working gateway accepting the user’s session. Without it, deliver the disabled/offline states and report that live home-vault testing is unverified.