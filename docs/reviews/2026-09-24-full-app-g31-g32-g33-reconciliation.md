# Full-app review và đối chiếu G31/G32/G33 — 24/09/2026

## Kết luận và phạm vi

**Không thể xác nhận G31, G32, G33 đã hoàn tất.** G31 chưa có Investor Lens theo đặc tả; G32 chưa có scoring/valuation-core được duyệt; G33 đã triển khai nhiều phần nhưng nghiệm thu ổn định còn thất bại. Review này đưa toàn bộ deliverables trở lại cùng hàng đợi SOT §12.11–12.12, không tạo goal hoặc backlog cạnh tranh.

Yêu cầu founder trong lượt này: review toàn app, điều chỉnh plan để không bỏ sót việc G31/G32/G33, đồng thời đưa lựa chọn model DeepInfra tiết kiệm và đủ chất lượng/capacity cho C-level vào plan. Không coi yêu cầu cập nhật plan là bằng chứng các tính năng đã chạy.

Baseline source: BlockID `c2e147066`, SVI `565250b`. Có luồng triển khai khác cập nhật workspace trong lúc review: freeze theo SHA và receipt, không theo version `v3.33.3` chung. Manifest lúc đọc trỏ `c2e147066` nhưng `deployed_at` rỗng; không lấy manifest này làm bằng chứng T16k live.

## Cách review và độ phủ

- Ba nhánh review song song: G31/G32; G33/toàn app; model/pricing/capacity DeepInfra. Root tổng hợp source, plan, lịch sử và probe public.
- Inventory toàn bộ `src/app` của hai repository: **BlockID 382 page files + 693 handlers; SVI 59 page files + 29 handlers**. Tổng **441 pages + 722 handlers = 1.163 entries**. Route groups được bỏ khi dựng pattern; dynamic route là pattern, không phải mọi bản ghi thực tế.
- [CSV đầy đủ](2026-09-24-full-app-route-inventory.csv) ghi site, kind, route, nhóm chức năng, source file, SHA và coverage. Phân nhóm tự động phục vụ triage; không chứng minh mỗi route đã được functional review.
- [22 GET public lúc 13:59 UTC](2026-09-24-full-app-public-probes.json): các trang mẫu trả 200; workspace/admin chuyển tới login. Chuyển tới login rồi 200 không phải kiểm thử quyền hoặc chức năng bên trong.
- Tái dùng evidence test đã có thay vì chạy lại suite lớn hoặc tạo tài khoản/giao dịch mới. Receipt 24/09 ghi 307 pass/15 skip, page/link sweep và typecheck; đây là lịch sử, không gán thành test pass cho source mới.
- Lượt trước đã kiểm tra browser demo/listing và 26 focused tests, ghi riêng tại [report/valuation/criteria audit](2026-09-24-cross-site-report-valuation-criteria-audit.md).
- Không gọi inference, không gửi email, không mutate DB/billing/chain, không thay runtime provider và không deploy trong lượt điều chỉnh plan.

## Ma trận toàn app: việc nào phải nằm trong full plan

