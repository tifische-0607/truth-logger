# U3: plan for moving existing evidence files to DarkNight (for approval, not carried out)

Status on 3 Nov 2026: the library holds no files and engagement outputs hold no files. The original evidence
capture store still holds 218 files in private cloud storage (screenshots, renders, API data, exports from the
Mac mini worker). U3 says no evidence file stays in the cloud, so these need moving. Nothing has been moved.

Proposed steps (each waits for approval):
1. Freeze: pause the capture worker so no new file lands in cloud storage.
2. Export: for every artefact row, copy the file to DarkNight under its existing CASE-/INC-/FB_ folder path.
3. Verify: DarkNight re-hashes every file; each must match the artefact's recorded SHA-256. Any mismatch stops the move.
4. Record: add a custody event "transferred" per artefact naming the DarkNight location (append-only; originals untouched until step 6).
5. Switch reads: case, dossier and transcript screens fetch artefacts live from DarkNight with the offline message.
6. Remove cloud copies only after a second full re-hash pass on DarkNight and your written approval.

Open: the capture worker must then write to DarkNight directly (U4), and the secure route to DarkNight (decision C2).
