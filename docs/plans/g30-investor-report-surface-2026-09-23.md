# G30 — Investor Report Surface (bản chốt)

**Trạng thái:** PLAN ONLY — chưa code · **Ngày:** 2026-09-23 · **Ưu tiên:** P1 (sau P0 AI routing)
**Thay thế:** hợp nhất và **chốt** các đề xuất rải rác ngày 23/09 trong
[`g30-analyze-pitchbook-parity-2026-09-23.md`](g30-analyze-pitchbook-parity-2026-09-23.md) (giữ làm hồ sơ
điều tra) và [`analyze-report-dashboard-spec.md`](../design/analyze-report-dashboard-spec.md) (giữ làm spec thị giác).
**Merge trong:** `SOURCE-OF-TRUTH.md` §5, §6.7, §10

---

## 1. Mục tiêu một câu

**Bổ sung scope23/09:** tab Files trên BlockID và intake SVI cần nhận ảnh trực tiếp
và đọc ảnh nằm trong tài liệu/slide theo [visual evidence spec](g30-visual-evidence-analysis-2026-09-23.md).
Preview/reorder/rotate, processing states, page/region evidence và EN/VI uncertainty
thuộc intake/report hiện có. Web/PDF/DOCX giữ cùng accepted revision và quyền đọc
ảnh. Đây là requirement mới; không suy source/live support từ thiết kế giao diện.

> Một bản **Trusted Business Report đủ nghĩa cho investor**, đọc được kết luận trong 3 giây,
> mở sâu khi cần — **không thêm bước, không rối màn hình**.

---

## 2. Quyết định chốt

### A. Một report, hai cửa — không bỏ trang nào

| | |
|---|---|
| **A1** | **Một component report dùng chung.** Guest xem tại `/analyze/[id]` (công khai + signed token, giữ nguyên link e-mail đã gửi); người đã đăng nhập xem tại `/workspace/reports/business`. Cùng layout, cùng section, khác nhau chỉ ở quyền và chrome. |
| **A2** | **`/analyze` = intake + report trong MỘT trang.** Nhập xong ở trên, báo cáo dựng ngay bên dưới. Đây chính là chỗ bỏ được "một bước thừa". |
| **A3** | **Bỏ lớp preview trùng lặp** (`analyze-results.tsx`: score ring + radar + gaps nằm trên tài liệu chính). Đây là nguyên nhân thật của cảm giác rối và lặp. |
| **A4** | **Không chuyển guest vào workspace.** Lý do quyết định: workspace **307 → login**, và với plan free nó **khoá 8 chương** sau rail A$3 — tức người dùng sẽ thấy *ít hơn* `/analyze` hiện tại, đúng lúc cần gây ấn tượng nhất. |

### B. Màn hình đầu = quyết định đầu tư (chống rối)

| | |
|---|---|
| **B1** | **Mặc định mở ở "Investor view"** — chỉ 4 khối: **Masthead → Verdict bar → Signal strip → Triptych**. Khoảng 1,5 màn hình. Không đổ 22 trang vào mặt người đọc. |
| **B2** | **Verdict bar trả lời 3 giây:** *đáng giá bao nhiêu · tốt hay chưa · sai ở đâu · thiếu gì.* Định giá là con số lớn nhất trang; chưa đủ điều kiện thì in thẳng "chưa đủ bằng chứng để định giá" + 2 việc cần làm, **không in khoảng giá mờ**. |
| **B3** | **Triptych** Điểm mạnh / Rủi ro / Cần làm rõ — mỗi cột **tối đa 3 mục**, cấu trúc cố định (tiêu đề ≤ 8 từ · một câu bằng chứng có `[ev:id]` · bung tại chỗ). Mobile đảo thứ tự Rủi ro → Điểm mạnh → Cần làm rõ. |
| **B4** | **Phần sâu nằm sau rail/tab, không cuộn dài:** Định giá chi tiết · 8 chiều · 16 câu hỏi investor · Kế hoạch 90 ngày · Bằng chứng. Mở tại chỗ, **một cú nhấp**, không chuyển trang. |
| **B5** | **16 câu hỏi investor** gom **4 nhóm**, mặc định **đóng**, chỉ tự mở các câu trạng thái `Mâu thuẫn`. Chúng là chiều sâu, không phải màn hình đầu. |
| **B6** | Nút **"Xem báo cáo đầy đủ"** mở toàn văn — và đó cũng đúng là nội dung bản PDF. Web = PDF = DOCX. |

