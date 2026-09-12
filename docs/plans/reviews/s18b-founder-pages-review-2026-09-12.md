> **Disposition (2026-09-12):** no owner regression; P1 (shared report sections re-charged / re-owned by a member) + P2-1…8 → fix in flight; live exposure 0 (no memberships).

# S18-B review — `(founder)` server pages member-aware (merge ff11412b9; commits eec37451a, d76f5ef29, c512f8626)

Tests run: 34 files / 283 tests green (12 page render tests, page-scope, founder-features, pages-scope-guard, tests/chrome/shell-coverage).

## Q1 — owner data loss / spurious "view only"? **No regression found.**
- `getProjectScope()` resolves the project via the same `getActiveProject(user.id, cookieSlug)` that `getProjectIdFromRequest()` used (projects.ts:594-660); owned rows map to `role:"owner"`, so `pageScopeKeys` gives `isMember=false`, `canEdit=true`, `dataEmail=user.email`, `ownerUserId=user.id` — identical keys to pre-merge. No project / no cookie → `scope=null` → same `(user.email, project_id IS NULL)` path as before (page-scope.ts:44-55, 66-70).
- Legacy owner (`svi_accounts.project_id IS NULL`, no cookie): if they have a default project, `findOrCreateSVIAccount(email, defaultProjectId)` is called exactly as before (no fallback before either); if none, the NULL-project row is found. Pinned by `dashboard/svi/page.test.tsx:161`, `evidence/page.test.tsx:122`, `page-scope.test.ts` "no scope" case.
- Brand-new owner: `resolveSVIAccountIdForPage` → `findOrCreateSVIAccount` for `!scope || scope.isOwner` (page-scope.ts:66-68) → `svi_accounts` + default share class/shareholder still created on first `/dashboard` render. Checked OK.
- "View only" note is gated `isMember && !canEdit` (or `canAdmin` on members page); `isMember = Boolean(scope && !scope.isOwner)` — never true for an owner. Checked OK.
- founder-features readers: `founderFeatureScope(scope,user)` → `{ownerUserId: user.id, projectId: null}` for the legacy path; readers return `[]` on null project exactly as before (founder-features.ts:126-136, 171-178). Checked OK.
- Behaviour change (improvement, not loss): `dashboard/page.tsx:421` `activeProject` is now the cookie-selected project (was always the *default* project via `getActiveProject(user.id)`), so `growth_phase_current`, Money Radar prefill and phase gate follow the switcher.

## Q2 — member sees / triggers beyond role? **No P0. One P1, several P2.**

### P1 — `report_sections` are per-analysis, but pages filter per caller → editor member re-buys owner's sections and the owner's view then loses them
- `dashboard/page.tsx:576-581`, `dashboard/svi/page.tsx:219-224`: `.eq("analysis_id", latestAnalysisId).eq("user_id", user.id)`.
- `api/svi/report-section/route.ts:314-326` upserts with `onConflict: "analysis_id,section_id,depth"` (no user_id in the key) and stamps `user_id: user.id`.
- Scenario: owner unlocks "Market" (paid). Editor member opens `/dashboard` → the analysis is the owner's (`dataEmail`) but `savedSections` is filtered to the member's `user_id` → section shows as locked → member pays again → upsert flips `user_id` to the member → owner's next render hides the section they paid for (looks locked; content still in DB). Double charge + owner-visible loss.
- Fix (minimal): drop `.eq("user_id", user.id)` in both pages (the `analysis_id` is already owner-scoped through `dataEmail`), or `.in("user_id", [user.id, ownerUserId])`; update the `CALLER_EMAIL_ALLOW` reasons in `projects.pages-scope-guard.test.ts:55-60` ("saved sections stay per caller" is wrong). Add a svi page test: member sees owner-unlocked sections as saved.

