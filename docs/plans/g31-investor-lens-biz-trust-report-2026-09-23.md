# G31 — Investor Lens: nâng cấp Trusted Business Report (Biz Trust Report)

**Trạng thái:** `PLAN ONLY — chưa code` · **Ngày:** 23/09/2026 · **Owner quyết định:** Do Van Long
**Ưu tiên:** P1. Chạy **sau hoặc song song có điều kiện** với các P0 truth item của G30 (E01/E03/A03/V01), như §7.
**Đầu vào:** `BlockID_Biz_Trust_Report_Upgrade_Plan.md` v1.0 (founder cung cấp 23/09/2026). Plan này là bản phân tích, điều chỉnh và cụ thể hoá đầu vào đó.
**Merge trong:** [`SOURCE-OF-TRUTH.md`](SOURCE-OF-TRUTH.md) §10.13, §12 (work items IL01–IL14), §16.3 (D21), §17.
**Design spec đi kèm:** [`docs/design/investor-lens-report-spec.md`](../design/investor-lens-report-spec.md).
**Kế thừa, không thay thế:** [G27 TBR v3 spec](../design/tbr-v3-investor-report-spec.md) · [G30 Investor Report Surface](g30-investor-report-surface-2026-09-23.md) · [dashboard spec `/analyze`](../design/analyze-report-dashboard-spec.md).

> **Tên goal:** G31 là tên gọi của gói nâng cấp. Các việc được đăng ký là work items IL01–IL14 trong **cùng hàng đợi §12 của SOT**. Không tạo backlog cạnh tranh; nếu mâu thuẫn, SOT thắng.

---

## 0. Tóm tắt một trang

**Mục tiêu:** Trusted Business Report trả lời theo đúng thứ tự investor quan tâm trước buổi gặp. Thứ tự đó là: đội ngũ → traction → moat → liquidity → cap table → IP. Mỗi kết luận phải có **độ tin cậy bằng chứng đi kèm** và **đường dẫn tới bằng chứng**.

**Nguyên tắc sản phẩm:** *Không thay SVI. Thêm lớp Investor Lens phía trên SVI.* Lớp này là **trình bày và suy diễn xác định (deterministic)** từ dữ liệu ReportV2 đã có. Trọng số, ledger và các con số SVI giữ nguyên tuyệt đối.

**Kết quả người dùng thấy:** màn hình đầu gồm 4 chỉ số, 6 tín hiệu investor, 3 lý do nên xem, 3 điều có thể chặn deal và 3 câu hỏi trước buổi gặp. Phần này đọc hiểu trong dưới 60 giây. Chiều sâu mở tại chỗ, không chuyển trang. Web, PDF và DOCX có cùng nội dung.

**Bản phát hành đầu tiên nên làm (IL-R1):** Investor Snapshot + Investor Priority Matrix + Evidence Confidence theo từng tín hiệu. Bản này làm thuần bằng derivation khi đọc (như G27): **không migration, không thêm lời gọi LLM, không đổi SVI**. Mọi report đã lưu đều render được ngay.

**Thứ tự phát hành:**

| Release | Nội dung chính |
|---|---|
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
| Câu hỏi trước buổi gặp | `cover.threeQuestions`; lớp 16 câu IC Q01–Q16 (G30); 52 câu canonical | **Có nguyên liệu, chưa có engine xếp hạng** |
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
- `trend` = so với revision trước của **cùng company** (`startup_score_history`): ↑ nếu Δ ≥ +5, ↓ nếu Δ ≤ −5, → nếu nằm giữa. Chưa có revision trước thì ghi “Báo cáo đầu tiên”, không vẽ mũi tên.
- **Narrative gap callout:** `score ≥ 70` và `confidence < 40` thì hiện “Luận điểm mạnh, bằng chứng yếu”.

### 3.3 Questions to Investigate engine (R3)

