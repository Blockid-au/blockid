# /analyze upload failure: incident, review and priority fixes (25/09/2026)

**Founder report:** On blockid.au, a signed-in user uploaded a document, was told it failed, and was sent back to an older report.

## 1. Incident: root cause confirmed

**nginx trace**
- 04:44:58 `POST /api/intake` from `/analyze?kind=deck` returned **200 with a 216-byte body**. That body is `{ok:false, reason:"free_allowance_used", …, payHref:"/workspace/reports/business"}`.
- 04:45:01 the browser was on `/workspace/reports/business`, which renders the project's **previous** report.

**Database**
- `admin@blockid.au` (plan `growth`, role `admin`, 1 286 credits) had used free grants 1 and 2 (21/09 and 23/09).
- `plans.growth.feature_flags` does not include `report.basic` or `report.premium`, so the free-allowance gate counted this user.

**Effect:** A signed-in founder who had spent the 2 free reports got a quote. The quote's only action was a link to the workspace report page. The uploaded deck was dropped and the old report was shown. Credits could not be used for the new input at all.

**Fix `aac98460c`** (deploy 25/09)
- The quote now carries the credit price of *this* input (`trust_report`) and the user's balance.
- The panel shows "Run this analysis — N credits", with cost and balance visible before the click.
- `payWith=credits` charges once, runs, saves and starts the report job.
- If the analysis throws, the credits are refunded.
- A short balance, or a race at spend time, returns 402 and nothing runs.
- Admin (staff QA) runs never consume the free allowance and are never blocked by it.
- 524 related tests pass and `tsc` is clean.

## 2. Full review of the analysis path

This review was read-only and used code, the production database, origin logs and nginx.

**Data from the last 7 days**
- Since the pipeline switched on 21/09, **7 of 12 runs ended `failed`** after 3 attempts. The message was "report fully degraded: 8 deterministic chapters…". One of these was a real customer.
- After the G33 fixes on 24/09, 3 of 3 runs finished. The longcare run needed a retry and took **16 minutes**.
- `/api/intake` itself responds in under 9 seconds.

| ID | P | Symptom | Root cause | Fix |
|---|---|---|---|---|
| AF01 | P0 | For a guest, any upload error (413, 422 OCR, 429, 500, network) looks like nothing happened; the button simply re-enables | `handleSubmit` sets `errorMsg`, but the `email` phase never renders it (analyze-root) | On errors other than email checks, return to `intake` with the error visible |
| AF02 | P0 | A signed-in user with low credits spends a free report on the run, then the confirm modal disables Run. Closing the modal drops a report that is already running. The user re-uploads, spends free report #2, and hits the paywall | The intake route reserves the grant and starts the job **before** the credit modal | When `freeReport` is present, skip the modal and go straight to the live phase |
| AF03 | P0 | A user past the allowance who cannot afford it is still linked to the workspace report (the old one) | Pay panel fallback uses `FREE_REPORT_PAY_HREF` | Link to "Buy credits" with `next=/analyze`, keep the file in memory, and never fall back to the old report |
| AF04 | P0 | Credits are spent but no report is produced and no refund is made | Save returns a null `analysisId` (rate limit or DB) and there is no refund; a final pipeline failure also has no refund | Refund when `!analysisId`; store the charge on the row and refund it on final failure; make the copy depend on how the run was paid |
| AF05 | P0 | "Retried automatically" is shown, then the page stops updating; a retry that succeeds is never shown | `pollAfterSecFor('failed') = 0` | While `failed` and attempts < 3, keep polling every 30–60 s |
| AF06 | P1 | "Retrying" is shown, but a non-OK poll (502 during a deploy) is not actually retried | full-report-panel returns without scheduling the next poll | Back off and retry on non-OK; stop only on 404 |
| AF07 | P1 | The spinner can run forever (the client stops polling after 20 minutes; a stuck run is only reclaimed after about 27) | No reclaim on poll and no notice when polling gives up | Give-up notice ("we will e-mail it"); the poll route reclaims `running` rows with no progress for more than 3 minutes |
| AF08 | P1 | Save fails, but the page still says "sending report N" | The route still returns `freeReport` | Return `saveFailed` and show a "not saved — retry" card |
| AF09 | P1 | Reloading `/analyze?q=` runs the analysis again (a second job and a second free report) | The URL is never replaced with `/analyze/<id>` | Call `history.replaceState` after a 200 |
| AF10 | P1 | A double click creates 2 runs | No in-flight guard and no `busy` on SmartIntake | Add an in-flight ref and a `busy` prop |
| AF11 | P1 | Error reasons are masked (`ocr_busy` shows as "rate limited", a 500 shows as generic) | Incomplete reason mapping | Map every `reason`; the 500 response returns `reason`; check size on the client |
| AF12 | P1 | Workspace deck page: uploading again within 30 minutes charges credits but shows **the previous run** | The restore key does not include the deck id (svi-stream-analysis) | Add `pitchdeckId` to the key; skip restore when `autoStart` |
| AF13 | P1 | The workspace report never reflects a run made on /analyze and has no "as of" date | `analyses` has no project; the page prefers localStorage | "Report from <date>" banner and a link to a newer analysis (full fix: G34 DC01) |
| AF14 | P2 | A transient 5xx on `/analyze/<id>` shows "Analysis not found" | 5xx is treated as not-found | Treat only 404 as not-found; retry otherwise |
| AF15 | P2 | Workspace uploads show generic errors | The server sends `reason` but the client reads `error`, and failed files are skipped silently | Show the reason; restrict accepted file types |

## 3. Showing results as early as possible

Everything below uses data that already exists today.

| Time | Show | Source |
|---|---|---|
| ER1: T+2 s | Score ring, stage, input echo, extracted slides | The intake response already contains `structured`, `signals`, `context` and `deriveCompactSvi`. Remove the fake deck walk (320 ms per slide) and the 1.4 s idea-lab hold. Mount FullReportPanel during the `live` phase |
| ER2: T+30 s | Valuation range, 8 dimension cards, 30-day plan labelled "draft — agents are checking" | `buildDeterministicReport` already runs before any model call (report-v2-job); save it into the progress envelope |
| ER3: T+2 min onward | Each chapter as it finishes | The orchestrator already emits `dimension_complete` with the chapter; the job only counts them. Save each chapter as it lands |

## 4. Order of work

1. **Wave A (P0):** AF01–AF05 plus AF10, in one deploy.
2. **Wave B:** ER1–ER3 (earliest results) plus AF06, AF07 and AF09.
3. **Wave C:** AF08, AF11–AF15.

After every deploy: review, qa:live partial, fix. Tracked in SOT §12.14.
