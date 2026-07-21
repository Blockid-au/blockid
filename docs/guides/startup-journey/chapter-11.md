# Chapter 11 — Post-Funding & Scale

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `11-scale`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 11 · Post-Funding / Scale**

The round has closed. Now the cap table hashes to the private EVM
(Share Management add-on required), vesting schedules stamp, and the
CEO agent starts auto-drafting a monthly board pack. Chapter 11 is
where operational muscle memory takes over — you spend less time
deciding, more time reading the weekly + monthly rhythms.

## What the founder does

In Workspace → Cap Table (add-on required), approve each row of the
final post-round cap table one more time — the approved snapshot is
what hashes on-chain. Set the board-pack recipients (investors + board
observers). Open Workspace → KPIs → Monthly cadence and confirm the
day/time the board pack drafts + circulates. If any early hire's
vesting was paused during the raise, restart it now.

## Agents invoked

- **Blockchain-sync worker** — hashes the approved cap-table snapshot
  to the private EVM (chainId 420) via `blockchain-sync.ts`; writes
  `{snapshot_hash, block_number, tx_hash}` to `blockchain_records`.
- **CHRO agent (vesting activator)** — stamps the vesting schedule per
  grant into `vesting_schedules`; kicks off the monthly cliff-and-tranche
  accrual job.
- **CEO agent (board pack)** — auto-drafts a monthly board pack (SVI
  curve + KPI dashboard + runway update + top-3 asks) as PDF, emailed
  to board recipients on the configured day.
- **CFO agent (runway monitor)** — recomputes runway every Monday; if
  <9 months, escalates a warning card in the workspace and pings the
  founder via `email-drip.ts`.
- **AU-compliance agent** — checks quarterly BAS + annual company
  review deadlines land in the workspace calendar with 14-day lead
  reminders.

## Expected outputs & how to interpret

- `cap-table-onchain-receipt.json` — `{snapshot_hash, chain_id: 420,
  block_number, tx_hash, snapshot_at}`; permanent record you can cite
  in any future dispute.
- `vesting-schedules.csv` — one row per grantee × tranche, with
  vested / unvested split refreshed monthly by the accrual job.
- `board-pack-YYYY-MM.pdf` — monthly investor + observer update,
  auto-emailed; 5–8 pages, structured (SVI + KPIs + wins + risks +
  asks).
- `runway-monitor.md` — updated every Monday; the amber / red band
  triggers a workspace card so you notice before the runway does.
- `compliance-calendar.ics` — subscribable calendar with BAS + annual
  review + statutory-lodgment dates, 14-day lead reminders enabled.
- **How to read the board pack:** the "asks" block matters more than
  the KPI dashboard. Investors read KPIs in the elevator; they engage
  when they see the ask list and can help unblock at least one item.
  Never send a board pack with an empty ask list.

## Common pitfalls

- Skipping the on-chain cap-table hash because "we can always do it
  later". Later means never — the value of the hash is that it dates
  the snapshot; a hash written next quarter proves the cap table at
  next quarter, not at close.
- Letting the board pack drift into "we shipped X features this month"
  narrative. Investors want the SVI slope + runway + top asks. Feature
  lists belong in the product-team standup, not the monthly board pack.
- Ignoring runway warnings because "we can extend the round". Extending
  a round takes 8–12 weeks in AU; if the amber card fires at 9 months,
  you have exactly one calm quarter to plan. Waiting until red is a
  panic quarter.
- Forgetting the AU-compliance calendar. A missed BAS lodgment is an
  ATO penalty; a missed annual company review is an ASIC late fee that
  scales — the calendar exists so neither happens.

## On BlockID.au's showcase workspace

BlockID.au's Phase 11 rehearsal shows how the pipeline should feel even
before the round closes — a sample cap-table snapshot, a sample board
pack for month-1-post-close, and a runway-monitor doc that would fire
amber at month-3 if traction slipped. Look at `/showcase/blockid` to
see how the milestone `funded` slot renders in "planned" state while
the underlying infra is already primed to accept a real snapshot the
day the round closes.

## Next step

This is a rhythm chapter, not a project chapter. Block a 30-minute
Monday runway read and a 60-minute monthly board-pack review on your
calendar this week — protect them the way you protect release deploys,
and Chapter 11 runs itself.
