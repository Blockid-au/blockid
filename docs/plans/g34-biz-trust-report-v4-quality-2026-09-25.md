# G34 — Biz Trust Report v4: chất lượng report, ghi nhận dữ liệu theo profile, lifecycle email

**Trạng thái:** `PLAN ONLY — chưa code` · **Ngày:** 25/09/2026 · **Ưu tiên:** P1. Riêng BT1/BT2 là P0 về dữ liệu và tuân thủ.

**Yêu cầu founder (25/09/2026):**
- Phân tích và tiếp nối việc của Codex.
- Nghiên cứu đối thủ và các hệ thống tương tự, cùng tiêu chí investor và unicorn dùng để screening.
- Chấm điểm cộng dồn theo phân tích của AI Agents BlockID.
- Dashboard chính gom các điểm investor muốn thấy; nhận xét chi tiết để phía sau.
- Chia tiêu chí thành module theo 8 dimension để dễ bổ sung. Mỗi phân tích có Agent phụ trách cụ thể.
- Song song: ghi nhận toàn bộ dữ liệu người dùng nhập theo đúng profile, và có cơ chế email nhắc người dùng quay lại.
- Mỗi phase deploy live.

**Merge vào:** [SOURCE-OF-TRUTH](SOURCE-OF-TRUTH.md) §10.14, §12.13, §12.9, §16.3 (D24), §17 · [ROADMAP](../../ROADMAP.md) §4.

**Không tạo backlog cạnh tranh.** G34 là bản tinh chỉnh nội dung cho G33 S4–S6 (G31 Investor Lens + G32 SVI v3/valuation), cộng thêm hai lane mới: dữ liệu người dùng (DC) và email (EM).

**Tài liệu đi kèm:**
- [Research annex](../research/2026-09-25-g34-investor-screening-research.md): đối thủ, catalogue tiêu chí có nguồn, email/pháp lý.
- [Dashboard v4 design spec](../design/tbr-v4-dashboard-spec.md).
- Đầu vào của Codex: [`2026-09-25-investor-report-upgrade.md`](../research/2026-09-25-investor-report-upgrade.md) (chưa commit lúc viết) và `web/src/lib/report-v2/investor-screening.ts` (a357a1b03).

---

## 0. Tóm tắt một trang

**Goal G34:** Một investor đọc **trang 1 trong 60 giây** biết được năm điều:
1. Doanh nghiệp đáng giá bao nhiêu, hoặc vì sao chưa ước được.
2. Mạnh và yếu ở đâu theo 8 chiều. Mỗi chiều có Agent chịu trách nhiệm.
3. Chỉ số nào đã được xác minh.
4. Có red flag nào.
5. Nên hỏi gì trước buổi gặp.

Nhận xét chi tiết nằm trong 8 chương dimension. Mỗi câu trả lời trong chương đều có trích dẫn tới trang deck, file hoặc URL cụ thể.

**Song song:**
- Mọi thứ người dùng nhập đều gắn đúng **project/profile**, không mồ côi, không bị trùng.
- Người dùng nhận **đúng email, đúng lúc, đúng pháp luật Úc**, để quay lại hoàn thiện hồ sơ và evidence.

**Bảy phase, mỗi phase một hoặc nhiều deploy live.** Sau mỗi deploy: review → test → fix, rồi mới sang phase kế (memory "deploy immediately").

| Phase | Nội dung | Phụ thuộc | Deploy |
|---|---|---|---|
| **BT0** | Quyết định D24 + **module registry 8 dimension** (dữ liệu thuần, chưa dùng khi chạy) + guard không lộ trọng số | Founder duyệt D24 | 1 deploy, không đổi hành vi |
| **BT1** | **Dữ liệu người dùng theo profile** DC01–DC10: `analyses.project_id`, claim theo email đã xác minh, chuyển project evaluator→founder, erasure | BT0 | 1–2 deploy + migration additive |
| **BT2** | **Nền email** EM01–EM09: send log chung, frequency cap, suppression bounce/complaint, consent, RFC 8058, gỡ 5 luồng chết hoặc trùng, lint T-class | Song song BT1 | 1–2 deploy |
| **BT3** | **Dashboard v4** RQ01–RQ09: 5 tiles, key metrics, scorecard 8 chiều có lead agent, red flags, why/stop/ask, trang 1 free không khoá; parity web/PDF/DOCX/email | Codex land screening UI; G31 R0 golden | 2–3 deploy (flag off → preview → on) |
| **BT4** | **Lifecycle flows** EM10–EM21: 12 luồng trên `email_drips`, trigger theo hành vi và theo gap của chính người dùng | BT1 + BT2 | Deploy từng luồng, dry-run trước |
| **BT5** | **Module chấm điểm cộng dồn** RQ10–RQ18 (= G32 SV0/SV2/SV3): rubric từ catalogue, overlay CGH/LCO/IRI, question matrix có trích dẫn, key metrics CFO/CRO; chạy shadow | G33 S1 ổn định 7 ngày | 2 deploy shadow |
| **BT6** | **Kích hoạt + tính năng rút ra từ đối thủ** RQ19–RQ28: SV4 calibration, SV5 activation, V04b valuation producer, peer percentile, stage ladder, calibration disclosure, kiểm chéo ABN/ASIC, mandate fit, triage; kiểm định 20 người dùng | BT5 + SV4 đạt ngưỡng | 2–3 deploy |

**Những gì G34 không làm:**
- Không đổi giá, credit hoặc Stripe.
- Không thêm paid AI provider ngoài DeepInfra; trần vẫn là US$0.50/report.
- Không công bố trọng số số.
- Không gửi email marketing cho người chưa đồng ý rõ ràng.
- Không sửa file Codex đang làm dở.
- Không bỏ evidence gate để hiện được số.

---

## 1. Baseline (đối chiếu source và live, 25/09/2026)

Live: `03356f9cb` (origin 4145, verified-good), gồm cả G33 tới T16k.

