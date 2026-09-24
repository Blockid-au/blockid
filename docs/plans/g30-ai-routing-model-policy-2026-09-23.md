# G30 — AI routing & model policy (C-level DeepInfra, cost and capacity)

> **Cập nhật có hiệu lực cho plan 24/09/2026:** founder yêu cầu đưa model DeepInfra phù hợp, chất lượng tốt, phục vụ nhiều user và chi phí thấp nhất vào full plan G31/G32/G33. **§8 bên dưới là policy target mới nhất cho C-level**, thay ordering/free-fallback proposal lịch sử khi mâu thuẫn. Sau yêu cầu “hãy làm toàn bộ”, source đã enforce DeepInfra-only cho scoped reports và customer adapters; Groq CEO fallback đã gỡ trong source. SVI customer tasks đi qua attested proxy. Xem [execution receipt](../reviews/2026-09-24-cfo-implementation-receipt.md) và [coverage](../reviews/2026-09-24-clevel-provider-coverage.md). Chưa deploy, chưa benchmark/qualify model mới; không claim cost/capacity optimal đã được đo. Full G31/G32/G33 acceptance vẫn mở. Xem [full-app audit](../reviews/2026-09-24-full-app-g31-g32-g33-reconciliation.md).

**Trạng thái cập nhật23/09:** PARTIALLY IMPLEMENTED / QUALITY NOT YET QUALIFIED. D-A1 report ladder, D-A2/D-A3 và D-A6 đã có trong source; synthesis ladder khác đề xuất. D-A4/D-A5 activation và D-A7 vẫn cần gates. [Review đối chiếu và corrections](../reviews/2026-09-23-report-quality-plan-revalidation.md) là cập nhật mới; bảng đo bên dưới giữ làm evidence lịch sử, không chứng nhận toàn report hoặc worst-case cost.
**Ngày:** 2026-09-23 · **Ưu tiên:** P0 (chặn report generation → chặn sale)
**Merge vào:** `docs/plans/SOURCE-OF-TRUTH.md` §11.3 / §11.3.1 (shortlist DeepInfra), §12 O01–O02.
**Nguồn chẩn đoán:** `docs/reviews/2026-09-23-pre-presentation-review.md`

---

## 1. Vì sao (evidence, không phải phỏng đoán)

**Scope bổ sung23/09 — vision cho hai site:** [Visual evidence plan](g30-visual-evidence-analysis-2026-09-23.md)
áp dụng DeepInfra primary cho ảnh trong tài liệu/slide và ảnh upload trực tiếp.
Vision dùng role/allowlist riêng sau capability + task-quality + cost qualification;
không coi text ladder bên dưới là model đọc ảnh. Chưa chọn exact vision model hoặc
bật paid inference. OCR/local extraction, selective crops, permission-scoped cache
và accounting cả image usage/failed attempts là điều kiện trước activation.

Từ 2026-09-21 11:34 tới nay, **29 lần chạy report liên tiếp ra 0 chữ, hỏng 8/8 chương**
(`web/content/reports/tbr-quality.jsonl`). `/api/status.tbr_quality.degradedShare = 1`.

### Đính chính chẩn đoán trước

Bản review sáng nay nói ngân sách token là 1.275 và bị reasoning ăn hết. **Sai về cơ chế.**
`structuredMaxTokens()` có **floor 2.600** (`agent-dispatcher.ts:561,586-592`), thực tế
2.600 cho hầu hết role, 3.400 cro, 4.000 cmo/cfo/cpo. Đo lại ở 2.600: **mọi ứng viên đều trả
JSON hợp lệ**. Trần 1.275 chỉ chạm đường degraded prose (`agent-dispatcher.ts:780` dùng raw
1.500) và classify.

### Nguyên nhân thật

Report chạy dưới `policy: "blockid-report-v1"` → **chỉ DeepInfra, không có fallback nào**:

- `ai-client.ts:2515-2517` — `allProviders = scoped ? ["deepinfra"] : ...`
- `ai-client.ts:1770-1773` — mọi provider khác bị ném `"Provider is not eligible"`
- `ai-client.ts:1513-1517` — ladder đóng băng `REPORT_POLICY_MODELS` (4 model)

