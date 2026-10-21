# G35 — Pricing v5 (Pay-as-you-go 3 tier) + rà soát platform + AI cost routing

**Ngày:** 20/10/2026 · **Owner quyết định:** Do Van Long · **Trạng thái:** W0, W1, W2 (P1–P5), A1/A3, O1, D30 **LIVE 20/10** (`606f0f118`); W6 (guest Full = report 16 section + tier label, evaluator PAYG bằng thẻ, A2 eval loop + coordinator + review fixes) **LIVE 21/10** (`bc356985f`). Pricing v5 code-complete sau cờ `payg_enabled` = OFF. Còn: Stripe test key → test E2E (gồm evaluator thẻ + guest Full) → mint live → bật cờ + archive A$3 (founder duyệt).

**Nguồn:** spec founder `blockid-payg-pricing-update.md` (20/10) + yêu cầu bổ sung: *bỏ hẳn A$1 / A$3 khỏi chương trình; rà soát toàn platform; sửa bug; kiểm tra link hỏng; cơ chế đổi free model; chọn model chất lượng tốt nhất với giá thấp nhất; agent điều phối đánh giá tổng hợp + chi tiết (paid + free); cảnh báo khi model trả phí sắp hết tiền; sẵn sàng chạy lâu dài.*

**Bằng chứng:** 5 agent read-only chạy song song ngày 20/10 (pricing inventory, purchase/report map, platform audit, link sweep, AI routing audit). Không sửa code, không deploy, không chạy Stripe trong bước lập plan. Kết quả thô ở mục Phụ lục.

**Hợp nhất:** plan này là G35 trong [SOURCE-OF-TRUTH §12.15](plans/SOURCE-OF-TRUTH.md) và **thay** câu "giữ existing A$3/plan entitlement" ở SOT §14 + bảng `REPORT_SKUS` A$3 ở §14.1 sau khi D25–D27 được duyệt. [pricing-truth.md](ops/pricing-truth.md) và [messaging.md](design/messaging.md) được sửa trong wave P5 (không sửa trước khi code đổi, để guard không lệch).

---

## 0. Tóm tắt một trang

| # | Lane | Vì sao | Hạn |
|---|---|---|---|
| **L0** | **Khẩn cấp: report ngừng chạy 23/10 00:00 UTC** + Next.js RCE + test hỏng chặn deploy + `/data` 91% | Mất toàn bộ report (paid + free) sau 2,6 ngày; lỗ hổng critical đang live 20 ngày; deploy gate sẽ fail | **22/10** |
| L1 | Ổn định chạy lâu dài (disk, release pruning, error digest, status root, boot unit, AI defects) | Còn ~10 deploy là đầy disk; monitoring đang "mù" | tuần 1 |
| L2 | Link hỏng (19) + nâng cấp link checker | 9 trang grant theo bang 404 từ 04/10, email cảnh báo 16 ngày không ai xử lý | tuần 1 |
| P1–P5 | **Pricing v5**: Snapshot A$19 / Full A$49 / Verified A$149, bỏ A$1/A$3 | Spec founder | tuần 1–3, sau flag `payg_enabled` |
| A1–A3 | **AI coordinator**: model catalogue, eval loop, scorecard, balance alerts | Chất lượng tốt nhất / chi phí thấp nhất, có cảnh báo hết tiền | tuần 2–3 |
| O1 | Ops dài hạn: firewall chỉ Cloudflare, origin cert, certbot, log rotation, worktree cron, DB WAL slot | Giảm rủi ro dài hạn | tuần 2–4 |

Thứ tự deploy: **L0 → L1+L2 → P1–P3 (flag off) → A1 → P4 → P5 (flip flag test → live sau duyệt) → A2–A3 → O1.** Mỗi deploy qua `deploy-auto.sh`, một lần một deploy (chờ peer session), sau mỗi deploy: review → test → fix trước phase kế tiếp.

---

## 1. Discovery (spec §2)

### 1.1 A$1 / A$3 hiện có ở đâu

**Ba SKU one-off A$3** (`web/src/lib/pricing/v3-skus.ts:66-121`, `REPORT_SKUS` :124):

| SKU id | Sản phẩm | Env Stripe | Nguồn giá |
|---|---|---|---|
| `sku_trust_report_5aud` | Trusted Business Report (member, `/api/reports/checkout`) | `STRIPE_PRICE_TRUST_REPORT_5AUD` (đọc trực tiếp ở route :111; **không** có trong `STRIPE_PRICE_MAP`, `.env.example`, `sync-stripe-pricing.mjs`) | code constant 300¢ + `FEATURE_COSTS.trust_report = 3.00` (test ép credit = A$) |
| `sku_one_click_report_3aud` | One-Click guest report (`/one-click-report`, `/analyze` guest, `/api/stripe/analysis`) — bán như TBR | `STRIPE_PRICE_ONE_CLICK_REPORT` | code constant; `platform_config.guest_analysis_price_aud_cents=300` **không ai đọc** |
| `sku_funding_report_3aud` | **Money Finder** | `STRIPE_PRICE_FUNDING_REPORT` | code constant + 2 bản sao độc lập (`funding/radar-upsell.ts:112`, `funding-paywall.tsx:42` literal "A$3") + en/vi.json literal |

**A$1 không còn SKU bán thật**, nhưng còn: (a) đơn vị credit — pack 5 = A$5 ("A$1.00/credit" tự tính ở `billing-client.tsx:741`); (b) evaluator re-score hiển thị "A$1" (`evaluations-client.tsx:46,257,772`, `actions-block.tsx:104`, email `progress-email.ts:171-200`); (c) nhãn `credit-gate.tsx:57,67,98`; (d) legacy `STRIPE_PRICE_SVI_ANALYSIS`=100¢ (catalogue + `.env.example:144`), A/B `ab-pricing.ts` variant `a1` vẫn `active:true`; (e) copy cũ: cron `growth-insights` ("Founding 100 ($1)"), prompt `admin/rnd` ("$1-25"), video Remotion "From A$1", content/research.

