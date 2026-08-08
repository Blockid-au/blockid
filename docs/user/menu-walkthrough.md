# Menu walkthrough — what unlocks, when, and why

> **Audience:** founders using BlockID.
> **Companion spec (engineers):** [`docs/plans/unlock-next-level-2026-07-31.md`](../plans/unlock-next-level-2026-07-31.md) §2a, §2c, D2.
> **Last refresh:** 2026-08 (G8-P8).

BlockID's menu is not static. It grows with your startup. As you finish evidence and cross **phase exit gates**, new tools appear in the sidebar — Cap Table when equity matters, Data Room when investors show up, Tokenisation once you have a real market.

This page tells you exactly what you'll see, at which phase, on which plan.

---

## 1. What you'll see at each growth phase / Bạn sẽ thấy gì ở mỗi giai đoạn

The spine is 12 growth phases (`vision` → `funding`). Three groups are **always visible**: **Home**, **Validate**, **Account**. Everything else appears as you cross the gate for that phase.

| # | Phase (`GrowthPhaseId`) | Vietnamese | Newly unlocked nav groups |
|---|---|---|---|
| 1 | `vision` | Tầm nhìn & Sứ mệnh | Home · Validate · Account (baseline) |
| 2 | `customer_dev` | Phát triển khách hàng | Validate → Discover (Market Size, Knowledge Base) |
| 3 | `revenue_model` | Mô hình doanh thu | **Fundraise → Valuation & Finance** (VC Valuation, CFO Advisor) |
| 4 | `pitch` | Kỹ năng thuyết trình | Validate → Track (Metrics, Weekly Reports); pitch builder |
| 5 | `mentor_review` | Cố vấn đánh giá ý tưởng | Mentor console, advisor requests (Roles overlay) |
| 6 | `legal_equity` | Pháp lý & Cổ phần | **Build → Equity Setup** (Cap Table, Equity Split, Shareholders) |
| 7 | `go_to_market` | Ra thị trường & Mở rộng | **Scale & Exit → Revenue** (Revenue, Growth Journal, GST tools) |
| 8 | `product_dev` | Phát triển sản phẩm | Tech DD, SBOM/licence inventory, R&D tax surface |
| 9 | `investor_review` | Nhà đầu tư đánh giá tiến độ | **Fundraise → Data Room** (Data Room, ESIC self-assessment, s708 tools) |
| 10 | `team` | Đồng sáng lập & Đội ngũ | Build → People (ESOP Setup, Vesting, Equity Offer) |
| 11 | `growth` | Tăng trưởng | Listings / SVI Index submission, tokenisation preview |
| 12 | `funding` | Gọi vốn | **Scale & Exit → Exit** (Exit Modeling, Dividends, marketplace, tokenisation) |

The **Roles** group is overlay-only — its subgroups (Investor, Advisor, Accelerator, Reseller, Mentor) show up when your account is tagged with that segment, independent of phase.

---

## 2. The 13 evaluation criteria / 13 tiêu chí đánh giá (§2a)

Every phase gate reads from the same 13 evidence criteria. Weights sum to 100 and feed the SVI score directly.

| Criterion | Weight | Primary SVI dimension | What it means in plain English |
|---|---|---|---|
| `market` | 12 | MPC | Is the market real, big, and reachable? |
| `idea` | 10 | MPC | Is the problem sharp and the solution differentiated? |
| `customer_size` | 10 | TRE | Do you know your ICP and TAM/SAM/SOM? |
| `revenue` | 10 | TRE | Recurring revenue, ARPU, unit economics — with numbers. |
| `founder_profile` | 8 | FTV | Founder-market fit; why *you* for *this*. |
| `team` | 8 | FTV | Co-founders, roles, and coverage of the skills matrix. |
| `gtm_strategy` | 8 | TRE | Channels, CAC, activation — a plan, not a hope. |
| `documents` | 7 | IRI | Pitch, one-pager, model, memo — investor-grade. |
| `code_git` | 6 | PTD | Real repo, real commits, real reviewers. |
| `roadmap` | 6 | PTD | 6-quarter product roadmap tied to milestones. |
| `website` | 5 | PTD | Live product surface / marketing site — not a Notion page. |
| `dataroom` | 5 | IRI | Structured data room, permissioned, up to date. |
| `team_structure` | 5 | CGH | Cap table clean, ESOP pool sized, vesting on paper. |

Quality ladder for each: `incomplete → basic → good → strong → exceptional`. Gates require `≥ good`.

**SVI dimensions:** FTV = Founder & Team · MPC = Market & Problem · PTD = Product & Technical · TRE = Traction & Revenue · CGH = Cap Table & Governance · IRI = Investor Readiness · LCO = Legal & Compliance · SVM = valuation multiplier.

