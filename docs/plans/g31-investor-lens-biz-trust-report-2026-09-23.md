# G31 — Investor Lens: nâng cấp Trusted Business Report (Biz Trust Report)

**Trạng thái:** `PLAN ONLY — chưa code` · **Ngày:** 23/09/2026 · **Rev 1.1:** đã đối chiếu source `4ed643201` (§1.5), thêm phương án implement và deploy từng phase (§7) · **Owner quyết định:** Do Van Long
**Ưu tiên:** P1. Chạy **sau hoặc song song có điều kiện** với các P0 truth item của G30 (E01/E03/A03/V01), như §7.
**Đầu vào:** `BlockID_Biz_Trust_Report_Upgrade_Plan.md` v1.0 (founder cung cấp 23/09/2026). Plan này là bản phân tích, điều chỉnh và cụ thể hoá đầu vào đó.
**Merge trong:** [`SOURCE-OF-TRUTH.md`](SOURCE-OF-TRUTH.md) §10.13, §12 (work items IL00–IL15), §16.3 (D21), §17.
**Design spec đi kèm:** [`docs/design/investor-lens-report-spec.md`](../design/investor-lens-report-spec.md).
**Kế thừa, không thay thế:** [G27 TBR v3 spec](../design/tbr-v3-investor-report-spec.md) · [G30 Investor Report Surface](g30-investor-report-surface-2026-09-23.md) · [dashboard spec `/analyze`](../design/analyze-report-dashboard-spec.md).

> **Tên goal:** G31 là tên gọi của gói nâng cấp. Các việc được đăng ký là work items IL00–IL15 trong **cùng hàng đợi §12 của SOT**. Không tạo backlog cạnh tranh; nếu mâu thuẫn, SOT thắng.

---

## 0. Tóm tắt một trang

**Mục tiêu:** Trusted Business Report trả lời theo đúng thứ tự investor quan tâm trước buổi gặp. Thứ tự đó là: đội ngũ → traction → moat → liquidity → cap table → IP. Mỗi kết luận phải có **độ tin cậy bằng chứng đi kèm** và **đường dẫn tới bằng chứng**.

**Nguyên tắc sản phẩm:** *Không thay SVI. Thêm lớp Investor Lens phía trên SVI.* Lớp này là **trình bày và suy diễn xác định (deterministic)** từ dữ liệu ReportV2 đã có. Trọng số, ledger và các con số SVI giữ nguyên tuyệt đối.

**Kết quả người dùng thấy:** màn hình đầu gồm 4 chỉ số, 6 tín hiệu investor, 3 lý do nên xem, 3 điều có thể chặn deal và 3 câu hỏi trước buổi gặp. Phần này đọc hiểu trong dưới 60 giây. Chiều sâu mở tại chỗ, không chuyển trang. Web, PDF và DOCX có cùng nội dung.

**Bản phát hành đầu tiên nên làm (IL-R1):** Investor Snapshot + Investor Priority Matrix + Evidence Confidence theo từng tín hiệu. Bản này làm thuần bằng derivation khi đọc (như G27): **không migration, không thêm lời gọi LLM, không đổi SVI**. Mọi report đã lưu đều render được ngay.

**Thứ tự phát hành:**

| Release | Nội dung chính |
|---|---|
| R0 | Nền an toàn: golden SVI, guard, cờ `investorLens` (không đổi giao diện) |
| R1 | Snapshot + Matrix |
| R2 | Signal chapters + claim/freshness |
| R3 | Questions + Risk engine |
| R4 | Cap Table Quality |
| R5 | Path to Liquidity |
| R6 | Cohort Lens + API |
| R7 | Report vNext (PDF/DOCX, sample, docs) + kiểm chứng người dùng |

---

## 1. Phân tích chi tiết plan đầu vào

### 1.1 Đánh giá chung

Plan đầu vào **đúng hướng và khớp chiến lược đã chốt**: investor là buyer chính (D01), thông điệp “Know the business before you invest.” (D15), và luật “pending ≠ 0”. Phần lớn hạ tầng plan yêu cầu **đã có trong code**. Khoảng trống thật nằm ở **lớp quyết định cho investor**, không nằm ở dữ liệu nền.

| Plan đầu vào yêu cầu | Hiện trạng trong code | Kết luận |
|---|---|---|
| Thang evidence 6 bậc 20/35/50/75/90/100% | `lib/evidence/types.ts` (L1–L6, **đúng 20/35/50/75/90/100**), `EVIDENCE_CONFIDENCE_LEVELS` trong `report-v2/schema.ts`, cap theo nguồn `confidence-cap.ts` | **Có sẵn.** Chỉ cần hiển thị theo từng claim/tín hiệu thay vì một con số cho cả report |
| Verification ladder (“L3 Trust”) | `lib/verification/level-engine.ts` L0–L5 (L3 = financials attested) | **Có sẵn.** Giữ L0–L5; hiển thị nhãn chữ, không chỉ “L3” |
| Evidence freshness Live/Current/Aging/Stale/Unknown | `lib/evidence/freshness.ts`: fresh ≤30 ngày, stale >90, trạng thái fresh/ageing/stale/never; `expiry.ts` | **Có một phần.** Thiếu bậc “Live <7 ngày”, và mới áp cho connector, chưa áp cho từng claim |
| Valuation range, phương pháp, kịch bản | 7 phương pháp, consensus, ask, `crossChecks`, bear/base/bull (`valuation-view.ts`) | **Có sẵn.** Cần thêm “phương pháp không dùng + lý do” và “biến nhạy nhất” (trùng V02 của G30) |
| Risk matrix | `InvestmentView.riskMatrix` 3×3 (G27 §4.4) | **Có, nhưng likelihood suy từ thiếu evidence.** SOT §3 cấm cách này nên phải sửa (xem 1.3-C) |
| Câu hỏi trước buổi gặp | `cover.threeQuestions` (lưu trong report); 52 `guidingQuestions` trong `evaluation-criteria.ts`. **Q01–Q16 chỉ có trong docs, chưa có trong code repo này** | **Có nguyên liệu, chưa có engine xếp hạng** |
| Cohort theo lens | `CohortFilters` đã lọc stage/sector/SVI/confidence/traction/risk/verification/review | **Có khung.** Thiếu cột và bộ lọc theo 6 tín hiệu |
| Cap table / SAFE / dilution | `lib/cap-table.ts`, `lib/fundraise.ts` (`calculateRound` priced/SAFE/note) | **Có công cụ founder.** Chưa đưa vào report investor |
| Exit / liquidity | `lib/exit-modeling.ts`, `exit-strategy.helpers.ts` (công cụ founder, input do founder nhập) | **Chưa có phân tích investor.** Không tái dùng số exit của founder làm kết luận (xem 1.3-G) |
| Provenance (report ID, methodology…) | `reportId`, `snapshotId`, `pipelineVersion`, `promptVersionIds`, `SVI_VERSION 2.2.0`, `audit_events` có hash chain | **Có một phần.** Thiếu evidence count, connector freshness, overrides và audit ref trên masthead |
| Reviewer governance | `evaluation_assessments` (0392), `assessment_overrides` (0423), `OverrideDialog` | **Có.** Thiếu cờ “bằng chứng đã đổi sau khi ra quyết định” |
| Claim/evidence data model | `claims`/`claim_versions`/`evidence_records` (0417), E01 của G30 đang dựng claim/source ID | **Không tạo bảng `claim_evidence` mới.** Mở rộng E01 |

### 1.2 Điểm mạnh của plan đầu vào cần giữ nguyên

1. **Tách điểm và độ tin cậy bằng chứng** (§10 đầu vào). Đây là lợi thế khác biệt lớn nhất. Hiện report chỉ có **một** evidence confidence cho cả tài liệu (G27 §4). Plan này nâng thành confidence **theo từng tín hiệu và từng claim**.
2. **Giới hạn mật độ màn hình đầu** (4/6/3/3/3). Khớp nguyên tắc 3 giây của G30 B1–B3.
3. **Không dùng % khảo sát làm trọng số** khi chưa kiểm chứng nguồn. Giữ nguyên tuyệt đối.
4. **Ngôn ngữ trung tính** (“Worth investigating”, không phải “Invest”). Khớp ASIC RG 244 và luật “Humans make the decision”.
5. **Questions engine** từ khoảng trống bằng chứng. Biến điểm yếu dữ liệu thành giá trị cho investor.
6. **ESG theo tính trọng yếu**, không ép điểm cho mọi công ty.

### 1.3 Điểm cần điều chỉnh trước khi triển khai