**Bề mặt cần đổi** (inventory đầy đủ ở Phụ lục A): pricing page + FAQ JSON-LD (`(marketing)/pricing/page.tsx:80,92,100`, `faq-v2.tsx`, `pricing-data.ts:290`, `vi/pricing`), Product JSON-LD `price "3.00"` (`(marketing)/layout.tsx:58`), homepage tiers ladder "Free / A$3 / A$29", `/solutions/*` `{reportPrice}` (đọc từ One-Click SKU), `plans-v2.ts` Free plan feature "TBR A$3 PAYG", paywall (`ReportPaywallGate.tsx`, `unlock-rail.tsx`, `tbr-strings.ts` EN/VI), `/analyze` (guest panels), trial copy, `/docs`, PDF upsell (`svi-summary-pdf.tsx`, `pitch-deck-pdf.tsx`), email (`email.ts` guest tax invoice, `email-drip.ts`, `progress-email.ts`), legal `terms-v2.mdx:101-106,231`, `privacy-v2.mdx`, migration registry `0346`, i18n `en.json/vi.json` (hero CTA, advisor headline, funding.*), scripts investor self-report, ~30 test/guard files (Phụ lục A.3), `docs/ops/pricing-truth.md`, `docs/design/messaging.md:76,114,196`.

### 1.2 Luồng mua + fulfilment hiện tại

- **Member:** `ReportPaywallGate` (dialog confirm-before-pay, không qua `/checkout/review`) → `POST /api/reports/checkout` (auth bắt buộc, `mode:'payment'`, `automatic_tax`, metadata `bid_scope:'report_order'`, `bid_sku`, reseller fields; **không reuse `customer`**, **không `invoice_creation`**) → insert `report_orders` `CHECKOUT_INITIATED` → webhook `checkout.session.completed` → `handleReportOrderCompleted` (PAID, audit, `enqueueOrder` → `report_generation_queue`, `revenue_events`) → cron `report-order-drain` 2 phút/1 order → `generateTrustReportForOrder` (orchestrateReport → `assembled_reports` + `report_v2`) → 3 lần fail → `refundFailedOrder`.
- **Guest:** `/api/guest-analysis/create-order` → `guest_analyses` → webhook → `runGuestAnalysis` → `sendGuestReport` (có tax invoice + ABN).
- **Evaluator:** `report-dialog.tsx` → `POST /api/evaluations/[id]/report` dùng quota plan hoặc credits, không qua Stripe. *(20/10 follow-up, sau `payg_enabled`: thêm mua bằng thẻ — preview trả `cost.payg.card`, dialog mở `PaygTierPicker`, checkout `/api/reports/checkout` + `evaluationId`, xem SOT §12.15.)*
- **Webhook:** chữ ký `constructEvent` 300 s; idempotent theo `stripe_webhook_events` (PK event id) + unique `report_orders.stripe_session_id` + unique queue `order_id`.
- **Credits redeem:** `/api/reports/redeem` (`sku_trust_report_credits`).

### 1.3 Report generator + gating

- TBR v2 có **16 section** (`components/tbr/v2/report.tsx:2-8`): Dashboard, Investment view, Key points, Valuation, 8 chương dimension (tre, mpc, ftv, ptd, cgh, iri, lco, svm), Risk matrix, 90-day plan, Money on the table, Appendix + Evidence cited. Khớp spec "16-section".
- Free tier hiện **gate ở client** (`report.tsx:129-166` `lockCards`); `GET /api/svi/report/[projectId]` trả full `reportV2` cho client (`route.ts:252-258`). Chỉ PDF/DOCX được project ở server (`lib/report-v2/free-tier.ts`). → **Lỗ hổng dữ liệu hiện có**: section khoá vẫn nằm trong payload. P2 sửa luôn.
- PDF: `@react-pdf/renderer` — `lib/pdf/tbr-pdf.tsx`; Investor Pack `lib/pdf/investor-pack.tsx` (đang là feature credits `investor_pack`).

### 1.4 Evidence + verification

- Business verification L0–L5 `projects.verification_level` (`lib/verification/*`); evidence ladder 6 nấc tới `third_party_verified`; evidence-confidence % `lib/svi/evidence-confidence.ts` → `svi_snapshots.evidence_confidence`; groundedShare `report_v2.quality`.
- Admin `/admin/evidence-review` + `POST /api/admin/evidence/[id]/review` ghi `svi_dimension_evidence.review_status` — **tái sử dụng** cho Verified review (per-claim accept/reject).
- Chưa có khái niệm "report reviewed" / badge "BlockID Reviewed"; chưa có SLA.

### 1.5 Khoảng trống chặn spec (phải xử lý trước khi bán tier)

| # | Khoảng trống | Hệ quả | Xử lý |
|---|---|---|---|
| G1 | `report_orders.product_sku` CHECK chỉ 2 SKU cũ (`0270`) | Không insert được tier mới | Migration 0474 |
| G2 | Unique index `report_orders_active_uniq (business_id,user_id)` gồm cả READY | Không mua được Full sau Snapshot (409) | Đổi thành unique theo `(business_id,user_id,sku)` cho trạng thái in-flight; upgrade có `upgrade_of_order_id` |
| G3 | TBR checkout không `invoice_creation` | Không có ATO tax invoice cho A$3 hiện tại | Bật như guest/funding (Seller ABN custom field, footer GST) — **sửa ngay ở P3** |
| G4 | Không email paid/ready cho `report_orders` | Khách không biết report xong | Thêm (report-delivery là loại email vẫn được gửi theo quyết định 25/09) |
| G5 | `charge.refunded` chỉ đụng reseller commission | Order không chuyển REFUNDED | Thêm handler |
| G6 | Gating free/paid ở client | Rò section khoá | Server-side projection (P2) |
| G7 | Checkout không reuse Stripe customer | Customer trùng, portal rời rạc | Truyền `customer` khi có `app_users.stripe_customer_id` |
| G8 | `platform_config` không có DDL trong repo, chỉ key có trong `CONFIG_DEFAULTS` mới áp dụng | Key PAYG phải thêm vào defaults + admin UI | P1 |
| G9 | `report_orders.expires_at` +90 ngày, không có cron expiry | Không rõ quyền truy cập | Quyết định: report one-off **không hết hạn** (đặt `expires_at` null cho tier v5) |
| G10 | Migration 0472 (queue lease) chưa apply | Paid order không có lease/reclaim | Founder apply trước P3 |

---

## 2. Quyết định founder (D25–D30) — **ĐÃ DUYỆT 20/10/2026** theo cột "Đề xuất"

