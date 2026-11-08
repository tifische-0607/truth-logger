# SuperAdmin housekeeping

SuperAdmins can delete projects from the Projects list or engagement header, and capture jobs from the Capture queue or job header. Confirmation requires a reason.

Deletion removes the record from active browser lists and direct project/job reads through database row rules. Original rows, related engagement records, evidence files and custody events are retained, not erased. Running capture jobs must first be stopped. Deleted jobs cannot be restarted or claimed by the worker.

Each deletion records the SuperAdmin, record identifier, label, reason and database timestamp in append-only `housekeeping_deletions` and `account_admin_events` (User activity). Duplicate deletion is refused. There is no restore action.

No U3 file move, cloud-copy removal, external connection or email sending is performed.

Checks: `tests/sql/housekeeping_test.sql` contains read-only structural checks and rollback-only behavior checks. Behavior checks require authenticated test fixtures.