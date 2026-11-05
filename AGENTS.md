<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Extend evidence features additively; retain existing capture/offline routes and immutable custody to preserve existing legal evidence workflows.
- Project permissions and workflow transitions are enforced by database policies and guarded triggers; UI permissions are presentation only.
- Read DarkNight directly from the browser with HTTPS, redirect-blocked bearer requests; never proxy or persist home files in cloud storage.
- Store project output files under immutable hash-qualified paths; home-containing ZIP outputs remain device-only.
- Use shared hub/project modules for verdicts, hashing and metadata so all project surfaces apply the same rules.
- Share generated-document attribution through document-footer; keep evidence originals untouched so footer corrections cannot invalidate custody hashes.
- Render every printable document through components/print/PrintDocument and the "Generated documents" rules in styles.css (page margin boxes for footer/page numbers, repeating table head for the header, side margins as padding so the full-bleed cover shares one layout width); one layout keeps all documents consistent.
- Build each output against its recorded brief version, not the current brief, to keep deliverable provenance consistent.
- Resolve full site links through site-config and the server-provided SITE_URL configuration; preview auth callbacks stay same-origin so broker sign-in works during development.
- Client administrator identities are isolated from staff roles and engagement membership by database guards; staff routing and public client surfaces use the database identity function.
- Record invitation hashes and consume them atomically before privileged account creation; raw single-use links are returned only to the authorized inviter and are never persisted or logged.
- Keep SQL regression tests under tests/sql when integration-owned drizzle paths are write-protected; run authenticated live checks through the application without widening database test privileges.
- Cloud Vault (Phase 6): an external PostgreSQL 10.23 database; FA Portal code must target only its own `fa_portal` schema there, never run automatic DDL against it (schema setup ships as a reviewable SQL file), use only PostgreSQL 10-compatible SQL, and read connection details from server-side VAULT_CLOUD_* secrets with an honest "Not configured" / Test-connection result.
- Brand: all colour values live only in src/styles.css tokens (light, dark, high-contrast); components use semantic tokens, and the logo renders only through src/components/BrandLogo.tsx so official assets can replace the placeholder in one place.
- Research collection writes (jobs, runs, captures, vault reports) go only through service-role worker functions; people act through research_* SECURITY DEFINER functions so the database owns every research rule.
- Research collectors plug in through the research_connectors registry and the one standard capture shape validated by research_submit_capture_std; new connectors are registry rows, not code changes, so every connector obeys the same quality rules.
- Research worker routes (src/routes/api/public/research-*) are thin wrappers over service-role-only database functions; never grant those functions to authenticated, so capture and status events can only come from the collection device.

- Under U3 the external PostgreSQL (schema `fa_portal`) is the home of portal data — clients, users, tiers, engagements, billing, activity — while every report and evidence file stays on DarkNight only; that split is why files never enter the cloud queue. Library documents carry only a DarkNight location (home_source_id/home_path) and are fetched live by the browser and re-hashed via lib/library-download; the database refuses any new cloud file path. Only custody and event records reach the vaults through the append-only vault_outbox (fed by triggers) with service-role write results; report, evidence and document files are never copied to the Cloud Vault, and success states are refused while a required write is pending.
- Phase clocks follow the database's own phase rule (sla_project_phase) via triggers on gates, cycles, items, load reports and outputs; the screen never starts or stops a clock, so turnaround figures cannot drift from the record.
- Framework library (U8): every rule source lives in framework_* tables with append-only versions; only Curator-approved versions in force may be linked by modules (research plans refuse Start without one), so past results always cite the exact version they used.
- Billing (U2): tiers, prices, invoices and tier changes change only through billing_* SECURITY DEFINER functions with append-only logs; clients.tier_id is trigger-guarded so the database owns every pricing rule.
- Research collection is requirement-bound: the per-engagement register (research_requirements, append-only versions) is the only source of requirement IDs, and DarkNight evidence names come only from public.research_fa_std001_name_sample so the final FA-STD-001 scheme swaps in one place.