| ID | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| **D25** | Money Finder đang A$3. Spec nói giữ; yêu cầu mới nói bỏ hẳn A$3 | **Đổi Money Finder full report thành A$19** (SKU `report_funding`, cùng mức Snapshot), credits 19; copy "Free scan · A$19 full" | Khớp "bỏ hẳn A$3"; một mức giá entry duy nhất (A$19) dễ hiểu; Money Finder vẫn là sản phẩm riêng, không gộp vào TBR |
| **D26** | One-Click guest report A$3 (bán như TBR) | **Gộp vào PAYG**: guest chọn Snapshot hoặc Full (email bắt buộc, claim vào account sau); Verified bắt buộc đăng nhập | Một sản phẩm report, ba tier; bỏ SKU trùng tên |
| **D27** | A$1 = đơn vị credit (pack 5 = A$5) và re-score "A$1" | **Bỏ pack 5 credits/A$5**; giữ 10/25/50/100; mọi UI hiển thị **"N credits"**, không quy đổi A$/credit; re-score hiển thị "1 credit"; tách giá tier khỏi `FEATURE_COSTS` (bỏ test ép credit = A$); credits mua được Snapshot (19) / Full (49), Verified chỉ trả thẻ | Bỏ mọi con số A$1 hiển thị; không phá credit đã bán |
| **D28** | Cơ chế upgrade | **Price one-time riêng**: `upgrade_snapshot_full` A$30, `upgrade_full_verified` A$100 | Founder đã cấm coupon (G25); Price riêng hiện đúng dòng trên invoice + audit |
| **D29** | Ai review Verified, công suất | Reviewer = admin role; **cap 5 Verified đang `in_review`** (`payg_verified_max_open`), vượt thì ẩn tier Verified tạm thời; SLA 2 ngày làm việc Sydney + ngày lễ NSW | Không hứa SLA khi không đủ người |
| **D30** | Off-site backup (O09 đã DEFER 22/09) — nay `/data` 91%, 41 lần offsite fail | **Mở lại**: chọn 1 trong (a) Shared Drive, (b) GCS bucket (~US$1/tháng cho 14 dump); hoặc giữ defer có ghi rõ rủi ro mất dữ liệu khi mất VM | Toàn bộ dump nằm cùng đĩa đang đầy |

Không đổi: giá/quota mọi subscription (Founder Free/A$29/A$69; Scout A$79, Firm A$149, Program A$349, Fund A$999; Intake, Cohort 25/100). Report included trong subscription = **Full**.

---

## 3. Lane 0 — khẩn cấp (trước 22/10, một deploy)

| ID | Việc | Evidence | Fix |
|---|---|---|---|
| L0-1 | **Report price policy hết hạn 23/10 00:00 UTC** → mọi report (paid, free, reanalysis, market research trong scope report) bị từ chối "price or request not admitted" | `web/src/lib/ai/report-attempt-budget.ts:24` `EXPIRES`, :118; giá DeepInfra 4 model kiểm 20/10 **không đổi** | Gia hạn `EXPIRES` +30 ngày (giữ `REPORT_PRICE_POLICY` id vì `ledgerSchema` pin `z.literal` — đổi id sẽ vô hiệu ledger đang chạy); thêm test "policy còn ≥ 7 ngày"; A1 thêm cron cảnh báo trước 7 ngày + tự soạn bản gia hạn |
| L0-2 | 3 unit test phụ thuộc ngày (tháng 9) fail → gate 4b chặn deploy | `investors/dealflow.test.ts:128`, `workspace/evidence/corrections/page.test.tsx:124`, `funding/programs/[capital]/[id]/page.test.tsx:216` | `vi.useFakeTimers()` + `vi.setSystemTime` |
| L0-3 | **Next 16.3.5 RCE** (GHSA-vcvr-r3jv-pc5j, `next/og` — dùng ở `/api/og/score`, `/api/og/svi` nhận query user) + SSRF image optimizer + `sharp` high | `npm audit`: 1 critical / 19 high; security posture 95 → 74 | `next@16.4.2`, `sharp@0.35.5`; build + full vitest + qa:live; SVI repo (next 15.5.19) cùng bump |
| L0-4 | `/data` 91% (28 GB trống ≈ 10 deploy), disk-guard fail im lặng mỗi 5 phút | `df`, `blockid-disk-guard.service` exit 2, `StandardOutput=null` | Thêm `/data` vào uptime guardian (cảnh báo 85%, critical 92%); chạy release pruning (L1-1) ngay sau deploy |
| L0-5 | 9 trang `/funding/grants/state/*` 404 từ 04/10 (ISR cache HIT 404 trên origin :4165) | link-check-latest 13 broken, email 16 ngày | Deploy L0 thay cache; L2 tìm root cause (revalidate lưu 404) |

Kiểm tra: `tsc` 0, vitest 0 fail, `qa:live` green, 1 canary report thật sau deploy, `/api/og/svi` 200.

---

## 4. Lane L1 — ổn định chạy lâu dài

