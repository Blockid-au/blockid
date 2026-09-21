# G26 — Light unicorn template on every page: light surfaces, dark high-contrast text, one harmonious palette

**Opened:** 2026-09-21 — founder (verbatim): "điều chỉnh thiết kế toàn bộ template của blockid.au là nền sáng và chữ màu tối tương phản để dễ đọc và hài hoà màu sắc, redesign full all page same style for whole blockid.au (spawn agent nếu cần thiết và dùng skill design ui/ux pro max phù hợp unicorn style)".
**Owner:** Claude session loop — five worktree lanes (ui-ux-pro-max first in every lane) → merge → full suite → deploy → elevated live-qa + link-check + page sweep + screenshot review → read-only review → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G26 · `ROADMAP.md` row G26.
**Status:** LIVE 2026-09-21 — v3.26.0 (`be1f41cf2`); lanes T/M/W1/W2/R/X shipped; guard enforcing (0 hits); close-out pending the v3.26.0 QA + review + ui-ux check (SOT § G26).

## 1. Design decision (supersedes `docs/design/unicorn-template.md` § 2 "light default with a full dark pairing" and § 6 "tone=dark once per page")
- **Light is the only default.** Every page renders on light surfaces (`--ds-surface` white / `--ds-surface-sunken` soft grey) with dark ink text (`--ds-ink` ≥ 15:1, secondary ≥ 8:1, muted ≥ 4.5:1). No dark bands, no dark nav island, no dark footer edge, no dark hero. `prefers-color-scheme: dark` no longer flips the site; an explicit `[data-theme="dark"]` scope stays for the report/PDF theme contract and the toggle (if kept) but is opt-in only.
- **One harmonious palette (unicorn style):** brand navy `#1B2A5E` for primary actions and headings' accent, cyan `#0891B2` (muted) as the single secondary accent on light, violet `--ds-highlight` only for eyebrows as today, bull/bear/warn semantic colours unchanged; SVI orange stays graphic-only. No raw hex / rgb in components — tokens only.
- **Text contrast:** body ≥ 4.5:1, headings ≥ 7:1, links distinguishable by colour + underline on hover; focus rings visible on light (`ring-brand-navy`).
- **Same chrome everywhere:** one nav (light, white with a 1 px line), one footer (light sunken), one page header pattern (eyebrow · h1 · lede), one card (white, 1 px line, sm shadow), one table, one form field, one button set (primary navy / secondary outline / ghost). Workspace and admin share the marketing tokens (no second palette).

## 2. Lanes (parallel; each: Skill `ui-ux-pro-max` → screenshots before/after at 375 + 1280 via Playwright against a local `next build && next start` or production for public pages → fixes → tests → full unit suite → `git merge master` → report)
### T — Tokens, primitives, chrome, guard (skills: ui-ux-pro-max, react-expert, nextjs-16-expert) — MERGES FIRST
`globals.css` (light-only default; dark scope opt-in; navy/cyan accent tokens; remove auto-dark media query), `components/marketing/template/*` (`Section` loses `tone="dark"`; `sunken` alternation only), nav (`landing/nav-v2.tsx` light island), footer, `docs/design/unicorn-template.md` rewritten (§ 2 tokens, § 6 do/don't), a **guard test** `src/design/light-template.guard.test.ts`: no `bg-brand-navy*`, `bg-slate-9xx`, `bg-black`, `bg-[#0…]`, `dark:` page-level surfaces, `text-white` outside the allow-list (primary buttons, chips on brand fills, SVG), no raw hex in `className`; allow-list file with a reason per entry. Theme toggle: keep the component but default light; `data-theme` cookie ignored on first paint.
### M — Marketing + /vi (skills: ui-ux-pro-max, seo-content-au)
`app/(marketing)/**`, `app/vi/**`, `components/landing/**`, `components/marketing/**`, showcase pages, docs, legal, insights, funding, startup-index, compare: every page on the light template, hero light, feature bands alternate white/sunken, CTAs navy; OG images untouched.
### W1 — Founder workspace (skills: ui-ux-pro-max, react-expert)
`app/(app)/(founder)/workspace/**` (dashboard, score, evidence, reports, billing, settings, data room, connectors, onboarding), `components/workspace/**`, `components/dashboard/**`, `components/svi/**`: light shell (sidebar white/sunken, header white), cards/tables/forms per the primitives, charts on light (grid lines `--ds-border`, series from the semantic palette).
### W2 — Evaluator, accelerator, admin (skills: ui-ux-pro-max, react-expert)
`app/(app)/(founder)/workspace/evaluations/**`, `workspace/accelerator/**`, `workspace/investor/**`, `app/(app)/(admin)/admin/**`, `components/evaluations/**`, `components/accelerator/**`, `components/admin/**`, cohort table / compare drawer / dossier / IC memo / validation tracker: same shell + primitives; dense tables readable (zebra sunken rows, sticky header, 44 px row actions).
### R — Reports and documents (skills: ui-ux-pro-max, svi-scoring)
`components/tbr/**` (ReportV2 web), `/tbr/demo`, showcase report, `components/report-visuals/**` SVG palette on light, `lib/pdf/**` + `lib/docx/**` theme (light paper, navy headings), e-mail templates (`lib/email/**`, `lib/svi/email-report.ts`), `tests/e2e/smoke/tbr-contrast.spec.ts` updated to the light contract (≥ 4.5:1 sampled on every text node, light only).

## 3. Acceptance
Guard test green with an allow-list ≤ 30 entries; every page in `scripts/page-sweep.mjs` renders light (new sweep check: computed `background-color` of `body` and the first `main` section luminance > 0.85, `color` of body text luminance < 0.35); tbr-contrast smoke green; full unit + pdf; deploy 12/12; elevated live-qa green; link-check 0; screenshot review (375/1280) of 20 representative pages attached to the close-out; SOT § G26 closed; `docs/design/unicorn-template.md` v2.

## 4. Out of scope
startupvalueindex.com (separate repo — a follow-up goal), OG/social images, printed PDF page count.