Khi 4 rung DeepInfra hỏng (log: `Worker timeout (60s)` ×4 — chính là timeout criterion 60 s
của ta, và `Empty DeepInfra response`), ladder ném `DeadLadderError` → **không còn provider
nào** → 8/8 chương degrade. Các lỗi 429 của Gemini/Groq/Claude trong log là của call **ngoài**
report (cron, agent, GATHER), không phải nguyên nhân.

→ Đây đúng là việc founder yêu cầu: **chốt DeepInfra làm mặc định với model chọn lọc, và
xếp fallback free từ mạnh xuống trung bình, loại model yếu.**

---

## 2. Đo thực tế 2026-09-23 (thay số public trong SOT §11.3.1)

Cùng một prompt chapter thật (40 evidence rows có `[ev:id]`, JSON mode, `max_tokens=2600`).
`cites` = số citation model tự gắn — proxy cho grounding. `$/rpt` = 37 call/report.

### DeepInfra (primary)

| Model | Giá in/out (USD/1M, live) | Latency | cites | ~$/report | Nhận định |
|---|---|---|---|---|---|
| `deepseek-ai/DeepSeek-V3.2` *(thinking:false)* | 0.26 / 0.38 | 20,2 s | **20** | 0,0334 | **Grounding tốt nhất** |
| `Qwen/Qwen3-235B-A22B-Instruct-2507` | 0.09 / 0.55 | 16,4 s | 14 | 0,0179 | **Cân bằng tốt nhất** |
| `deepseek-ai/DeepSeek-V4-Flash` | 0.09 / 0.18 | **6,5 s** | 9 | **0,0112** | Nhanh & rẻ nhất |
| `zai-org/GLM-5.3-Flash` | 0.15 / 0.50 | 26,0 s | 14 | 0,0269 | Chậm, không hơn Qwen |
| `openai/gpt-oss-120b` *(reasoning low)* | 0.037 / 0.17 | 7,0 s | **0** | 0,0053 | **Bỏ khỏi class report** — bỏ qua yêu cầu citation |
| `nvidia/Nemotron-3-Super-120B` | 0.085 / 0.40 | 45,4 s | 0 | 0,0299 | **Loại** — JSON hỏng, chậm |

Giá trong SOT §11.3.1 cần sửa theo catalogue live: V4-Flash **0.09/0.18** (không phải
0.06/0.18); GLM-5.3-Flash **0.15/0.50** (promotion 50% đã hết); `DeepSeek-V4-Flash-0731`
không xuất hiện trong catalogue snapshot của lượt đo đó. **Đính chính review23/09:** [trang official](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash-0731) hiện có ID này với giá0.06/0.18; chưa xác minh account inference/quality. Không tự coi hai IDs là alias hoặc thêm model vào ladder.
V4-Flash/V3.2/V4.1-Flash đều có tag `can-disable-reasoning` → tắt reasoning bằng
`chat_template_kwargs:{thinking:false}` (đã kiểm chứng hoạt động).

### Free providers (fallback)

| Provider / model | Latency | cites | Kết quả |
|---|---|---|---|
| `groq / openai/gpt-oss-120b` | **2,0 s** | 8 | **Mạnh** — giữ rung 1 |
| `groq / openai/gpt-oss-20b` | **1,0 s** | 6 | **Khá** — giữ rung 2 |
| `openrouter / nvidia/nemotron-3-nano-omni-...-reasoning:free` | 24,6 s | **0** | Yếu — loại |
| `openrouter / cohere/north-mini-code:free` | 15,8 s | **0** | Yếu — loại (**đang là priority 1 của chain live**, lại là model *code*) |
| `openrouter / deepseek-chat-v3.1:free` | — | — | **HTTP 404** "unavailable for free" (vẫn nằm trong default list) |
| `openrouter / qwen3-235b-a22b:free` | — | — | **HTTP 404** "unavailable for free" (vẫn nằm trong default list) |
| `sambanova` (3 model) | — | — | **404 model_not_found** toàn bộ |
| `cerebras` | — | — | **402** — hết free tier |
| `gemini-2.5-flash` | — | — | **429 daily quota** |

---

## 3. Quyết định đề xuất (chờ founder duyệt — chưa code)

