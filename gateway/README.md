# DarkNight gateway

A small read-only service that lets the Evidence Hub show DarkNight evidence
without copying it to the cloud. It runs on the Mac Studio beside DarkNight:

```text
iPad (Evidence Hub, signed in) ──HTTPS over Tailscale──▶ gateway (Mac Studio, 127.0.0.1:8787)
                                                          ├─ DarkNight Postgres (read-only user, localhost)
                                                          └─ NAS evidence share (read-only mount)
```

- **Nothing is stored in the cloud.** The browser fetches records and files from
  the gateway directly. When an analyst links a record to a case, the hub stores
  only a reference and the SHA-256 of each file.
- **Read-only at every layer:** a read-only database user, read-only
  transactions, a read-only NAS account, and no write endpoints.
- **Tailnet only.** The gateway listens on 127.0.0.1; `tailscale serve`
  publishes it with HTTPS to your tailnet, never to the internet.
- **Signed-in investigators only.** Every request carries the hub's sign-in
  token, which the gateway verifies, and the caller must be an investigator.
- **Home custody log.** Every search, read, download and re-hash is appended to
  `custody-log.jsonl` in the state folder. Each line carries the hash of the line
  before it, so edits or deletions are detectable (`verify-log`, below).

API shapes are in [`../GATEWAY_API.md`](../GATEWAY_API.md).

## Setup on the Mac Studio

### 1. Create the read-only database user

In `psql` as DarkNight's owner:

```sql
CREATE ROLE evidence_hub_ro LOGIN PASSWORD 'choose-a-long-password';
ALTER ROLE evidence_hub_ro SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE darknight TO evidence_hub_ro;
GRANT USAGE ON SCHEMA public TO evidence_hub_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO evidence_hub_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO evidence_hub_ro;
```

Postgres stays listening on localhost only. The gateway is on the same machine.

### 2. Mount the evidence share read-only

On the NAS, create an account (e.g. `evidence-hub-ro`) with **read-only**
permission on the DarkNight evidence share. On the Mac Studio, mount the share
with that account and set it to reconnect at login (System Settings → General →
Login Items, or an `automount` entry). Note the mount path, e.g.
`/Volumes/Evidence/darknight`.

### 3. Fill in the mapping

`mapping.yaml` holds the SQL that turns DarkNight rows into hub records. The
table and column names in it are **placeholders**. Replace them with the real
ones from `darknight_schema.sql`, keeping the output column names.

### 4. Configure and install

```sh
cd /Users/hermes/truth-logger
cp gateway/.env.example gateway/.env      # then edit gateway/.env
bash gateway/deploy/install.sh
```

The script creates a Python environment, runs `check` against DarkNight,
installs a login service that restarts itself, and publishes the gateway on the
tailnet at `https://<mac-studio>.<tailnet>.ts.net:8443`.

### 5. Turn it on in the hub

Evidence Hub → **Sources** → DarkNight → paste the `https://…ts.net:8443`
address → **Save and test**. The iPad (or any device using the hub) must be
signed in to Tailscale.

## Everyday commands

```sh
cd gateway
.venv/bin/python -m darknight_gateway check        # run every mapping query once
.venv/bin/python -m darknight_gateway verify-log   # check the custody log chain
tail -f ~/darknight-gateway/gateway.err.log        # service log
launchctl kickstart -k gui/$(id -u)/com.fridayanalytics.darknight-gateway   # restart
```

## Tests

```sh
cd gateway
.venv/bin/pip install pytest
DARKNIGHT_TEST_DSN=postgresql://postgres@localhost/dn_test .venv/bin/python -m pytest
```

The API tests create their own `findings` / `finding_files` tables in the test
database. Never point `DARKNIGHT_TEST_DSN` at DarkNight itself.

## Moving to the SQL server

When DarkNight moves to the dedicated SQL server, run the gateway there instead
(or keep it on the Mac Studio and point `DARKNIGHT_DATABASE_URL` at the server
over the LAN). Update the address in Sources; nothing in the hub changes.