| # | Plan đầu vào | Vấn đề | Quyết định G31 |
|---|---|---|---|
| A | Top metric đầu tiên là “SVI 71/100” | Theo G30 B2, **định giá là con số lớn nhất trang**. `cover.svi.total` là **index không trần** (showcase 135), còn composite 0–100 mới là band input (G27 §4) | Hàng 4 chỉ số, theo thứ tự: **Valuation range** (lớn nhất) · **Evidence confidence** · **SVI composite /100 + band chữ** (index không trần hiển thị phụ, có tooltip) · **Verification L0–L5 + nhãn** |
| B | “Meeting potential” 4 nhãn, đứng cạnh verdict A–D | Có hai kết luận song song thì vi phạm D06/A03 (“một assessment status”) | **Không thêm kết luận thứ hai. Đổi nhãn hiển thị của band A–D** sang ngôn ngữ trung tính: A → *Strong case to investigate* · B → *Worth investigating* · C → *Major issues to resolve* · D → *Evidence incomplete*. Rubric `verdictBand()` giữ nguyên. Cách này đồng thời bỏ câu “Investable now”, vốn gần với lời khuyên đầu tư |
| C | `Risk Priority = Severity × Probability × Evidence Confidence` | (1) Nhân với confidence làm **rủi ro nghiêm trọng nhưng ít bằng chứng bị tụt hạng**, đúng những rủi ro investor cần hỏi nhất. (2) G27 đang suy likelihood từ “missing → high”, trái SOT §3 | Rank = **Severity × Probability**. Probability chỉ gán khi có bằng chứng; nếu không có thì ghi `Chưa xác định`, xếp theo severity và gắn chip `Chưa kiểm chứng`. Evidence confidence là **cột hiển thị riêng**, không phải hệ số nhân |
| D | Các % investor-priority (75/57/56/47/35/30/11) | Chưa rõ nguồn, mẫu, địa lý | Chỉ dùng để **sắp thứ tự hiển thị**. Mở task IL00 xác minh nguồn. Không in các con số % này lên report |
| E | Wording “startup evaluation” | D16 dùng **business/company** trong thông điệp chung | Positioning: *“Evidence infrastructure for business evaluation.”*; từ “startup” chỉ giữ khi nói đúng giai đoạn |
| F | 7 endpoint mới cho mỗi report + 4 bảng mới | Endpoint trùng lặp; `claim_evidence` trùng 0417/E01 | **Một** endpoint `investor-view` trả bundle; mở rộng institutional API v1. Tín hiệu lưu **trong ReportV2 revision bất biến** (`investorLens`, optional). Chỉ thêm **một bảng projection** `report_investor_signals` để lọc cohort (R6) và bảng `investor_questions` (R3) cho trạng thái hỏi/đáp |
| G | Path to Liquidity: “similar acquisitions, revenue multiple” | Cần research có nguồn thật, chịu ngân sách **US$0.50/report DeepInfra-only**. `exit-modeling.ts` là công cụ với input do founder nhập | Buyer **class** lấy từ taxonomy xác định theo sector/business model. Tên bên mua cụ thể và giao dịch so sánh **chỉ xuất hiện khi có nguồn** (R02 của G30). **Không in giá trị exit.** Thiếu nguồn thì ghi `Chưa có bằng chứng thoát vốn` |
| H | Cap Table Quality “Watch” trong ví dụ | Đa số company **không có cap table trong BlockID**. Nếu suy “Watch” từ thiếu dữ liệu là sai | Không có dữ liệu cap table (BlockID cap table, XLSX/CSV theo G30 E1, SHA/tài liệu) thì trạng thái là **Insufficient evidence** (xám) + CTA tải lên. Chỉ đánh giá khi có dữ liệu |
| I | 13 criteria được map vào 6 tín hiệu | 13 criteria hiện có (`lib/evaluation-criteria.ts`) **không có criterion riêng cho Legal/IP/Cap table/Exit** | Không thêm criterion thứ 14. Thêm **overlay questions** có ID (được G30 §6 cho phép): `LQ*` liquidity, `CT*` cap table, `IP*` IP. Ánh xạ về LCO/CGH/SVM |
| J | Lộ trình 15–20 tuần | Nhịp thực tế là phát hành theo phase nhỏ và deploy ngay | 7 release, mỗi release deploy riêng sau khi đạt gate. Ước lượng ở §7 |
| K | A/B test Version A/B | Traffic hiện tại không đủ để có ý nghĩa thống kê | Dùng feature flag + funnel events (G16) để **đo định hướng**. Kết luận chính lấy từ usability có điều phối (§9). Không gọi kết quả A/B là “significant” khi chưa đủ mẫu |
| L | “Expected lift” / hứa tăng điểm | Plan đầu vào: không hứa tăng điểm trừ khi xác định | Chỉ in “+N SVI” khi catalogue lift là quy tắc xác định. Nếu không thì dùng câu “sẽ nâng độ tin cậy bằng chứng của {tín hiệu} từ {bậc} lên {bậc}”, tính được từ thang evidence |

### 1.4 Rủi ro của chính đợt nâng cấp

| Rủi ro | Giảm thiểu |
|---|---|
| Lens trông “chắc chắn” hơn dữ liệu thật (6 chip màu đẹp trên nền bằng chứng mỏng) | Chip trạng thái **luôn đi kèm confidence**. Confidence <35% thì chip chuyển xám `Insufficient evidence` bất kể score (quy tắc cứng, có test) |
| Trùng nội dung giữa 6 signal chapters và 8 dimension chapters | Signal chapter = tổng hợp ≤200 từ + bảng claim. Dimension chapter vẫn là phân tích. SVI Detail mặc định đóng trên web |
| Báo cáo cũ lỗi (showcase 136a49f5: 0% confidence nhưng dimension 100) sẽ lộ mâu thuẫn rõ hơn | Chạy song song với A03/Q02. Lens có self-check: điểm tín hiệu ≥70 nhưng confidence <35% thì hiện callout “Luận điểm mạnh, bằng chứng yếu”, không giấu |
| Liquidity bị đọc như dự báo exit | Nhãn cố định “Không phải dự báo giá trị thoát vốn”. Không có con số A$ trong section 09 |
| Chi phí inference tăng | R1–R4 không thêm lời gọi LLM. R5 (buyer/comps) nằm trong budget report hiện có và dùng lại research store R01/R02 |
| Xung đột file với phiên Codex / phiên song song | Giữ phân vai G30 §5. `business-report-client.tsx`, `full-report-panel.tsx` và `analyze-results.tsx` chỉ **một bên** sửa tại một thời điểm. Serialize deploy |

### 1.5 Đối chiếu source hiện tại (rev 1.1, HEAD `4ed643201`, 23/09/2026)

Kiểm trực tiếp trong `web/src`. Những phát hiện dưới đây **thay các giả định ban đầu** của plan này.