| # | Quyết định |
|---|---|
| **D-A1** | **DeepInfra là primary** cho `report`/`synthesis`. Ladder chốt 3 model: `DeepSeek-V3.2` → `Qwen3-235B-A22B-Instruct-2507` → `DeepSeek-V4-Flash`. Lý do: grounding → cân bằng → rẻ/nhanh khi tải cao. Chi phí xấu nhất ~US$0,033/report (A$3/report, 2 free/email ⇒ không đáng kể). |
| **D-A2** | **Bỏ `openai/gpt-oss-120b` khỏi class `report`/`synthesis`** (0 citation). Giữ cho `classify` (rẻ, đủ dùng). |
| **D-A3** | **Tắt reasoning** trên model có `can-disable-reasoning` bằng `chat_template_kwargs:{thinking:false}` cho mọi call structured — giảm latency và tránh tràn ngân sách. |
| **D-A4** | **Free fallback có điều kiện, xếp mạnh→trung bình:** `groq/gpt-oss-120b` → `groq/gpt-oss-20b` → `gemini-2.5-flash` (khi còn quota). **Loại khỏi routing:** toàn bộ `openrouter :free` hiện tại, `sambanova` (404), `cerebras` (402). |
| **D-A5** | Free fallback cho report **chỉ** được bật qua cơ chế qualification đã có (`lib/ai/free-fallback-qualification.ts`, hiện `executionAllowed:false`) — không nới `scopedReportPolicy` theo kiểu mở cửa tự do. Hết quota thì **queue/trả trạng thái đúng**, không hạ quality gate (đúng SOT §11.3). |
| **D-A6** | **Sửa health probe**: hiện gửi `max_tokens: 4`, chỉ kiểm tra `status === 200` (`lib/ai/health-check.ts:88-104`) → model trả rỗng vẫn "healthy" và được đẩy lên priority 1. Probe phải dùng prompt report-size và **assert `content` không rỗng**. |
| **D-A7** | **Sửa ranking discovery**: `model-discovery.ts:44-90` cho family lạ điểm mặc định 55 + thưởng recency/context → model `:free` mới lạ thắng model tốt đã biết. Thêm allowlist/pin mà cả 4 job ghi `ai-free-models.json` đều phải tôn trọng, nếu không sẽ bị ghi đè trong 30 phút. |

---

## 4. Ánh xạ vào backlog hiện có (không tạo lane mới)

| Item SOT | Bổ sung |
|---|---|
| **O01** (routing policy, hard allowlist) | D-A1, D-A2, D-A3, D-A5 — freeze ladder + tắt reasoning + đóng I36 |
| **O02** (capacity/diagnostics) | D-A4, D-A6, D-A7 — fallback order, probe thật, ranking có pin |
| **§11.3.1** | Thay bảng shortlist public bằng bảng đo ở §2 (giá live + kết quả benchmark) |
| **§13** release gate | Thêm gate: “một run report thật đạt `groundedShare > 0` trên chain đã chốt” trước khi tuyên bố sale-ready |

**Không đổi:** `scopedReportPolicy` vẫn là cơ chế đúng; không dựng router thứ hai; không
sửa tay `ai-free-models.json` (bị cron ghi đè sau ≤30 phút).

---

## 5. Phối hợp với Codex (ChatGPT) — tránh dẫm chân

Codex đang code nhánh G30 (commit gần nhất: model budget/accounting, website intent, receipt).
Phân vai đề xuất:

| Vùng | Ai làm | Ghi chú |
|---|---|---|
| `lib/ai-client.ts` — `DEEPINFRA_MODELS_BY_CLASS`, `PAID_PRICING_USD_PER_1M`, `COST_PER_1K` | **Một bên duy nhất** | 3 hằng số phải sửa cùng commit, nếu không test `ai-client.test.ts:1304-1312` đỏ |
| `lib/ai/health-check.ts`, `lib/model-discovery.ts` | Độc lập với billing | Có thể tách commit riêng |
| `lib/ai/free-fallback-qualification.ts` (wiring) | **Codex** nếu đang làm quota reservation | Tài liệu ghi `requiredNext: atomic_account_quota_reservation_and_scoped_transport_integration` |
| Model budget/spend accounting | **Codex** | Claude không đụng |

