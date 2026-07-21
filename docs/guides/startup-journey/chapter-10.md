# Chapter 10 — Fundraise & Term Sheet

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `10-fundraise`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 10 · Fundraise / Term Sheet**

Share the data room with real investors, receive term sheets, and get
an AI + CLO legal review on each one. The plan is deliberate about
wording: the optional blockchain hash of a term sheet is an immutable
record for later verification — not legal notarisation, which is a
reserved role under Australian law.

## What the founder does

Send data-room access via the NDA workflow (each investor gets a unique
token — click-tracked, revocable). When a term sheet comes back, upload
it into Workspace → Fundraise → Term sheet review. Approve the AI + CLO
redline; iterate with the investor on the two or three clauses flagged.
If you want tamper-evidence, opt in to the optional blockchain hash step
— the hash is written to the private EVM (per `project_blockchain_explorer`)
as an immutable record.

## Agents invoked

- **Term-sheet AI review** — the existing `term_sheet_ai` entitlement
  kicks in; produces a clause-by-clause redline with plain-English
  explanations.
- **CLO agent (deep)** — legal red-flag report via
  `compliance-checker.ts`; flags any clause that departs from AU-standard
  early-stage terms.
- **AU-comparable-raises agent** — benchmarks the valuation + terms
  against public AU rounds in your segment, last 12 months.
- **IR agent (negotiation prep)** — writes talking-points for the two or
  three clauses most likely to move; includes an anchor-and-concede
  script.
- **Blockchain-hash worker (optional)** — computes SHA-256 of the
  term-sheet PDF and writes `{hash, cid, chain, block, ts}` to a
  `blockchain_records` table; the term sheet itself is NEVER uploaded
  to chain.

## Expected outputs & how to interpret

- `term-sheet-review.pdf` — clause-by-clause redline with the AI's
  plain-English gloss and the CLO agent's AU-law risk rating per clause.
- `au-comparable-raises-benchmark.md` — table of comparable AU rounds
  (stage, sector, valuation, key terms) with your term sheet positioned
  inside the range.
- `negotiation-talkingpoints.md` — three-point script per contested
  clause (anchor / walk-back / minimum acceptable).
- `svi_analyses` row updated with `deal_valuation` +
  `deal_status='in_negotiation'` — surfaces on the reseller's Timeline as
  "Term sheet in review".
- `blockchain-hash-receipt.json` (optional) — `{hash, chain_id: 420,
  block_number, timestamp}`; sits alongside the term sheet in the
  DataRoom for future verification.
- **How to read the CLO risk rating:** any red rating on liquidation
  preference, drag-along threshold, or founder-vesting clauses is
  negotiable — those are usually the anchor points the investor put in
  to test how much you know. Concede the flavours (definitions, cure
  periods) and hold the substance (participation, ratchets, board
  consent).

## Common pitfalls

- Confusing the optional blockchain hash with legal notarisation. It is
  neither — "notary" is a reserved title under Australian law; the hash
  is a tamper-evidence record you can point to years later to prove the
  PDF hasn't been edited. Do not describe it as notarised in any
  external communication.
- Uploading the actual term-sheet content to the chain. The chain gets
  the hash only; the private EVM (per `project_blockchain_explorer`) is
  not confidential storage.
- Signing the first term sheet because it "looks fine". The AI + CLO
  review + the AU-comparable-raises benchmark exist so you can push back
  knowing which of your terms are already above-market and which are
  anchor bids — use them.
- Ignoring the reseller Timeline surface. The reseller sees
  deal-in-progress metadata (valuation + status) but no term-sheet
  content; if you don't want that visibility, mark the deal "private" in
  Workspace → Fundraise, otherwise assume the reseller will
  congratulate you at week two.

## On BlockID.au's showcase workspace

BlockID.au itself is pre-revenue at Phase 10 for now, so the
`/showcase/blockid` page renders the milestone as "planned, not yet
triggered" with a link back to the `/guide/reports` Phase 10 sample pack
that shows the artefacts a real Phase-10 team produces. When BlockID.au
closes its own first round, the milestone will flip live automatically
— that is the point of dogfooding.

## Next step

Do not accept the first term sheet in the room. Run the AI + CLO review,
read the AU-comparable-raises benchmark, and come back with a counter
that adjusts at least two clauses — investors expect this and respect
founders who negotiate calmly with data.