```
priority = investorImportance × evidenceGap × investmentImpact
  investorImportance: theo thứ tự tín hiệu (Team 6 … IP 1; ESG 1 khi trọng yếu)
  evidenceGap       : 1 − claimConfidence (missing = 1.0; contradiction = 1.0 + ưu tiên tuyệt đối)
  investmentImpact  : trọng số dimension × độ lệch vs p50 (khi có n ≥ 10) hoặc severity của risk liên quan
```

- **Nguồn câu hỏi:** câu 52 canonical + 16 IC ở trạng thái `missing/partial/conflict`, claim confidence thấp, dữ liệu Stale, concentration, key-person, blockers liquidity/cap table/IP, rủi ro pháp lý.
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
- **Comparable exits:** chỉ lấy từ research store (G30 R01/R02) và phải có ngày, nguồn và giai đoạn. Không có thì ghi “Chưa có giao dịch so sánh có nguồn”.
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
| R3 | `investor_questions` (company_id, report_revision_id, question_key, priority, impact, evidence_gap, related_signal, related_claim_ids, status open/asked/answered/dismissed, org_id) | Evaluator đánh dấu đã hỏi/đã trả lời; tách theo org, không ghi đè report |
| R6 | `report_investor_signals` (projection: report_revision_id, company_id, signal_type, score, evidence_confidence, status, trend, generated_at) | Lọc/sắp cohort bằng SQL. Có thể tái tạo từ revision, không phải nguồn sự thật |

- Không tạo `claim_evidence` (dùng 0417 + E01) và không tạo `liquidity_routes` (nằm trong revision JSON).
- Migration áp theo runbook `docker exec psql` + `NOTIFY pgrst`. Có RLS theo org; không auto-apply khi deploy.

### 4.3 API

| Endpoint | Ghi chú |
|---|---|
| `GET /api/reports/{id}/investor-view` | Bundle `investorLens` + masthead; quyền giống report; cache theo revision |
| `GET /api/v1/institutional/companies/{projectId}` | Thêm `investorLens.signals` + `evidenceSummary` |
| `GET /api/v1/institutional/cohorts/{id}` | Thêm cột tín hiệu; `?signal=traction:strong&confidence_gte=60` |
| `GET /api/evaluations/batch/{id}/export.csv` | Thêm 6 × (status, score, confidence) |
| `PATCH /api/evaluations/{id}/questions/{key}` | Trạng thái câu hỏi (R3) |

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

## 7. Lộ trình và phụ thuộc

| Release | Nội dung | Phụ thuộc G30 | Ước lượng | Deploy |
|---|---|---|---|---|
| **R1 — Investor Lens MVP** | IL01 schema optional + `buildInvestorLens()` thuần; IL04 Snapshot + Matrix + Evidence section; IL05 đổi nhãn band; strengths/watch/questions tạm từ dữ liệu hiện có; PDF/DOCX 01–03 | Không chặn (derivation trên dữ liệu hiện có). Hưởng lợi khi A03 xong | 4–6 ngày | Có — bật qua flag `investor_lens_v1`, mặc định bật cho showcase/demo trước |
| **R2 — Signal chapters + claim/freshness** | IL02 overlays MT/TR/IP; IL06 5 bậc freshness; IL07 claim rows theo tín hiệu; narrative-gap callout; chapters 05/06/08 | E01 (claim IDs), E03 (citation đúng) | 5–7 ngày | Có |
| **R3 — Questions + Risk engine** | IL08 questions engine + bảng `investor_questions`; IL09 risk rank mới; sections 12–13 | E01, A03 | 4–5 ngày | Có (migration trước, reader tương thích) |
| **R4 — Cap Table Quality** | IL10 cap table view, pro-forma dilution, governance checklist; overlays CT | G30 E1 (XLSX/CSV cap table) để có dữ liệu | 4–5 ngày | Có |
| **R5 — Path to Liquidity** | IL11 taxonomy route, buyer classes, blockers; comps có nguồn | R01/R02 research store; budget | 6–8 ngày | Có, route/blockers trước; comps khi research live |
| **R6 — Cohort Investor Lens** | IL12 projection `report_investor_signals`, cột/bộ lọc/sắp xếp, CSV, API v1 | R1–R3 | 4–5 ngày | Có |
| **R7 — Report vNext + kiểm chứng** | IL13 sample/showcase/demo band A–D, docs methodology/API, email; IL14 usability 20 người + flag test | U02, S01 | 5–7 ngày + lịch phỏng vấn | Có |