| Nhóm | Hiện trạng/bằng chứng | Phần phải nghiệm thu | Work items hiện hữu |
|---|---|---|---|
| Public/marketing/docs/SEO | Trang mẫu public hoạt động; copy methodology vẫn có lời hứa vượt output hiện tại | Copy khớp capabilities, canonical/redirect/EN-VI và link nguồn; inventory toàn site không chỉ homepage | U03–U06, O03/O04 |
| Auth/onboarding/projects/personas | Routes và suite persona có sẵn; probe anonymous redirect đúng; chưa chạy lại signed-in | Project/tenant isolation, switch context, deleted/revoked account, onboarding resume và link guest cũ | T01/T02, U06, O03/O04 |
| Intake/files/URL/text/vision | Có contracts/crawl/vision nền; qualification và input coverage chưa hoàn chỉnh | Multi-file/XLSX/CSV; phần cuối deck/bảng/ảnh không mất; source locator và financial provenance | F01, E01–E03, U07, report-surface E1 |
| Evidence/connectors/data room | BlockID trusted revenue producers rỗng; SVI `DataRoomTab.tsx` cố định 16 folders “0 documents/Not requested”, readiness 0/16 | Phân biệt chưa kết nối/chưa đánh giá với thực sự rỗng; producer tài chính hoàn chỉnh và evidence freshness | V01, R01–R04, T02, U02 |
| Report/criteria/share/export/email | 13/52 và 16 questions chưa cùng projection; SVI answers cắt 600 ký tự; public report thiếu question panel | Full detail + citations + question states; final revision giống nhau khi complete/reload/share/PDF/DOCX/email; old report preserved on failure | A01–A03, F02/F04, T02, U01/U02/U07 |
| Credits/billing/refund | Foundation và candidate migrations tồn tại; không đủ chứng minh full transaction lifecycle | Quote/consent/reserve/publish/capture/refund; replay/concurrent/cancel/failed report; mở nội dung đã mua không charge | B01–B03, U08, O03/O04 |
| SVI/index/benchmarks | Còn clamps 100 ở filters/cohort/adapter; SVI có draft base100, không phải G32 | Một nghĩa cho index; version-aware delta; no rerun bonus; ranking eligibility; consumers đồng bộ hai site | A04/A05, SV0–SV6 |
| Valuation/equity/cap table/vesting/dividends | `vesting.ts:86`, `share-price.ts:170` còn score→money; SVI `CapTableTab.tsx:73` mặc định A$5m/A$500k khi thiếu input | Gỡ score→money trên mọi consumer; label simulator assumptions; giữ immutable số đã phát hành; valuation theo phương pháp có nguồn | V01–V04, IL10, SV5 |
| Investor/CRM/portfolio/program/evaluator | Tools/questions tồn tại; Lens 6 signals/cohort projection chưa có | Dossier permissions, overrides, evidence changed after decision; filters/CSV/API theo cùng Lens và version | IL03, IL08–IL12, U06 |
| Founder/growth/tools/grants/advisor/reseller | Nhiều modules và specs có sẵn; chưa tái kiểm thử mọi business path | Context/navigation/entitlements; claim trong tool không trở thành verified report fact; hết hạn/missing/failure có trạng thái đúng | U06, O03/O04, E03 |
| Admin/API/cron/audit/deploy | G33 có fixes; snapshot 2 ngày, migration authority, rate limits, durable leases còn mở | Không dùng HTTP green thay core health; jobs restart; old origins quiescent; audit branch reconciliation; schema parity | G33 S0–S3, T08–T15, O05–O09 |
| UI/mobile/EN-VI/accessibility/performance | Shared tokens/components có; report dài và các page chậm nằm trong backlog | 375/768/1440, keyboard, headings, ≥44px actions, loading/error/empty/withheld/partial; parent/back giữ context; đo bytes/latency | U01–U07, T15, IL13/IL14 |

Offsite backup vẫn là **deferred**, không phải recovery đã đạt. Lỗi dependency ở receipt cũ cần refresh dependency audit trước khi khẳng định CVE hiện tại.

## G31: traceability đủ IL00–IL15, R0–R7

Không tìm thấy `investorLens` hoặc `NEXT_PUBLIC_BLOCKID_INVESTOR_LENS` trong tracked application source hai repo tại baseline. Component TBR hiện tại không chứng minh G31 được implement.

| Release / IDs | Source hiện tại | Thiếu / exit evidence |
|---|---|---|
| R0 / IL15 | Chưa có flag/golden theo G31 | Golden SVI gồm dossier, degraded fixture, guard và build-time flag |
| R1 / IL01, IL04, IL05 | Dashboard/InvestmentView cũ còn; “Investable now” còn trong `tbr-v3-strings.ts` | Shared Lens: 4 tiles, 6 signals, 3 strengths, 3 blockers, 3 questions; neutral labels; same projection 4 outputs |
| R2 / IL02, IL06, IL07 | Freshness primitives có; chưa có signal-level trend/Lens overlays | Team/Traction/Moat&IP, evidence freshness/lineage, delta cùng methodology/revision |
| R3 / IL03, IL08, IL09 | Evaluator questions đã lưu; risk likelihood vẫn suy từ missing evidence (`investment-view.ts:164`) | Ranked questions, criterion mapping, unknown probability, evaluator handoff; không dùng confidence làm risk likelihood |
| R4 / IL10 | Founder cap-table tools có; chưa aggregate trong Lens | Privacy-safe cap-table quality, SAFE/dilution; R4b theo XLSX input readiness |
| R5 / IL11 | Exit tools có; chưa có Lens liquidity | Buyer classes từ nguồn hiện có, comps AU có URL/ngày; tên buyer cụ thể deferred đến R01/R02; không thêm LLM/research trong R5 ban đầu, không số tiền dự đoán exit |
| R6 / IL12 | Chưa có `report_investor_signals` / `investor_lens` projection | Migration/backfill/revision binding, cohort filters/CSV/API additive, access parity |
| R7 / IL00, IL13, IL14 | 16 sections cũ không phải layout mới; chưa có receipt usability | Brief/full PDF/DOCX/email, samples/docs, nguồn đầu vào slide, 20-user review và A/B theo plan |