| # | Phát hiện trong source | Hệ quả cho plan |
|---|---|---|
| S1 | `investmentView` được dựng **riêng ở từng bề mặt**: web `components/tbr/v2/report.tsx:106–113` (`investmentViewFor`), PDF `lib/pdf/tbr-pdf.tsx:1631`, DOCX `lib/docx/tbr-docx.ts:942–946`, email `lib/svi/email-report.ts:128`. `readSnapshotReportV2` (`/tbr/[token]`, `api/svi/report`) không chạy `ensureInvestmentView` | Lens dùng **một hàm thuần `investorLensFor(report, card)`**, gọi tại đúng 4 chỗ này, sau `alignReportWithAssessmentCard`. Không phụ thuộc đường load, nên mọi report cũ có lens giống nhau |
| S2 | Có 6 bề mặt render `<TbrReportV2>`: `/analyze` (`full-report-panel.tsx:385`), workspace + `/tbr/[token]` (`business-report-client.tsx:869`), `ReportOrderView.tsx:94`, showcase, `/tbr/demo` | Lens gắn **bên trong `TbrReportV2`**, nên **không cần sửa** `business-report-client.tsx`/`full-report-panel.tsx` (các file đang chia vai với Codex) |
| S3 | **Không có feature flag cho report UI** (chỉ có `lib/features/hidden.ts` cho route/nav và `feature-gate.ts` cho entitlement) | R0 thêm `lib/report-v2/investor-lens-flag.ts`: `BLOCKID_INVESTOR_LENS=off\|preview\|on` (server-only). `preview` = chỉ fixtures/demo/showcase/sample. Web/PDF/DOCX/email đọc cùng một cờ |
| S4 | **Không có golden regression cho SVI** (golden chỉ có ở entitlements) | R0 bắt buộc thêm golden SVI **trước** khi đổi bất kỳ dòng nào của report |
| S5 | `lib/marketing/messaging.test.ts` **không quét `components/tbr`** | R0 mở rộng guard sang `components/tbr/**` + `lib/report-v2/**` (chặn “Investable now”, nhãn nội bộ, benchmark thiếu n) |
| S6 | Chuỗi band nằm ở `lib/i18n/tbr-v3-strings.ts:195–201` (EN) và `:344–350` (VI), re-export ở `tbr-strings.ts:1943`. “Investable” có trong 5 test (`investment-view.test.ts:271`, `report.test.tsx:126`, `investment-view.test.tsx:62,146`, `tbr/demo/page.test.tsx:102`) | Đổi nhãn meeting (D21-a) = sửa 2 khối chuỗi + 5 test; `verdictBand()` và `BAND_TO_EXECUTIVE` giữ nguyên |
| S7 | `EvidenceRow` (`schema.ts:61`) có `dims`, `confidence?`, `observedAt?` nhưng **không có criterion key**. `CriterionCard.citations[].evidence_id` nối được sang `chapter.evidence` | R1 tính confidence theo tín hiệu bằng **join citations → evidence rows**, fallback theo `dims`. R2 thêm `criterion?` optional ở writer cho report mới |
| S8 | Risk likelihood = `dimLikelihood` (`investment-view.ts:164`): evidenced → low, partial/stale → medium, **còn lại → high** | R3 thay đúng hàm này; thêm mức `unknown`; `RISK_LEVELS_*` (:484) và `projectInvestmentView` (`free-tier.ts:91`) cập nhật theo |
| S9 | Trend chỉ có **tổng** (`cover.svi.deltaVsLast`, writer `run-for-project.ts:1114–1121` + `pitchdeck/save-snapshot/route.ts:140–153`). Dimension trước chỉ có ở `api/svi/history/full` | R1 hiện trend tổng. R2 writer lưu `cover.previousDimensionScores?` (optional) cùng truy vấn đó; report cũ ghi “chưa có lịch sử theo tín hiệu” |
| S10 | **Q01–Q16 không có trong code repo này** (chỉ có trong docs, trỏ tới project khác). Chưa có type trạng thái câu hỏi | Questions engine dựa trên 52 `guidingQuestions` + `EvidenceStatus` + `claims.contradiction_status`. Không chờ Q01–Q16 |
| S11 | Không có API “request evidence” cho evaluator. Đã có `evaluation_assessments.questions_for_founder` + `api/evaluations/[id]/assessment/share`; `decided_at` không tồn tại (dùng `submitted_at ?? updated_at`, như `outcomes/proposals.ts:324`) | R3 **không tạo bảng hay route mới**: nút “Thêm vào câu hỏi cho founder” ghi vào `questions_for_founder`; cờ “bằng chứng đổi sau quyết định” so `submitted_at` với `evidence_records.observed_at` |
| S12 | Cap table nằm ở các bảng `share_classes/shareholders/share_transactions/esop_pool` (0029 + `project_id` 0036); đọc bằng `loadCapTable(userId, projectId)` (`lib/investor-pack-assembler.ts` ~361, **cần owner id**). **Chưa có import XLSX/CSV** (`smart-intake.tsx:26–34` chỉ nhận pdf/doc/ppt/ảnh) | R4 đọc cap table **ở writer, trong ngữ cảnh owner**, rồi lưu **chỉ số tổng hợp** (%, số SAFE, pool) vào report. Không lưu tên cổ đông, nên evaluator xem report không thấy dữ liệu riêng. XLSX/CSV là R4b, phụ thuộc G30 E1 |
| S13 | Đã có comps thoát vốn AU **có URL công khai**: `lib/exits/au-benchmark.ts` (`getAuComparableExits`), cùng `suggestAcquirers(sector, …)` (`exit-strategy.helpers.ts:333`) | R5 **không cần research store hay LLM**: buyer class từ `suggestAcquirers` (chỉ lấy class), comps từ `au-benchmark.ts` có ngày/URL. R01/R02 chỉ mở rộng sau |
| S14 | Cohort: `CohortRow` (`cohort-rows.ts:95–140`); traction = điểm dimension `tre`; risk flags từ `riskFlagsFor` (:173); URL params ở `parseCohortFilters` (:364–430); CSV headers `BLOCKID_COHORT_CSV_HEADERS` (:580); API v1 chỉ **additive** (`docs/api/institutional.md` §Versioning) | R6 thêm trường vào cuối (CSV/API additive), params mới cho filter, cột mới mặc định ẩn bớt |
| S15 | Migration cao nhất trên master là `0447`; nhánh khác đã chiếm 0443–0446, 0448, 0449 | Projection R6 lấy số **≥0450**, chốt khi merge. Áp bằng `docker exec … psql` + `NOTIFY pgrst, 'reload schema'` **trước** deploy code |
| S16 | Free tier: `projectInvestmentView` (`free-tier.ts:91`) cắt risk/plan; section ids ở `TBR_V2_SECTION_IDS` (`shared.tsx:77`); thứ tự render ở `report.tsx:130–156` | Lens 01–03 không bị cắt. Giữ id cũ (`tbr-dashboard`…) làm **anchor alias** để link e-mail đã gửi vẫn đúng chỗ |

**Đồng bộ với G30 Investor Report Surface:** phần B1–B3/D1–D4 (Investor view mặc định, verdict bar, triptych, research masthead, trạng thái bằng icon + chữ) được **hiện thực trong `TbrReportV2` bởi G31 R1**. A1–A3 (một trang `/analyze`, bỏ lớp preview), C1–C3 và E1 vẫn thuộc G30 theo phân vai Codex/Claude. Hai bên không làm trùng.

---

## 2. Goal và KPI đo được

### 2.1 Goal một câu

> **Một investor mở Trusted Business Report và trong 60 giây biết: có nên dành thời gian cho doanh nghiệp này không, vì sao, bằng chứng mạnh/yếu ở đâu, và câu nào cần hỏi trước.** Mọi kết luận truy được về bằng chứng, và SVI giữ nguyên là khung phân tích.

### 2.2 Mục tiêu con (goal tree)

| Goal | Kết quả | Đo bằng |
|---|---|---|
| **G31-1 Hiểu nhanh** | Snapshot đọc hiểu trong <60 giây | ≥80% trong 20 người thử (5 angel · 5 VC associate · 5 accelerator manager · 5 founder) nêu cùng 2 điểm mạnh và 2 rủi ro hàng đầu; trung vị thời gian đạt kết luận đầu tiên <60 giây |
| **G31-2 Tin được** | Không kết luận nào thiếu bằng chứng | 100% tín hiệu có `evidenceConfidence` + ≥1 claim link, hoặc trạng thái `Insufficient evidence` (kiểm tự động trên corpus Q01) |
| **G31-3 Điểm ≠ tin cậy** | Score và confidence tách riêng ở mọi nơi | Guard test: không component nào render score tín hiệu mà thiếu confidence bên cạnh; web = PDF = DOCX |
| **G31-4 SVI bất biến** | Không đổi phương pháp | Golden regression: `total_svi`, composite, 8 dimension scores, band và verdict **giống hệt** trước/sau trên toàn bộ fixtures và showcase |
| **G31-5 Hành động được** | Câu hỏi và rủi ro có thứ tự | Top 3–7 câu hỏi xếp theo công thức xác định. ≥80% người thử chọn câu hỏi đầu tiên nằm trong top 3 |
| **G31-6 Liquidity và cap table rõ ràng** | Hai tín hiệu mới có logic riêng | Mỗi company có route liquidity + blockers, hoặc `Chưa có bằng chứng`; cap table được đánh giá khi có dữ liệu, không suy từ thiếu dữ liệu |
| **G31-7 Cohort cùng lens** | Evaluator lọc theo tín hiệu | 6 cột tín hiệu + 8 bộ lọc trong `CohortTable`; CSV/API xuất cùng trường |
| **G31-8 Đẹp và dễ dùng** | UI/UX đạt design gate | 375/768/1440 px không tràn ngang; nút ≥44 px; tương phản đạt spec; trạng thái = icon + chữ + màu; light-template guard xanh |
| **G31-9 Founder có lối đi** | Founder biết bằng chứng nào nâng tin cậy nhất | Top 3 evidence gaps + 1 hành động tác động lớn nhất, không hứa tăng điểm khi không xác định |
| **G31-10 Chi phí** | Không đội chi phí | R1–R4 không thêm lời gọi AI; R5 nằm trong trần US$0.50/report |

### 2.3 Definition of done (tổng)

Giữ 17 mục checklist §33 của plan đầu vào, cộng thêm:

- [ ] Nhãn band A–D đã đổi sang ngôn ngữ trung tính (1.3-B), và không có kết luận thứ hai.
- [ ] Rủi ro không bị hạ hạng vì thiếu bằng chứng (1.3-C).
- [ ] Không in % khảo sát investor chưa xác minh (1.3-D).
- [ ] Không in giá trị exit (1.3-G).
- [ ] Cap table thiếu dữ liệu hiển thị `Insufficient evidence`, không hiển thị `Watch` (1.3-H).
- [ ] Golden regression SVI giống hệt (G31-4).
- [ ] EN/VI tương đương cho mọi chuỗi mới (`tbr-strings.ts`).

---

## 3. Kiến trúc Investor Lens

### 3.1 Vị trí trong hệ thống

```
Evidence (connectors · documents · public · founder)      ← đã có (0417, connector_snapshots)
        │
13 criteria / 52 câu hỏi + overlays LQ/CT/IP              ← G30 E01 + G31 IL02
        │
SVI 8 dimensions · ledger · composite · verdict A–D       ← GIỮ NGUYÊN
        │
┌───────────────────────────────────────────────┐
│ INVESTOR LENS (mới, xác định, không LLM ở R1)  │
│  6 tín hiệu (+ESG tùy chọn) · confidence/tín hiệu│
│  freshness · trend · questions · risk rank    │
│  liquidity routes · cap-table quality          │
└───────────────────────────────────────────────┘
        │
ReportV2.investorLens (optional, trong revision bất biến)
        │
Web (Investor view mặc định) · PDF · DOCX · Email · API · Cohort
```

