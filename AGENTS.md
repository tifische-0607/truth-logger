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
- Build each output against its recorded brief version, not the current brief, to keep deliverable provenance consistent.
