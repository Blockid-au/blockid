# Dataroom Templates — Source of Truth

These 10 files are the Day-0 minimum-viable dataroom seeded into every new
startup via `POST /api/reseller/create-startup` (see
`web/src/lib/dataroom/seed-templates.ts`). They live in the client public
tree so the standalone Next.js build carries them into
`.next/standalone/web/public/templates` at deploy time.

**Not auto-generated.** This README is a workflow doc — safe to edit.

## Inventory

| Filename                   | Owning agent       | Size cap  | Notes                                                             |
| -------------------------- | ------------------ | --------- | ----------------------------------------------------------------- |
| `pitch-deck.docx`          | Investor Relations | < 200 KB  | 12-slide skeleton with `[[COMPANY_NAME]]` merge tokens.           |
| `cap-table.xlsx`           | CFO                | < 200 KB  | Founders / Employees / SAFE-Convertibles / Fully-Diluted sheets.  |
| `financial-model.xlsx`     | CFO                | < 200 KB  | 3-year P&L, headcount plan, burn/runway. Assumptions tab drives.  |
| `term-sheet.docx`          | CLO                | < 200 KB  | AU seed non-binding term sheet.                                    |
| `safe.docx`                | CLO                | < 200 KB  | YC-style SAFE adapted for AU (post-money cap + discount).         |
| `sha.docx`                 | CLO                | < 200 KB  | Shareholders' Agreement — drag/tag/pre-emptive, AU Corp Act.       |
| `esop-plan.docx`           | CLO                | < 200 KB  | AU ESOP invoking Div 83A start-up concessions.                     |
| `ip-assignment.docx`       | CLO                | < 200 KB  | Founder + employee IP assignment deed (AU).                        |
| `employment-contract.docx` | CLO                | < 200 KB  | Full-time contract with restraint + IP clauses.                    |
| `board-consent.docx`       | CLO                | < 200 KB  | Circular resolution of directors template.                         |

**Total storage per tenant:** ≤ 2 MB (10 × 200 KB).

## CI enforcement

CI rejects any `web/public/templates/*.{docx,xlsx}` larger than **200 000
bytes**. Keep placeholders lean — richer copy belongs in the generated
report layer, not the seed dataroom.

## To bump a template version

1. Edit the file in place.
2. Bump `version: "v1"` → `"v2"` for that entry in
   `web/src/lib/dataroom/template-manifest.ts`.
3. Deploy.
4. The scheduled re-seed job (follow-up ticket) picks up the new version
   on next founder-digest tick and uploads the v2 file alongside v1 for
   audit-trail preservation. Existing startups keep v1 until then; new
   startups get v2 immediately on provision.

## Legal disclaimer

Every `.docx` in this directory ships with a **red banner: "REPLACE ME —
NOT LEGAL ADVICE"**. Templates are drafting starting points only; the
CLO / au-compliance agent has NOT professionally reviewed each one for
every AU jurisdiction and the founder MUST have their lawyer sign off
before external use.

## Regeneration

The initial batch was built by `scripts/build-template-stubs.py` (Python
+ zipfile — no npm dep needed). To re-scaffold from scratch:

```
python3 scripts/build-template-stubs.py
```

Once your team has custom-authored replacements (e.g. designed pitch-deck
in Keynote → export .docx), the Python script is no longer needed — just
overwrite the file in place and bump the manifest.
