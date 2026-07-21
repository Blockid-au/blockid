# Chapter 9 — Funding-Ready

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `09-funding`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 9 · Funding-Ready**

Assemble the investor pack, organise the data room into the standard
sections, and let the LLM-auditor self-review the whole set before you
send it out. Chapter 9 is the last dress rehearsal — the room only opens
to investors once every red-flag from the audit is resolved.

## What the founder does

Open Workspace → Data Room → Investor pack. Approve the auto-drafted
investor deck (or override slides), then invite three trusted reviewers
(mentor, ex-founder, angel) to leave feedback. Once every red-flag from
the LLM-auditor is resolved, mark the data room "shareable" — that flip
is what unlocks Chapter 10.

## Agents invoked

- **CEO agent** — auto-drafts the investor deck DOCX from the
  Chapters 1–8 artefacts (vision, market, product, financials, team).
- **Data-room organiser** — moves every DataRoom document into the
  standard sections (product / team / financials / legal / traction)
  using `data-room-templates.ts`.
- **LLM-auditor (ADK Agent Garden)** — self-reviews the whole investor
  pack; flags inconsistencies between the deck, the projection, and the
  traction numbers.
- **IR (Investor Relations) agent** — writes the outreach one-pager and
  the follow-up email template calibrated to your ideal-investor persona.
- **CLO agent (light)** — spot-checks the standard investor-facing
  agreements (NDA, term-sheet draft, side-letter template) for AU-law
  defaults.

## Expected outputs & how to interpret

- `investor-deck.docx` — auto-drafted 12–15 slide deck; every claim
  carries a footnote to the DataRoom artefact that backs it.
- `data-room-index.md` — every folder + document listed in the standard
  section order, plus a "What lives here" one-liner per folder.
- `audit-report.md` — LLM-auditor findings grouped by severity
  (red/amber/green); resolve every red before you invite an investor.
- `outreach-onepager.pdf` — IR agent's one-page cold-outreach summary
  (problem, traction, ask, contact).
- Milestone `investor_ready` in `milestone-report-state.json` — flipped
  only when the data room is marked shareable.
- **How to read the audit report:** don't try to argue every amber. The
  three or four points that recur across mentor + auditor + ex-founder
  reviews are the ones investors will ask about — fix those, then send.

## Common pitfalls

- Sending the data room before the auditor resolves reds. A reviewer who
  spots the inconsistency you missed passes on the deal — and the pass
  propagates in the AU angel network faster than any positive signal.
- Inviting fifteen reviewers to hedge. Three deep readers beat fifteen
  shallow scrollers; the auditor + three humans is the sweet spot the
  plan expects.
- Treating the investor deck as final. It is a rehearsal artefact — you
  will re-draft slide 3 (traction) and slide 8 (ask) at least twice
  during Chapter 10 conversations. Ship it "good-enough", iterate on
  real feedback.

## On BlockID.au's showcase workspace

BlockID.au's Chapter 9 pack is live in `/guide/reports` Phase 9. Notice
the audit report flagged the projection's Bear-scenario CAC at $180
while the pricing memo assumed $120 — the fix (a footnote reconciling
the two) is documented, and the milestone `investor_ready` only flipped
after that inconsistency landed a green check. That kind of visible
trail is what investors read as governance maturity.

## Next step

Set aside one full afternoon this week for the auditor pass. Read every
red-flag out loud with a co-founder — reading aloud surfaces the awkward
phrasings that will blow up in an investor Q&A.