### C. Trạng thái và phân tích lại

| | |
|---|---|
| **C1** | **Trạng thái theo từng section:** `đang phân tích` (skeleton đúng hình dạng, không spinner giữa trang) · `thiếu dữ liệu` (CTA cụ thể) · `đã có`. Không nhảy layout khi dữ liệu về. |
| **C2** | **↻ Phân tích lại ở cấp section**, đi qua đúng contract quote/credit §6.7 — không tạo đường chạy thứ hai. (Nút ↻ hiện tại POST thẳng, không quote, không idempotency.) |
| **C3** | **Timeline theo stage + ETA thật** thay câu cứng "Usually 3–8 minutes". Pha 1 dùng đúng cơ chế polling hiện có; **không** làm lại SSE ở pha này. |

### D. Chất lượng nội dung và thiết kế

| | |
|---|---|
| **D1** | **Không thêm palette/font mới.** Dùng nguyên token light template (navy `#1b2a5e`, cyan `#0e7490`, bull/warn/bear) và primitives `Card`/`Table`/`Section`. |
| **D2** | **Mọi trạng thái = icon + chữ + màu**, không bao giờ chỉ màu. Số dùng tabular numerals, cột số căn phải. |
| **D3** | **Thành thật hiển thị ngang hàng con số:** evidence confidence, claim chưa kiểm chứng, `n` của benchmark nằm **cạnh** con số. Chiều chưa đánh giá in `—`, không in 0, không nội suy. |
| **D4** | **Giống research note:** masthead có công ty · sector · stage · ngày · phiên bản methodology · report id; mục đánh số; in ra là tài liệu hợp lệ. |
| **D5** | **Sửa 5 lỗi đang thấy** (kèm bằng chứng): ghép sai cặp tiêu đề/bằng chứng ở "Why back / What weighs against"; mâu thuẫn connector Stripe trong cùng trang; header "no published cohort" nhưng vẫn vẽ dải p25–p75; nhãn nội bộ (`uncited`, `cro`, `Auditor: grounded`) lọt ra giao diện; **Investor Leads + Investor Views** gate theo `shareToken` nên **chưa từng render** trên route founder (`business-report-client.tsx:896,943`). |
| **D6** | **Đưa các phần chỉ có ở workspace vào component dùng chung:** Share with Investor (mint `/tbr/<token>`), export DOCX, sticky TOC, benchmarks, Peer-5 similarity, clarity survey, ActionPlan, link corrections. Ngược lại mang **trạng thái đang chạy** của `/analyze` sang workspace (workspace hiện không poll report đang chạy). |

### E. Đầu vào

| | |
|---|---|
| **E1** | **Nhiều file** (≤5 × 25 MB) thay vì một file, thêm **XLSX/CSV** cho financial model và cap table — trực tiếp cải thiện chất lượng định giá. PDF/DOCX/PPTX đã chạy sẵn. |
| **E2** | Giữ nguyên free-report gate (2 bản đầu miễn phí theo e-mail), guest A$3 SKU, review-before-pay, và **e-mail báo cáo** như hiện tại. |

---

## 3. Những đề xuất đã BỎ (và vì sao)