Mỗi release đi theo nhịp: **implement → build/type → deploy theo chỉ đạo deploy hiện hành → review sau deploy → sửa → release tiếp**. Deploy được serialize với phiên song song.

### 7.1 Work items (đăng ký vào SOT §12)

| ID | P | Việc | Phụ thuộc | Nghiệm thu |
|---|---|---|---|---|
| IL00 | P2 | Xác minh nguồn slide investor-priority (nguồn, n, địa lý, năm) | — | Ghi nguồn hoặc kết luận “chưa xác minh”; không in % lên report |
| IL01 | P1 | Schema `investorLens` optional + `buildInvestorLens()`/`ensureInvestorLens()` thuần + fixtures A–D | — | Unit test công thức; golden SVI bất biến (G31-4) |
| IL02 | P1 | Overlay questions MT/TR/LQ/CT/IP/ES có ID, map 13 criteria/dimensions | E01 | Bảng map có version; không thêm criterion 14 |
| IL03 | P1 | Hiệu chỉnh ngưỡng status/cờ đỏ trên corpus Q01 | IL01, Q01 | Báo cáo hiệu chỉnh; ngưỡng ghi trong methodology |
| IL04 | P1 | UI Snapshot + Priority Matrix + Evidence section, web/PDF/DOCX | IL01 | Checklist design spec §9; 375/768/1440 |
| IL05 | P1 | Nhãn meeting trung tính cho band A–D (EN/VI), bỏ “Investable now” | — | Không còn chuỗi cũ (messaging guard) |
| IL06 | P1 | Freshness 5 bậc, áp cho claim | E01 | Test ranh giới 7/30/90 |
| IL07 | P1 | Signal chapters 05/06/08 + claim rows + narrative-gap | IL02, E03 | Mọi claim trọng yếu có source/level/freshness |
| IL08 | P1 | Questions engine + `investor_questions` + request evidence | IL02, A03 | Top 3–7 xác định; trạng thái theo org |
| IL09 | P1 | Risk engine severity × probability, bỏ likelihood từ thiếu evidence | A03 | Test: risk ít bằng chứng không bị tụt hạng |
| IL10 | P1 | Cap Table Quality + dilution pro-forma + governance | G30 E1 | Thiếu dữ liệu → Insufficient evidence |
| IL11 | P1 | Path to Liquidity: routes, buyer classes, blockers, comps có nguồn | R01/R02 | Không có A$ exit; tên buyer chỉ khi có nguồn |
| IL12 | P1 | Cohort lens: projection, cột, bộ lọc, CSV, API v1 | IL01–IL09 | Lọc/sắp đúng; RLS theo org |
| IL13 | P1 | Report vNext: sample/showcase/demo, methodology + API docs, email summary theo lens | IL04–IL11, U02 | Web = PDF = DOCX = email trên cùng revision |
| IL14 | P1 | Usability 20 người + so sánh flag A/B | IL04, S01 | KPI G31-1/G31-5; báo cáo trong `docs/research/` |

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
| D21-d | Thứ tự R1→R7; R5 chờ research store | Đề xuất |
| D21-e | Ngưỡng status/cờ đỏ hiệu chỉnh bằng corpus trước khi bật | Bắt buộc |

Im lặng không phải là phê duyệt. Việc viết plan này **không** cấp quyền code, deploy, thay giá hay chi inference mới.