### 3.2 Sáu tín hiệu: đầu vào, ánh xạ, quy tắc

Ánh xạ tới **criterion key** thật trong `lib/evaluation-criteria.ts` và dimension. Không đổi trọng số dimension.

| Tín hiệu (UI) | Câu hỏi investor | Criteria nguồn | Overlay mới | Dimension chính / phụ |
|---|---|---|---|---|
| **Team** — Management Track Record | Đội này có thực thi được không? | `founder_profile`, `team`, `team_structure` | `MT1` prior exit · `MT2` full-time commitment · `MT3` key-person dependency | FTV / CGH, IRI |
| **Traction** — Commercial Traction | Khách hàng có thực sự kéo sản phẩm không? | `customer_size`, `revenue`, `gtm_strategy` | `TR1` concentration (khách lớn nhất %) · `TR2` retention/churn | TRE / MPC |
| **Moat** — Competitive Moat | Vì sao vẫn phòng thủ được nếu thành công? | `idea`, `code_git`, `roadmap`, `market` | 5 sub-signal: tech · data · IP · network · distribution/switching | SVM / PTD |
| **Liquidity** — Path to Liquidity | Investor hiện thực hoá giá trị bằng đường nào? | `revenue`, `market`, `documents`, `team_structure` | `LQ1` route khả thi · `LQ2` buyer classes · `LQ3` comparable exits (có nguồn) · `LQ4` blockers | SVM + CGH + TRE + LCO |
| **Cap Table** — Cap Table Quality | Cấu trúc có đầu tư được không? | `team_structure`, `documents`, `dataroom` | `CT1` founder ownership + vesting · `CT2` ESOP pool · `CT3` SAFE/note → dilution vòng tới · `CT4` dead equity/concentration · `CT5` SHA/board | CGH / LCO |
| **IP Depth** — IP & Research Depth | Tài sản giá trị nào tồn tại ngoài pitch? | `code_git`, `documents`, `idea` | `IP1` IP assignment · `IP2` patents/trademarks · `IP3` proprietary data/research | PTD + SVM + LCO |
| *ESG / Impact (tùy chọn)* | Có trọng yếu với mandate/sector không? | — | `ES1` materiality · `ES2` evidence | Chỉ hiện khi sector ∈ {climate, health, energy, government, impact, regulated} hoặc investor lens có mandate ESG |

**Công thức (R1, xác định):**

- `signalScore` = trung bình trọng số điểm các criterion nguồn **đã đánh giá**. Trọng số lấy từ tỷ lệ dimension hiện có, không đặt số mới. Không criterion nào được đánh giá thì `null` và hiển thị `—`.
- `signalConfidence` = trung bình theo mức trọng yếu của **evidence level** các claim nuôi tín hiệu (20/35/50/75/90/100). Mỗi claim bị cap theo freshness: Stale thì tối đa bậc `public_url` 35%; Unknown thì tối đa 20%.
- `status`, xét theo thứ tự, luật đầu tiên khớp thắng:

| Luật | Status |
|---|---|
| `signalConfidence < 35` hoặc `signalScore = null` | **Insufficient evidence** |
| Có blocker vật chất (vd. IP chưa assign, cap table phân mảnh) | **Material issue** |
| `score ≥ 70` và `confidence ≥ 60` | **Strong** |
| `score ≥ 55` | **Moderate** |
| `score ≥ 40` | **Developing** |
| Còn lại | **Watch** |

  Ngưỡng là đề xuất, được hiệu chỉnh ở IL03 trên corpus Q01 trước khi bật.
- `trend` (**R1 chỉ có trend tổng** qua `cover.svi.deltaVsLast`; **trend theo tín hiệu từ R2**, khi writer lưu `dimension_scores` của snapshot trước) = so với revision trước của **cùng company**: ↑ nếu Δ ≥ +5, ↓ nếu Δ ≤ −5, → nếu nằm giữa. Chưa có revision trước thì ghi “Báo cáo đầu tiên”, không vẽ mũi tên.
- **Narrative gap callout:** `score ≥ 70` và `confidence < 40` thì hiện “Luận điểm mạnh, bằng chứng yếu”.

### 3.3 Questions to Investigate engine (R3)

```
priority = investorImportance × evidenceGap × investmentImpact
  investorImportance: theo thứ tự tín hiệu (Team 6 … IP 1; ESG 1 khi trọng yếu)
  evidenceGap       : 1 − claimConfidence (missing = 1.0; contradiction = 1.0 + ưu tiên tuyệt đối)
  investmentImpact  : trọng số dimension × độ lệch vs p50 (khi có n ≥ 10) hoặc severity của risk liên quan
```

- **Nguồn câu hỏi:** 52 `guidingQuestions` + trạng thái evidence (`evidenced/partial/missing/stale`) + `claims.contradiction_status`/`assessment_status`. Q01–Q16 **không phải phụ thuộc**; khi G30 đưa vào code thì chỉ là nguồn bổ sung, claim confidence thấp, dữ liệu Stale, concentration, key-person, blockers liquidity/cap table/IP, rủi ro pháp lý.
- **Hiển thị:** Snapshot 3 câu, section 13 hiện 3–7 câu. Mỗi câu kèm “vì sao hỏi” (claim/khoảng trống cụ thể), tín hiệu liên quan và nút “Yêu cầu bằng chứng”. Nút này dùng luồng request/correction hiện có, **không tự gửi cho founder**.
- **Viết câu:** R3 dùng template xác định theo loại gap. Dùng LLM để viết lại cho tự nhiên là tùy chọn sau này, phải qua claim gate.

### 3.4 Risk engine (R3)

- **Trường:** `severity` (H/M/L) · `probability` (H/M/L/`Chưa xác định`) · `evidenceConfidence` · `horizon` (0–6/6–18/18+ tháng) · `controllability` (founder kiểm soát / thị trường) · `mitigation` · `linkedQuestionId`.
- **Xếp hạng:** `severity × probability`. Khi probability là `Chưa xác định`, dùng severity × M làm thứ hạng tạm và gắn chip `Chưa kiểm chứng`. Mặt trước tối đa 3 mục, section 12 tối đa 5.
- **Thay G27 §4.4:** bỏ luật `missing → high likelihood`.

### 3.5 Path to Liquidity (R5)

- **Taxonomy route:** strategic acquisition · PE acquisition/roll-up · secondary · founder/management buyback · dividend model · IPO.
- **Tính khả thi mỗi route** = điều kiện xác định: recurring revenue, quy mô, sector consolidation (khi có nguồn), cấu trúc sở hữu. Ví dụ: IPO ở pre-seed thì “Không khả thi ở giai đoạn này”.
- **Buyer classes:** suy từ adjacency sản phẩm/khách hàng/công nghệ/phân phối/data. Nhãn class (“nhà cung cấp phần mềm doanh nghiệp AU”) luôn được hiển thị; **tên công ty chỉ hiện khi có nguồn research**.
- **Comparable exits:** R5 lấy từ `lib/exits/au-benchmark.ts` (đã có URL deal công khai, S13); mở rộng qua research store G30 R01/R02 sau. Mọi comp phải có ngày, nguồn và giai đoạn. Không có thì ghi “Chưa có giao dịch so sánh có nguồn”.
- **Blockers:** tự động từ IP assignment, key-person, cap table phân mảnh, concentration, recurring revenue thấp, governance, regulatory.
- **Đầu ra:** status + tối đa 3 route xếp hạng + blockers + confidence. **Không có con số A$.**

### 3.6 Cap Table Quality (R4)

- **Nguồn:** BlockID cap table (`lib/cap-table.ts`) › XLSX/CSV upload (G30 E1) › SHA/tài liệu › founder declared.
- **Tính toán:** founder ownership hiện tại; pro-forma sau vòng tới bằng `calculateRound` (SAFE cap/discount, note, priced) với **giả định hiển thị rõ**; ESOP pool; top-holder concentration; dead equity (holder không active, được đánh dấu bởi founder hoặc tài liệu); SAFE stack; vesting có/không; SHA có/không.
- **Cờ đỏ xác định**, ví dụ:
  - founder <50% trước Series A;
  - dead equity >5%;
  - SAFE conversion >20%;
  - không có vesting;
  - không có SHA.

  Ngưỡng hiệu chỉnh ở IL03 và ghi rõ trong methodology.

### 3.7 Evidence freshness (R2)

Mở rộng `lib/evidence/freshness.ts` và **giữ một module duy nhất**:

| Bậc | Điều kiện |
|---|---|
| Live | Connector sync <7 ngày |
| Current | <30 ngày |
| Aging | 30–90 ngày |
| Stale | >90 ngày |
| Unknown | Không có ngày quan sát |

