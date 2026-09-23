# G30 — AI routing & model policy (DeepInfra primary + qualified free fallback)

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