| Hạng mục | Hiện trạng | Nguồn |
|---|---|---|
| Trang 1 | 4 tiles (SVI · evidence · verdict · valuation) + bar 8 chiều + ledger strip | `dashboard-view.ts:73-137` |
| Investor screening (Codex) | Logic đã commit: 6 signal, `score: null`, ≤3 strengths/gaps/questions. **UI và export chưa commit**: `dashboard.tsx`, `report.tsx`, `criteria-summary.tsx`, `tbr-pdf/docx`, `email-report.ts`, `tbr-v3-strings.ts` | a357a1b03 + working tree |
| Criteria | 13 criteria / 52 guiding questions; ID ổn định trong `lib/reanalysis/scope.ts`; `SVI_SCOPE_MAP` map 16→13 | `evaluation-criteria.ts` |
| Điểm theo câu hỏi | **Chưa có.** Không có `question_scores`. `lib/svi/question-panel.ts` chưa có caller | SOT §9.4, §12.12 |
| SVI | `2.2.0` base 100. v3 C+S+T−A (D22) chưa có trong code | `svi-analysis.ts:15` |
| Valuation trên report | Luôn unavailable (`TRUSTED_REVENUE_PRODUCERS = []`). CFO scenario engine live ở chế độ scenario-only | `revenue-qualification.ts:33` |
| Chỉ số investor | Chưa có field NRR, gross margin, runway, burn multiple trong ReportV2 | `schema.ts` |
| Owner | Criterion owner ≠ dimension lead ở revenue/idea/website/roadmap. CGH và LCO không có primary criterion | `dimension-owners.ts`, `evaluation-criteria.ts` |
| Free tier | `lockCards={!paid}` có thể khoá phần lớn 6 signal và 7/13 hàng criteria trên report free hoặc public | `report.tsx:117-120` |
| Dữ liệu `/analyze` | `analyses` không có `project_id`; guest chỉ claim được qua cookie | §8 |
| Email | 6 chuỗi onboarding chồng nhau; không có cap chung; không xử lý bounce; consent marketing mặc định true | §9 |
| Ổn định report | G33 S1 acceptance còn mở. Canary gần nhất: 0–3 chương degraded, grounded 0.87–0.89 | SOT §12.11 |

---

## 2. Nguyên tắc (không thương lượng)

1. **SVI = tổng điểm agent chấm, không base, không trần (D22).** Investor Score 0–100 là đại lượng riêng. Không đổi SVI sang tiền.
2. **Verified chỉ ở T1/T2.** T3 hiển thị "company-stated", T4 hiển thị "founder-stated". Mọi số trên trang 1 kèm nguồn, ngày và tier, hoặc ghi "Not evidenced". Không nội suy.
3. **Mỗi điểm có chủ.** Mỗi item trong catalogue có một **owner agent**, 2 judge khác họ model, và quote bắt buộc. Lead agent của dimension chịu trách nhiệm tổng dimension.
4. **Một projection cho mọi bề mặt.** Web, PDF, DOCX và email đọc cùng một `dashboard-v4`. Nội dung đang khoá không lọt ra bề mặt nào.
5. **Trọng số là IP riêng.** Repo public chỉ ghi dải nhấn mạnh (High/Medium/Low) theo stage. Hằng số số nằm trong private config (D24-f).
6. **Startup sở hữu dữ liệu** (memory data-principle). Mỗi điểm thu dữ liệu có một dòng nói mục đích. Erasure phải phủ bảng mới.
7. **Email:** T-class chỉ chứa thông tin thực tế, không có bất kỳ khối quảng bá nào. C-class cần consent rõ ràng, unsubscribe một chạm và tuân theo cap.
8. **Deploy từng phase** theo luật G30: permit, retire origin cũ nhất, mark-good. Chờ peer session xong mới deploy (memory serialize). Phase chạm pipeline, billing hoặc dữ liệu áp dụng kiểm thử D23.
9. **Merge, không song song.** Mở rộng `investor-screening.ts`, không tạo `investor-lens.ts`. Dùng lại ID câu hỏi trong `scope.ts`, không tạo registry thứ hai.

---

## 3. Nghiên cứu: kết luận áp dụng

Chi tiết và nguồn ở [annex](../research/2026-09-25-g34-investor-screening-research.md).

| Phát hiện | Áp dụng vào G34 |
|---|---|
| CB Insights tách **mức trưởng thành** (Commercial Maturity 1–5) khỏi **chất lượng** (Mosaic) | Stage ladder riêng trên trang 1 (RQ20) |
| PitchBook và Tracxn dùng **percentile trong nhóm cùng stage/ngành**; PitchBook loại đặc điểm cá nhân của founder | Peer percentile khi n ≥ 10 (RQ19). Catalogue FTV **cấm** tuổi, trường và giới tính |
| Dealroom: **độ đầy đủ ≠ chất lượng**; có tín hiệu timing ~12 tháng sau vòng gọi vốn | Coverage hiển thị riêng, không cộng vào điểm. Tín hiệu "round readiness" nằm trong IRI |
| Crunchbase: độ chính xác IPO chỉ 59%, lý do bị khoá sau paywall | Công bố calibration (backtest ρ, n) và **không bao giờ khoá lý do** trên trang 1 (RQ21) |
| AlphaLens và Hebbia: **mỗi câu trả lời có trích dẫn tới slide/trang** | Cột "cited source" trong question matrix (RQ13) |
| V7 Go: điểm theo playbook quỹ → pass/fail/review + danh sách thiếu | Triage verdict cho evaluator + mandate fit (RQ25–RQ26) |
| Equidam: **trọng số phương pháp thay đổi theo stage**; hiện phương pháp không dùng và lý do | Valuation section hiện method, applicability và phần mở khoá (RQ22 = V04b) |
| Techboard (AU): phần lớn vòng gọi vốn ở Úc **không công bố**; phát hiện qua hồ sơ ASIC | Kiểm chéo ABN/ASIC (RQ23): bản free trước, trích xuất có phí là quyết định founder |
| VC memo (Sequoia/Visible): thesis 2–3 câu, bằng chứng mạnh nhất lên đầu, có risks & mitigations | Section 2 thesis một câu. Section 13 risks gồm cả mitigation |
| Benchmark 2025 (High Alpha, SaaS Capital, CTV AU) thấp hơn nhiều so với thời 2021 | Benchmark theo **dải percentile + năm nguồn**, không dùng ngưỡng cứng. Mỗi con số benchmark có nguồn và ngày |
| Spam Act: một khối quảng bá biến email giao dịch thành CEM (Lululemon bị phạt A$702,900, 03/2026) | Lint CI chặn nội dung quảng bá trong template T (EM08) |

---

## 4. Module registry: tiêu chí theo 8 dimension

### 4.1 Kiến trúc module (để bổ sung dễ về sau)

**Vị trí đề xuất:** `web/src/lib/screening/modules/{ftv,mpc,ptd,tre,cgh,iri,lco,svm}.ts` + `registry.ts` + `types.ts`. Đây là dữ liệu thuần và không gọi AI.

Mỗi **catalogue item** gồm:

```
id              "TRE-04"            ổn định, không tái sử dụng
dimension       "TRE"
title/question  EN + VI
questionRefs    ID câu hỏi trong scope.ts (52 câu hiện có) hoặc overlay id mới
ownerAgent      "CRO"               chấm và viết phần trả lời
judges          2 họ model khác nhau (lấy từ admitted ladder DeepInfra)
supporting      ["CFO","CDO"]
stages          ["A","B+"]          applicability
emphasisBand    theo stage: High | Medium | Low   (số thực ở private config)
evidence        tier chấp nhận + loại nguồn (connector/doc/URL) + freshness window
benchmarkRef    id benchmark (nguồn + năm + dải percentile), hoặc null
redFlags[]      luật xác định → red flag trang 1 (ví dụ NRR < 100%)
metricsKey      key metrics trang 1 hoặc chương (nếu có)
signal          Team|Traction|Moat|Liquidity|Capital|IP (map sang chip investor)
rubricVersion   rubric@v1 (anchors 0–4, checklist nhị phân)
```

**Thêm tiêu chí mới** = thêm một item + fixture golden + dòng calibration. `catalogVersion` tăng. Report cũ giữ version cũ (bitemporal, §9.4.4 SOT).

**Guard:**
- Test registry: mỗi item có đủ owner, judges và tier.
- Không item nào chứa trọng số số.
- ID là duy nhất.
- Mọi `questionRefs` tồn tại.
- Mỗi dimension có ≥ 1 item cho mỗi stage.

### 4.2 Catalogue v1

Có 78 item: FTV 9 · MPC 9 · PTD 8 · TRE 13 · CGH 10 · IRI 9 · LCO 12 · SVM 8. Chi tiết indicator, evidence, red flag và nguồn ở annex §3. **Nội dung pháp lý đã sắp lại theo nghĩa canonical:**
- **IRI** = sẵn sàng diligence (data room, model, reconcile số liệu, điều khoản vòng, ESIC, R&DTI, lộ trình thanh khoản).
- **LCO** = pháp lý, IP và tuân thủ.

| Dim | Lead | Items gắn với 52 câu hiện có (map sơ bộ, chốt ở SV0) | Items overlay mới (thay thế và gộp G31 overlay MT/TR/LQ/CT/IP/ES) |
|---|---|---|---|
| FTV | CHRO | founder_profile ×4, team ×4, team_structure ×4 → FTV-01…05, 07 | FTV-06 vesting, FTV-08 candour, FTV-09 CEO scaling |
| MPC | CMO | idea ×4, market ×4, gtm ×4 → MPC-01…07 | MPC-08 ngoài AU, MPC-09 concentration |
| PTD | CTO | code_git ×4, website ×4 → PTD-01, 03, 04 | PTD-02 cohort, PTD-05 security, PTD-06 AI compute GM, PTD-07 data, PTD-08 Act II (roadmap ×1) |
| TRE | CRO | customer_size ×4, revenue ×4 → TRE-01…03, 06, 12 | TRE-04 NRR, 05 GRR, 07 CAC payback, 08 LTV:CAC, 09 burn multiple, 10 magic number, 11 Rule of 40, 13 backlog (overlay TR) |
| CGH | CFO | (không có primary; dùng secondary dataroom/team_structure) | **CGH-01…10 toàn bộ là overlay mới** (overlay CT của G31) |
| IRI | CLO | documents ×4, dataroom ×4 → IRI-01, 02, 04 | IRI-03 reconcile, 05 reporting, 06 references, 07 ESIC, 08 R&DTI, 09 liquidity (overlay LQ) |
| LCO | CLO | (không có primary; documents secondary) | **LCO-01…12 overlay mới** (overlay IP, ES) |
| SVM | CEO | roadmap ×3 → SVM-03, 06 | SVM-01 moat, 02 non-consensus, 04 path to scale, 05 economics, 07 exit, 08 chống thay thế bởi AI (overlay MT) |

**Luật sàng lọc bắt buộc** (từ research):
- FTV không chấm tuổi, trường hoặc giới tính.
- TRE-02 thay NRR/GM ở pre-seed.
- CGH-01 so khớp cap table với sổ đăng ký (s169) và ASIC khi có nguồn.
- LCO-01 IP assignment là red flag cứng khi thiếu ở mọi stage.

### 4.3 Nhấn mạnh theo stage (chỉ công bố dạng dải)

| Dim | Pre-seed | Seed | Series A | Series B+ |
|---|---|---|---|---|
| FTV | Rất cao | Cao | Trung bình | Trung bình |
| MPC | Cao | Cao | Trung bình | Trung bình |
| PTD | Cao | Cao | Trung bình | Thấp |
| TRE | Thấp | Trung bình | Cao | Rất cao |
| CGH | Thấp | Trung bình | Trung bình | Cao |
| IRI | Thấp | Trung bình | Cao | Cao |
| LCO | Trung bình | Trung bình | Cao | Cao |
| SVM | Trung bình | Trung bình | Trung bình | Trung bình |

Đây là đề xuất của BlockID, dựa trên bằng chứng "đội ngũ quyết định giai đoạn sớm, business quyết định giai đoạn sau" (Gompers 2020, Kaplan 2009). Chưa có chuẩn công bố. Hằng số cụ thể được chốt ở SV4 calibration.

### 4.4 Agent phụ trách từng dimension (lúc chạy phân tích)

| Dim | Owner (chấm + viết) | Supporting | Nguồn research bắt buộc | Output | Quality gate |
|---|---|---|---|---|---|
| FTV | **CHRO** | CEO, CLO, COO | Deck team slide, LinkedIn upload, `founder_profiles`, lịch sử director (ABN/ASIC khi có), tỷ lệ commit (CTO cung cấp) | FTV items + team roster | Không có thuộc tính nhân khẩu học trong prompt/output (lint) |
| MPC | **CMO** | CPO, CRO, CFO, CDO | Deck, R01 retrieval public URL, bảng competitors 3–5 (D13), nguồn thị trường có trích dẫn | MPC items + bảng competitor | TAM bottom-up có nguồn; "no competitors" → red flag |
| PTD | **CTO** | CISO, CPO, CDO | Git connector, crawl website, security posture, analytics | PTD items + tech depth | Mỗi claim kỹ thuật có artefact |
| TRE | **CRO** | CFO, CMO, CDO | Stripe/Xero connector (`xero-metrics`, `stripe-recurring-source`), bank statement, CRM | TRE items + key metrics ARR/growth/NRR/GRR | Số T1 phải reconcile với connector; T4 không thành "verified" |
| CGH | **CFO** | CLO, CHRO, COO | Cap table (`shareholders`, `share_*`, `esop_pool`), instruments, bank → runway | CGH items + cap table bar + runway/burn | Cap table khác register → red flag |
| IRI | **CLO** (CFO bắt buộc làm judge cho IRI-02/03/08) | CFO, CRO, CEO, CDO | Data room, financial model, term sheet, AusIndustry/ATO | IRI items + readiness checklist theo stage | Reconcile deck ↔ ledger |
| LCO | **CLO** | CISO, COO, CFO | Deed IP, IP Australia, ASIC extract, hợp đồng, policy | LCO items + IP checklist | Không có deed IP → red flag cứng |
| SVM | **CEO** | CMO, CPO, CFO | Roadmap, cohorts, comparables | SVM items + moat breakdown | Moat phải gọi tên loại cụ thể |
| Chéo | **CDO** evidence officer | — | Mọi nguồn | Tier, freshness, fact identity, dedup | Một fact chỉ nuôi một item/kỳ (§9.4.4) |
| Chéo | **llm-auditor** | — | Output các agent | Verify quote, grounded share | Median grounded ≥ 0.85 |
| Chéo | **CEO synthesis** | COO | Chỉ đọc output đã chấm | Thesis một câu, why/stop/ask, 90-day plan | Không tạo số mới |