**Quy tắc:** bên nào cầm `ai-client.ts` thì commit trọn vẹn cả 3 hằng số + 11 test file ở §6;
bên kia không mở file đó cho tới khi commit đó đã push.

---

## 6. Test sẽ đỏ khi đổi ladder (phải sửa cùng commit)

`ai-client.test.ts` (:1288-1312 pin đúng danh sách model + bắt buộc có dòng giá; :1810-1845
scoped-policy suite), `ai/model-strikes.test.ts:185`, `ai/last-report.test.ts:31-33`,
`analyses/first-analysis/{job,meta,agents}.test.ts` (chuỗi “Prepared with … via DeepInfra”),
`pdf/first-analysis-report-pdf.test.tsx:70-76`, `pdf/tbr-pdf.test.tsx:298-300`,
`docx/tbr-docx.test.ts:398-402`, `api/status/route.test.ts:179,1320`,
`cron/{discover-models,refresh-models}/route.test.ts`, `model-discovery.test.ts`.
Bề mặt người dùng: `admin/architecture/architecture-client.tsx:131-133`.

---

## 7. Nghiệm thu

**Correction23/09:** các mục1–4 bên dưới chỉ là smoke/operational targets lịch sử,
không đủ làm release gate. Canonical SOT§13 và [review mới](../reviews/2026-09-23-report-quality-plan-revalidation.md)
yêu cầu claim/source correctness, question coverage, không critical contradiction,
holdout và cost/accepted-report bao gồm failures/retries. Không bắt buộc5,000 từ
cho case thiếu dữ liệu, không gọi USD0.04 là worst-case cap đã chứng minh.

1. `groundedShare > 0` trên một run report thật (không phải fixture `/tbr/demo`).
2. `tbr-quality.jsonl` có dòng mới `degradedSections: 0`, `words > 5000`.
3. `/api/status.tbr_quality.degradedShare` về 0 trong 24 h.
4. Chi phí thực đo ≤ US$0,04/report trên `ai-spend-daily.json`.
5. Health probe mới: model trả rỗng **không** được đánh `healthy`.
6. Chain live (`/admin/ai-health`) không còn model 404/0-citation nào.

## 8. Cập nhật 24/09/2026 — C-level DeepInfra: tối ưu chi phí và capacity

### 8.1 Quyết định và giới hạn

Target: mọi C-level customer AI call của hai app đi qua **DeepInfra**, cùng admission/budget policy. Chọn **model rẻ nhất đã đạt chất lượng cho tác vụ**, sau đó tối ưu completion probability và P95 latency dưới tải. Chức danh CEO/CFO không tự buộc dùng model đắt. Code tính SVI, valuation, ownership/dilution; AI trích driver có nguồn, chấm rubric và giải thích. G31 read-time Lens không thêm LLM call.

Đây là lựa chọn cho plan, chưa phải runtime activation hay kết quả benchmark. Không tuyên bố một model “tối ưu nhất” khi chưa có holdout/capacity thực. Giữ các mức **candidate → smoke-tested → admitted → release-qualified**, task/version/account cụ thể. Một price row không làm model được phép nhận private deck hoặc chấm G32.

`ai-client.ts` hiện routing chủ yếu theo task class; scoped ladder lọc `REPORT_ADMITTED_MODELS`. T16j/k có direct Groq CEO fallback mặc định trừ khi `REPORT_GROQ_FREE_FALLBACK=off`, cùng 40s reserve. O01/T16 phải đưa call này vào traceability và reconcile với target DeepInfra; không đổi env/live trong lượt plan. Khi không còn model DeepInfra đạt task/deadline/budget, queue/resume hoặc explicit failed/partial, không âm thầm chuyển provider ngoài policy.

### 8.2 Exact model IDs và giá public

Kiểm tra official **24/09/2026**; đơn vị **USD / 1 triệu input / output tokens**, Standard, không giả cache hit/discount. Giá public không xác minh quyền gọi, account quota, latency hoặc chất lượng cho BlockID. Revalidate trước benchmark/activation; giữ pricing-policy expiry hiện tại 23/10/2026, update sớm nếu giá đổi.