Áp cho claim có `observed_at`, không chỉ connector. Bắt buộc hiển thị cho revenue, customer count, user metrics, pipeline, cap table, cash runway và headcount.

### 3.8 Provenance và governance

- **Masthead + appendix hiển thị:** Report ID · Company ID · Methodology (`SVI_VERSION`) · Engine (`PIPELINE_VERSION`) · Snapshot time · Data sources · Evidence count · Connector freshness · Evaluator overrides · Audit ref (hash `audit_events`).
- **Evaluator:** reviewer, comment, decision, override reason, ngày (đã có 0392/0423). Thêm cờ **“Bằng chứng đã thay đổi sau quyết định”**, so `decided_at` với `observed_at` mới nhất của claim liên quan.

---

## 4. Data model và API

### 4.1 ReportV2 (không migration ở R1–R2)

Thêm field **optional** vào `lib/report-v2/schema.ts`. Theo đúng pattern G27, field được tính khi đọc bằng `ensureInvestorLens()` sau `alignReportWithAssessmentCard`:

```ts
investorLens?: {
  version: "lens-1";
  meetingLabel: "strong_case" | "worth_investigating" | "major_issues" | "evidence_incomplete"; // = band A–D
  signals: InvestorSignal[];          // 6 (+esg khi trọng yếu)
  strengths: LensItem[];              // ≤3
  watchItems: LensItem[];             // ≤3
  questions: InvestorQuestion[];      // ≤7 (snapshot lấy 3)
  risks?: RiskRow[];                  // R3
  liquidity?: LiquidityView;          // R5
  capTable?: CapTableView;            // R4
  evidenceSummary: { byLevel: Record<EvidenceLevel, number>; freshness: Record<FreshnessBand, number>; overall: number };
  founderGaps: EvidenceGap[];         // ≤3
  provenance: ReportProvenance;
}
InvestorSignal = { type; score: number|null; evidenceConfidence: number; status; trend; freshness;
  primaryDimension; secondaryDimensions; claimIds: string[]; keyEvidence: string; narrativeGap: boolean }
```

Khi finalization boundary (G30 F02) sẵn sàng, `investorLens` được **đóng băng trong revision**. Report cũ vẫn tính khi đọc, cùng nguyên tắc như `investmentView`.

### 4.2 Bảng mới (chỉ khi cần)

| Release | Bảng | Lý do |
|---|---|---|
| R3 | **Không tạo bảng.** Câu hỏi được evaluator chọn ghi vào `evaluation_assessments.questions_for_founder` (0392, đã có org_id/shared_fields) và gửi founder qua `api/evaluations/[id]/assessment/share` | Tái dùng luồng có quyền và org sẵn |
| R6 (migration số ≥0450, số chốt khi merge vì 0443–0449 đã có trên nhánh khác) | `report_investor_signals` (projection: report_revision_id, company_id, signal_type, score, evidence_confidence, status, trend, generated_at) | Lọc/sắp cohort bằng SQL. Có thể tái tạo từ revision, không phải nguồn sự thật |

- Không tạo `claim_evidence` (dùng 0417 + E01) và không tạo `liquidity_routes` (nằm trong revision JSON).
- Migration áp theo runbook `docker exec psql` + `NOTIFY pgrst`. Có RLS theo org; không auto-apply khi deploy.

### 4.3 API

| Endpoint | Ghi chú |
|---|---|
| `GET /api/reports/{id}/investor-view` | Bundle `investorLens` + masthead; quyền giống report; cache theo revision |
| `GET /api/v1/institutional/companies/{projectId}` | Thêm `investorLens.signals` + `evidenceSummary` |
| `GET /api/v1/institutional/cohorts/{id}` | Thêm cột tín hiệu; `?signal=traction:strong&confidence_gte=60` |
| `GET /api/evaluations/batch/{id}/export.csv` | Thêm 6 × (status, score, confidence) |
| `api/evaluations/[id]/assessment` + `/share` (đã có) | Thêm câu hỏi của Lens vào `questions_for_founder` (R3); không tạo route mới |

Tài liệu API: `docs/api/institutional.md` + in-app API docs (G22).

---

## 5. Cấu trúc báo cáo mới (16 mục)

Web mặc định mở **Investor view** (mục 01–02 + triptych). Các mục còn lại nằm sau rail/tab và mở tại chỗ (G30 B4). PDF “Brief” = 01, 02, 03, 12, 13. PDF “Full” = 01–16.

| # | Mục | Nội dung | Nguồn | Thay đổi so với v3 hiện tại |
|---|---|---|---|---|
| 01 | **Investor Snapshot** | 4 chỉ số · meeting label · 3 lý do nên xem · 3 điều có thể chặn deal · 3 câu hỏi | `investorLens` + valuation + cover | Thay Dashboard + Investment view + Key points (gộp 3 thành 1) |
| 02 | **Investor Priority Matrix** | 6 hàng: status · score · confidence · freshness · trend · bằng chứng chính | `signals` | **Mới** — visual đặc trưng BlockID |
| 03 | **Evidence & Confidence** | Thang 6 bậc, phân bố claim theo bậc/freshness, claim ít tin cậy nhất | `evidenceSummary` | **Mới** (trước đây chỉ ở appendix) |
| 04 | **Business Overview** | Vấn đề · khách hàng · sản phẩm · mô hình | executive + criteria `idea`/`market` | Tách khỏi executive |
| 05 | **Team** | Track record, độ đầy đủ đội, key-person | signal chapter | Mới dạng signal chapter |
| 06 | **Traction** | Revenue, khách hàng, tăng trưởng, retention, pipeline, concentration | signal chapter | Mới |
| 07 | **Market** (+ ESG khi trọng yếu) | Quy mô, cạnh tranh 3–5 (G30 R04), timing | MPC chapter | Giữ |
| 08 | **Moat & IP** | 5 sub-signal moat + IP depth, **score ≠ confidence** | 2 tín hiệu | Mới |
| 09 | **Path to Liquidity** | Routes · buyer classes · comps có nguồn · blockers | `liquidity` | **Mới** (R5; trước đó hiện “Đang xây dựng”) |
| 10 | **Capital & Governance** | Cap table quality, dilution pro-forma, governance checklist | `capTable` + CGH | Mới (R4) |
| 11 | **Valuation** | Range, base, phương pháp dùng/không dùng + lý do, input mạnh/yếu, sensitivity | valuation | Chuyển từ #4 xuống. Tóm tắt vẫn ở 01 |
| 12 | **Key Risks** | Top 5, matrix severity × probability | `risks` | Thay risk matrix G27 |
| 13 | **Questions to Investigate** | 3–7 câu, lý do, trạng thái | `questions` | **Mới** |
| 14 | **SVI Detail** | 8 dimensions theo anatomy G27 §3 (mặc định đóng) | dimensions | Chuyển từ #5–12 |
| 15 | **90-Day Plan** (+ Money on the table) | Plan + top 3 evidence gaps cho founder | actionPlan + `founderGaps` | Giữ, thêm founder gaps |
| 16 | **Evidence Register & Audit** | Claims, nguồn, ngày, trạng thái, provenance, methodology, disclaimer | appendix | Mở rộng provenance |

**Free vs paid:** giữ nguyên entitlement (D08, G25: 2 báo cáo đầu miễn phí là bản đầy đủ). Ở free tier sau grant, **01–03 luôn đầy đủ**. Lý do: đây là lời hứa niềm tin cốt lõi, và việc khóa confidence chỉ để bán hàng trái nguyên tắc. Các chương 04–16 theo luật trim hiện có của `free-tier.ts`.

---

## 6. UI/UX — tóm tắt (chi tiết ở design spec)

- **Research note, không phải landing page.** Masthead gồm công ty · sector · stage · jurisdiction · snapshot date · methodology · report ID.
- **Phân cấp thị giác:** định giá (48 px mono) → meeting label (chip lớn) → 6 hàng matrix → triptych. Mật độ mặt trước bị khóa cứng ở 4/6/3/3/3.
- **Hai mã hoá khác nhau cho điểm và tin cậy.** Score là **thanh đặc màu navy** 0–100. Confidence là **thước 6 nấc** màu cyan có nhãn bậc (“Connected source · 75%”). Mắt không thể nhầm hai đại lượng.
- **Trạng thái 6 mức**, mỗi mức = icon + chữ + màu token:

| Status | Màu token |
|---|---|
| Strong | bull |
| Moderate | cyan |
| Developing | cyan outline |
| Watch | warn |
| Material issue | bear |
| Insufficient evidence | xám, viền đứt |

- **Radar thành chi tiết phụ.** Chart chính là bar ngang của G27. Mọi chart có bảng thay thế.
- **Mobile 375:** matrix chuyển thành thẻ xếp dọc. Rủi ro đứng trước điểm mạnh. Rail chuyển thành tab ngang cuộn được.
- **Nguyên tắc:** không thêm palette/font; dùng token light template và primitives có sẵn; tuân `light-template-guard`.

---

## 7. Phương án implementing và deploy live sau mỗi phase

### 7.0 Nguyên tắc chung