**Đổi owner (D24-c): một nguồn duy nhất.**
- Owner của item = lead của dimension chứa item đó, trừ khi registry ghi rõ là supporting.
- `evaluation-criteria.ts primaryAgent` trở thành **contributor**.
- Xung đột hiện có được giải như sau:
  - revenue → TRE items do CRO chấm, CFO làm judge; runway/burn → CGH do CFO chấm.
  - idea → MPC-01/02 do CMO chấm, CPO hỗ trợ.
  - website → PTD-01 do CTO chấm, tín hiệu marketing → MPC.
  - roadmap → SVM-06 do CEO chấm, PTD-08 do CTO chấm, CPO hỗ trợ cả hai.

---

## 5. Chấm điểm cộng dồn: tích hợp vào G32

- **Catalogue §4 là rubric SV0.** Không viết rubric riêng. rubric@v1 = 52 câu hiện có (ID `scope.ts`) + overlay items, với anchors 0–4 và checklist nhị phân.
- **C (agent chấm):** Σ item được chấm của `B_q × L_q/4 × e_tier × f_fresh`.
  - `B_q` lấy từ emphasis stage (private).
  - `e_tier`: T1 > T2 > T3 > T4; T4 bị giới hạn level tối đa 2 (§9.4 SOT).
  - Quá hạn freshness thì phần dương giảm theo half-life. Tin xấu không tự hết.
- **S, T, A** giữ đúng SOT §9.4.3. Red flag rules của catalogue là **đầu vào cho A** (có version) khi đã xác minh. Red flag chưa xác minh chỉ hiện trên trang 1 và không trừ điểm.
- **Cộng dồn theo thời gian:** mỗi lần người dùng thêm evidence hoặc connector, item tương ứng được chấm lại; cache tính theo evidence hash.
  - Không có fact mới thì Δ = 0 (chạy lại hay mua credit đều không tăng điểm).
  - Ledger theo revision cho thấy **"điểm tăng vì item nào, evidence nào"**. Ledger này nuôi email "Score updated" (EM12) và phần "How this score was built".
- **Panel:** owner agent (phiếu 1, không tốn thêm call) + 2 judge khác họ model. Quote phải khớp nguyên văn evidence. Lệch > 1 level thì escalate; không đủ bằng chứng thì N/A (không chấm 0).
- **Calibration (SV4):**
  - Golden set 30–50 doanh nghiệp, do 2 người chấm; Krippendorff α ≥ 0.67.
  - Backtest outcome có sẵn (S39).
  - Sensitivity trên emphasis/scale/half-life.
  - Công bố ρ và n trên `/methodology/calibration` + section 4 của report.
- **Chi phí:** ước tính ≈ US$0.05–0.10/report cho 2 judge (SOT §9.4, bảng chi phí). Chạy trong reservation US$0.50. Khi hết ngân sách, item để `pending`, không hạ chất lượng.

---

## 6. Dashboard v4 và cấu trúc report

Spec đầy đủ: [`tbr-v4-dashboard-spec.md`](../design/tbr-v4-dashboard-spec.md). Tóm tắt các quyết định:

1. **Trang 1**, theo thứ tự:
   - masthead
   - 5 tiles: valuation lớn nhất · SVI không trần · Investor Score 0–100 · evidence · verification
   - meeting label + thesis
   - **key metrics**: ARR, growth, NRR, GM, runway, burn; stage-aware; "○ Not evidenced" khi thiếu
   - **scorecard 8 chiều**: emphasis band, score, band, confidence, trend, `Lead · CRO`
   - red flags (theo luật) ∥ chip 6 signal (chỉ status) + peer percentile + stage ladder
   - why / stop / ask (≤ 3 mỗi loại)
   - một CTA chính
2. **Sau trang 1:** thesis → valuation → evidence & calibration → 8 chương dimension (question matrix có trích dẫn, signal block trong chương) → risks → questions → 90-day plan → appendix. Thay cho 16 section của G31; signal chapters G31 05–10 thành block trong chương sở hữu.
3. **Trạng thái:** loading, preliminary, degraded, insufficient, locked, old revision, shared (spec §3).
4. **Free tier (D24-b):** trang 1 không khoá. Chi tiết chương khoá theo `free-tier.ts`. Test chống rò trên DOM, PDF, DOCX và email.
5. **PDF trang 1 và email tóm tắt** dùng cùng projection. Email tóm tắt là class T.

---

## 7. Tính năng rút ra từ đối thủ (xếp vào BT6, trừ khi ghi khác)

| ID | Tính năng | Pattern gốc | Điều kiện hiển thị | Owner |
|---|---|---|---|---|
| RQ19 | Peer percentile trong nhóm cùng stage + ngành | Tracxn / PitchBook | Cohort n ≥ 10, loại sample/rerun (publication rules) | CDO |
| RQ20 | Stage ladder 5 bậc tách khỏi chất lượng | CB Insights Commercial Maturity | Suy ra từ evidence đã xác minh | COO |
| RQ21 | Calibration disclosure (ρ, n, ngày, "not a substitute for diligence") | PitchBook / Crunchbase | Luôn hiện; "chưa đủ dữ liệu" khi n nhỏ | CDO |
| RQ13 | Trích dẫn theo từng câu trả lời (trang deck / file / URL) | AlphaLens / Hebbia | BT5 | llm-auditor |
| RQ23 | Kiểm chéo ABN Lookup + dataset công ty ASIC (miễn phí): tên, trạng thái, ngày đăng ký, director khi có nguồn. **Share issuance / Form 484 cần trích xuất có phí → D24-i** | Techboard | Khi có ABN/ACN | CLO |
| RQ24 | Tín hiệu ngoài deck (tuyển dụng công khai, website changelog, app store) — chỉ nguồn công khai, retrieval R01 | Harmonic / Specter | Nguồn cited; không scrape trái điều khoản | CMO |
| RQ25 | Mandate fit cho evaluator (stage, ngành, vé, địa lý) | V7 Go / Affinity | Evaluator có mandate | CEO |
| RQ26 | Triage verdict cho evaluator: đọc tiếp / cần thêm bằng chứng / ngoài mandate + danh sách còn thiếu | V7 Go | Chỉ cho evaluator; đổi nhãn từ band, không phải kết luận thứ hai | CEO |
| RQ27 | Hiển thị round-readiness timing (vòng gần nhất + runway) | Dealroom | Có dữ liệu vòng | CFO |
| RQ28 | "Spike" flag: một chiều vượt trội dù tổng trung bình | Startmate | Dimension ≥ p90 cohort | CEO |