### P2
1. `workspace/tech-analysis/page.tsx:22-40` reads the owner's `website_url/github_url` but `TechIntelligencePanel` gets no `readOnly`; `api/founder/tech-analysis/route.ts:97-98` is owner-only (`projects.user_id = user.id`) → every member (even admin) sees "Run" and gets a 404/not-found error. Fix: pass `readOnly={isMember}` (or convert the route to `getProjectScope("editor")` + `ownerUserId`).
2. `workspace/data-room/data-room-client.tsx:283-427`: Upload is hidden for viewers but "Set up Drive", "Generate data room", "Auto-fill" buttons stay visible and only toast on click. Cosmetic; API enforces. Fix: `{!readOnly && …}` around those buttons.
3. `components/workspace/view-only-note.tsx:19`: for `editor` the copy says "only the project **owner** can …" on admin surfaces (members page, GA link) — admins can too. Fix: "ask an admin or the owner".
4. `dashboard/c-level-reports/[role]/page.tsx:117` form posts to `/api/investor-pack/append` — route does not exist (`ls api/investor-pack` → download, generate, one-click, preview). Pre-existing dead CTA (now editor+ only). Fix: point at `/api/investor-pack/one-click` or remove.
5. `dashboard/accelerator/page.tsx:43-47,67-71`: `svi_accounts.account_id` / `svi_milestones.account_id = ownerUserId` — `svi_accounts` has no `account_id` column (migration 0008/0020), so the SVI card was always empty; S18-B only swapped `user.id`→`ownerUserId`. Same for `workspace/investor-pack/page.tsx:177-181` `svi_accounts.user_id` (no such column → pinned artefacts never load). Pre-existing; fix = `resolveSVIAccountIdForPage` + `.eq("id", accountId)`.
6. `dashboard/page.tsx:404-411` onboarding redirect counts `svi_analyses` under the **caller's** email; an invited member with `onboardingCompleted=false` is bounced to `/dashboard/onboarding` on every `/dashboard` visit. Pre-existing (S17-A), worth a `!isMember` guard.
7. Money Radar tile (`lib/funding/tile-data.ts:540-548`, untouched): project profile/prefill/phase progress come from the owner's project (correct) but `latestFundingReportForUser(user.id, project.id)` / `funding_matches.user_id = user.id` / `dataroom_files.user_id = user.id` are per caller → a member never sees the owner's report/matches (empty tile state, no leak). Consistent with "credits per caller" but not with "owner's project data". Decide + document.
8. No render test for `dashboard/page.tsx` itself (the largest converted page); only the static guard covers it. Add one mirroring `dashboard/svi/page.test.tsx`.

## Explicit checks
- `dashboard/page.tsx` credits/scores per caller: `getBalance(user.id)` :422, `scores.email = user.email` :596, `user_actions.email = user.email` :613, `getCompletedOnboardingSteps(user.id)` :779. Checked OK (except report_sections, P1 above).
- `NextUnlockCard`: `evaluation_criteria` by owner's `accountId` + `projectId` (:664-675), `growth_phase_current` from owner's project. Checked OK. `MoneyRadarTile`: see P2-7.
- `workspace/projects/[slug]/members/page.tsx:49-50`: `getActiveProject(user.id, slug)` returns null for non-member/pending → `notFound()`; editor/viewer get shell + note, roster only when `roleCanAdmin`. Test :84 pins 404. Checked OK.
- No `(founder)` page calls `getProjectScope("editor"|"admin")` (grep clean); all 22 pages use `"viewer"`, which never throws. Checked OK.
- `getProjectIdFromRequest` / `getActiveProjectIdOrNull` under `(founder)`: none (grep clean; guard rule B, allow-list empty). Checked OK.
- Client `readOnly` props: living-svi-dashboard (unlock CTAs + bundle), evidence-vault-client (add/connect/bank import/disconnect/wizard), data-room-client, grants-client, metrics-client, InvestorPackGenerateForm (one-click = editor+; `/generate` stays viewer+ caller-paid — matches routes). Checked OK.
- Integrations: GitHub OAuth `canOAuth = !isMember || role==="admin"`, manual form editor+, GA link admin+ (matches `api/integrations/github/manual` editor gate). Checked OK.
- API keys match page keys: founder-crud.ts:37/72/113 `ownerUserId`; `api/esop/grants` :30/100 `ownerUserId`; `investor-pack/generate|preview` `ownerUserId`. Checked OK.
- `tests/chrome/shell-coverage.test.ts`: untouched by the merge, passes. Checked OK.
- Member never inserts `svi_accounts`: `page-scope.test.ts` runs the real readers against fake Supabase for viewer/editor/admin — no insert, no legacy `IS NULL` probe. Checked OK.