1. **Một phase = một lát dọc chạy được = một lần deploy live.** Không gom nhiều phase vào một release. Phase lớn tách thành a/b và mỗi phần deploy riêng.
2. **Thứ tự rủi ro thấp trước:** R0 không đổi giao diện; R1–R3 không migration và không LLM. Migration đầu tiên chỉ có ở R6. Không phase nào thêm chi phí inference.
3. **Additive và tương thích ngược:** mọi field mới trong ReportV2 là optional. Reader chịu được report cũ. Anchor id cũ được giữ. CSV/API v1 chỉ thêm cột/trường ở cuối.
4. **Không sửa file đang chia vai với Codex** (`business-report-client.tsx`, `full-report-panel.tsx`, `analyze-results.tsx`, `smart-intake.tsx`). Lens gắn bên trong `TbrReportV2` (S2). Nếu buộc phải sửa, báo trước và làm một bên tại một thời điểm.
5. **SVI bất biến:** golden R0 phải xanh ở mọi phase. Hỏng golden là dừng deploy.
6. **Commit + push ngay sau mỗi bước** (tránh vòng `git reset --hard` nền). Deploy luôn serialize với phiên khác.

### 7.1 Quy trình deploy chuẩn cho mỗi phase (áp dụng R0–R7)

| Bước | Việc | Lệnh / bằng chứng |
|---|---|---|
| D0 Chuẩn bị | Kiểm lock deploy và phiên song song. Nếu phiên khác đang deploy/QA thì **chờ xong hẳn**. `git pull --rebase`; tree sạch với file của phase | `flock -n /tmp/blockid-deploy.lock true`; `tail -1 web/content/reports/deploy-log.jsonl`; `git status --short` |
| D1 Migration (chỉ R6) | Áp migration additive **trước** code; reader cũ không đọc bảng mới nên an toàn | `docker exec -i supabase-db psql -U postgres -c "$(cat web/supabase/migrations/04xx_….sql)"` → `NOTIFY pgrst, 'reload schema'`; ghi migration ledger |
| D2 Build gate (bắt buộc) | Typecheck + production build. Thêm test tập trung của phase; bộ test lớn theo chỉ đạo hiện hành | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`; `npm run build`; `npx vitest run <file của phase>` |
| D3 Deploy | Chỉ đạo founder 23/09 (“implement xong là deploy”) dùng **fast profile**. Khi chỉ đạo được gỡ thì chạy full 12 gates | `cd web && G30_NO_NOTIFICATIONS=1 G30_DEFER_UNIT_TESTS=1 G30_DEFER_EXTENDED_REVIEW=1 G30_DEFER_CANDIDATE_TESTS=1 DEPLOY_NOTE="G31 Rn …" bash scripts/deploy-live.sh --quick` |
| D4 Xác minh bản live | Candidate trên cổng 4100–4199 và nginx đã chuyển. SHA live = HEAD | `curl -s https://blockid.au/api/status` → `git_sha` == `git rev-parse HEAD`; kiểm `g30-serving-state.json` |
| D5 Review sau deploy | Checklist live riêng của phase (§7.3). Chụp 375/1440 bằng Playwright trên origin nội bộ của candidate | Receipt `docs/reviews/2026-09-xx-g31-rN-live.md` |
| D6 Sửa hoặc rollback | Lỗi nhỏ → fix-forward bằng một deploy mới. Lỗi dữ liệu hoặc hiển thị sai kết luận → **warm rollback** ngay, sửa rồi deploy lại | `python3 scripts/g30-serving-state.py …` (warm rollback, theo runbook) hoặc `bash scripts/deploy-live.sh --rollback --dry-run` → `--rollback` |
| D7 Mark-good | Hết soak → mark-good dưới deployment lock; giữ bản trước ở trạng thái warm | Theo `docs/ops/deploy.md` §G30 retained-origin |
| D8 Ghi nhận | SOT §12.9 (status IL + SHA + receipt), change log §17, cập nhật tick trong plan này | Commit + push ngay |

**Nguyên tắc rollback theo phase:** R0–R5 chỉ đổi code và field optional, nên rollback code là đủ. R6 rollback code để bảng projection nằm lại (additive, không ai đọc), không drop bảng. Flag `BLOCKID_INVESTOR_LENS=off` là cách tắt không cần sửa code; đổi env nghĩa là tạo candidate mới, nên warm rollback vẫn là đường nhanh nhất.

### 7.2 Chi tiết từng phase

#### R0 — Nền an toàn (IL15) · ~1 ngày · deploy: có, không đổi giao diện

| Hạng mục | Chi tiết |
|---|---|
| Mục tiêu | Có lưới an toàn trước khi chạm report: golden SVI, guard wording, cờ Lens |
| File mới | `lib/report-v2/svi-invariance.golden.test.ts`: snapshot `compositeScore`, `cover.svi.total`, 8 dimension scores, band, `verdictBand` cho mọi fixture (`demoReportV2`, `freeFixtureReportV2`, `preRevenueFixtureReportV2`, `citedDemoReportV2`, `investmentBandFixture(A–D)`) + 1 bản JSON showcase đã làm sạch · `lib/report-v2/investor-lens-flag.ts` (`investorLensMode(): "off"\|"preview"\|"on"`, mặc định `off`) |
| File sửa | `lib/marketing/messaging.test.ts`: mở reach tới `components/tbr/**`, `lib/report-v2/**`; thêm regex benchmark thiếu `n`, nhãn nội bộ |
| Deploy | D0–D8, với `BLOCKID_INVESTOR_LENS=off` |
| Kiểm live | `/tbr/demo`, `/showcase/blockid/report`, 1 `/tbr/<token>`: render **giống hệt** trước (so ảnh chụp); PDF tải được |
| Exit | Golden xanh; guard xanh (lỗi guard phát hiện được ghi và sửa trong R1) |

#### R1 — Investor Snapshot + Priority Matrix + Evidence (IL01, IL04, IL05) · ~4–5 ngày · 2 deploy (R1a preview → R1b on)

| Hạng mục | Chi tiết |
|---|---|
| Schema | `lib/report-v2/schema.ts`: `investorLens?: InvestorLens` (Zod `.optional()`), types `InvestorSignal`, `LensItem`, `EvidenceSummary`, `ReportProvenance` |
| Logic thuần | **Mới** `lib/report-v2/investor-lens.ts`: `SIGNAL_SOURCES` (6 tín hiệu → `CriterionKey[]` + dim chính/phụ, dựa trên `CRITERION_KEYS` và `DIMENSION_OWNERS`); `signalScore` (trung bình có trọng số các criterion đã đánh giá; `isAssessed`); `signalConfidence` (join `criteria[].citations.evidence_id` → `chapter.evidence[].confidence`, fallback theo `dims`, cap theo freshness hiện có); `signalStatus` (luật §3.2); strengths/watch **tái dùng** `investmentView.reasons/risks` (tiêu đề và bằng chứng cùng object, sửa lỗi ghép G30 D5); 3 câu hỏi = `cover.threeQuestions` + 2 gap lớn nhất; `evidenceSummary` theo 6 bậc; `provenance` (`reportId`, `snapshotId`, `pipelineVersion`, `SVI_VERSION`, evidence count, `generatedAt`); `investorLensFor(report, card)` |
| Chuỗi | `lib/i18n/tbr-v3-strings.ts`: `bandLabel`/`bandWording` EN :195–201 và VI :344–350 → meeting labels (**D21-a**). Thêm khoá `lens.*` EN/VI (parity test `tbr-strings.test.ts:100`) |
| Component | **Mới** `components/tbr/v2/lens/`: `lens-masthead`, `metric-tiles`, `meeting-label`, `priority-matrix`, `score-bar`, `confidence-meter`, `status-chip`, `freshness-badge`, `lens-triptych`, `signal-drawer`, `evidence-ladder` (spec §3) |
| Tích hợp | `report.tsx:130–156`: khi mode ≠ off (và với `preview` chỉ trên fixture/showcase), render 01 Snapshot + 02 Priorities + 03 Evidence **thay** Dashboard/InvestmentView/KeyPoints; các chương giữ nguyên thứ tự. `shared.tsx:77`: thêm `tbr-snapshot`, `tbr-priorities`, `tbr-evidence`; `tbr-dashboard`/`tbr-investment-view`/`tbr-key-points` thành anchor alias. `tbrV2Toc`/`tbrV2TocGroups` cập nhật |
| Tier | `free-tier.ts`: không cắt lens (**D21-c**); `page-estimate.ts`: thêm 3 section |
| Export | `tbr-pdf.tsx:1622+`: trang 1 = masthead + tiles + meeting + matrix; trang 2 = triptych + evidence ladder. `tbr-docx.ts:940+`: tiles 2×2, matrix có header lặp, ký hiệu chữ thay icon. `email-report.ts:123+`: meeting label + 3/3/3 + link |
| Test tập trung | `investor-lens.test.ts` (công thức, ngưỡng, insufficient <35%, narrative gap, không có score thiếu confidence); cập nhật 5 test chứa “Investable”; `report.test.tsx` (thứ tự + alias); `tbr-pdf.test.tsx`, `tbr-docx.test.ts`, `email-report.test.ts` (parity field) |
| R1a deploy | `BLOCKID_INVESTOR_LENS=preview`: chỉ `/tbr/demo/band/[A–D]`, `/showcase/blockid/report`, `/sample-business-report` |
| Kiểm live R1a | 4 band demo + showcase ở 375/768/1440; drawer mở/đóng, Esc, focus; PDF và DOCX từ showcase; không lộ nhãn nội bộ; so ảnh trước/sau |
| R1b deploy | `on` cho mọi report sau khi R1a đạt; deploy riêng |
| Kiểm live R1b | 1 report `/analyze/<id>` đã xong, 1 `/tbr/<token>`, 1 order `ReportOrderView`, 1 report free-tier bị trim; link e-mail cũ `#tbr-dashboard` vẫn đúng chỗ; e-mail tóm tắt (dựng bằng `reportEmailContext` với report thật) |
| Exit | G31-3, G31-4 xanh; checklist design spec §9 cho 01–03; không mâu thuẫn số giữa tile và matrix |