| ID | Ưu tiên | Defect | Fix (file/script) |
|---|---|---|---|
| L1-1 | P0 | 66 release (165 GB) + 32 SVI release (43 GB) không bị xoá: `release-retention-pins.json` pin gần hết; 60/65 origin "retained" có PID chết | `scripts/cron/g30-release-retention.py`: bỏ entry PID+start-time chết, tái tạo pins từ entry sống; cron weekly dry-run report + apply giữ 6 |
| L1-2 | P1 | Error digest mù từ 22/09 (đọc `/data/logs/blockid-production.log` cũ) → `/api/status errors_1h=0` giả | `scripts/error-digest.mjs:38` đọc log origin đang serve (qua g30 serving-state); thêm timestamp vào log service |
| L1-3 | P1 | Live code đọc `content/reports` theo `process.cwd()` = thư mục release đóng băng 27/09 (39 file); history ghi vào release dir mất sau deploy | Chuyển sang `getStatusRoot()`/`BLOCKID_WEB_DIR` (`src/lib/status/jsonl.ts`) + guard test cấm `process.cwd()` + `content/reports` |
| L1-4 | P1 | Reboot = site down (origin là transient unit `Restart=no`; watchdog không cold-start); kernel pending reboot, uptime 79 ngày | Boot unit khởi động release `.next-current`; thử 1 reboot giờ thấp điểm |
| L1-5 | P1 | Replication slot `cainophile_*` (supabase-analytics) giữ 3,9 GB WAL, `safe_wal_size` 170 MB; DB `_supabase` logging 2,6 GB không retention | Reset analytics consumer / tạo lại slot; retention 14 ngày cho `_analytics.log_events_*` |
| L1-6 | P1 | Migration 0472 (queue lease) + 0473 (team_members) chưa apply 23 ngày | Founder apply (`web/supabase/pending-authority/README.md`) |
| L1-7 | P2 | Crontab drift: repo file còn `clean-disk.sh --apply`, `server-cleanup.sh --procs`; 6 job no-op "deferred (G30 ownership)" từ 22/09 (guardian auto-heal tắt) | Đồng bộ `scripts/crontab.production` = live; comment job deferred; quyết định bật lại agent-guardian |
| L1-8 | P2 | 22:30 UTC 3 job nặng chạy cùng lúc → 24 watchdog strike, curl timeout | Giãn 10 phút |
| L1-9 | P2 | 4 origin cũ (:4161–4164, ~2,9 GB RAM) + 11 SVI service cũ; 55 unit failed; 88 nginx backup; 104 worktree (42 không commit, 38 prunable) | Dọn sau deploy; `systemctl reset-failed`; `git worktree prune`; cron `cleanup-merged-worktrees.sh` (không xoá worktree agent đang chạy) |
| L1-10 | P2 | Runtime state file trong repo public (33 modified, 515 untracked; `security-posture.json` liệt kê 73 route không auth guard); JSONL 8,4 MB/5,7 MB không rotate | `.gitignore` `web/content/reports/*` runtime + `git rm --cached`; rotate JSONL > 5 MB (giữ 30 ngày) |
| L1-11 | P2 | `ga4-event-audit` fail mọi lần (05, 12, 19/10): custom events thiếu → funnel mù | Kiểm consent mode + Measurement Protocol; P5 analytics phụ thuộc mục này |
| L1-12 | P2 | Alert fatigue: 342 email ops/22 ngày, phần lớn lặp | Dedup theo (kind, level, ngày); digest 1 email/ngày cho P2; escalation khi > 48 h |
| L1-13 | P2 | Log noise: 1.042 "failed-to-find-server-action", 789 "Server Reference ID did not match" (bot/tab cũ) | Hạ mức log; giữ ChunkLoadError auto-reload |

Ops dài hạn (lane O1, sau pricing): firewall GCP chỉ Cloudflare IP cho 80/443 (origin đang truy cập trực tiếp được, spoof forwarded header); cài Cloudflare Origin Certificate (cert origin hiện là của `git.longcare.au`, hết hạn 14/08 — không được bật Full strict trước khi thay); certbot `bot.longcare.au` đổi sang webroot (fail 2 lần/ngày); `ai-token-guardian.sh:61` bỏ `docker restart` container không tồn tại.

---

## 5. Lane L2 — link hỏng

| Nguồn → đích | Status | Fix |
|---|---|---|
| sitemap + mọi trang grant → `/funding/grants/state/{ACT…national}` (9) | 404 | L0-5 + root cause ISR lưu 404 (`(marketing)/funding/grants/state/[state]/page.tsx`, `lib/funding/seo.ts:193`) |
| `/vi/pricing` og/twitter image → `/og/pricing.png` | 404 | `vi/pricing/page.tsx:37,48` dùng `/pricing/opengraph-image` |
| JSON-LD breadcrumb `/vi/solutions/*` → `/vi/solutions` | 404 | `solutions-shared.tsx:440` trỏ `/solutions` hoặc thêm trang vi index |
| `/checkout/review` canonical/hreflang/og:url | 404 | Bỏ canonical/alternates trên trang noindex này |
| grant `boosting-female-founders` → business.gov.au round-3 | 404 | Đánh dấu closed (`grants-au.seed.json:19` + DB `au_grants`) |
| Hobart programs, `/funding/report/demo` → enterprize.space (2) | 404 | `programs-au.seed.json:6745,6813` → `/programs/` |
| Canberra → capitalangels.com.au | 503 nhiều ngày | Flag review, ẩn sau N ngày |
| `/tbr/demo`, insight → investmentcouncil.com.au | 302 loop | `content/insights/how-to-value-a-startup-idea-australia.md:124` + fixture |
| `/tbr/demo` → investment.nsw.gov.au MVP Ventures | 3 hop | `report-v2/fixtures.ts:144` URL mới |
| Static scan: `/workspace/legal` (weekly digest email), `/innovator/theses|pipeline|reports`, `/credits`, `/wholesale/verify` | route không tồn tại | `digest/weekly.ts:145`, `product-tour/feature-tours.ts:690,720,730`, `startup-package/analyze/route.ts:152`, `equity/request/route.ts:83` |
| startupvalueindex.com `http://`, `www.` trả 200 trực tiếp | không redirect | Cloudflare Always Use HTTPS + nginx www → apex 301 |

**Nâng cấp checker** (`web/scripts/link-check.mjs`): alert chỉ khi tập broken thay đổi + escalation > 48 h + số open trên `/admin`; parse JSON-LD/og/twitter/hreflang, trang có query; redirect loop/> 5 hop = broken; 403/429/999 ghi "unverifiable" (không bỏ qua); quét trang đăng nhập bằng tài khoản `qa:live`; job weekly kiểm `official_url` của `au_grants`/`au_programs` → `link_status`, ẩn programme hỏng > 7 ngày; gate 8 thêm `--include-sitemap` (không bị `G30_DEFER_EXTENDED_REVIEW` bỏ qua); static route scan thành unit test; chạy nightly cho startupvalueindex.com.

---

## 6. Pricing v5 — thiết kế triển khai

### 6.1 Catalogue (một nguồn)

File mới `web/src/lib/pricing/v5-payg.ts` (thay `REPORT_SKUS` v3 cho report):

| SKU | Giá (AUD, GST incl.) | Env | Nội dung |
|---|---|---|---|
| `report_snapshot` | 1900 | `STRIPE_PRICE_REPORT_SNAPSHOT` | SVI + radar 8 chiều, top 3 strengths/risks, evidence-confidence %, PDF 1 trang |
| `report_full` | 4900 | `STRIPE_PRICE_REPORT_FULL` | + 16 section TBR, AU comparables, evidence register, questions to ask next, PDF đầy đủ |
| `report_verified` | 14900 | `STRIPE_PRICE_REPORT_VERIFIED` | + team review evidence, Investor Pack PDF, badge "BlockID Reviewed", ≤ 2 ngày làm việc |
| `upgrade_snapshot_full` | 3000 | `STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL` | D28 |
| `upgrade_full_verified` | 10000 | `STRIPE_PRICE_UPGRADE_FULL_VERIFIED` | D28 |
| `report_funding` (D25) | 1900 | `STRIPE_PRICE_REPORT_FUNDING` | Money Finder full report |

