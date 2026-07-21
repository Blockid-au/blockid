# Usecase library

> **What this is.** A library of **executable demo usecases** that simulate
> a real startup's journey on the live BlockID.au platform. Each usecase
> takes a public company's documented history and replays it through
> BlockID.au's tools — SVI scoring, cap-table, data room, vesting,
> tokenisation — so a new founder can *see* what a mature version of their
> own workspace looks like.
>
> Distinct from `/showcase` (static case-study read pages) — these are
> **runnable** specs. The autonomous goal loop picks each one up on a
> future tick and produces a sandboxed BlockID.au workspace populated
> with the case's data.

## Australian compliance disclaimer

Every usecase in this library **MUST** obey these rules:

1. **PUBLIC SOURCES ONLY.** Every data point (dates, dollar amounts,
   employee counts, board members, funding rounds, product launches)
   MUST have a live URL citation to a publicly-available source:
   - SEC EDGAR filings (S-1, F-1, 10-K, 10-Q, DEF 14A, 8-K)
   - Company press releases
   - Officially-published annual reports
   - Founder interviews on public channels (YouTube, podcasts w/ URL)
   - Wikipedia (as a cross-reference index, not as the primary source)
   - Crunchbase free tier
   - Australian regulators: ASIC company search, AUSTRAC, ACCC
2. **NO PARAPHRASE OF PAYWALLED CONTENT.** WSJ, FT, AFR articles are
   not allowed as primary sources. If a fact only appears behind a
   paywall, mark it "NOT FOUND (paywalled)" — do not restate.
3. **NO PERSONAL INFORMATION beyond public role names.** Board members,
   C-suite executives, founders are named because they are public
   figures whose corporate role is on the public record. **Do not
   include** private contact details, home addresses, family info,
   compensation details beyond what proxy statements disclose.
4. **Australian Privacy Act 1988 (APP 3 / APP 6 / APP 11)**:
   - Usecase data is de-identified from any BlockID.au customer or
     employee. It is entirely about the target public company.
   - No cross-linking usecase data with any actual BlockID.au user
     workspace.
   - Retention: usecase workspaces are `is_showcase=true` and
     `is_usecase=true` (new flag); they never touch a real customer
     project.
5. **Australian Consumer Law s18/s29** — no misleading statements about
   the target company. If a claim is disputed or ambiguous, cite BOTH
   sides. Mark speculation clearly.
6. **Corporations Act 2001** — no forward-looking financial statements
   presented as fact. Speculation about future IPOs, mergers, or
   fundraising must be marked "SPECULATION".
7. **Copyright / trademark** — company logos, product screenshots may
   be used under fair dealing (education, research) with attribution.
   Do not use them in commercial context (BlockID.au marketing) — only
   inside the educational usecase view.

## Two-way phase mapping (case ↔ BlockID.au)

Every usecase carries a **mapping table** in its `USECASE.md`:

- **Case → BlockID.au**: for each historical milestone in the case,
  which of BlockID.au's 12 phases (Vision → Beyond) does it map to?
- **BlockID.au → Case**: for each of BlockID.au's 12 phases, what did
  this case do that is a good exemplar? What did they do differently
  that a BlockID.au founder should NOT copy?

Both directions are documented so the platform can **adjust either
side** — if a case's story shows that BlockID.au's phase model is
missing a step (e.g. UK-Plc redomiciliation), we add it to the
platform. If the case did something unusual that doesn't generalise,
we mark it "case-specific, not a template".

## Library index

| Case | Country | Status | Public sources | USECASE.md |
|---|---|---|---|---|
| Atlassian | 🇦🇺 AU | LIVE | SEC EDGAR (CIK 0001650372), atlassian.com/newsroom, DEF 14A, F-1, 424B4 | [atlassian/USECASE.md](atlassian/USECASE.md) |
| Canva | 🇦🇺 AU | LIVE (skeleton) | canva.com/newsroom, Crunchbase, Wikipedia | [canva/USECASE.md](canva/USECASE.md) — pending research |
| Xero | 🇳🇿🇦🇺 NZ/AU | queued | NZX + ASX filings, xero.com/investors | pending |
| SafetyCulture | 🇦🇺 AU | queued | Softbank filings, safetyculture.com/press | pending |
| WiseTech Global | 🇦🇺 AU | queued | ASX 300 filings, wisetechglobal.com/investors | pending |
| SEEK | 🇦🇺 AU | queued | ASX filings, seek.com.au/investors | pending |
| Culture Amp | 🇦🇺 AU | queued | cultureamp.com/press, TechCrunch | pending |

## Execution model

The autonomous goal loop (Track C.x) picks queued cases and:

1. Spawns 3 parallel general-purpose research agents on public sources
2. Merges their briefs into `docs/usecases/<slug>/RESEARCH.md`
3. Generates `docs/usecases/<slug>/USECASE.md` — the executable spec
4. Generates `web/src/app/showcase/<slug>/page.tsx` — the read view
5. Optionally: seeds a sandboxed BlockID.au workspace (per U.4 mechanism)
   with the case data so a founder can navigate it in-app
6. Runs a compliance-review agent (au-compliance skill) that verifies
   no rule above was broken
7. Commits + pushes + deploys via existing loop