#### R2 — Signal chapters + freshness + trend theo tín hiệu (IL02, IL06, IL07) · ~4–5 ngày · 1 deploy

| Hạng mục | Chi tiết |
|---|---|
| Freshness | `lib/evidence/freshness.ts`: thêm `freshnessBand(ageDays, source)` 5 bậc Live<7/Current<30/Aging≤90/Stale/Unknown; giữ API cũ `freshnessState` cho connector UI |
| Writer (report mới) | `EvidenceRow.criterion?: CriterionKey` (optional) set ở bước gather; `cover.previousDimensionScores?` lưu tại `run-for-project.ts:1114–1121` và `pitchdeck/save-snapshot/route.ts:140–153` (cùng truy vấn snapshot trước) |
| Overlay | **Mới** `lib/report-v2/lens-overlays.ts`: câu hỏi MT1–3, TR1–2, IP1–3 có ID; trả lời xác định từ dữ liệu có sẵn (connector, evidence, criterion) hoặc `missing`; không LLM |
| UI | Signal chapters 05 Team · 06 Traction · 08 Moat & IP (`MoatBreakdown`, `ClaimRow`, `NarrativeGapCallout`) chèn trước các chương dimension; 8 chương dimension gom vào nhóm “14 SVI detail” (web mặc định đóng, PDF Full vẫn in đủ) |
| Phụ thuộc G30 | Dùng `EvidenceRow` + citations hiện có. Khi E01 claim ID vào code thì đổi nguồn trong **một** adapter, không đổi UI |
| Kiểm live | Showcase: chip freshness khớp ngày connector; claim `self_declared` có chip “Founder stated”; report cũ không có `previousDimensionScores` ghi “Báo cáo đầu tiên”; report mới chạy lại hiện ↑/→/↓ đúng |
| Exit | Mọi claim trọng yếu trong 05/06/08 có source/level/freshness; golden SVI xanh |

#### R3 — Questions engine + Risk engine + evaluator questions (IL08, IL09) · ~3–4 ngày · 1 deploy

| Hạng mục | Chi tiết |
|---|---|
| Questions | **Mới** `lib/report-v2/lens-questions.ts`: nguồn là 52 `guidingQuestions` + `EvidenceStatus` + `claims.contradiction_status` + overlay gaps; `priority = importance × gap × impact`; conflict luôn lên đầu; template EN/VI xác định; top 3 (snapshot) / 3–7 (mục 13) |
| Risk | `investment-view.ts:164` `dimLikelihood` → `riskProbability` (có bằng chứng thì H/M/L; không có thì `unknown`); sort theo severity × probability, `unknown` xếp như M + chip “Chưa kiểm chứng” (**D21-b**); `RISK_LEVELS_*` :484; `projectInvestmentView` + `risk-matrix.tsx` + PDF/DOCX thêm cột “Chưa xác định” |
| Evaluator | Dossier (`lib/evaluations/dossier.ts` + trang `[evaluationId]`): nút “Thêm vào câu hỏi cho founder” ghi `evaluation_assessments.questions_for_founder`, gửi bằng route `assessment/share` có sẵn; badge “Bằng chứng đã đổi sau quyết định” (`submitted_at` so với `evidence_records.observed_at` mới nhất) |
| Kiểm live | Band D demo: rủi ro nặng thiếu bằng chứng vẫn nằm top 3; dossier: thêm câu hỏi, share, founder nhìn thấy; không có route mới |
| Exit | G31-5 (kiểm nội bộ trên fixtures); test “risk ít bằng chứng không tụt hạng” xanh |

#### R4 — Cap Table Quality (IL10) · ~3–4 ngày · 1 deploy (+ R4b khi G30 E1 có XLSX)

| Hạng mục | Chi tiết |
|---|---|
| Writer | Trong `run-for-project.ts` (ngữ cảnh owner): `loadCapTable(ownerId, projectId)` → **Mới** `lib/report-v2/lens-cap-table.ts` tính founder %, pool %, số SAFE/note, top-holder %, pro-forma bằng `calculateRound` (`lib/fundraise.ts:67`) với giả định vòng tới từ `suggestRoundSize`; lưu `capTableSummary?` (**chỉ số tổng hợp, không tên người**) vào report |
| Quy tắc | Không có dữ liệu → `Insufficient evidence` + CTA “Tải cap table / mở Cap Table”; cờ đỏ theo §3.6 (ngưỡng hiệu chỉnh IL03); governance checklist từ evidence `documents`/`dataroom`/`team_structure` |
| UI | Mục 10: `CapTableBar` (hiện tại / sau vòng tới) + bảng + giả định + `GovernanceChecklist`; hàng Cap Table trong matrix có dữ liệu thật |
| Quyền riêng tư | Báo cáo share/evaluator chỉ thấy tổng hợp. Test: payload report không chứa `shareholders.name` |
| Kiểm live | Project có cap table demo (`demoCapTable`) và project không có cap table; PDF mục 10 |
| R4b | Import XLSX/CSV cap table → sau G30 E1 (intake đa file), dùng cùng `lens-cap-table.ts` |

#### R5 — Path to Liquidity (IL11) · ~3–4 ngày · 1 deploy

| Hạng mục | Chi tiết |
|---|---|
| Logic | **Mới** `lib/report-v2/lens-liquidity.ts`: 6 route + luật khả thi xác định (stage, recurring revenue, quy mô, cấu trúc sở hữu); buyer **class** từ `suggestAcquirers` (`exit-strategy.helpers.ts:333`, chỉ lấy class); comps từ `getAuComparableExits` (`lib/exits/au-benchmark.ts`), in kèm ngày + URL; blockers suy từ tín hiệu (IP, key-person, cap table, concentration, recurring, governance) |
| Ràng buộc | Không in A$ exit; không tái dùng `exit_scenarios` của founder; comps quá 5 năm ghi rõ tuổi; không LLM, không research call (budget US$0.50 không đổi) |
| UI | Mục 09: `LiquidityRoutes` (≤3) + blockers + banner “không phải dự báo” |
| Kiểm live | Showcase + band A/D: route IPO ở pre-seed = “Không khả thi ở giai đoạn này”; comps có link mở được; guard “không có A$ trong mục 09” xanh |
| Mở rộng sau | Comps ngoài AU và tên buyer cụ thể khi G30 R01/R02 có source store |

#### R6 — Cohort Investor Lens + API (IL12) · ~4–5 ngày · 2 deploy (R6a data → R6b UI)

| Hạng mục | Chi tiết |
|---|---|
| Migration | `04xx_report_investor_signals.sql` (số ≥0450, chốt khi merge): projection theo revision + `org_id`, RLS giống `evaluation_batch_items`; index `(company_id, signal_type)` |
| R6a data | Writer upsert projection khi report hoàn tất (run-for-project + batch scoring); **Mới** `web/scripts/backfill-investor-signals.mjs` (idempotent, giới hạn lô, dry-run trước); API additive `investor_lens` trong `PublicCohortItemV1`/`PublicCompanyV1` (`lib/api-v1/institutional-data.ts`) |
| R6a deploy | D1 migration → D3 deploy → chạy backfill dry-run → chạy thật → kiểm số dòng = số report |
| R6b UI | `CohortRow` thêm `lens`; `COHORT_COLUMNS` (`cohort-view-state.ts:10–26`) thêm 6 cột chip (mặc định hiện Team/Traction/Moat, còn lại tùy chọn); `CohortFilters` + `parseCohortFilters` thêm `team, moat, liq, cap, ip, evconf, incomplete, improved`; CSV thêm cột **ở cuối** `BLOCKID_COHORT_CSV_HEADERS`; docs `docs/api/institutional.md` |
| Kiểm live | Demo cohort: lọc “Strong traction + evidence ≥60”; CSV mở được trong Excel và cột cũ không đổi vị trí; API v1 cũ không vỡ (so response trước/sau); `qa:live` sau deploy workspace |
| Exit | G31-7 |