- **Giá thu** luôn từ Stripe Price; **giá hiển thị** từ `platform_config` (`payg_snapshot_cents`, `payg_full_cents`, `payg_verified_cents`, `payg_enabled` mặc định **false**, `verified_sla_business_days`=2, `payg_verified_max_open`=5) — thêm vào `CONFIG_DEFAULTS` + Admin › System Config (`pricing-config.tsx`). Stripe sync page cảnh báo drift display ≠ Stripe.
- Credits (D27): `FEATURE_COSTS.report_snapshot=19`, `report_full=49`; bỏ ràng buộc `trust_report === TRUST_REPORT_PRICE_AUD`.

### 6.2 Stripe

- Script idempotent `web/scripts/stripe/mint-payg-v5.mjs`: tìm Product theo `metadata.sku`, tạo nếu thiếu; Price `currency:'aud'`, `tax_behavior:'inclusive'`, `unit_amount`, metadata `{sku, pricing_version:'v5'}`; `--mode test` mặc định, `--mode live` từ chối nếu thiếu `--confirm-live`; in Price IDs, không in secret. Thêm rows vào `stripe-price-catalogue.json`, `STRIPE_PRICE_MAP`, `.env.example`, `sync-stripe-pricing.mjs`, `stripe-price-audit`.
- Checkout session: `mode:'payment'`, `customer` reuse (G7), `invoice_creation` + Seller ABN + footer GST (G3), metadata `{bid_scope:'report_order', sku, project_id, user_id, order_id, pricing_version:'v5'}`, success → `/workspace/reports/order?session_id=…`, cancel → trang report.
- Archive (không xoá) Price A$3 cũ sau khi v5 live; webhook giữ map `sku_trust_report_5aud`, `sku_one_click_report_3aud`, `sku_funding_report_3aud` để fulfil session muộn.

### 6.3 Migration 0474 (`pending-authority/`, idempotent)

Không tạo bảng `report_orders` thứ hai — **mở rộng bảng hiện có** (spec §4 yêu cầu bảng mới, nhưng bảng cùng tên đã tồn tại với webhook/queue/refund; tạo thứ hai = hai ledger):

- `report_orders`: thêm `tier text check (tier in ('snapshot','full','verified'))`, `currency text default 'aud'`, `upgrade_of_order_id uuid null references report_orders(id)`, `reviewed_by uuid null references app_users(id)`, `reviewed_at`, `delivered_at`, `sla_due_at`; mở rộng CHECK `product_sku` (giữ 2 SKU cũ + 6 SKU v5); thêm status `IN_REVIEW` (map spec: `paid→PAID`, `generating→GENERATING`, `delivered→READY`, `in_review→IN_REVIEW`, `refunded→REFUNDED`, `failed→FAILED`); thay unique index active thành `(business_id, user_id, product_sku)` chỉ cho `CHECKOUT_INITIATED/PAYMENT_PENDING/PAID/GENERATING`.
- `assembled_reports`: thêm `payg_tier text`, `reviewed boolean default false`, `reviewed_at`, `reviewed_by`. `review_notes` đặt ở bảng mới `report_reviews` (admin-only RLS) + `report_review_claims` (claim_id, decision accept/reject, note).
- `revenue_events.kind`: thêm `report_snapshot|report_full|report_verified|report_upgrade|report_funding`.
- RLS: user đọc order/report của mình; admin đọc tất cả; chỉ service role cập nhật `status`. Test RLS: user A không đọc được order user B.
- Apply qua `scripts/db/apply-migration.sh` (founder hoặc phiên có quyền), ghi `schema_migrations`.

### 6.4 Purchase + fulfilment

1. **CTA "Get report"** (3 tier) ở: unlock rail trang report, evaluator deal-flow (khi hết quota/không có subscription), `/analyze` guest (Snapshot/Full), Money Finder (D25). Review-before-pay giữ dạng dialog hiện có, hiển thị tên tier, nội dung, tổng tiền GST incl., one-off, thời gian nhận (Verified: "within 2 business days").
2. `POST /api/reports/checkout` nhận `tier`; từ chối khi `payg_enabled=false` (403 + copy) hoặc Verified vượt `payg_verified_max_open`.
3. Webhook `checkout.session.completed` (chữ ký + idempotent theo event id và session id): order PAID → snapshot/full: enqueue tier → READY + email link; verified: generate Full → IN_REVIEW + `sla_due_at` + hàng đợi admin + email "in review, ready within 2 business days".
4. **Sinh dữ liệu một lần:** mọi tier chạy pipeline Full (chi phí AI ≈ US$0,02/report — đo 10/2026), gate ở render/PDF ⇒ upgrade tức thì, không chạy AI lại. Upgrade: order mới SKU upgrade, `upgrade_of_order_id`, webhook chỉ đổi `payg_tier` của report hiện có.
5. `charge.refunded` → `REFUNDED`; report vẫn đọc được; Verified bị refund → bỏ badge (`reviewed=false`, ghi audit).
6. Subscriber: dùng quota không bao giờ charge; hết quota → PAYG Full A$49 hoặc nâng plan (copy: *Scout A$79/tháng gồm 10 Full report — hoà vốn sau 2 report Full lẻ*).
7. Email (thuộc nhóm report-delivery còn gửi): paid, ready, in-review, reviewed; tên tier trên receipt/billing history.
8. **Guest Full (D26, follow-up 20/10):** guest không có account/project nên không dùng được drain `report_orders`. Runner (`lib/guest-analysis/runner.ts`) thấy `report_data.payg.tier = "full"` (chỉ create-order ghi khi cờ ON) → `full-report.ts`: `analyzeInput` (như `/api/intake`) → `saveAnalysis` (row `analyses` không user, `full_report_email` = email mua, anon key ngẫu nhiên không set cookie) → `startReportV2Job` (cùng `orchestrateReport` tier standard = đủ 16 section; retry/stuck/cron 5 phút sẵn có) → email report với link ký `/analyze/<id>?t=…` + PDF `renderTbrPdf`. `guest_analyses` → `delivered` (= đã giao cho pipeline) + `report_data.fullReport.analysisId`; email receipt `sendGuestFullReportPaid` (dòng tax invoice + link ký, EM08 lint). Claim vào account: đăng nhập magic link/Google bằng email đó (G34 DC03). Snapshot guest giữ PDF SVI "preview"; A$3 (cờ OFF) không đổi (test chứng minh). Tier label (Snapshot/Full/Verified) trên trang order/report in-app: `GET /api/reports/[orderId]` thêm `paygTier` chỉ cho order v5. Không migration. Còn mở: hoàn tiền tự động khi job v2 của guest Full hỏng hết lượt retry (hiện giống A$3: không auto-refund, support xử lý).

