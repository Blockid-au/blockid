# G30 — `/analyze` ↔ SVI PitchBook parity (một cấu trúc kết quả investor)

**Trạng thái:** PLAN ONLY — chưa code. Viết để đồng bộ với phiên Codex đang code cùng vùng.
**Ngày:** 2026-09-23 · **Ưu tiên:** P1 (ngay sau P0 AI routing) — bề mặt bán hàng chính
**Merge vào:** `SOURCE-OF-TRUTH.md` §5 (input contract), §6.7 (cross-site), §10.8–10.9 (intake), §12 U07–U08/R01–R04/F02–F04
**Bối cảnh:** [website/text intent review](../reviews/2026-09-23-website-text-investor-intent-review.md) · [cross-site re-analyze review](../reviews/2026-09-22-g30-cross-site-reanalysis-source-review.md) · [pre-presentation review](../reviews/2026-09-23-pre-presentation-review.md)

---

## 1. Yêu cầu founder (23/09/2026)

> Đổi `blockid.au/analyze` để cấu trúc kết quả **giống và đồng bộ** với `startupvalueindex.com/pitchbook`
> khi phân tích pitchbook; có thể **dùng lại hoặc nhúng** toàn bộ kết quả nếu nhanh và hiệu quả nhất.

**Đính chính đường dẫn:** không có trang `/pitchbook` (404). Thực tế là **`/pitchbook/upload`**,
kết quả đổ về `/company/{slug}` và bản chia sẻ công khai `/report/{slug}`.

---

## 2. Hiện trạng hai bên (đọc source + live 23/09)

### SVI — mạnh ở **intake, 16 câu hỏi IC, progress streaming**

| Thành phần | Source |
|---|---|
| Intake 3 tab **Files / URL / Text**, **≤5 file × 25 MB**, PDF·PPTX·DOCX·XLSX·ODT/ODP/ODS·TXT·MD·CSV·JSON·HTML·RTF | `src/app/pitchbook/upload/page.tsx`, `UploadPitchBook.tsx` |
| Pipeline v2: `POST /api/ingest/pitchdeck` trả `runId` ngay, chạy nền; **16 criteria song song (Semaphore = 4)**, stream từng kết quả khi xong | `src/lib/pitchdeck/job-runner-v2.ts`, `criteria/registry.ts` |
| **SSE có resume theo byte-offset** (`Last-Event-ID`), heartbeat 15 s, tự dựng lại `done/error` nếu process restart | `src/app/api/analysis/[runId]/stream/route.ts` |
| **ETA thật**: trung vị 30 run gần nhất từ `run-timings.jsonl`, phát ngay ở event đầu nên timeline vẽ đủ trước khi chạy | `src/lib/pitchdeck/progress.ts` |
| **16 câu hỏi IC** Q01–Q16, mỗi câu `{summary_en, summary_vi, evidence_ids[]}` | `src/lib/decision/types.ts:214-231` |
| Valuation / investor score / confidence / risk = **deterministic** | `src/lib/decision/valuation-engine.ts`, `enrichment/investor-score.ts` |
| Bản chia sẻ công khai `/report/{slug}` (không cần đăng nhập, index được, in/PDF/DOCX/MD) | `src/app/report/[slug]/page.tsx` |

**16 câu hỏi:** Q01 công ty làm gì · Q02 vấn đề quan trọng không · Q03 thị trường lớn/tăng trưởng ·
Q04 đã ai thành công trong ngành · Q05 **đối thủ có làm tốt hơn không** · Q06 khác biệt/moat ·
Q07 **runway/sống sót** · Q08 unit economics · Q09 claim có bằng chứng · Q10 pháp lý/governance/cap table ·
Q11 valuation hợp lý · Q12 **ownership + dilution** · Q13 **điều gì làm luận điểm sai** ·
Q14 cần due diligence gì · Q15 câu hỏi cho buổi gặp founder · Q16 theo dõi sau đầu tư.

### `blockid.au/analyze` — mạnh ở **pipeline, billing, evidence contract**

**Đính chính quan trọng:** `/analyze` **đã render đúng tài liệu TBR v3 ReportV2**
(`full-report-panel.tsx` → `<TbrReportV2>` trong `#analyze-canonical-report`) — cùng component với
report trả phí. `analyze-results.tsx` 4-dimension chỉ là **preview trước khi report cuối về**.

| Đã có | Còn thiếu so với SVI |
|---|---|
| Upload deck **đã chạy**: PDF/DOCX/PPTX, 25 MB, `/api/intake` → `analyzeInput()`; PPTX qua `node-pptx-parser`, DOCX qua `mammoth`, PDF qua `pdf-parse`; OCR fallback cho PDF scan | **Một file mỗi lần**; thiếu **XLSX/CSV** (financial model, cap table), ODT/ODP/ODS, HTML/RTF |
| Intake một ô thông minh tự nhận URL/text/file | Không có 3 tab rõ ràng |
| ReportV2 16 section, revision/export, credit/entitlement, identity, free-report gate, PDF twin | **Không có khung 16 câu hỏi IC** — khác biệt nội dung thật sự |
| Trạng thái chạy: **HTTP polling**, một dòng `progressLineV2()`, ETA cứng "Usually 3–8 minutes" | Không có **stage timeline, ETA tính được, SSE resume** |
| Lưu `analyses.full_report_json`; tenancy theo session/anon cookie/signed token | — |