#### R7 — Report vNext + kiểm chứng (IL13, IL14, IL00) · ~5 ngày + lịch phỏng vấn · 2 deploy

| Hạng mục | Chi tiết |
|---|---|
| Cấu trúc | Hoàn tất thứ tự 16 mục (§5): 04 Business, 07 Market, 11 Valuation (dời xuống; tóm tắt vẫn ở 01), 12 Risks, 13 Questions, 15 Plan (+ founder gaps), 16 Register + provenance đầy đủ |
| Export | PDF `?variant=brief\|full` trên `api/svi/report/pdf`; DOCX cùng thứ tự; e-mail theo lens |
| Nội dung | Tái tạo showcase/sample; trang methodology (6 tín hiệu, thang evidence, ngưỡng, “never trust a score without evidence”); docs API |
| Đo lường | Biến thể A/B **chỉ trên `/tbr/demo`** bằng cookie bucket + funnel events G16 (`/admin/funnel`): time-to-first-click, evidence/question click-through |
| Usability | 20 người (§9); báo cáo trong `docs/research/g31-investor-lens-usability.md`; IL00 xác minh nguồn slide |
| Deploy | R7a cấu trúc + export; R7b nội dung + A/B |
| Exit | G31-1, G31-5, G31-8; DoD §2.3 |

### 7.3 Lịch tổng và điểm quyết định

| Tuần | Phase | Deploy | Điểm dừng / quyết định |
|---|---|---|---|
| 1 | R0 → R1a → R1b | 3 | Sau R1a: founder xem 4 band demo; duyệt nhãn meeting (D21-a) trước R1b |
| 2 | R2 → R3 | 2 | Sau R3: duyệt risk rank (D21-b) trên demo |
| 3 | R4 → R5 | 2 | Ngưỡng cờ đỏ cap table/route khả thi (D21-e) chốt từ IL03 |
| 4 | R6a → R6b | 2 | Kiểm backfill + API v1 tương thích |
| 5–6 | R7a → R7b + usability | 2 | Kết quả 20 người → sửa → đóng G31 |

Tổng cộng 11 lần deploy, mỗi lần đi qua D0–D8. Lịch này là **ước lượng theo phụ thuộc, không phải cam kết ngày**. Deploy của phiên khác được ưu tiên theo luật serialize.

### 7.4 Work items (đăng ký vào SOT §12)

| ID | Phase | P | Việc | Phụ thuộc | Nghiệm thu |
|---|---|---|---|---|---|
| IL15 | R0 | P1 | Golden SVI + guard reach `components/tbr` + cờ `BLOCKID_INVESTOR_LENS` | — | Golden/guard xanh; live không đổi |
| IL01 | R1 | P1 | Schema `investorLens` optional + `investor-lens.ts` + `investorLensFor` tại 4 bề mặt | IL15 | Test công thức; web/PDF/DOCX/email cùng trường |
| IL04 | R1 | P1 | UI 01–03 + PDF/DOCX/e-mail | IL01 | Design spec §9 |
| IL05 | R1 | P1 | Meeting labels EN/VI (D21-a) | IL15 | Không còn “Investable now” (guard) |
| IL02 | R2 | P1 | Overlays MT/TR/IP (LQ/CT ở R4–R5) | IL01 | Bảng map có version |
| IL06 | R2 | P1 | `freshnessBand` 5 bậc + áp cho claim | — | Test ranh giới 7/30/90 |
| IL07 | R2 | P1 | Signal chapters 05/06/08, `criterion?`, `previousDimensionScores?` | IL02 | Claim có source/level/freshness |
| IL08 | R3 | P1 | Questions engine + evaluator `questions_for_founder` | IL07 | Top 3–7 xác định; không có route/bảng mới |
| IL09 | R3 | P1 | Risk probability `unknown`, rank không phạt thiếu evidence (D21-b) | IL01 | Test không tụt hạng |
| IL03 | R3–R5 | P1 | Hiệu chỉnh ngưỡng status/cờ đỏ/route trên fixtures + corpus Q01 khi có | IL01 | Ngưỡng trong methodology |
| IL10 | R4 | P1 | Cap Table Quality (tổng hợp, không tên) + R4b XLSX sau G30 E1 | IL01 | Thiếu dữ liệu → Insufficient |
| IL11 | R5 | P1 | Liquidity từ `suggestAcquirers` + `au-benchmark.ts` | IL01 | Không A$; comps có URL/ngày |
| IL12 | R6 | P1 | Projection ≥0450 + backfill + cohort UI/CSV/API additive | IL01–IL11 | Filters đúng; v1 không vỡ |
| IL13 | R7 | P1 | 16 mục, PDF brief/full, showcase/sample, methodology/API docs | IL01–IL12 | Web = PDF = DOCX = e-mail |
| IL14 | R7 | P1 | Usability 20 người + A/B `/tbr/demo` | IL13 | KPI G31-1/5 |
| IL00 | R7 | P2 | Xác minh nguồn slide investor-priority | — | Ghi nguồn hoặc “chưa xác minh” |

---

## 8. Chất lượng, test và gate

- **Unit (thuần):** công thức signal/confidence/status, ranh giới freshness, questions priority, risk rank, cap table red flags, liquidity feasibility.
- **Golden:** SVI bất biến (G31-4); fixtures band A–D; showcase `136a49f5` làm regression mâu thuẫn score/confidence.
- **Guard:**
  - Không render score tín hiệu khi thiếu confidence.
  - Không có chuỗi “Invest now/Investable now”.
  - Không có benchmark khi thiếu `n`.
  - Không có số A$ trong liquidity.
  - Không lộ nhãn nội bộ.
- **Parity:** web/PDF/DOCX/email cùng trường lens.
- **UI:** visual review 375/768/1440, keyboard, reduced motion, print. Tuân theo chỉ đạo test/deploy hiện hành của founder tại thời điểm thực hiện, và ghi rõ phần nào bị hoãn thay vì gọi là pass.
- **Profile deploy:** theo §7.1. Fast profile là chỉ đạo founder 23/09. Test/review bị hoãn được ghi `DEFERRED` trong receipt, không ghi pass. Golden SVI + typecheck + build **không bao giờ hoãn**.
- **Controlled-sale:** vẫn theo SOT §13/S03. G31 không tự mở khoá sale readiness.

## 9. Kiểm chứng với người dùng

- **Người tham gia:** 5 angel · 5 VC/associate · 5 accelerator manager · 5 founder.
- **Sáu câu hỏi sau 60 giây:**
  1. Công ty làm gì?
  2. Có đáng điều tra tiếp không?
  3. Hai điểm mạnh là gì?
  4. Hai rủi ro là gì?
  5. Claim nào bạn tin ít nhất?
  6. Bạn sẽ hỏi câu nào đầu tiên?
- **Mục tiêu:** ≥80% đồng thuận điểm mạnh và khoảng trống bằng chứng; trung vị <60 giây.
- **So sánh flag (A = SVI-first, B = Lens-first):**
  - thời gian tới kết luận;
  - evidence click-through;
  - question click-through;
  - shortlist/review actions;
  - follow-up thủ công.

  Kết quả báo cáo là định hướng khi mẫu nhỏ.
- **Lưu ý tuân thủ:** không tuyển người thử bằng coupon/pilot (G25). Dùng demo và report mẫu.

## 10. Positioning và copy

- **Cấp sản phẩm:** “Evidence infrastructure for business evaluation.” / “Hạ tầng bằng chứng cho việc đánh giá doanh nghiệp.”
- **Hero (giữ D15):** “Know the business before you invest.”
- **Trusted Business Report:** “Know what matters before you take the meeting.” / “Biết điều quan trọng trước khi vào buổi gặp.”
- **Dòng phụ:** “An evidence-backed view of the team, traction, moat, liquidity and risks behind the pitch.”
- **Luật cốt lõi, in trong methodology:** *BlockID never asks an investor to trust a score without showing what evidence earned it.*
- **Disclaimer (giữ G27 §4):** “BlockID structures the evidence; evaluators make the decision. General information, not financial product advice.”

## 11. Quyết định cần founder duyệt (D21)

| ID | Đề xuất | Mặc định nếu chưa trả lời |
|---|---|---|
| D21-a | Đổi nhãn band A–D sang meeting labels trung tính (1.3-B) | Đề xuất làm ở R1 |
| D21-b | Rank rủi ro không nhân evidence confidence (1.3-C) | Đề xuất làm ở R3 |
| D21-c | Mục 01–03 luôn đầy đủ ở mọi tier | Đề xuất; không đổi giá/quota |
| D21-d | Thứ tự R0→R7, 11 lần deploy (§7.3); R5 dùng comps AU có sẵn, không chờ research store | Đề xuất |
| D21-e | Ngưỡng status/cờ đỏ hiệu chỉnh bằng corpus trước khi bật | Bắt buộc |

Im lặng không phải là phê duyệt. Việc viết plan này **không** cấp quyền code, deploy, thay giá hay chi inference mới.
