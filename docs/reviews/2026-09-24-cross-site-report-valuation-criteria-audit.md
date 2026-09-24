# Review BlockID.au và StartupValueIndex.com — 24/09/2026

## Kết luận

Phản ánh của founder có cơ sở: trải nghiệm report hiện tại chưa đạt plan về định giá, bộ tiêu chí tập trung và chiều sâu phân tích. Không phải toàn bộ engine/criteria đã bị xoá. Có ba lớp lỗi riêng: admission chặn tính định giá; dữ liệu chi tiết bị rút gọn hoặc không có trong report cũ; các trang kết quả render những tập nội dung khác nhau.

Đây là review, không phải chứng nhận full-site production hoặc bản sửa. Không thay code ứng dụng, dữ liệu khách hàng, cấu hình hay deploy.

## Phạm vi và bằng chứng

- Đọc hai repository, plan G30, report surface, parity investigation, taxonomy, pipeline, adapter, renderer và lịch sử thay đổi liên quan.
- BlockID HEAD `15c670f14`; manifest live `30da5e778` / v3.33.3, deployed 09:36 UTC. Không có diff `web/src` giữa live SHA đó và HEAD tại lúc kiểm tra.
- SVI HEAD `565250b`; source findings dưới đây không tự chứng nhận tất cả endpoint production chạy đúng SHA đó.
- Mở website công khai bằng web tool; kiểm tra lại BlockID `/tbr/demo` và SVI `/listings/SAAS-KKF` bằng Chromium/Playwright. Bản crawl web tool của demo cũ hơn trang browser hiện tại, nên không dùng crawl đó để kết luận layout live.
- Chạy 3 suite có sẵn: revenue qualification, criterion analysis, valuation unavailable: **26/26 pass**. Đây là xác nhận hành vi hiện tại, không chứng minh đáp ứng yêu cầu sản phẩm.
- Không tạo report AI mới, không dùng phiên đăng nhập khách hàng, không chạy thanh toán/email, không đối chiếu PDF/DOCX của một report thật mới. Chưa có URL/id báo cáo cụ thể founder đang phản ánh nên chưa quy nguyên nhân cho một bản ghi cụ thể.

## Findings theo ưu tiên

### F01 — P0: đường định giá report mới của BlockID bị chặn toàn bộ tại qualification

**Source:** `web/src/lib/report-pipeline/revenue-qualification.ts:33–40`, `gather.ts:844–914`; ghi chú implementation `revenue-qualification.md`.

`TRUSTED_REVENUE_PRODUCERS = []`. Mọi observation đều nhận `trusted_producer_unavailable`, không thể eligible. `gather` chỉ lấy MRR từ observation eligible; khi MRR null, bỏ gọi CFO builder và trả `valuation.status = unavailable`. Do đó đường gather này không thể sinh định giá số với cấu hình source hiện tại, kể cả có connector hoặc founder nêu doanh thu. Không suy rộng sang mọi công cụ định giá độc lập/legacy trong repo.

**Lịch sử:** commit `6d5c03674`, 22/09 07:30, chặn dữ liệu tài chính không đủ provenance. Tài liệu của chính commit nói rõ chưa có Stripe/Xero writer hợp lệ và chưa hoàn tất valuation implementation. Containment có mục đích đúng, nhưng producer nối vào engine vẫn chưa hoàn thành.

**Tác động:** UI gợi ý bổ sung dữ liệu không phản ánh đủ tình trạng hệ thống chưa có đường chấp nhận nguồn. Upload thêm hoặc rerun không tự giải quyết. Explicit zero cũng không qua được gate, khiến pre-revenue mất lối vào phương pháp phù hợp.

**Sửa đúng:** hoàn tất producer tài chính có source/entity/period/currency và quyền sở hữu; hỗ trợ dữ liệu founder-stated với nhãn riêng; admission theo từng phương pháp. Không chỉ thêm chuỗi vào allowlist hoặc bỏ gate. Phân biệt unavailable do dữ liệu với unavailable do hệ thống.