---

## 8. Ghi nhận dữ liệu người dùng theo profile (lane DC, phase BT1)

**Mục tiêu:** mọi input (text, URL, file, câu trả lời, evidence) gắn đúng `project_id` và `user` khi người dùng đã đăng nhập. Người dùng guest được gắn khi đăng ký, trên mọi thiết bị, theo email đã xác minh. Không tạo project trùng. Erasure phủ đủ.

| ID | P | Việc | File chính | Acceptance |
|---|---|---|---|---|
| DC01 | P0 | Migration additive `analyses.project_id` (nullable, FK `projects`, index). Run có người dùng đăng nhập thì tạo hoặc gắn project (theo tên/website đã chuẩn hoá, **không ghi đè project khác** — memory search-startup-creation) và seed profile từ intake | `api/intake/route.ts`, `lib/analyses/store.ts`, migration mới trong `pending-authority/` | 100% analyses mới của người dùng đăng nhập có `project_id`; qa:live kiểm tra |
| DC02 | P0 | Truyền `projectId` vào `attachAnalysis(grant, analysisId, projectId)`; `free_report_grants.project_id` được ghi | `intake/route.ts:368`, `free-grants.ts:192` | Grant có project |
| DC03 | P0 | Claim `analyses` theo **email đã xác minh** (`full_report_email`/`summary_email`), ngoài cookie | `lib/analyses/claim.ts`, `store.ts:337-385` | Guest đổi thiết bị vẫn thấy report sau khi đăng nhập |
| DC04 | P0 | `register-with-card` và `svi-handoff` gọi claim | 2 route | Test route |
| DC05 | P1 | Evaluator tạo evaluation → founder claim: **liên kết** project (founder xác nhận "đây là công ty tôi"), không tạo bản sao; evaluator giữ quyền đọc theo evaluation | `lib/evaluations.ts:830`, `api/evaluations/claim/[token]` | Một startup = một project; quyền evaluator không đổi |
| DC06 | P1 | Ghi `svi_evidence.project_id` (cột đã có từ 0036). Null project không tạo `svi_accounts` phụ | `lib/projects.ts:695-742`, evidence routes | Không còn account null-project mới |
| DC07 | P1 | Deck program intake không fallback về `/tmp`; lưu vào storage bền. Lỗi thì báo, không mất file âm thầm | `lib/intake/submission-runner.ts:50` | Test: storage không có thì 503, không ghi `/tmp` |
| DC08 | P1 | Tín hiệu hoạt động thật: `app_users.last_seen_at` (từ session). Cron `svi-snapshot` **không** bump `last_active_at` | `lib/auth.ts:425`, `svi-snapshot/route.ts:166` | Dùng làm input cho sunset/suppression |
| DC09 | P0 | Erasure: `email_preferences` theo email (kể cả `user_id` null), `svi_notifications.email`, và mọi bảng mới (send log, consent) + migration `erase_account` | `lib/privacy/erasure-map.ts` | Test erasure-map phủ 100% bảng có email |
| DC10 | P2 | Mỗi điểm thu dữ liệu có một dòng mục đích (câu data-principle đã duyệt) + link privacy. Autosave hiện "đã lưu" | intake/onboarding UI | Kiểm tra copy |

**Quản lý dữ liệu:**
- Migration additive, đặt trong `web/supabase/pending-authority/` (schemaDigest G30), apply bằng docker exec psql + `NOTIFY pgrst` (memory reference_db_migrations).
- Backfill `analyses.project_id` chỉ cho row có `user_id`, bằng match chắc chắn. Row mơ hồ để null, không đoán.

---

## 9. Lifecycle email (lane EM, phase BT2 + BT4)

### 9.1 Nền (BT2)