### 6.5 Server-side gating Snapshot (và vá G6)

- Module `web/src/lib/report-v2/tier-projection.ts`: `projectReportForTier(reportV2, tier)` trả **chỉ** Executive Summary, SVI + radar 8 chiều, top 3 strengths/risks, evidence-confidence %, CTA upgrade cho Snapshot; Full/Verified trả đủ 16 section; free tier dùng cùng hàm (thay gating client).
- Áp dụng tại mọi đường đọc: `GET /api/svi/report/[projectId]`, `GET /api/reports/[orderId]` (json/pdf/docx), `/tbr/[token]`, `/api/svi/report/pdf`, investor pack, email attachment. Guard test: response Snapshot không chứa key section bị khoá.

### 6.6 Verified review (admin)

- Trang `/admin/verified-reviews` (admin guard ở page): hàng đợi theo `sla_due_at`; evidence list + link; accept/reject từng claim (tái sử dụng `lib/evidence/review.ts`); notes; nút "Mark reviewed".
- Mark reviewed: tính lại verification level + evidence-confidence từ evidence được chấp nhận; `reviewed=true` + badge "BlockID Reviewed · ngày · reviewer"; sinh Investor Pack (`lib/pdf/investor-pack.tsx`, không trừ credits cho order Verified); email khách; order → READY + `delivered_at`.
- SLA: `lib/time/au-business-days.ts` (Australia/Sydney, cuối tuần + ngày lễ NSW, bảng năm 2026–2027); cron notifications kiểm `IN_REVIEW` quá `sla_due_at` → cảnh báo admin (email ops, dedup).

### 6.7 Copy, pháp lý, guard

- `/pricing` (+ `/vi/pricing`): block "Pay as you go" dưới plan switcher, 3 card + dòng *"Scout pays for itself after two Full reports."*; FAQ thay câu A$3 bằng *"Without a subscription, buy a single report: Snapshot A$19, Full A$49 or Verified A$149 (all AUD, GST-inclusive)."*; cập nhật FAQ JSON-LD và Product JSON-LD (`(marketing)/layout.tsx:58` → `AggregateOffer` low 19 / high 149).
- Homepage tiers, `/solutions/*` `{reportPrice}` → "from A$19"; `plans-v2.ts` Free plan; trial copy; `/docs`; PDF upsell; email drip; `/one-click-report` (D26 → trang PAYG guest); Money Finder copy (D25); i18n EN/VI.
- Terms v2.2 (`content/legal/terms-v2.mdx`, `legal/versions.ts`, migration registry mới): report one-off không hoàn tiền sau khi giao, trừ khi ACL yêu cầu; Verified còn `in_review` hoàn đủ khi yêu cầu; giữ câu ACL không bị loại trừ.
- Bỏ A$1 (D27): re-score "1 credit"; xoá `STRIPE_PRICE_SVI_ANALYSIS`, `ab-pricing` variant `a1/a3` → `active:false`; sửa `growth-insights`, `admin/rnd` prompt; ghi chú video Remotion cần render lại (asset marketing, không chặn release).
- Guard: `messaging.md` §11 thêm pattern cấm `A\$3(?!\d)`, `A\$1(?![\d,.])` cho report/credit price (theo mẫu dòng A$5.50 đã retire); unit test quét `src/` + `content/legal` cho literal giá cũ; giữ ngoại lệ lịch sử (`/version`, `/roadmap` changelog).
- Cập nhật ~30 test pin A$3/A$1 (Phụ lục A.3) theo catalogue v5, không xoá test.

### 6.8 Admin + analytics

- KPI dashboard (`lib/admin/report-kpis.ts`): PAYG orders theo tier 7/30 ngày, doanh thu PAYG, tỷ lệ Snapshot→Full, SLA hit rate Verified, PAYG buyer sau đó subscribe.
- Stripe sync (`dashboard/admin/stripe-sync`): 6 Price v5 + drift so với `platform_config`.
- Events qua wrapper hiện có (consent mode v2): `payg_tier_viewed`, `payg_checkout_started`, `payg_paid`, `payg_upgrade` — thêm vào `lib/analytics/events.ts`; phụ thuộc L1-11 để GA4 thấy được.

### 6.9 Tests + acceptance (spec §10)

Tests: price lookup; checkout session từng tier (+ `payg_enabled=false` bị chặn); webhook idempotent (cùng event 2 lần → 1 order, 1 report); gating Snapshot server-side; giá upgrade chênh lệch; refund; RLS cross-user; SLA business days (cuối tuần, lễ NSW, DST); guard không còn A$3/A$1.

Done khi: Stripe **test mode** mua từng tier end-to-end giao đúng report + GST tax invoice; PDF/page Snapshot không chứa section khoá, upgrade hiện đủ không chạy AI mới; Verified vào queue admin, Mark reviewed gửi Investor Pack + badge; không còn "A$3"/"A$1" cho report/credit ở code, copy, JSON-LD, email, legal; Money Finder theo D25; subscription không đổi; `payg_enabled=false` ẩn block + chặn checkout; lint, tsc, full vitest, qa:live pass.

### 6.10 Rollout

1. P1–P4 deploy với `payg_enabled=false` (đường A$3 cũ vẫn chạy cho tới bước 3 để không có khoảng trống bán hàng).
2. Mint test-mode → chạy acceptance §6.9 trên build local `:4001` với Stripe test keys + Stripe CLI forward webhook (không dùng production cho test mode).
3. **Cần founder duyệt:** mint live Prices, set env, bật `payg_enabled`, gỡ A$3 khỏi UI (P5) trong cùng một deploy.
4. Archive Price A$3 cũ (giữ mapping webhook).
5. Changelog `docs/` + tóm tắt Stripe IDs cho founder.

---

## 7. AI routing: free + paid, coordinator, cảnh báo số dư

### 7.1 Hiện trạng (20/10)