### F02 — P1: SVI giấu section khi định giá vắng mặt

**Source:** SVI `src/app/report/[slug]/page.tsx:146–148,229,252–261`.

Hero lấy `state.valuation?.consensus_mid_aud` và in `—` khi null. Navigation và toàn section Valuation nằm sau điều kiện `state.valuation`. Thiếu kết quả làm mất cả phần giải thích, thay vì giữ section với lý do và yêu cầu bổ sung.

**Live:** listing [SAAS-KKF](https://startupvalueindex.com/listings/SAAS-KKF) hiển thị SVI 135 nhưng Valuation `—`. Listing là bề mặt khác public report; đây là chứng cứ hiển thị thiếu số, không chứng minh cùng nguyên nhân pipeline cho bản ghi này.

**Sửa:** section luôn tồn tại; có trạng thái available / insufficient evidence / not applicable / failed / not run; giữ method applicability, missing inputs, ngày và nguồn. Không dùng số 0 thay null.

### F03 — P1: public report SVI thiếu tập hợp 16 câu hỏi có ở company overview

**Source:** `src/components/company/CompanyOverview.tsx:310–325` render `SixteenAnswers`; `ReportView.tsx:159` render `SavedAnalysisDetails(section="report")`; `src/app/report/[slug]/page.tsx` không render hai component này.

`CriteriaGrid` chỉ được dùng trong `StreamingProgress`. Người dùng thấy 16 tiêu chí lúc chạy, nhưng public report cuối dùng các khối summary/company/metrics/market/team/SVI. Đây là thiếu parity giữa các trang, không phải taxonomy bị xoá.

**Sửa:** một projection tiêu chí dùng chung cho overview, saved report, public report và export, có kiểm soát quyền đối với nội dung private. Có mục lục và trạng thái từng câu ngay cả khi chưa có kết quả.

### F04 — P1: kết quả tiêu chí SVI bị cắt và không mang evidence IDs vào answers

**Source:** `src/lib/pitchdeck/job-runner-v2.ts:480–494`.

`criterionToAnswer` ghép verdict+narrative rồi `.slice(0, 600)` cho mỗi ngôn ngữ và luôn đặt `evidence_ids: []`. UI đọc `state.answers` vì vậy nhận bản tóm tắt cắt cứng và không có liên kết evidence trong trường này. Không khẳng định toàn bộ narrative đã mất khỏi mọi stream/cache; vấn đề xác nhận là projection answers mất thông tin.

**Sửa:** lưu detail nguyên vẹn, summary riêng, evidence references có nguồn, audit status và revision. Kiểm tra parity ngay sau completion, reload, share, export. Với report cũ, chỉ phục hồi từ artifact có lineage hoặc tạo revision mới, không bịa/backfill âm thầm.

### F05 — P1: BlockID còn taxonomy nhưng chưa có ma trận 52 câu hỏi đầy đủ

**Source:** `web/src/lib/evaluation-criteria.ts` có 13 tiêu chí × 4 guiding questions; engine có 8 dimensions. `components/tbr/v2/chapter.tsx:316–350` render bảng criteria theo từng chương, verdict cắt 20 từ ở bảng và detail disclosure khi có `detailedAnalysis`.

`lib/report-v2/criterion-analysis.ts` chỉ giữ narrative khi có đúng một audit, grounded, không hadIssues/uncited/high conflict/degraded. Thiếu result/audit bỏ trường detail; report cũ không có field không được dựng chi tiết tự động. Gating giữ tính trung thực, nhưng người dùng không thấy một danh mục coverage xuyên suốt để hiểu phần nào thiếu và vì sao.

`CriterionResearchCoverage` hiện chỉ có retrieval status và một question tùy chọn; `comparison` cố định `not_assessed`, `businessImplication` cố định `not_recorded`. Đây chưa phải evidence → reasoning → implication cho 52 câu hỏi.

**Sửa:** giữ registry 13/52 đầy đủ và ID ổn định, lưu trạng thái từng câu, map 16 investor questions sang criteria/dimensions. Không gộp 8, 13, 16, 52 thành một con số hoặc thay hệ cũ bằng một scorecard khác. Báo cáo phải hiển thị cả câu thiếu dữ liệu, không chỉ câu có narrative.

### F06 — P1: chính sách đầu vào định giá khác nhau giữa hai site

**Source:** SVI `financial-metrics.ts:84` chỉ đưa 32.000 ký tự đầu vào extraction; `financial-evidence.ts` yêu cầu scalar, metric và AUD rõ trong cùng exact line, loại bare `$`, FX, nhiều measurement chưa chọn kỳ, approximate/range. `job-runner-v2.ts:279` chỉ chạy valuation nếu `hasFinancialMeasurements`.

Strict provenance tránh số sai, nhưng currency ở header, bảng nhiều kỳ, nội dung cuối deck hoặc tài liệu tiếng Việt có thể không được nhận. Đây là giới hạn source đã xác định, chưa đo tỷ lệ false-negative trên corpus thật.

SVI kiểm tra có **bất kỳ** financial measurement; BlockID yêu cầu qualified recurring MRR. Hai phía vì vậy không có cùng definition of eligible valuation. Founder ask/TAM cũng có thể khiến SVI đi vào engine dù không có actual revenue.

**Sửa:** financial evidence contract chung, đọc theo trang/bảng và budget có thông báo coverage; giữ currency/period context; applicability theo phương pháp, không gate chung theo một field.

### F07 — P1: engine SVI có số không đồng nghĩa đã đạt chất lượng định giá theo plan

**Source:** `src/lib/decision/valuation-engine.ts:27–32,59,67–84,125–166,195–200`.

Sector multiples hard-coded; VC method dùng SAM ×1% ×4 /5.38; Scorecard baseline A$4m với hệ số từ số lượng claims; revenue method tự gắn high confidence khi có ARR; kết hợp median của methods không low-confidence. Các mặc định có thể hữu ích cho scenario, nhưng không chứng minh comparables thị trường độc lập hoặc confidence đã hiệu chuẩn.

**Sửa:** phân biệt management ask / scenario / indicative estimate; công khai assumptions, kỳ, nguồn benchmark, cỡ mẫu và applicability. Không tăng confidence chỉ vì số methods hay số claims. Review này đánh giá phần mềm và phương pháp triển khai, không định giá doanh nghiệp.

### F08 — P1: report surface chưa thực hiện đầy đủ bản chốt G30

**Plan:** `docs/plans/g30-investor-report-surface-2026-09-23.md`: A3 bỏ preview trùng; B2 định giá hoặc lý do+2 actions; B4/B5 depth rail và 16 questions; C1 trạng thái section; E1 multi-file và XLSX/CSV.

**Source:** `analyze-root.tsx:887` vẫn compose `AnalyzeResults` trước panel; `full-report-panel.tsx:385` dùng `TbrReportV2`. `report.tsx:129–155` vẫn xếp dashboard, investment view, key points, valuation và các chương liên tục. Cần phân biệt component preview còn tồn tại với việc mọi block đều lặp trong mọi state; chưa xác nhận authenticated render của tất cả state.

**Live demo:** browser hiện tại có định giá và bảng Criteria trong 8 chương; do đó kết luận “UI không hề có valuation/criteria” là sai. Demo dùng fixture đầy đủ không chứng minh report thật có dữ liệu tương đương.

### F09 — P1: vận hành pipeline cải thiện nhưng acceptance nội dung chưa đạt

`docs/reviews/2026-09-24-g33-t16-s2-live.md` ghi nhận 4 canary liên tiếp 0 degraded, chưa claim 5-run acceptance. Hai run cuối grounded share 0.60 và 0.67, dưới KPI 0.85; duration 416s. Đây là bằng chứng lịch sử rollout, không phải phép đo mới trong review này.

Zero degraded nghĩa là không rơi vào fallback chương; không xác nhận 52 câu được trả lời, có định giá, citation entailment đúng hoặc cùng nội dung sau reload/export. Test hiện tại pass cả khi valuation luôn bị chặn; cần positive customer-path acceptance.

### F10 — P2: thông điệp marketing/methodology vượt kết quả có thể đọc

[SVI About](https://startupvalueindex.com/about) mô tả live valuations và blended 4-lens estimate, trong khi listing công khai kiểm tra có dấu `—`; source engine còn preset assumptions và hai site chưa chung admission contract. Cần sửa copy theo năng lực thực tế, đồng thời sửa pipeline; không dùng đổi copy thay cho hoàn thiện tính năng.

## Bộ tiêu chí cần phục hồi thành một trải nghiệm thống nhất

13 tiêu chí canonical: Idea & Innovation; Market; Founder Profile; Code/Git; Website; Team; Customer Size; GTM Strategy; Documents; Data Room; Team Structure; Roadmap; Revenue. Dùng đúng label/ID trong registry khi implement; danh sách này diễn giải nhóm, không tạo taxonomy mới.

Mỗi dòng: criterion/question ID → dimension → trạng thái → kết luận → nguồn → lập luận → ảnh hưởng kinh doanh → dữ liệu thiếu → hành động tiếp theo. Luôn hiện đủ catalog. Số score và confidence tách nhau; unknown không phải 0.

16 investor questions: hiểu doanh nghiệp; vấn đề; thị trường; doanh nghiệp đã thành công; đối thủ tốt hơn; khác biệt; runway; unit economics; bằng chứng claims; pháp lý/governance; valuation ask; ownership/dilution; anti-thesis; diligence; câu hỏi founder; monitoring. Đây là lớp trình bày investor, phải map sang 13 criteria/52 questions, không thay chúng.

## Thứ tự sửa và nghiệm thu đề xuất trong backlog hiện có

1. **Khôi phục đường định giá hợp lệ:** producer + per-method applicability; report có input hợp lệ phải ra được method/result; thiếu input ra lý do cụ thể. Pre-revenue có nhánh phù hợp, không ép mọi công ty phải có MRR. Phân biệt lỗi hệ thống với thiếu dữ liệu doanh nghiệp.
2. **Dừng mất nội dung:** lưu full criterion detail và evidence references; same revision sau complete/reload/share/export. Thử một narrative >600 ký tự để phát hiện cắt cụt; giữ báo cáo trước khi retry thất bại.
3. **Một tập hợp criteria:** đủ 13/52, mapping 16 questions, không biến mất do null hoặc audit withheld. Bản public giữ đúng quyền dữ liệu nhưng không bỏ catalog/trạng thái.
4. **Một report surface:** valuation và missing inputs nhìn thấy ngay, summary ngắn, depth một lần mở; chia sẻ cùng projection thay vì sao chép layout lệch nhau.
5. **Positive E2E acceptance:** deck revenue AUD đủ kỳ; pre-revenue rõ ràng; financial table có currency header; USD có/không FX hợp lệ; nguồn mâu thuẫn; tài liệu không có tài chính; report legacy; provider timeout/retry. Mỗi fixture kiểm tra expected applicability và nội dung, không chỉ HTTP 200/test pass.
6. **Chất lượng trước kết luận done:** coverage 52 câu, citation/source fidelity, meaningful investor implications, định giá giải thích được, report mới/reload/public/export nhất quán; sau đó đối chiếu copy methodology/pricing.

Không tạo goal/backlog mới cạnh tranh G30. Gắn F01/F06/F07 vào V01–V03; F03–F05 vào A01–A03/F02–F04/U02; parity/UI vào U07 và report-surface; content acceptance vào Q02/S03.

## Những phần chưa xác nhận

- Báo cáo cụ thể của founder thuộc site/route/revision nào và có financial inputs nào.
- Tỷ lệ report production thực sự thiếu valuation/detail; review không quét nội dung private hàng loạt.
- Full EN/VI/mobile/PDF/DOCX parity của một report thật mới; chỉ browser spot-check trang public và focused tests nêu trên.
- Independent valuation calibration, paid research publication, billing/refund lifecycle và toàn bộ website ngoài luồng report không được chứng nhận bởi review này.