| ID | P | Việc | Acceptance |
|---|---|---|---|
| EM01 | P0 | **Một engine:** `email_drips` + `lib/email-drip.ts`. Gỡ lịch hoặc retire `lifecycle-mailer` (không có preference check, link unsubscribe 404, không enrol), `nurture_email_queue` (queue tăng mãi, không có cron), `onboarding-sequence`, `lead-nurture`, `weekly-insights`, stub `svi-notify`/`nurture`. Dọn `crontab.production` (single source) | Không còn cron nào gửi marketing ngoài engine |
| EM02 | P0 | **Send log chung** `email_sends` (recipient hash, flow, class T/C, template version, provider id, status). Mọi `sendEmail` ghi vào đây | 100% lần gửi có log |
| EM03 | P0 | **Frequency cap C-class:** ≤ 1/ngày, ≤ 3/7 ngày, ≤ 1/luồng/72 h. Priority re-run > evidence > intake > quota > digest; email thua **bị bỏ, không xếp hàng**. Nối `canSendMarketingToday`/`emailSendChecklist` (hiện không có caller) | Test cap |
| EM04 | P0 | **Suppression:** hard bounce, complaint, unsubscribe toàn bộ, erased, goal đã đạt, người dùng hoạt động trong 24 h (DC08). Nhận bounce qua webhook Resend; SMTP Gmail thì parse DSN hoặc chuyển C-class sang Resend | Bounce → suppressed trong < 1 h |
| EM05 | P0 | **Consent marketing rõ ràng:** checkbox không tick sẵn, tách khỏi T&C, ở signup và intake. Lưu cách lấy, bản wording và thời điểm (`lib/consent.ts`). **Đổi mặc định category C sang false** cho người dùng mới. Người dùng cũ: giữ inferred consent cho account holder đang hoạt động, còn guest chỉ nhập email thì không gửi C | Không C-email nào tới người không có consent |
| EM06 | P0 | **Unsubscribe:** body link + `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) trên C-class. Không cần đăng nhập. Hiệu lực ≥ 30 ngày. Xử lý < 2 ngày. Theo category: nhắc tiến độ / ưu đãi / evaluator matches / digest tháng | Test header + route |
| EM07 | P1 | `cofounder-match` và `ops-alert-email` đi qua `sendEmail` (guard erased + log) | grep guard trong CI |
| EM08 | P0 | **Lint CI template T:** chặn giá, plan, credit offer, "upgrade", link cross-sell trong template T (report ready, score updated, receipt, security, evaluation assigned) | Guard test fail khi vi phạm |
| EM09 | P1 | **Tách stream:** `notify.blockid.au` (T) / `news.blockid.au` (C), SPF/DKIM/DMARC aligned, DMARC tiến dần tới quarantine. **Đổi DNS là thao tác ra ngoài → D24-h** | Postmaster spam < 0.1%; kill switch C-stream khi > 0.08% |

### 9.2 Mười hai luồng (BT4, trên `email_drips`)

Trigger lấy từ dữ liệu đã gắn profile ở BT1. Nội dung dùng **gap của chính người dùng**: `computeNextSteps`, evidence thiếu theo dimension, connector chưa nối, free report 1/2, quote chưa trả.

| ID | Luồng | Trigger → trễ | Nội dung | Dừng khi | Class |
|---|---|---|---|---|---|
| EM10 | Report ready | Phân tích xong → ngay | Nhãn + 5 tiles + 3 câu hỏi + link revision (dashboard-v4 email) | Gửi 1 lần | T (có sẵn; chuyển sang projection v4 ở BT3) |
| EM11 | Save & resume (người dùng bấm) | Ngay | Link resume ký, hash, scoped, 72 h, dùng 1 lần | Gửi 1 lần | T |
| EM12 | Score updated | Re-analysis xong → ngay | Điểm cũ → mới, item nào tăng và vì evidence nào (ledger §5) | 1 lần | T |
| EM13 | Intake bỏ dở | Draft idle + consent → 24 h, nhắc lại 72 h | "Hồ sơ 60%, còn 2 phần" | Nộp, hoặc đã gửi 2 | C |
| EM14 | Gap evidence | Đã xem report, 0 evidence → 48 h, nhắc lại 7 ngày | "3 evidence sẽ nâng confidence Low→Medium; lớn nhất: Traction (CRO)" + link upload đúng dimension | Có evidence, hoặc đã gửi 2 | C |
| EM15 | Mời chạy lại | Có evidence mới, chưa re-run → 24 h | "Có dữ liệu mới từ lần chấm trước" + **giá credit hiện trước** (memory transparent pricing) | Đã re-run | C |
| EM16 | Hết free report | Report free thứ 2 đã giao → 3 ngày | Credits/plans mở khoá được gì; **trang review, không redirect Stripe** (memory review-before-Stripe) | Đã mua, hoặc đã gửi 1 | C |
| EM17 | Evaluator: evaluation chờ xử lý | Có startup được giao chưa xử lý → sáng thứ Hai, weekly | Danh sách + tuổi + mở một chạm | Queue rỗng | T (chỉ việc được giao) |
| EM18 | Evaluator: submission mới khớp mandate | Watchlist opt-in → daily/weekly | Match + SVI + link | Unsubscribe category | C |
| EM19 | Digest tháng | Account active + consent → hằng tháng | Xu hướng điểm, gap mở, peer percentile (khi n ≥ 10). **Gửi cả tháng yên ắng**; sửa lỗi bỏ qua tuần yên ắng của `founder-digest-weekly`, lấy nội dung `founder-weekly-digest` (top-3 thiếu) | Unsubscribe / sunset | C |
| EM20 | Re-engagement / sunset | 90 ngày không click/đăng nhập (DC08) → 1 email | "Giữ hay dừng?" | Click → giữ; im 30 ngày → dừng mọi C | C |
| EM21 | Billing & security | Thanh toán, biên lai, thẻ lỗi, đăng nhập mới | Chỉ thông tin thực tế | — | T |

**Giờ gửi:** 8:00–19:00 ngày thường, theo múi giờ người nhận (mặc định Australia/Sydney). T-class được miễn. Có ≥ 2 item trong 24 h thì gộp thành digest.

**KPI:** click-through và quay lại sản phẩm trong 14 ngày. **Không dùng open rate làm KPI** vì Apple MPP làm sai số. Activation = "đã xem report đầu + thêm ≥ 1 evidence"; mốc benchmark B2B trung vị khoảng 25%.

---

## 10. Merge: 10 chồng chéo và quyết định gộp

| # | Chồng chéo | Quyết định G34 |
|---|---|---|
| 1 | 6 signal ở 3 nơi (G31 `investorLens.signals`, Codex `buildInvestorScreening`, design spec) | **Mở rộng `investor-screening.ts`**. Chip status trên trang 1; score có khi `question_scores` có (G31 C12) |
| 2 | 4 phiên bản trang đầu (G31 01–03, 4 tiles + screening, §9.4.6, criteria summary) | **Một thứ tự duy nhất** theo spec v4 §1; criteria summary thành question matrix trong chương |
| 3 | Registry câu hỏi tách (scope.ts, rubric §9.4.8, overlay G31, map 16 câu) | **Catalogue §4 dùng `scope.ts` IDs + `SVI_SCOPE_MAP`**; overlay G31 gộp vào items CGH/LCO/IRI/TRE/SVM |
| 4 | Hai bộ trọng số criterion (`evaluation-criteria.ts` vs draft §9.4.3) + lệch trọng số dimension giữa hai site (H6) | **Private config một nguồn** (D24-f), hai site đọc chung; code public chỉ còn emphasis bands |
| 5 | CGH và LCO không có primary criterion | **Overlay items CGH-01…10, LCO-01…12** |
| 6 | Owner criterion ≠ lead dimension; §9.4.8 là mapping thứ ba | **Registry là nguồn owner duy nhất** (D24-c, §4.4) |
| 7 | Free tier khoá dashboard (`lockCards={!paid}`) vs G31 "01–03 luôn đầy đủ" | **Trang 1 không khoá** (D24-b); chi tiết chương vẫn khoá; test chống rò |
| 8 | Lệch wording verdict ("Investable now" vs meeting labels) + luật rủi ro G27 "missing → high" | **Meeting labels G31**; risk rank = severity × probability (D21) |
| 9 | Producer valuation tách (report `cfo-valuation.ts` vs scenario `cfo-*` core) | **`valuation-core` mới làm producer cho report** (V04b), not-estimable theo từng method |
| 10 | File ownership với Codex | BT3 **chỉ bắt đầu sau khi Codex commit/land** các file đang sửa; lane DC/EM không chạm file report |

**Map sang G33 và G32:**
- BT3 ≈ **G33 S4** (G31 R0–R1).
- BT5 ≈ **G33 S5** (SV2/SV3 shadow).
- BT6 ≈ **G33 S6** (SV5 + V04b + Lens đầy đủ).
- G34 **thay nội dung** cho các phase đó, không thêm phase song song.
- BT1/BT2/BT4 là lane mới, **không chạm pipeline report**, nên chạy được song song với G33 S1–S3.

---

## 11. Phase chi tiết — implement, deploy live, review sau mỗi phase

**Chu trình mỗi phase:**
1. Implement trong worktree lane.
2. Typecheck + test liên quan (D23 khi chạm pipeline, billing hoặc dữ liệu).
3. Merge → deploy (permit, retire origin cũ nhất theo quy tắc, chờ peer).
4. qa:live.
5. Review sau deploy (code-review + security khi có dữ liệu hoặc email).
6. Fix.
7. Mark-good.
8. Receipt trong `docs/reviews/`, cập nhật §12.9 SOT.

### BT0 — Quyết định + registry (1 deploy, không đổi hành vi)

- **Làm:**
  - Founder duyệt D24.
  - Tạo `lib/screening/{types,registry}.ts` và 8 module dữ liệu (78 items).
  - Guard test (§4.1).
  - Guard "không trọng số số trong repo public" quét `lib/screening`, docs mới và methodology.
  - Cơ chế private config: file ngoài repo, đường dẫn qua env, fallback emphasis → hệ số mặc định an toàn khi thiếu, log cảnh báo.
- **Không:** chưa nối vào pipeline.
- **Acceptance:** tests xanh; build; deploy; `/api/status` không đổi; golden SVI không đổi.

### BT1 — Dữ liệu theo profile (1–2 deploy + migration)

- **Làm:** DC01–DC09 (DC10 cùng BT3 nếu chạm UI report).
- **Thứ tự:** migration additive → code ghi → backfill chắc chắn → claim theo email → erasure.
- **Acceptance:**
  - qa:live có spec mới: guest → đăng ký thiết bị khác → thấy report.
  - Người dùng đăng nhập chạy /analyze → có project.
  - Evaluator → founder claim → một project.
  - Erasure xoá sạch email ở các bảng mới.
- **Rollback:** cột nullable; code cũ bỏ qua cột.

### BT2 — Nền email (1–2 deploy)

- **Làm:** EM01–EM08 (EM09 khi D24-h được duyệt).
- **Thứ tự:**
  1. Send log + guard.
  2. Cap + suppression.
  3. Consent UI + default.
  4. Retire cron trùng (dry-run `?dry=1` trước, so danh sách người nhận).
  5. RFC 8058.
  6. Lint T.
- **Acceptance:**
  - Không cron marketing ngoài engine.
  - Test cap/suppression/unsubscribe.
  - Gửi thử tới hộp thư test (không gửi khách thật) để kiểm header.
- **Rủi ro:** tắt nhầm email giao dịch. Chỉ retire luồng C; mọi luồng T giữ nguyên và có test.

### BT3 — Dashboard v4 (2–3 deploy)

- **Điều kiện:** Codex đã land screening UI; G31 R0 golden SVI + fixture degraded.
- **Làm:**
  - RQ01 `dashboard-v4.ts` projection.
  - RQ02 5 tiles.
  - RQ03 key metrics (ARR/growth có sẵn; 4 số còn lại "Not evidenced").
  - RQ04 scorecard + lead.
  - RQ05 red flags + khử trùng với deal-breakers.
  - RQ06 why/stop/ask.
  - RQ07 states.
  - RQ08 trang 1 free không khoá + test rò.
  - RQ09 PDF/DOCX/email parity + email tóm tắt class T (EM10).
- **Deploy:**
  1. Flag off (code chết).
  2. Preview cho admin/showcase report BlockID.
  3. Bật toàn bộ.
- **Acceptance:**
  - Parity fixture 100% trên 4 bề mặt.
  - 0 rò nội dung khoá.
  - a11y (axe 0 lỗi nghiêm trọng, target 44 px).
  - Mobile 375 không cuộn ngang.
  - Test hiểu trong 60 giây với ≥ 5 người: ≥ 80% nói đúng nhãn, trạng thái valuation, red flag hàng đầu.

### BT4 — Lifecycle flows (deploy từng luồng)

- **Thứ tự:** EM11 → EM12 → EM14 → EM13 → EM15 → EM16 → EM17 → EM19 → EM20 → EM18 → EM21.
- **Mỗi luồng:**
  1. Dry-run 24 h, log người nhận dự kiến.
  2. Founder xem mẫu.
  3. Bật.
- **Acceptance:**
  - Spam < 0.1%.
  - Unsubscribe xử lý < 2 ngày.
  - Mỗi luồng dừng đúng khi đạt goal.
  - Không vượt cap.
  - Baseline activation và quay lại 14 ngày được ghi trước khi bật, đo lại sau 14 và 30 ngày.

### BT5 — Module chấm điểm cộng dồn, shadow (2 deploy)

- **Điều kiện:** G33 S1 đạt acceptance 7 ngày (§12.12 điểm 3).
- **Làm:**
  - RQ10 rubric@v1 từ catalogue (= SV0).
  - RQ11 method metadata + contribution ledger (= SV2).
  - RQ12 `question_scores` trong payload W1–W3 + stage SCORE 2 judge (= SV3).
  - RQ13 trích dẫn theo câu.
  - RQ14 question matrix thay criteria table (đọc shadow cho admin).
  - RQ15 CFO/CRO module ra NRR/GRR/GM/runway/burn có evidence id.
  - RQ16 red flag rules → A (chỉ khi đã xác minh).
  - RQ17 cache theo evidence hash + dedup fact.
  - RQ18 lint FTV không nhân khẩu học.
- **Acceptance:**
  - Chi phí thêm ≤ US$0.10/report.
  - Không tăng degraded.
  - Tỷ lệ quote verify ≥ 95%.
  - Judge agreement được đo.
  - SVI công khai không đổi (shadow).

### BT6 — Kích hoạt + tính năng rút ra từ đối thủ (2–3 deploy)

- **Điều kiện:** SV4 calibration đạt (α ≥ 0.67, backtest không tệ hơn 2.2.0), consumer migration §12.12 điểm 6.
- **Làm:**
  - RQ22 V04b valuation producer.
  - SV5 activation hai site cùng lúc.
  - RQ19–RQ21, RQ23–RQ28.
  - Chip signal có score (G31 C12).
  - 20-user validation (G31).
  - Privacy policy công bố automated decision (APP 1.7, **hạn 10/12/2026**).
- **Acceptance:** KPI §12; APP 1.7 live trước 10/12/2026.

---

## 12. KPI và acceptance cho toàn G34

| Nhóm | KPI | Ngưỡng |
|---|---|---|
| Ổn định | Chương degraded/run; report hoàn tất | ≤ 1 degraded / 5 runs liên tiếp (G33 S1); 0 report rỗng |
| Grounding | Median grounded share | ≥ 0.85 |
| Trích dẫn | Item đã chấm có quote khớp + tier + nguồn | 100% |
| Trung thực | Số trang 1 có nguồn/tier hoặc "Not evidenced" | 100%; 0 số nội suy |
| Đồng thuận | Krippendorff α golden set | ≥ 0.67 |
| Calibration | Backtest ρ công bố cùng n | Có mặt trên report + methodology |
| Hiểu | Test 60 giây | ≥ 80% đúng 3 câu |
| Parity | Web = PDF = DOCX = email trên fixture | 100% |
| Rò rỉ | Nội dung khoá xuất hiện trên bề mặt free | 0 |
| Chi phí/thời gian | Chi phí AI; thời gian report | ≤ US$0.50; theo G33 S1 |
| Dữ liệu | Analyses người dùng đăng nhập có `project_id`; guest claim theo email | 100%; ≥ 99% |
| Email | Spam rate; unsubscribe; lint T | < 0.1%; < 2 ngày; 0 vi phạm |
| Tăng trưởng | Activation (report + 1 evidence); quay lại 14 ngày | Đo baseline ở BT2, mục tiêu +50% tương đối sau BT4 (đề xuất, chờ duyệt) |

---

## 13. Quyết định cần founder duyệt (D24)

| ID | Đề xuất | Mặc định nếu chưa duyệt |
|---|---|---|
| D24-a | Catalogue 8 module (§4) là rubric SV0 duy nhất; overlay G31 gộp vào | Không bắt đầu BT5 |
| D24-b | Trang 1 report free **không khoá** (điểm, band, nhãn, status signal); chi tiết chương vẫn khoá | Giữ khoá hiện tại |
| D24-c | Registry là nguồn owner duy nhất; lead dimension chịu trách nhiệm tổng; criterion owner thành contributor; IRI giữ CLO với CFO bắt buộc làm judge | Giữ `dimension-owners.ts` |
| D24-d | Trang 1 = 5 tiles + scorecard 8 chiều; 6 signal là chip status đến khi có điểm theo câu | G31 matrix |
| D24-e | Một engine email (`email_drips`); retire 5 luồng trùng/chết; C-class cần consent rõ ràng; cap 1/ngày, 3/tuần | Không bật luồng C mới |
| D24-f | Chuyển trọng số và hằng số SVI v3 sang **private config**; tài liệu và methodology công khai chỉ ghi dải. Lưu ý: SOT §9.4.3 đã ghi trọng số draft trong lịch sử public, nên từ v3.0 chỉ công bố dải | Trọng số giữ trong code |
| D24-g | `analyses.project_id` + claim theo email đã xác minh + liên kết project evaluator→founder (không tạo bản sao) | BT1 chờ |
| D24-h | Tách subdomain gửi `notify.`/`news.blockid.au` + DNS SPF/DKIM/DMARC (thao tác ngoài hệ thống) | Dùng domain hiện tại, chỉ bật header |
| D24-i | Kiểm chéo ASIC: bản free (ABN Lookup + dataset công ty) trước; trích xuất có phí (share issuance/Form 484) chỉ khi được duyệt ngân sách | Chỉ bản free |
| D24-j | KPI tăng trưởng email (+50% activation tương đối) và cửa sổ đo | Chỉ đo, không đặt mục tiêu |

Áp dụng D23 (kiểm thử theo phase) cho G34. Duyệt plan **không** đồng nghĩa duyệt chi phí, gửi email ra ngoài hay đổi DNS chưa được định lượng.

---

## 14. Lane triển khai và phân công agent (khi được duyệt)

| Lane | Phạm vi | File sở hữu | Skill/agent | Không được chạm |
|---|---|---|---|---|
| L-SCR (screening) | BT0, BT5 registry/rubric/scoring | `lib/screening/*`, `lib/svi/question-*`, rubric docs | `svi-scoring`, Plan agent, general-purpose worktree | UI report của Codex |
| L-UI (report) | BT3, BT6 UI | `lib/report-v2/dashboard-v4.ts`, component v4 mới, exports | `ui-ux-pro-max`, `screenshot-tour` (localhost:4001) | Chỉ sau khi Codex land |
| L-DATA | BT1 | intake/claim/evaluations/projects/erasure + migrations | reference_db_migrations; security review | pipeline report |
| L-MAIL | BT2, BT4 | `lib/email*`, `email-drip`, cron routes, `crontab.production`, consent UI | email research annex; security review | template report (chỉ qua projection) |
| L-VAL | BT6 V04b | `lib/valuation/*` producer | CFO module | `run-for-project.ts`/`storage.ts`/`load.ts`/`adapter.ts` theo luật §12.10 |
| L-QA | Mọi phase | qa:live specs, guard tests, receipts | code-review, live QA suite | — |

**Chạy:** mỗi lane một worktree agent (memory G13 wave loop). Review bắt buộc sau mỗi ship (các lần review trước đều tìm ra P0/P1). Không xoá worktree còn chạy (memory worktree-cleanup). Serialize deploy.

---

## 15. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Thêm judge làm report chậm hoặc degraded | BT5 chỉ chạy shadow sau khi S1 đạt; reservation riêng; pending thay vì hạ chất lượng |
| Catalogue quá dài, agent chấm nông | Applicability theo stage (~40–60 item/lần); N/A thay vì 0; calibration |
| Benchmark lỗi thời hoặc theo chuẩn Mỹ | Dải percentile + năm nguồn; ưu tiên nguồn AU (CTV); n nhỏ thì không hiện |
| Email bị coi là spam; phạt ACMA | Consent rõ ràng, lint T, RFC 8058, cap, sunset, kill switch |
| Mất hoặc trộn dữ liệu khi backfill project | Chỉ match chắc chắn; row mơ hồ để null; không ghi đè project (memory) |
| Xung đột file với Codex | BT3 chờ Codex land; lane DC/EM độc lập |
| Lộ trọng số | Private config + guard quét |
| Phân biệt đối xử trong FTV | Lint nhân khẩu học; không dùng trường, tuổi, giới tính |

---

## 16. Ngoài phạm vi

- Đổi giá, credits, Stripe.
- Provider AI trả phí mới.
- Warm-path CRM kiểu Affinity (ghi nhận cho sau).
- Scrape LinkedIn.
- Trích xuất ASIC có phí khi D24-i chưa duyệt.
- Backup off-host (O09 đã DEFERRED).
- Repo startupvalueindex.com: audit riêng. Parity SV5 thực hiện cùng lúc ở BT6.