---

## 3. Phase exit rules / Điều kiện qua giai đoạn (§2c)

A phase advances only when **all three** conditions hold:

1. Required criteria at `≥ good`
2. SVI dimension floor met
3. Phase deliverables complete

| # | Phase | Required criteria (≥ good) | Dimension floor | Unlocks on exit |
|---|---|---|---|---|
| 1 | `vision` | `idea`, `founder_profile` | MPC ≥ 40 | Validate group, SVI re-score |
| 2 | `customer_dev` | `market`, `customer_size` | MPC ≥ 55 | Benchmarks, competitor analysis |
| 3 | `revenue_model` | `revenue`, `gtm_strategy` | TRE ≥ 40 | Valuation tools |
| 4 | `pitch` | `documents`, `website` | IRI ≥ 45 | Pitch builder, shareable score links |
| 5 | `mentor_review` | `roadmap` + mentor sign-off | — | Mentor console, advisor requests |
| 6 | `legal_equity` | `team_structure`, `documents` | CGH ≥ 50, LCO ≥ 45 | **Cap Table, ESOP, Equity** |
| 7 | `go_to_market` | `gtm_strategy`, `customer_size` | TRE ≥ 55 | Growth analytics, GA4, **GST** |
| 8 | `product_dev` | `code_git`, `website` | PTD ≥ 55 | Tech DD, SBOM/licence inventory, **R&D** |
| 9 | `investor_review` | `dataroom`, `documents` | IRI ≥ 65 | **Data Room, investor access log, ESIC, s708** |
| 10 | `team` | `team`, `team_structure` | FTV ≥ 60 | ESOP admin, vesting schedules |
| 11 | `growth` | `revenue`, `customer_size` | TRE ≥ 70 | Listings / SVI Index, tokenisation preview |
| 12 | `funding` | all 13 ≥ good | IRI ≥ 75, CGH ≥ 65 | **Tokenisation, dividend, exit, marketplace** |

If a gate blocks, the dashboard "Next unlock" card tells you the top 3 blockers ranked worst-first — no guessing.

---

## 4. Tier-locked vs phase-locked (Decision D2) / Khoá theo gói vs khoá theo giai đoạn

Two different reasons a menu item can be unavailable — and they look different on purpose.

- **Progress-locked (phase not reached)** → the item is **hidden entirely**. No dim, no lock icon, no visual noise. You will see it appear the moment you cross the gate. Rationale: nothing pollutes the sidebar with tools you can't actually use yet.
- **Tier-locked (plan upgrade needed)** → the item stays **visible but dimmed**, with a small **UpgradeChip** next to it (e.g. `Growth`, `Scale`, `Enterprise`). Rationale: preserves upsell discovery — you can see what a higher plan unlocks and click through to compare pricing.

This is the **hybrid policy** decided on 2026-07-31. Neither pure-hide nor pure-dim on its own worked — pure-hide killed upsell discovery, pure-dim (the pre-G8 behaviour) buried the sidebar in 7 groups of locked pills the day you signed up.

**Route access unchanged.** Hidden ≠ blocked. A deep link you already hold still resolves; route-level entitlement remains authoritative. Hiding is about menu clarity, not permission.

---

## 5. Where to see your current unlock status / Xem trạng thái mở khoá hiện tại

Open **Dashboard → Next unlock** card. It shows:

- Your current growth phase (id, order, EN + VI label)
- `completionPct` — partial credit for how far you are through the current gate
- Top 3 blockers ranked worst-first, with a single next action
- What unlocks the moment the gate clears

The same card is mirrored in the sidebar footer, so it follows you around the workspace.

---

## Where the rules live (for engineers)

- Canonical taxonomy: [`web/src/lib/growth/phase-taxonomy.ts`](../../web/src/lib/growth/phase-taxonomy.ts)
- Gate engine: [`web/src/lib/growth/phase-gate.ts`](../../web/src/lib/growth/phase-gate.ts) — `PHASE_EXIT_RULES`
- Nav catalogue + gates: [`web/src/components/workspace/nav-groups.ts`](../../web/src/components/workspace/nav-groups.ts)
- Visibility decision: [`web/src/lib/nav/hide-when-locked.ts`](../../web/src/lib/nav/hide-when-locked.ts) — `decideVisibility()` returns `"show" | "show_dimmed" | "hide"`
- 13 evaluation criteria: [`web/src/lib/evaluation-criteria.ts`](../../web/src/lib/evaluation-criteria.ts)
- SVI dimensions: [`web/src/lib/svi-analysis.ts`](../../web/src/lib/svi-analysis.ts)
