# SVI v3 question rubric — methodology draft (rubric@v1)

**Status:** public methodology DRAFT for G32 SV0 (SOT §9.4.7–§9.4.8, G34 §5). It describes how BlockID AI agents will rate each assessment question. Nothing here changes a published score yet: every report today still shows **SVI 2.2.0**. Agent scoring runs in shadow first (SV3), then is calibrated against human raters (SV4), and only then goes live (SV5).

**Source of truth in code:** `web/src/lib/screening/rubric.ts` (entries in `rubric-data/*.ts`), built on the screening catalogue `web/src/lib/screening/registry.ts` (`catalog@v1`). This document explains the method. It does not publish weights or point budgets. Those are calibrated values held in configuration (D24-f), and this page lists only the relative stage emphasis bands.

## 1. What is rated

- **52 guiding questions**: the 13 BlockID criteria × 4 questions, each with a stable content-bound id (`blockid:question:<criterion>:<hash>`).
- **51 overlay items** covering diligence areas that no guiding question asks today, for example net revenue retention, cap-table reconciliation, IP assignment, runway and exit path.
- **Total: 103 rubric entries.** Each one belongs to one of the eight dimensions (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM). Each is **owned by that dimension's lead agent**: CHRO, CMO, CTO, CRO, CFO, CLO (IRI and LCO) or CEO.

## 2. The 0–4 scale

Every entry has five written anchors, one concrete, evidence-based sentence per level. The general meaning is:

| Level | Meaning |
|---|---|
| **0** | Assessed, and the evidence shows the practice or result is absent or contradicted. |
| **1** | Asserted only: a claim with no specifics that could be checked. |
| **2** | Specific and checkable, but supported only by the company's or founder's own account. |
| **3** | Supported by evidence of the tier the entry requires, at the level expected for the stage. |
| **4** | Supported by required-tier evidence over time or from independent sources, and strong for the stage. |
| **N/A** | Not assessed, or not applicable to this stage or business. Shown as *pending*: it adds nothing and deducts nothing. It is never shown as 0. |

Models are never asked for a 0–100 number. Ordinal scales with written anchors give higher agreement between raters.

Each entry also carries:

- **2–4 binary checks** that the rater answers yes/no before choosing a level;
- a **level-2 example** and a **level-4 example**;
- the **evidence types** that count (connector, document, register and so on);
- the **evidence tier required for level 4**;
- the **stages** where the entry applies, and its **N/A rule**.

## 3. Evidence tiers and level ceilings

| Tier | What it is | Label shown |
|---|---|---|
| **T1** | System of record: Stripe/Xero connector, bank statement, ASIC extract, IP Australia, ATO/STP, analytics, git | Verified |
| **T2** | Counterparty-signed: contracts, LOIs, deeds, signed references, reviewed accounts | Verified |
| **T3** | Company-produced: model, deck, dashboard export, policy | Company-stated |
| **T4** | Founder-stated: answers typed into BlockID, unsupported claims | Founder-stated |

The **strongest tier cited** sets the ceiling:

- evidence at the entry's required tier, or a stronger one, can reach **level 4**;
- weaker T1–T3 evidence can reach at most **level 3**;
- founder-stated evidence alone can reach at most **level 2**;
- no evidence at all means **N/A**, not 0.

A level that contradicts a verified fact is not averaged away. It becomes a recorded contradiction, and contradictions are handled as deductions (A in SVI v3).

## 4. Freshness

Each entry inherits a freshness window from its catalogue item: for example 60–90 days for revenue and usage, 180–365 days for team, legal and IP. After the window, positive credit decays by half-life. **Bad news does not expire.**

## 5. Stage applicability

Stages are **PS** (pre-seed), **S** (seed), **A** (Series A) and **B+** (Series B and later).

- Guiding questions apply at every stage unless stated otherwise. They carry an N/A rule for cases where they cannot apply; for example, MRR is N/A while the company is pre-revenue, and demand proxies (TRE-02) are rated instead.
- Overlay items apply only at their catalogue stages; for example, net revenue retention applies from Series A, and Rule of 40 from Series B.

Stage emphasis is published as bands only:

| Dimension | Pre-seed | Seed | Series A | Series B+ |
|---|---|---|---|---|
| FTV Founder Traction Velocity | Very high | High | Medium | Medium |
| MPC Market Pull & Category | High | High | Medium | Medium |
| PTD Product-Tech Depth | High | High | Medium | Low |
| TRE Traction Revenue Evidence | Low | Medium | High | Very high |
| CGH Capital Governance Health | Low | Medium | Medium | High |
| IRI Investor Readiness Index | Low | Medium | High | High |
| LCO Legal Compliance Observability | Medium | Medium | High | High |
| SVM Strategic Vision & Moat | Medium | Medium | Medium | Medium |

These bands are BlockID's proposal, based on evidence that the team matters most early and business results matter most later. They are not a published industry standard.

## 6. Who rates, and how agreement is reached (SV3 onward)

1. The **owner agent** gathers an evidence pack: id, source, quote, as-of date and tier. It proposes a level with a verbatim quote. This is vote 1.
2. **Two judges from different model families** read only the evidence pack, not the founder's narrative. Each gives its reasoning first, then a level. These are votes 2 and 3.
3. **Machine checks** run on every vote. A quote that is not a verbatim substring of the cited evidence invalidates the vote. The tier ceilings in §3 apply.
4. The **median of the valid votes** is the level. If two votes say N/A, or no vote is valid, the question stays *pending* and the report lists the data request. If votes differ by 2 or more levels, the question is escalated once; if they still differ, it is flagged for human review.
5. **Stability.** Each level is cached by question, rubric version, prompt, model and evidence-set hash. Rerunning, buying credits or re-uploading the same file adds **nothing**. Only new or stronger evidence can change a level.

## 7. Fairness

Founder and team questions (FTV) rate what founders have **done and shown**: role coverage, commitment, verifiable track record, candour, vesting. They **never** use age, education or school prestige, gender or other personal traits. A guard test checks every FTV rubric string for these terms.

## 8. Versioning and traceability

- The rubric is versioned (`rubric@v1`). Changing an anchor, check or applicability creates a new version; it is never an in-place edit.
- From SV2, every new report revision records:
  - `svi_method` (today `svi-2.2.0`);
  - `rubric_version`;
  - `profile_sha256`, a hash of the catalogue plus rubric content;
  - `knowledge_cutoff`;
  - an initially empty per-question `contribution_ledger`.

  With these, any future score can be traced to the exact method that produced it. Older reports are never recalculated.
- Scores are compared only within the same method and profile. A method change is shown as a marker, never as growth.

## 9. What this draft does not claim

- It makes no claim that rubric levels predict startup success or value.
- Agreement targets are goals, not results yet: Krippendorff α ≥ 0.67 overall and κ ≥ 0.6 per criterion on a 30–50 company golden set rated by two people (SV4).
- The SVI is never converted into money. Valuation uses separate methods (SOT §9.5).