---

## 3. Vì sao đáng ưu tiên (không chỉ vì "đẹp hơn")

16 câu hỏi IC lấp gần hết khoảng trống investor mà review sáng nay nêu:

| Gap trong pre-presentation review | Câu hỏi SVI lấp |
|---|---|
| Không có return math (ownership, dilution) | **Q12** |
| Không có phân tích đối thủ thật | **Q05**, Q04 |
| Không có runway / use of funds | **Q07** |
| Không có "what would have to be true" | **Q13** |
| Không có deal terms / governance | Q10 |
| Không có next diligence steps | **Q14**, Q15, Q16 |

→ Vừa đồng bộ giao diện, vừa **đóng khoảng trống nội dung investor**.

---

## 4. Vì sao KHÔNG nhúng kết quả SVI vào trang trả phí

| Rào cản | Bằng chứng |
|---|---|
| **iframe bị chặn hai lớp, cố ý** | `next.config.js:18` `X-Frame-Options: DENY` + `src/middleware.ts:45` `frame-ancestors 'none'`. Nhúng = phải hạ security header của SVI. |
| **SVI không có database** | Toàn bộ run là file phẳng trong `/home/dovanlong/svi-analysis-cache` (`{runId}.json`, `slug-*.json`, `.stream`). Không atomic, có thể mất update. |
| **`GET /api/analysis/{runId}` không có auth** | Biết `runId` là đọc được toàn bộ `RunState`. Không thể để sản phẩm trả tiền phụ thuộc bề mặt này. |
| **Citation không xác thực** | `key_evidence` là free string (xác nhận trong review 22/09) — trái Truth contract SOT §8. |
| **Cắt 8.000 ký tự** | `per-field-analyze.ts` cắt raw excerpt còn 8.000 ký tự — đúng thứ SOT §5 cấm ("không cắt âm thầm 8.000 ký tự"). |
| **Hai bộ từ vựng SVI song song** | 8 chiều có trọng số (`decision/svi-weights.ts`) **và** 11 chiều investor score (`enrichment/investor-score.ts`) cùng gọi là "SVI". Không nhập khẩu mâu thuẫn này. |

**Kết luận:** nhúng nhanh trước mắt nhưng mang khiếm khuyết auth/lưu trữ/citation vào sản phẩm bán tiền.

---

## 5. Quyết định đề xuất (chờ founder duyệt — chưa code)

| # | Quyết định |
|---|---|
| **D-B1** | **Port cấu trúc, không iframe.** Lấy `RunState["completed"]` (`src/lib/decision/store.ts:33-65`) + `SixteenAnswersSchema` + `MetaSummarySchema` làm **interface tham chiếu**, dựng lại trên dữ liệu ReportV2 của blockid. |
| **D-B2** | **Một pipeline duy nhất, đặt tại blockid.au.** SOT dòng 409 đã quy định cùng snapshot/intent/research contract. *Cần xác minh trước:* SVI có `scoped-proxy.ts` + `INVESTOR_PORTAL_AI_TOKEN` trỏ về `blockid.au/api/investor-portal/ai-generate`, nhưng stack phân tích của SVI cũng gọi provider trực tiếp; `blockid-client.ts` (ủy quyền sang blockid) là **dead code**. Phải trace đường chạy thật trước khi hợp nhất. |
| **D-B3** | **Mở rộng intake**: 3 tab Files/URL/Text, **nhiều file** (5 × 25 MB), thêm **XLSX/CSV** (financial model, cap table). PDF/DOCX/PPTX đã chạy — chỉ cần multi-file + parser bổ sung. Giữ nguyên free-report gate, guest A$3 SKU, review-before-pay. |
| **D-B4** | **Lấy 16 câu hỏi IC làm lớp trình bày investor**, **ánh xạ** về 13 criteria/52 câu hỏi canonical — không tạo taxonomy thứ ba, không nhập 11-dim của SVI. |
| **D-B5** | **Port thiết kế progress của SVI** (đây là phần đáng port nhất về kỹ thuật): SSE resume theo byte-offset + ETA từ trung vị run thật + timeline vẽ trước khi chạy. Hiện `/analyze` chỉ có polling + ETA cứng. |
| **D-B6** | Kết quả mở đầu bằng **decision brief** (verdict + confidence · valuation khi đủ điều kiện · điểm mạnh · rủi ro · điểm cần làm rõ · bước diligence kế tiếp). Trùng "Target outcome" trong review của Codex — gộp làm một. |
| **D-B7** | **Không sửa `components/tbr/v2/report.tsx`** (dùng chung report trả phí + PDF/DOCX twin). `/analyze` có composition riêng trên cùng `ReportV2` data, đặt đúng chỗ `analyze-results.tsx` đang lặp score/radar phía trên tài liệu chính — đó là seam tự nhiên. |

---

## 5b. Thiết kế UI/UX kết quả (yêu cầu founder 23/09)