| Thành phần | Trạng thái |
|---|---|
| Dispatcher `ai-client.ts` (3 class: classify/report/synthesis; rank theo tier → capacity) | OK |
| Report path DeepInfra-only (V3.2 → Qwen3-235B → V4-Flash), cap US$0,50/report | OK nhưng **hết hạn 23/10** (L0-1) |
| Free pool `ai-free-models.json` | Suy giảm: 6/21 model khoẻ; chỉ Groq + OpenRouter |
| Claude CLI fallback | Token hết hạn 18/10, guardian refresh fail 1.731 lần |
| Quality telemetry `tbr-quality.jsonl` | groundedShare median 0,89 (6 run tháng 10) — **không ghi model theo section** |
| Eval `prompt-eval-nightly` | "inspected 0" mỗi đêm; đánh giá prompt, không đánh giá model |
| Số dư | DeepInfra US$67,53 (auto top-up off); **OpenRouter US$1,55** (< floor US$2 → chặn cả model `:free`); không có alert runway |
| Chi phí | ~US$0,3–0,5/tháng hiện tại; ~US$0,023/report |

### 7.2 Defects (sửa ở lane A0, cùng L1)

1. Classify chạy Allam-2-7B (Arabic 7B) vì `demoteFlaky` xếp trên model ít strike → lọc classify ≥ 20B, deny `allam|tts|guard`; health check không dùng model này làm bằng chứng "AI OK".
2. SambaNova key sai nhưng probe `/v1/models` trả 200 → probe bằng completion 1 token, yêu cầu có content; Cerebras chỉ còn `gpt-oss-120b`, `qwen-3.8-27b`.
3. 15 model chết (`KNOWN_GOOD_FREE_MODELS`, ~1.755 strike mỗi cái) bị probe mỗi 30 phút → `ai-model-health.jsonl` 16 MB: bỏ khỏi pool sau 24 h dead, rotate file.
4. OpenRouter `low_credit` chặn cả `:free` → miễn trừ `:free`; thêm `nemotron-3-ultra-550b:free`, `nemotron-3-super-120b:free`, `gemma-4-31b-it:free` vào candidate.
5. Ledger chi phí sai: `ai_runs` ghi model/giá Claude danh nghĩa khi DeepInfra trả lời (`call-structured.ts:312`); daily ledger ghi đè (không có history); giá Gemini thấp hơn thực; 3 bảng giá riêng → một catalogue (A1).
6. Claude CLI guardian: tính expiry sai (âm 29 triệu phút), `docker restart` container không tồn tại; cần `claude auth login` (founder) hoặc đổi cách refresh.

### 7.3 Ma trận model đề xuất (giá USD / 1M token in/out, kiểm 20/10)

| Task | Primary (paid) | Rẻ hơn / challenger | Free fallback | Cuối cùng |
|---|---|---|---|---|
| Chương report (JSON có citation) | DeepSeek-V3.2 (0,26/0,38) — citation đo tốt nhất | V4-Flash-0731 (0,06/0,18); Qwen3-235B-2507 (0,09/0,55) | **Không** cho report scoped (chính sách founder: không paid spillover, chỉ DeepInfra) | Xếp hàng chờ + resume |
| CEO synthesis | V3.2 | Qwen3-235B; thử GLM-5.3-Flash (0,15/0,50), V4.1-Flash (0,20/0,60) | nemotron-3-ultra-550b:free (ngoài scope report) | Claude CLI (nội bộ) |
| Grounding critic / judge (khác family với writer) | Qwen3-235B-2507 | Llama-3.3-70B-Turbo (0,10/0,32) | Groq gpt-oss-120b | — |
| Extraction / classify | DeepInfra gpt-oss-120b (0,037/0,17) | V4-Flash-0731 | Groq gpt-oss-120b → gpt-oss-20b | Gemini 2.5 Flash-Lite |
| Dịch EN↔VI | Qwen3-235B-2507 | V4-Flash | Groq qwen3.8-27b | — |
| Chat | Groq gpt-oss-120b (free) | V4-Flash | Gemini 2.5 Flash (free tier) | Claude CLI |
| Vision | Qwen3-VL-235B (0,20/0,88) | Qwen3-VL-30B, Gemma-4-31B | — | Gemini 2.5 Flash |

Model mới chỉ vào ladder report sau khi qua eval (A2) và founder duyệt proposal (giữ D-policy G30).

### 7.4 Agent điều phối + đánh giá (A1–A3)

- **A1 Model catalogue** `web/src/lib/ai/model-catalog.ts` (id, provider, family, context, capability, task, giá, admitted) thay 3 bảng giá; `scripts/ai/sync-prices.mjs` cron 02:15 đọc feed giá DeepInfra + OpenRouter → `ai-price-feed.json`; alert khi giá đổi > 5%; **cảnh báo 7 ngày trước khi price policy hết hạn** + soạn sẵn bản gia hạn để founder duyệt (chặn lặp lại L0-1).
- **A2 Task profiles + eval loop** `task-profiles.ts` (8 task: gate schema, groundedShare, numeric check, không citation bịa, p95 latency, trần chi phí); golden set `test-fixtures/model-eval/<task>/` (40 dev + 20 held-out, EN+VI, dữ liệu tổng hợp/công khai); cron `/api/cron/model-eval` weekly full (CN 05:00 UTC) + nightly smoke 3 prompt/task, trần **US$1/lần**, budget riêng; chấm bằng `eval-runner` + `llm-auditor` `findUncitedClaims` + judge khác family (mẫu); live score từ `ai_runs` + `tbr-quality` (sau khi ghi model thật).
- **A2 Coordinator** `model-coordinator.ts` → `ai-routing-policy.json` (ai-client đọc như free-models, fallback mặc định) + `ai-model-scorecard.json/.jsonl`:
  - **Đánh giá tổng hợp**: điểm chất lượng/ chi phí trên mỗi output được chấp nhận theo provider + task; **chi tiết**: theo section/chương, theo ngôn ngữ, p95, tỷ lệ schema fail.
  - Promote challenger khi 0 lỗi critical trên held-out, chất lượng ≥ primary − 0,02 và chi phí ≤ 80%; hoặc chất lượng +0,05 với chi phí ≤ 1,5× — cần 2 lần liên tiếp. Demote khi live groundedShare < 0,80 trên 20 section, schema fail > 10%, trễ SLO hoặc dead.
  - Free model: tự promote/demote. Ladder report paid: chỉ **đề xuất**, admin duyệt (Approve/Rollback).