| Đề xuất trước đó | Quyết định | Lý do |
|---|---|---|
| Chuyển thẳng kết quả vào `/workspace/reports/business` | **Bỏ** | Workspace 307 → login; plan free khoá 8 chương ⇒ người dùng thấy *ít hơn*; route project-scoped không có slot id; gãy link e-mail đã gửi. |
| Bỏ hẳn trang `/analyze` | **Bỏ** | 254 tham chiếu; gãy permalink + link ký HMAC 30 ngày trong mọi e-mail đã gửi, cookie guest, hero handoff, 301 từ `/score` và `/one-click-report`. |
| Nhúng/iframe kết quả SVI vào blockid.au | **Bỏ** | SVI chặn framing hai lớp; không có database; `GET /api/analysis/{runId}` không auth; citation free-string; cắt 8.000 ký tự — trái §5/§8. |
| Lấy `RunState` của SVI làm schema kết quả | **Bỏ** | Ta đã có ReportV2 làm canonical. Chỉ mượn **ý tưởng 16 câu hỏi**, không mượn schema. |
| Hợp nhất pipeline hai site ngay trong đợt này | **Hoãn** | Đường chạy AI thật của SVI chưa được trace (`blockid-client.ts` là dead code). Giữ nguyên tắc §6.7 một contract, nhưng không làm trong P1. |
| Adoption analysis → project | **Hoãn sang pha 2** | Primitive này **chưa tồn tại** (`claimAnalyses` chỉ đóng dấu `user_id`). Pha 1 không cần vì guest ở lại `/analyze`. |
| Port toàn bộ SSE của SVI | **Hoãn sang pha 2** | Pha 1 chỉ cần timeline + ETA trên cơ chế polling sẵn có. |
| Bảng màu / font từ skill design | **Bỏ** | Guard light-template đang enforce một hệ duy nhất. |

---

## 4. Phạm vi UI pha 1 (chưa đồng nghĩa đủ điều kiện bán)

**Review23/09:** phạm vi dưới đây là UI milestone. Controlled-sale vẫn phải đạt
quality, delivery, billing và reliability gates tại SOT§13/S03; xem
[đối chiếu plan và chất lượng report](../reviews/2026-09-23-report-quality-plan-revalidation.md).

1. Component report dùng chung + Investor view mặc định (A1, A3, B1–B4, B6).
2. Triptych + verdict bar theo spec thị giác (B2, B3, D1–D4).
3. Trạng thái từng section + ↻ theo contract + timeline/ETA (C1–C3).
4. Lớp 16 câu hỏi, đóng sẵn, 4 nhóm (B5).
5. Intake nhiều file + XLSX/CSV (E1).
6. Sửa 5 lỗi ở D5.

**Không thuộc pha 1:** hợp nhất pipeline hai site, adoption → project, SSE mới, bỏ `/analyze`.

---

## 5. Phân vai với Codex

| Vùng | Ai |
|---|---|
| `BusinessInputSnapshot` / `InvestorIntentSnapshot`, materiality planner, site-crawl lineage, SSRF | **Codex** |
| Component report dùng chung, Investor view, triptych, trạng thái section, intake đa file | **Claude** |
| `analyze-results.tsx`, `full-report-panel.tsx`, `business-report-client.tsx`, `smart-intake.tsx` | **Một bên tại một thời điểm**, báo trước khi mở |
| Repo `startupvalueindex.com` | Không sửa ở pha 1 |

---

## 6. Nghiệm thu

1. Từ lúc submit tới lúc thấy kết luận đầu tư: **không có bước trung gian nào**, không có lớp kết quả lặp.
2. Màn hình đầu trả lời đủ 4 câu (giá trị · chất lượng · rủi ro · thiếu gì) ở 375 px lẫn 1440 px, không cuộn ngang, nút ≥ 44 px.
3. Mọi phần sâu mở được trong **một cú nhấp**, không chuyển trang, không mất vị trí cuộn.
4. Không mục nào hiển thị số không có trong evidence; chiều chưa đánh giá in `—`; benchmark thiếu `n` thì không vẽ dải.
5. Không nhãn nội bộ lọt ra giao diện; không mâu thuẫn trong cùng trang.
6. Guest vẫn nhận đủ báo cáo miễn phí 2 lần đầu + e-mail + PDF; link e-mail cũ vẫn mở được.
7. Bản in/PDF giữ đúng thứ tự và ngắt trang theo ranh giới khối.