Tất cả rows: **planned; chưa accepted**. Các primitives tái dùng không được đánh dấu là tích hợp đã xong. D21 giữ từng quyết định; review này không tự thay fee hoặc công bố threshold chưa hiệu chuẩn.

## G32: đủ SV0–SV6 và V04

| Phase | Bằng chứng hiện tại | Việc còn lại / acceptance |
|---|---|---|
| SV0 | Rubric được yêu cầu trong SOT, chưa thấy artifact rubric@v1 hoàn chỉnh | 52 question IDs, 0–4/N/A anchors, criticality/source rules và examples; human adjudication |
| SV1 | `mandates-shared.ts:101`, `saved-views.ts:40`, `cohort-rows.ts` shared range parser và adapter còn cap100 cho index | Gỡ cap chỉ ở index consumers/filters/CSV/API, tách confidence % và dimension scale, không so delta khác version. **Correction sau source recheck:** `cohort-snapshots.ts:212` clamp là `evidence_confidence`, đúng thang0–100, không phải index bug |
| SV2 | Chưa thấy `svi_method`, `rubric_version`, `contribution_ledger` theo G32 | Versioned metadata/ledger cùng immutable report revision; compatible old readers |
| SV3 | Chưa có `question_scores`/`svi-v3` | Owner + 2 independent-family judges, quote checks, abstention/escalation; SCORE durable job/cache |
| SV4 | Chưa có calibration receipt G32 | 30–50 firms, 2 human raters; α≥0.67/κ≥0.6 theo plan; sensitivity, dedupe/freshness/correction; budget panel |
| SV5 | Shared approved engine chưa có | Shadow diff→activation hai site; preserve prior versions, no fabricated history, rollback labels |
| SV6 | Index consumer migration chưa xong | Method-aware public index/divisor/ranking and counts; no draft inclusion |
| V04a | Legacy SVI-derived fallback còn | Gỡ adapter/first-analysis score→valuation; explicit not_estimable có actions |
| V04b | Chưa có `valuation-core`; revenue producer rỗng | Sourced drivers, method eligibility gồm pre-revenue, scorecard factor rules, comps/IPEV calibration/tornado; tất cả equity/vesting/dividend consumers chuyển cùng contract |

SVI `svi-longitudinal.ts:133` tính **100+adjustment**, version `svi-evidence-state-v1-draft`, `eligibleForRanking:false`. Không phải G32 **C+S+T−A**, không base, không trần. Plan phải giữ migration từ draft và lịch sử; test draft không được tính vào SV3/SV4.

## G33: đã triển khai không đồng nghĩa đã accepted

| Phase | Implementation/deploy evidence | Acceptance |
|---|---|---|
| S0 / T01–T04 | Receipt ghi fixes live | **T01 acceptance reopen:** `quality-log.ts:318` dùng no-report ratio/latest-two thay ngưỡng plan; `api/status/route.ts:636,658` chỉ services/SLO cho aggregate ok, không report health. Probe mới `ok:true/watch`, degradedShare .56; không đóng S0 từ receipt cũ |
| S1 / T05–T07, T16 variants | Streaming/reservation/model selection/hedge có; T16j/k thêm Groq ở source | **FAILED/OPEN:** QA 13:36 có 5 pass/1 fail, 2 degraded >1. Reset chuỗi 5-run; nhiều run 420s vượt target360s. Không nói “còn 1 run” |
| S2 / T08–T11 | Graph verifier 13.971 rows, 5 pinned forks theo receipt; snapshot fix/mail block/source migration restore | Chưa đủ 2-day cron evidence; SQL pending-authority→migration/manifest còn mở; signed reconciliation vs pinned-fork design delta phải ghi rõ |
| S3 | Một số immutable writers/readers có | Paid `paywall/report-generator.ts:415` vẫn dùng `insertCompletedAssembledReport`, không immutable revision; lease/reclaim/reconcile, safe auto-retirement, semantic claims còn mở |
| S4 | Planned | G31 R0–R1 + SV0–SV1 chưa triển khai |
| S5 | Planned/gated | Scoring shadow, calibration, V04a và G31 R2–R3 |
| S6 | Planned/gated | Activation, valuation-core, downstream money consumers, Lens R4–R7; full quality gates còn mở |

