# U14 Executive agent gateway contract

The agent runs on the Hermes agent stack on the **Mac Studio at home**, and executives reach it through **Telegram**. It is built outside Lovable. The portal provides only the access list, the log and this contract. There is no chat view in the portal; whether to add one is not decided.

## Read-only, always
The agent analyses and summarises. It never starts research, changes evidence, makes decisions or releases anything.
- It holds no portal write permission. Its single write is the log entry, made by the home gateway through `exec_log_exchange` (service role).
- It reads evidence on DarkNight, and only for engagements in `exec_scope(user_id)` (service role).

## Who may ask
- The access list (`exec_access`) is append-only. It starts empty, and the screen shows "No executives have access".
- Only the owner or Management can grant or revoke access (`exec_set_access`). Which executives get access is not decided.
- The database refuses access for a client login, and refuses any engagement the person cannot already see.
- `exec_scope(user)` returns the granted engagements, narrowed again to the ones the person can still access today, so losing access to an engagement narrows the agent at once.

## Mapping a Telegram account to a portal user
This is decided outside the portal. The home gateway keeps the Telegram binding locally on the Mac Studio, and the portal stores no Telegram identifiers.

## Every exchange is logged (`exec_qa_log`, append-only)
```
rpc exec_log_exchange(_user uuid, _item jsonb)   -- service role only
_item = { "question_sha256", "answer_sha256", "darknight_ref": "qa-…",
          "project_ids": [uuid], "cited_captures": [uuid], "confidence": "high|medium|low|none",
          "standard_version_id": "<FA-USTD version in force>", "asked_at", "answered_at" }
```
- The question and answer text stays on DarkNight under `darknight_ref`; the portal keeps only the hashes.
- The database refuses an entry when the person has no current access, uses an engagement outside their scope, or cites a capture outside their scope.
- It also refuses an answer that cites nothing unless confidence is `none`, and an answer that does not record the universal-standard version in force (U8).

## Answers must
- cite every claim with evidence links (capture IDs that open in the portal) and a confidence level
- follow the universal standard in force and state its version
- say plainly when the evidence is insufficient (confidence `none`)