> "tổ chức thành dashboard hài hoà, thiết kế giống một bản biz report chuyên nghiệp, nhìn vào là thấy ngay
> vấn đề / ưu điểm và định giá."

Spec đầy đủ: **[`docs/design/analyze-report-dashboard-spec.md`](../design/analyze-report-dashboard-spec.md)**.
Tóm tắt quyết định:

- **D-B8 — Quy tắc 3 giây.** Màn hình đầu trả lời đủ 4 câu: *đáng giá bao nhiêu · tốt hay chưa · sai ở đâu ·
  thiếu gì.* Zone 1 **Verdict bar** = Định giá (số lớn nhất trang) + SVI/band + Verdict A–D/conviction,
  kèm một câu luận điểm.
- **D-B9 — Triptych Điểm mạnh / Rủi ro / Cần làm rõ** ngay dưới verdict, mỗi cột tối đa 3 mục có cấu trúc
  cố định (tiêu đề ≤ 8 từ · một câu bằng chứng có `[ev:id]` · mở rộng tại chỗ). Trên mobile đảo thứ tự
  **Rủi ro → Điểm mạnh → Cần làm rõ**.
- **D-B10 — Giống research note, không giống landing page:** masthead (công ty · sector · stage · ngày ·
  methodology version · report id), đánh số mục 1–8, in ra là tài liệu hợp lệ, web = PDF = DOCX.
- **D-B11 — Progressive disclosure:** dashboard tóm tắt, mở rộng tại chỗ; không đổ 22 trang vào mặt người đọc.
- **D-B12 — Thành thật hiển thị ngang hàng:** evidence confidence, claim chưa kiểm chứng và `n` của benchmark
  nằm **cạnh** con số, không giấu ở phụ lục. Chiều chưa đánh giá in `—`, không in 0.
- **D-B13 — Không thêm palette/font mới.** Dùng nguyên token light template (navy `#1b2a5e`, cyan `#0e7490`,
  bull/warn/bear) và primitives `Card`/`Table`/`Section`. Mọi trạng thái = **icon + chữ + màu**, không chỉ màu.
- **D-B14 — Sửa luôn 4 lỗi đang thấy trên bản demo:** ghép sai cặp tiêu đề/bằng chứng ở "Why back / What
  weighs against"; mâu thuẫn connector Stripe trong cùng trang; header "no published cohort" trong khi vẫn
  vẽ dải p25–p75; nhãn nội bộ (`uncited`, `cro`, `Auditor: grounded`) lọt ra giao diện.

## 6. Hai pha (pha 1 đủ để bán)

**Pha 1 — parity nhìn thấy được, không đổi pipeline:**
1. Intake 3 tab + multi-file + XLSX/CSV (D-B3).
2. Lớp **16 câu hỏi IC** dựng từ ReportV2 đã có (D-B4, D-B7); câu thiếu evidence hiển thị
   `missing`/`needs input`, **không bịa**.
3. Decision brief đầu trang (D-B6) + stage timeline khi chạy (D-B5 bản rút gọn: timeline + ETA,
   SSE để pha 2).

**Pha 2 — contract thật (theo Codex):** `BusinessInputSnapshot` + `InvestorIntentSnapshot` versioned,
materiality planner → 13 criteria/52 câu hỏi, lineage trang/section, SSRF policy một chỗ,
SSE resume + durable job.

---

## 7. Phân vai với Codex (đang code cùng vùng)

| Vùng | Ai | Ghi chú |
|---|---|---|
| `BusinessInputSnapshot` / `InvestorIntentSnapshot`, materiality planner, site-crawl lineage, SSRF | **Codex** | Chủ đề review 23/09 của Codex |
| Intake UI 3 tab + parser XLSX/CSV + lớp 16 câu hỏi trên `/analyze` | **Claude** (pha 1) | Chỉ UI + mapping, không đụng contract |
| `analyze-results.tsx`, `smart-intake.tsx`, `pending-intake.ts`, `full-report-panel.tsx` | **Một bên tại một thời điểm** | Báo trước khi mở file |
| Repo `startupvalueindex.com` | Không sửa ở pha 1 | Chỉ đọc để port |

---

## 8. Nghiệm thu

1. `/analyze` nhận ≥5 file, gồm XLSX/CSV, mỗi file ≤25 MB; file lỗi báo rõ trang/lý do (SOT §5 extraction gates).
2. Kết quả hiển thị đủ **16 câu hỏi**, mỗi câu có trả lời theo công ty · evidence trỏ nguồn ·
   trạng thái `answered / partial / missing / conflict` — không câu nào là filler chung.
3. Không hiển thị số không có trong evidence (giữ claim gate hiện tại).
4. Cùng một input cho ra cùng cấu trúc trên `/analyze` và SVI (một pipeline — D-B2).
5. Mất kết nối giữa chừng: quay lại vẫn thấy tiến trình, không mất run.
6. Free-report gate, guest A$3 SKU, review-before-pay không đổi hành vi.
7. Locale theo cookie (**không có route `/vi/analyze`**) — chuỗi mới phải qua i18n catalogue.
