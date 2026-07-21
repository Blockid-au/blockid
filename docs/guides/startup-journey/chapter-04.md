# Chapter 4 — MVP & Product Discovery

> Runtime source: `web/src/lib/guide/startup-journey.ts` (slug `04-mvp`).
> This markdown mirrors the EN copy for offline reading; the runtime pages
> read the TS module.

**Phase 4 · MVP / Product Discovery**

Ship a minimal product surface and a public landing page that can measure
demand. Two integrations activate here — GitHub for source-of-truth and
Google Analytics for demand signal.

## What the founder does

Link a GitHub (or GitLab) repository at Workspace → Integrations → Source
repo. Draft a product brief with the two most important features from your
persona objections. Publish a landing page — the CMO draft from Chapter 2 is
a starting point.

## Agents invoked

- **CTO agent** — architecture note + tech-stack recommendation aligned to
  your team's skills.
- **CPO agent** — product-brief PDF: two-features-in, three-features-out,
  why.
- **CMO agent** — landing-page finalisation with the Phase 3 persona
  objections addressed.
- **GitHub integration** — reads public repo metadata (last commit,
  languages, stars). No code contents are fetched.

## Expected outputs & how to interpret

- `product-brief.pdf` — feature list, non-goals, first-user story, effort
  estimate.
- `architecture-note.md` — CTO's recommended stack with trade-offs; use it as
  a starting point, not a mandate.
- Landing page live at `blockid.au/showcase/<slug>` or your own domain — GA
  measurement ID stamped.
- `projects.repo_url` stamped — last-commit sparkline appears on the
  reseller's Progression view (metadata only).
- **How to read the CTO note:** the trade-offs section matters more than the
  stack choice. If a trade-off surprises you, ask the CTO agent to redo the
  pass with an emphasis you value (speed vs cost vs team fit).

## Common pitfalls

- Building three months of MVP before publishing a landing page. Landing
  pages are a demand experiment — ship it in week one, iterate on copy
  while code is being written.
- Linking a private repo. BlockID only reads public metadata; a private repo
  just shows an empty sparkline and no confidence signal to a reseller.
- Ignoring the GA measurement ID. Chapter 7 depends on this stream; skipping
  it delays your growth signals by weeks.

## On BlockID.au's showcase workspace

BlockID.au's Chapter 4 milestone `mvp_scoped` is in
`milestone-report-state.json` — the `/showcase/blockid` page reads it live.
Notice the product brief scoped down from eleven features to four (SVI
scoring, workspace shell, DataRoom, reseller attribution); the other seven
became the Track A/B roadmap you are reading right now.

## Next step

Set aside one week for a landing-page + repo-link pass. Everything else in
Chapter 4 layers on top — start with those two.
