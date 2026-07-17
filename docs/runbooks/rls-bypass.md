# Supabase RLS Bypass Runbook

Owner: CISO (primary), CTO (secondary). On-call: platform on-call rotation.
Severity: **P0** — any confirmed cross-tenant read or write on a table with an
RLS policy defeats the tenancy model and is a reportable data breach.

Trigger: a support ticket, penetration-test finding, `pg_stat_statements` row
showing an unexpected join across `user_id` predicates, or an anomaly in
`audit_events` where the acting user's `user_id` does not match the resource
owner's `user_id`. Includes accidental use of the `service_role` key from a
client-facing surface.

---

## 1. Identify the affected table and rows

Reconstruct the blast radius from the audit chain first — it is append-only, so
its evidence cannot be tampered with while you investigate.

```
select id, ts, user_id, actor, action, resource_type, resource_id, detail
from audit_events
where ts >= '<suspected_start_utc>'
  and (
       (actor = 'user' and detail::jsonb ? 'affected_user_id'
          and detail->>'affected_user_id' <> user_id::text)
    or actor = 'service_role'
  )
order by id asc;
```

Also correlate with `select relname, n_tup_upd, n_tup_del from pg_stat_user_tables`
to see which tables saw abnormal write volume in the window. Capture the query
output to `/secure-backup/rls-bypass-<utc>/audit-window.csv`.

## 2. Rotate the `service_role` key immediately

Any RLS bypass is treated as if `service_role` is compromised until proven
otherwise. Rotate in Supabase Studio -> Project Settings -> API. Update
`SUPABASE_SERVICE_ROLE_KEY` in `web/.env`, restart the Next.js server
(`bash web/scripts/restart-app.sh`), and confirm `curl -sf https://blockid.au/api/health`
returns `ok`. Any background worker that caches the old key must also restart.

## 3. Snapshot active sessions and connections

Grab `pg_stat_activity` before you freeze the table — it is your only source of
truth on which app process and which client IP held open the offending query.

```
psql -c "\\copy (
  select pid, usename, client_addr, application_name, state,
         query_start, xact_start, backend_start, query
  from pg_stat_activity
  where datname = 'postgres'
) to '/secure-backup/rls-bypass-<utc>/pg-stat.csv' csv header"
```

## 4. Freeze writes on the affected table

Do NOT drop or truncate. Prevent further mutation while investigation runs:

```
alter table public.<affected_table> disable trigger all;
revoke insert, update, delete on public.<affected_table> from authenticated, anon;
```

Communicate the freeze to `#security-critical` — writes returning 500 are
expected. Do not re-enable until §6 completes.

## 5. Privacy Act 1988 assessment

If the leaked rows contain personal information — `app_users`,
`consent_events`, `equity_requests.detail`, `startup_snapshots` — the incident
is an eligible data breach unless remedial action prevents serious harm before
it occurs. Start the s26WK assessment clock at the moment of §1 confirmation
and follow `docs/runbooks/privacy-act-72h-clock.md`. If Corporations Act
information (wholesale investor status) leaked, also loop CLO in for ASIC
notification per §3 of `docs/runbooks/wholesale-gate-breach.md`.

## 6. Verify scope via the audit chain

Run the full audit-chain verifier before re-enabling writes:

```
cd /home/dovanlong/blockid.au/web
AUDIT_HMAC_SECRET='...' SUPABASE_URL='...' SUPABASE_SERVICE_ROLE_KEY='...' \
  npx tsx scripts/verify-audit-chain.ts
```

The verifier must exit `0` and the resulting `OK:` summary must reconcile
against the last weekly attestation in
`web/content/reports/audit-chain-attestations.jsonl`. If it does not, escalate
to the audit-chain runbook (`docs/AUDIT-CHAIN-RUNBOOK.md` §4.2) — an RLS bypass
that also corrupted `audit_events` is a joint compromise.

Only re-enable triggers and grants once (a) the offending policy has been
rewritten, (b) a regression test covering the bypass has been added under
`web/tests/rls/`, and (c) counsel signs off on the s26WK outcome.
