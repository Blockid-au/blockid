# Daily C-Level Status Report — TEMPLATE (mandatory)

> Every C-Level executive (CTO, CFO, CMO, COO, CRO, CDO, CISO, CLO, CHRO, RnD) submits one
> report per cycle to `content/reports/<agent>-daily-YYYY-MM-DD.md` (weekly agents use
> `-weekly-`). Missing reports are flagged by the cron-health silent-death guard.
> Keep it concise — under 500 words. Use this exact section order.

**Agent:** <CTO|CFO|…>  ·  **Date:** YYYY-MM-DD  ·  **Status:** 🟢 GREEN | 🟡 YELLOW | 🔴 RED

## 1. Headline
One sentence: the single most important thing about your domain today.

## 2. Key metrics
| Metric | Today | Target | Trend |
|--------|-------|--------|-------|
| <e.g. API p95 / MRR / signups> | | | ▲/▼/→ |

## 3. What I found
- 2–4 bullets: concrete findings from today's research/checks (with numbers/sources).

## 4. Risks & blockers
- RED/YELLOW items needing attention, owner, and ETA. "None" if clear.

## 5. Proposed actions (for the CEO implementing plan)
- 1–3 shippable proposals, each with: **agent · change · versionImpact (patch/minor/major) · KPI**.
- These feed `project-state.json` → the CEO decides which to implement.

## 6. KPI check
- Progress against your owned KPI targets (see goal-tree). On-track / off-track + why.