- **A3 Cảnh báo số dư** `lib/ai/balances.ts` + cron `ai-balance` mỗi giờ: DeepInfra (`/v1/me?checklist=true` → `stripe_balance`, `suspended`), OpenRouter (`/api/v1/credits`, `/api/v1/key`); Groq/Cerebras/SambaNova theo 401/402 + rate-limit header; Gemini ước tính từ ledger vs ngân sách tháng. Runway = số dư ÷ burn trung bình 7 ngày. **Warn:** < 14 ngày hoặc < US$10; **critical:** < 3 ngày hoặc < US$3 → DeepInfra critical: chuyển task không phải report sang free, report xếp hàng (không đổi provider); OpenRouter critical: chỉ tắt model paid OpenRouter. Kênh: email ops (Telegram fallback) + `founder_notifications`, dedup theo mức/ngày.
- **Admin** `/admin/ai-health`: 3 card — số dư + runway; scorecard theo task (primary vs challenger, chất lượng, chi phí/accepted output, p95, lần eval cuối); policy diff + Approve/Rollback. Tuỳ chọn bảng `ai_model_scores` (migration sau).
- **Acceptance:** không report nào bị từ chối vì policy hết hạn; classify không chạy model < 20B; `ai_runs` khớp DeepInfra usage ±5%; scorecard cập nhật hàng tuần; số dư giả lập US$2 → đúng 1 email critical + chuyển free; model chết không bị probe sau 24 h.
- **Chi phí ước tính:** hiện tại ~US$0,5/tháng; + eval loop ~US$2–3/tháng → ~US$3/tháng; 100 report/tháng ~US$5; 1.000 report ~US$25–35 (gồm panel judge 3 family ≤ US$0,10/report). Biên gộp PAYG: Snapshot A$19 với chi phí AI < A$0,10 → rủi ro chính là thời gian review Verified, không phải AI.

---

## 8. Thứ tự thực thi + cách chạy agent

| Wave | Nội dung | Agent/worktree | Gate | Deploy |
|---|---|---|---|---|
| **W0 (≤ 22/10)** | L0-1…L0-5 | 1 agent (phiên chính) | tsc + full vitest + build + qa:live + canary report | **cần founder OK** |
| W1 | L1-1…L1-4, L1-7/8, A0 defects 1–5, L2 link fixes + checker | 3 agent worktree song song (ops / AI / links) | full vitest mỗi lane, merge tuần tự | 1 deploy |
| W2 | P1 catalogue v5 + platform_config + Stripe script (test) · P2 migration 0474 + tier projection (vá G6) | 2 agent | RLS test, gating guard | deploy flag off; 0474 founder apply |
| W3 | P3 checkout tier + invoice + customer reuse + webhook + refund + upgrade + emails | 1 agent | webhook idempotency, Stripe CLI test mode trên :4001 | deploy flag off |
| W4 | P4 Verified admin + SLA + Investor Pack + badge · A1 catalogue + sync-prices | 2 agent | SLA tests, admin smoke | deploy |
| W5 | P5 copy/legal/JSON-LD/i18n/guards, bỏ A$1/A$3, D25/D26/D27, KPIs, analytics | 2 agent (copy+legal / admin+analytics) | messaging guard, link check, qa:live | **founder duyệt live** → mint live, flip flag, archive A$3 |
| W6 | A2 eval + coordinator, A3 balance alerts + admin cards | 2 agent | acceptance §7.4 | deploy |
| W7 | O1 firewall/cert/certbot, L1-5/9/10/12/13, worktree cron | 1 agent + founder | reboot drill giờ thấp điểm | deploy |

Quy tắc: worktree agent cho mỗi lane, commit + push ngay (vòng `git reset --hard` nền); một deploy một lúc qua `bash web/scripts/deploy-auto.sh`, chờ peer session xong; review → test → fix sau mỗi deploy; không xoá worktree agent chưa commit; không chạy Stripe live / migration production / gửi email marketing khi chưa có duyệt.

---

## 9. Việc chỉ founder làm được

1. Duyệt **W0** (gia hạn price policy + bump Next/sharp + deploy) — hạn 22/10.
2. Duyệt D25–D30.
3. Apply migration 0472, 0473, (sau) 0474.
4. `claude auth login` trên server (Claude CLI fallback).
5. Thay/bỏ key SambaNova; quyết định nạp Cerebras; nạp OpenRouter US$10 nếu muốn model paid OpenRouter (model `:free` chạy được sau fix A0-4).
6. Off-site backup (D30).
7. Telegram bot token mới (alert hiện chỉ qua email).
8. Mint live Stripe Prices + bật `payg_enabled` (W5).

---

## Phụ lục

**A. Pricing inventory** — báo cáo agent ngày 20/10: 3 SKU A$3, danh sách A$1, ~30 test/guard pin giá (`v3-skus.test.ts`, `trust-report-price.test.ts`, `stripe-map.test.ts`, `purchase-surfaces.test.ts`, `gst-wording.test.ts`, `credits.test.ts`, `credit-packs.test.ts:248`, `plans-v2.test.ts`, `plans.test.ts:335`, `pricing-matrix.test.tsx`, `homepage/tiers.test.ts`, `solutions-pricing.test.ts`, `messages-parity.test.ts`, `funding/copy.test.ts`, `checkout-entry.guard.test.ts`, `email-transactional-lint.test.ts`, `marketing/claims.test.ts`, `messaging.test.ts`, `platform-config.test.ts`, `progress-email.test.ts`, `evaluations/page.test.tsx`, `financial-health/route.test.ts`, `stripe.test.ts`, scripts tests, live-qa `21-reports`, `43-free-reports`, `20-funding`, `22-evaluator`, e2e smoke/billing). docs: 62 file chứa A$3/A$1 (nặng nhất `docs/ops/pricing-truth.md`).

**B. Purchase/report map** — file:line ở §1.2–1.4.

**C. Platform audit** — vitest 43.433 test / 3 fail (ngày), tsc 0, eslint 0 error / 488 warning; `npm audit` 1 critical / 19 high; uptime 24 h 99,9%; qa:live 18/10 307/0; restore drill 18/10 pass.

**D. Link sweep** — crawl 854 trang + 1.550 target; startupvalueindex.com 16/16 OK; 49 external "unverifiable" (403/429/999).

**E. AI audit** — nguồn giá: DeepInfra `/v1/openai/models`, OpenRouter `/api/v1/models`; tài liệu: DeepInfra `/v1/me`, `/payment/checklist`; OpenRouter limits; Groq/Cerebras models; Gemini pricing.
