# Dashboard capture progress

## Build
- Add structured progress updates from the Mac mini worker at key capture, upload, record-writing, and completion stages.
- Show a live progress bar, percentage, and current stage for each queued or running capture on the Dashboard.
- Keep queued jobs at 0% and completed jobs at 100%; older runs without progress updates retain a clear indeterminate state.

## Technical details
- Reuse the existing append-only capture log and live job subscription, avoiding a database change.
- Encode machine-readable progress in worker log entries while preserving readable log history.
- Parse and clamp the latest progress update in the Dashboard, using the existing progress control and design tokens.
- Verify the worker code and the Dashboard rendering without disturbing capture evidence or custody records.