Task completeness: T01/T02 reopen current-vs-plan status acceptance; T03/T04 receipt only. T05 chưa xác nhận shared ≤3/model semaphore, không suy từ model ordering. T06 chưa đóng unknown-attempt reconciliation. T07 fail. T08 design delta; T09/T10 acceptance pending; T11 receipt deployed. T12 dependency refresh/export acceptance open. T13 owner access fix có nhưng rate-limit/scanner scope chưa full. T14 MaxListeners và T15 performance open. T16–i receipt deployed; T16j/k source present, exact live identity cần receipt mới.

## Điều chỉnh thứ tự thực hiện

1. **S0/S1:** sửa status/metric parity và completion; đồng thời xử lý provider-policy deviation. S1 phải kiểm tra free **và** paid, strict schema/citations, deadline và actual usage, không chỉ word count.
2. **Kéo prerequisite F02/T02/O08 tối thiểu từ S3 lên S1:** revision read-back của chính canary path + lease/retry/reconcile cần có trước khi dùng chúng làm exit gate S1. Full writer coverage các caller còn lại giữ S3. Loại dependency vòng S1 đòi read-back nhưng toàn writer để sau S1.
3. **Song song không phụ thuộc runtime:** SV0 rubric, mapping 13/52↔16, audit money consumers, G31 fixtures/spec và reviewable R0/SV1 code. SV3 shadow scoring chỉ bắt đầu sau khi S1 đạt 7 ngày; SV5 activation còn cần calibration và consumer-migration gates. Không để việc viết rubric chờ 7 ngày.
4. **S2/S3:** complete authority, all writers/delivery, durable jobs, financial source producer. Thêm restore from existing artifact/versioned regeneration cho report cũ; không dùng adapter để chế nội dung không được lưu.
5. **S4:** Lens snapshot/readers + full criteria view + missing valuation explanation; G31 không được thay số SVI. G32 thay số trong phase riêng.
6. **S5/S6:** G32 panel/calibration/shadow, valuation-core, toàn money consumers, Lens/cohort/exports. Preserve G31 R4b, R6a/b, R7a/b, IL00 và usability; không bỏ các hạng mục chậm để ghi full complete.
7. **Whole-app closure:** từng route trong inventory gắn journey/owner/state/receipt; đủ auth/project/billing/admin/tools/mobile/EN-VI, không chỉ report đẹp.

## Definition of done dùng cho tất cả phase

Mỗi ID ghi riêng `planned`, `implemented@SHA`, `validated@receipt`, `deployed@build`, `accepted@gate`. `Deferred`, `blocked`, `failed`, `not verified` không chuyển thành pass vì code tồn tại hoặc có một HTTP200.

Task đóng khi source + meaningful validation + exact release evidence + customer-path acceptance cùng thỏa, hoặc founder explicitly changes scope với lý do. G31 cần layout/data parity và real usability; G32 cần calibrated scoring/independent valuation; G33 cần stability/integrity. Full app vẫn cần U06/S03. Không có tuyên bố full complete trong review này.

## DeepInfra policy được đưa vào plan

Chi tiết exact IDs, giá official 24/09, role/task map, 3-family G32 panel, budget và capacity tại [AI policy §8](../plans/g30-ai-routing-model-policy-2026-09-23.md#8-cập-nhật-24092026--c-level-deepinfra-tối-ưu-chi-phí-và-capacity).

Tất cả C-level customer inference dùng target policy DeepInfra. Cheapest-qualified theo task; không seniority-based model upgrade. Candidate mới phải qua same truth gate; source T16j/k Groq fallback là deviation phải reconcile trước claim DeepInfra-only, không âm thầm bật/tắt trong review.

## Giới hạn kết luận

Toàn app đã được inventory và bao phủ trong review/plan theo nhóm chức năng; **chưa functional-test từng route**, chưa thử mọi persona, chưa tạo report/paid transaction mới hay model benchmark mới. Giá/catalog public không xác minh account quota. Những điều kiện đó được giữ là deliverable cụ thể, không gọi là đã hoàn thành.