| Exact DeepInfra model ID | Input | Output | Vai trò / admission |
|---|---:|---:|---|
| [`deepseek-ai/DeepSeek-V4-Flash`](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash) | 0.09 | 0.18 | Baseline tiết kiệm đang có smoke/source support; extraction/classification/first-pass; chưa full qualification |
| [`deepseek-ai/DeepSeek-V4-Flash-0731`](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash-0731) | 0.06 | 0.18 | **Challenger ưu tiên tiết kiệm** thay baseline khi đạt cùng task gates; official ID tồn tại, không tự coi alias/model đã tested |
| [`Qwen/Qwen3-235B-A22B-Instruct-2507`](https://deepinfra.com/Qwen/Qwen3-235B-A22B-Instruct-2507) | 0.09 | 0.55 | General reasoning/EN-VI writer challenger, independent-family judge; smoke có, output đắt hơn Flash |
| [`deepseek-ai/DeepSeek-V3.2`](https://deepinfra.com/deepseek-ai/DeepSeek-V3.2) | 0.26 | 0.38 | Material reasoning/audit/CEO candidate; smoke citation count tốt hơn không chứng minh accuracy; nâng cấp chỉ khi gain thực |
| [`meta-llama/Llama-3.3-70B-Instruct-Turbo`](https://deepinfra.com/meta-llama/Llama-3.3-70B-Instruct-Turbo) | 0.10 | 0.32 | Third-family judge candidate; phải qualify/schema/allowlist/scoped budget trước dùng |
| [`Qwen/Qwen3-VL-235B-A22B-Instruct`](https://deepinfra.com/Qwen/Qwen3-VL-235B-A22B-Instruct) | 0.20 | 0.88 | Vision baseline đã được price-policy nhận; giữ uncertainty/source units |
| [`Qwen/Qwen3-VL-30B-A3B-Instruct`](https://deepinfra.com/Qwen/Qwen3-VL-30B-A3B-Instruct) | 0.15 | 0.60 | Vision challenger tiết kiệm; chỉ thay baseline nếu numeric/table/EN-VI accuracy không giảm |
| [`openai/gpt-oss-120b`](https://deepinfra.com/openai/gpt-oss-120b) | 0.037 | 0.17 | Candidate rất rẻ cho classification; smoke report trước có 0 citations, **không** tự dùng final report/judge |

Không thêm model premium vào default chain chỉ vì mới hoặc tên mạnh. So tổng input/output mix: Qwen không luôn rẻ hơn V3.2 nếu output dài; Flash-0731 chỉ giảm phần input so với Flash. Model page benchmarks không thay corpus BlockID. Capability/reasoning params phải kiểm từng exact ID; không copy `thinking:false` từ V3.2 sang model mới không hỗ trợ.

### 8.3 Phân công theo C-level và loại tác vụ

| C-level / công việc | Low-cost first-pass candidate | Khi nào dùng challenger/stronger candidate | Kiểm tra bắt buộc |
|---|---|---|---|
| CDO / extraction, normalize, source indexing | Flash; ưu tiên thử Flash-0731 | Qwen khi schema/context khó; vision lane cho ảnh | Exact quote, entity, currency, period; không tự đổi đơn vị |
| CMO / thị trường, đối thủ, GTM | Flash trên relevant retrieved evidence | Qwen cho so sánh nhiều nguồn; V3.2 khi kết luận trọng yếu còn conflict | Sources thật, comparison dimensions, counter-evidence; không dùng model memory như research |
| CPO / problem, product, roadmap | Flash | Qwen khi synthesis nhiều claim; V3.2 nếu dispute material | Tách stated/observed/inferred và next evidence |
| CTO / tech, code, moat | Flash cho extraction/summary | Qwen cho technical synthesis; V3.2 khi material challenge | Không coi website là code audit; locator và scope limitation |
| CHRO / founder, team, org | Flash | Qwen cho team-fit synthesis | Không suy thiếu profile là năng lực thấp; nguồn và freshness |
| COO / operations, milestones | Flash | Qwen khi dependencies/contradiction phức tạp | Scope/timeframe, evidence coverage, actionable outputs |
| CFO / financials, valuation drivers | Flash trích số; **code** tính | V3.2 cho material rationale/conflict; Qwen/Llama judge khác family | Numeric oracle, methods applicability, source periods, no SVI→money |
| CLO / compliance/governance | Flash lập evidence checklist | V3.2 cho nhận định trọng yếu; Qwen/Llama challenge | Jurisdiction/date/source; thiếu tài liệu ≠ vi phạm pháp luật |
| CISO / security posture narrative | Flash trên findings được cung cấp | Qwen hoặc V3.2 khi technical contradiction | Scope đúng, không claim pentest/verified từ prose |
| CRO / revenue/funding readiness | Flash cho routine funnel/actions | Qwen cho GTM synthesis; V3.2 khi funding/financial claim material | Không biến ask/forecast thành actual traction |
| CSO/R&D / strategy, differentiation | Flash | Qwen cho comparison; V3.2 khi material uncertainty | Bằng chứng moat/competitor; không thưởng độ dài tài liệu |
| IR / investor memo và customer-care/CCSO | Flash trên approved facts | Qwen cho bilingual memo; critical issue chuyển qualified reviewer | Không lộ private data, không thêm facts vào bản dịch |
| CEO / final synthesis | So Flash và Qwen với baseline V3.2 trên holdout | Chỉ chọn V3.2 khi gain accuracy/coverage bù cost/latency | Chỉ final accepted evidence, giữ valuation unavailable và contradiction; summary reserve riêng |

Đây là **candidate map** để qualification, không assertion Flash đã đạt mọi role. Trước khi champion rẻ qualified, giữ model baseline đã admitted phù hợp; nếu baseline không đạt deadline/quality thì dừng/queue, không publish bằng challenger chưa được duyệt. Chọn model theo task+materiality+language+modality, không một global ladder cho mọi C-level. Khi V3.2 đã tham gia hoặc vẫn thất bại, escalation chỉ dùng model đã qualified/admitted và còn budget; nếu chưa có, giữ unresolved hoặc chuyển reviewer. Đổi family không tự là nâng chất lượng. Cron/admin không thuộc report phải có budget riêng; không hiểu US$0.50/report là US$0.50 cho mọi cron call hoặc ngân sách benchmark vô hạn.

### 8.4 G32 panel: đủ ba họ model, không nhân chi phí sai

**CFO methodology dependency24/09:** role routing phải phục vụ [CFO projection/valuation spec](g32-cfo-projection-valuation-implementation-2026-09-24.md), không thay nghiệp vụ bằng model mạnh hơn. CFO AI đề xuất driver/method có nguồn và giải thích deterministic outputs; three-statement/projection/DCF/cap-table math nằm trong engine. Scoring panel và valuation dùng cùng evidence revision, không feedback loop hoặc total SVI→money. Spec mới PLAN ONLY, không prompt/model activation trong lượt tài liệu.

Giữ §9.4.8: owner + hai judge **ba họ khác nhau**, blind votes trên cùng evidence/rubric; DeepSeek V3.2 và V4 Flash là **cùng family**. Target panel: **DeepSeek + Qwen + Llama** trên DeepInfra. Owner family quyết định hai family còn lại. Nếu Llama chưa đạt gates/được scoped admission, SV3 chưa đủ điều kiện activation; không dùng hai DeepSeek IDs để giả độc lập.

52 câu ×3 = **156 phiếu**. Với giả định thiết kế gom 4 câu/criterion: **13 owner calls +26 judge calls**; có thể gắn owner scores vào narrative calls tương ứng, không cần156 calls mới. Đây không phải số call runtime hiện tại đã đo; thêm `question_scores` vẫn tăng output tokens dù reuse owner calls. Durable job giữ từng question result; context phải đủ, chia lại batch khi quá dài, không cắt nội dung quan trọng để giữ số call.

Ví dụ economics, **10.000 input +1.500 output tokens/call**, không cache/discount/retry:

- Qwen + Llama: `13×[(10000×0.09+1500×0.55)+(10000×0.10+1500×0.32)]/1e6` = **US$0.041665** phần 26 judge calls.
- V3.2 + Llama: **US$0.066950** cùng assumption khi Qwen là owner.
- Chưa gồm owner narratives, vision, research, synthesis, failed/unknown attempts, repairs và escalation. Không gọi hai số trên là tổng report cost hoặc worst case.

Giữ target panel **≤US$0.10**, nằm **trong**, không cộng ngoài hard report cap **US$0.50**. S1 legacy canary target ≤US$0.10/run vẫn giữ riêng; không dùng panel dự toán để tự nới gate này. Reserve prompt/output/reasoning/vision chính xác theo endpoint; timeout/unknown giữ reservation cho tới reconciliation. Code/source checks chạy trước; phải yêu cầu và lưu trạng thái cả ba phiếu thuộc ba family; xử lý phiếu không hợp lệ/N/A, abstention và median theo SOT §9.4.8, không bỏ judge để đạt giá.

### 8.5 Multiuser/quota/capacity

Official default **200 requests đồng thời / model / account**, có thể trả 429 dưới giới hạn khi busy; không phải 200 reports/users được bảo đảm. **Quota và throughput account thực tế chưa xác minh.** [DeepInfra rate limits](https://docs.deepinfra.com/account/rate-limits).

Implementation trong O01/O02/O08/T05, không tạo scheduler riêng cạnh tranh:

1. Shared global + per-model semaphore across cả hai app và mọi origin/worker dùng chung account; tenant fair queue, bounded backlog, cancellation và durable lease. Bắt đầu conservative ≤3 in-flight/model theo S1, tối đa2/model cho một tenant trong thử nghiệm; đây là application targets, không phải limit DeepInfra. Dành slot cho finalization/verification để cron/research không chiếm hết.
2. Tăng concurrency từng bậc sau measured P50/P95 first-token/output/total, tokens/s, 429, accepted reports/minute và queue wait. Giảm khi overload; Retry-After + jitter, capped attempts, không fan-out 52 tasks hay retry storm.
3. Phân biệt model-busy, account quota, account budget/auth, context limit và semantic failure. Model khác cùng provider không phải outage domain độc lập. Không đổi model chỉ để reset account cap.
4. Deadline-aware lựa chọn trong eligible models; nếu không model nào có probability hoàn tất đủ tốt thì queue/resume, không khởi động hopeless attempt sát deadline. Không truncate report/criteria để tạo completion giả.
5. Tenant/project/evidence-hash/method/rubric/prompt/model-version scoped cache. Reuse extraction/retrieval và deterministic calculations; không rerun whole report khi chỉ một section đổi. G32 rerun cùng evidence không tăng score.
6. Monthly forecast dựa measured weighted calls/report và model seconds/report. Với model m: `reports/min ≲ 60×concurrency_m / expected_model_seconds_per_report_m`; lấy bottleneck, giữ headroom và account token limits nếu có. Cache/promotion không được mặc định 100%.
7. Standard cho interactive customer path; offline batching/Flex chỉ khi latency/permissions đáp ứng và discount được xác minh. Không cộng chồng cache/Flex/batch discount suy đoán.

### 8.6 Qualification, rollout và owner

O01 inventory mọi C-level caller gồm report/research/intake/vision/cron/admin/SVI proxy; exact provider+ID+task và bypass. O02 log actual model/usage/cost/queue/latency/outcome/citations/quality/version, không log private prompts vào public dashboard. Q01/Q02 dùng corpus40dev/20holdout EN-VI, source accuracy, numeric oracle, complete52 questions và human calibration; không dùng citation count làm accuracy.

Promote cheapest **qualified** champion khi: zero critical factual errors; gates SOT§13 không giảm; actual retry-inclusive cost/accepted-report thấp hơn hoặc useful throughput cao hơn với tradeoff ghi rõ; capacity test có fairness/no duplicate billing; web/reload/export giữ same final revision. Rollout shadow→small canary→staged traffic, rollback exact qualified DeepInfra ID; candidate failure không làm mất report đã lưu. Không tự qualify toàn family khi chỉ một exact ID pass.

CFO sở hữu economics/method inputs; CDO evidence+eval corpus; CTO/Ops router/admission/telemetry; report owners quality; root release owner serialize deploy. Giá user/credits không đổi vì model rẻ hơn. Benchmark trả phí chỉ dùng ngân sách/scope đã cấp; nếu chưa có allocation thì ghi NOT RUN, tiếp tục source/contracts/docs độc lập.
