# Review BlockID.au — source, chất lượng kết quả và đồng bộ design

Ngày: 22/09/2026. Source HEAD quan sát: `bb0fb53af`; package `3.27.2`.

**Kết luận:** nền tảng có nhiều thành phần kiểm soát chất lượng và bộ test đáng kể, nhưng còn lỗi ở việc gắn bằng chứng, tính nhất quán giữa kết quả streaming và bản lưu, xử lý deck mới và trạng thái giao báo cáo. Ưu tiên sửa tính đúng của kết quả trước khi mở rộng tính năng hoặc thay đổi diện mạo.

## Phạm vi và bằng chứng

- Khảo sát cấu trúc repository: `web` là ứng dụng chính; `services` và một phần `chain` được tài liệu kiến trúc mô tả là hướng tách dịch vụ/scaffolding, không coi mặc nhiên là production runtime.
- Inventory: 382 `page.tsx`, 682 API `route.ts`, 5.297 file dưới `web/src`. Đây là review theo rủi ro và luồng dữ liệu, **không phải chứng nhận đã đọc từng dòng của toàn bộ repository**.
- Đọc sâu pipeline báo cáo, citations/auditor, scoring/analyzer, cache, guest delivery, ReportV2 và UI primitives/theme.
- `npm run typecheck`: đạt, exit 0.
- `npx vitest run src/lib/report-pipeline src/lib/report-v2 src/lib/svi src/lib/analyzer src/design --maxWorkers=2`: **81 file, 2.491 test đạt**, 46,21 giây. Không chạy toàn bộ test repository.
- Hai tình huống gắn citation sai được tái hiện bằng hàm thật, dữ liệu giả, không gọi AI hoặc ghi database.
- Kiểm tra trình duyệt public: homepage, `/analyze`, `/tbr/demo`, `/showcase/blockid`, `/showcase/blockid/report`; desktop 1440×1000 và mobile 375×812 cho các màn hình mẫu. `/tbr/demo` và `/showcase/blockid` có `scrollWidth = 375` tại viewport 375.
- Chưa kiểm thử tài khoản đăng nhập, thanh toán, gọi AI tính phí, email thật, hay render/so sánh PDF mới. Không thay đổi application source hoặc deploy. Có sẵn nhiều thay đổi trong working tree trước review; chúng được giữ nguyên.
- Source local và website live cần được coi là hai snapshot riêng; chưa chứng minh chúng cùng build SHA. Các quan sát browser dưới đây chỉ áp dụng bản live tại thời điểm kiểm tra.

## Các phát hiện cần sửa

### Quan sát đầu ra thật — báo cáo showcase, snapshot `136a49f5`

Đọc trực tiếp `/showcase/blockid/report` lúc khoảng 01:37 UTC ngày review; trang ghi generated 21 Sept 2026. Không dùng báo cáo demo để đưa ra các nhận xét sau:

- SVI index **135**, composite **87/100**, nhưng evidence confidence **0%**, conviction low và verdict **D — Insufficient evidence**. Nhiều dimension đạt 100/100. Các chỉ số có thể khác nghĩa, nhưng cần giải thích ngay tại điểm đọc vì hiện dễ bị hiểu thành mức tin cậy cao.
- Phần Investment view vẫn có **“Analyst synthesis · Back with conditions”**, trong khi verdict chính không đủ bằng chứng. Đoạn summary nói “robust governance”, còn next actions yêu cầu xác minh ABN và thêm shareholders vào cap table.
- Summary nói gross margin “nearly 100%”; bảng Unit economics ghi **72%**, CAC **A$500**, Rule of 40 **44**, trong khi risk nói channel CAC chưa xác minh.
- Có điểm tích cực: report công bố confidence thấp, valuation directional, methods không chạy vì thiếu revenue, nguồn founder-stated và hạn chế của backtest. Tuy nhiên những disclosure này chưa reconcile hết narrative và metric card.

### 0a. P1 — Unit economics đưa fallback lên báo cáo như dữ kiện của startup

Vị trí: `web/src/lib/agents/cfo-valuation.ts:842`, `:907`; `web/src/lib/report-pipeline/valuation-chapter.ts:437`; `web/src/lib/report-v2/valuation-view.ts:125`; `web/src/components/tbr/v2/valuation.tsx:195`.

Engine dùng `Math.max(500, input.cacAud ?? perCustomer * 2)`, `input.grossMarginPct ?? 72`, rồi tính Rule of 40 từ các giá trị này. View chỉ format thành metric, không mang nguồn/assumption label. Khi monthly growth là 0 và gross margin thiếu, công thức cho đúng **44**, khớp bộ số 500/72/44 đang hiển thị trên showcase. Chưa đọc input riêng tư của snapshot nên không khẳng định nguồn gốc từng field của snapshot, nhưng đường đi fallback không có provenance đã xác nhận trong source. `Math.max(500, ...)` còn nâng cả CAC thực được cung cấp dưới A$500 lên A$500.

**Sửa:** dữ liệu không có thì hiện “chưa đo”; giữ giả định trong scenario riêng và gắn source/status. Không clamp một giá trị CAC được xác minh thành benchmark. Không tính chỉ số dẫn xuất như dữ kiện thật khi đầu vào là assumed/missing.

**Kiểm chứng:** input không có CAC/gross margin phải không tạo factual metric 500/72/44; CAC xác minh A$100 phải giữ A$100. Kiểm tra narrative và bảng số có cùng nguồn và cách làm tròn.

### 0b. P1 — Kết luận chính và narrative chưa được reconcile về cùng điều kiện bằng chứng

Vị trí: `web/src/lib/report-v2/investment-view.ts:417`; `web/src/components/tbr/v2/investment-view.tsx:61`, `:159`; `web/src/lib/report-pipeline/orchestrator.ts:1002`.

View chủ động giữ verdict AI bất đồng với rubric dưới nhãn Analyst synthesis. Structured summary được render riêng; audit pipeline đưa executive thesis vào danh sách kiểm tra, không đưa toàn bộ structured summary/whyBack vào cùng một pass. Vì vậy chỉnh thesis hoặc verdict band không đủ bảo đảm các đoạn còn lại đã nhất quán.

**Ảnh hưởng quan sát thực tế:** report thiếu bằng chứng vẫn có recommendation “Back with conditions” và lời khẳng định mạnh ở các phần khác. Việc đổi nhãn thành analyst synthesis chưa giải thích được đây là giả thuyết chưa đạt điều kiện để dùng.

**Sửa:** audit toàn bộ nội dung thực sự render, bao gồm structured executive; enforce một final recommendation contract. Khi evidence gate không đạt, nhận định AI lạc quan phải được đặt dưới điều kiện giả định rõ ràng và không xuất hiện như recommendation thứ hai.

**Kiểm chứng:** fixture verdict D + structured label back/back_with_conditions phải render một kết luận có điều kiện bằng chứng nhất quán; gross-margin claim trong summary phải khớp bảng hoặc được gắn nhãn giả định/xung đột.

### 1. P1 — Gắn citation dựa vào con số có thể biến nhận định sai thành “có bằng chứng”

Vị trí: `web/src/lib/report-pipeline/auto-cite.ts:152`, `:193`; `agent-dispatcher.ts:685`; `web/src/lib/report-v2/grounding.ts:56`.

`chooseItems()` yêu cầu trùng con số, nhưng với số được xếp loại strong thì không bắt buộc trùng chỉ tiêu. Các `topicRe` chỉ bảo vệ một số nhóm bằng chứng đặc biệt. Ngoài ra, `autoCite()` đưa quote do chính model viết vào nguồn đối chiếu khi ID hợp lệ; không kiểm tra quote đó có nằm trong tài liệu gốc. `adaptPayload()` cũng lọc citation theo ID. Ở read-time, criterion chỉ cần có citation là được đánh dấu grounded.

Tái hiện bằng hàm thật:

```text
Evidence: GA4 sessions — 3,302 website sessions
Claim:    We have 3,302 paying customers.
Output:   We have 3,302 paying customers [ev:ev-1].
Result:   added=1, uncited=0

Evidence: Founder evidence — No revenue data provided
Model quote, cùng evidence ID: MRR is AUD 50000
Claim:    MRR is AUD 50000.
Output:   MRR is AUD 50000 [ev:ev-2].
Result:   added=1, uncited=0
```

**Ảnh hưởng:** số lượng citation và tỷ lệ grounded có thể cao hơn chất lượng bằng chứng thực tế. Đây là lỗi cơ chế đã tái hiện; không có nghĩa mọi báo cáo đã phát hành đều chứa lỗi này.

**Sửa:** chỉ cho quote được xác minh với source tham gia đối chiếu; khớp metric + entity + thời kỳ + đơn vị tiền/số lượng; citation chưa xác minh không nâng confidence. Tách “có dẫn nguồn”, “đã xác minh nội dung”, “giả định được công bố” thành ba trạng thái.

**Kiểm chứng:** regression cases sessions→customers, burn→MRR, USD→AUD, kỳ trước→kỳ hiện tại, quote tự bịa có ID đúng, ID không tồn tại trên criterion. Tất cả phải bị giữ ở unverified.

### 2. P1 — Streaming và dữ liệu legacy giữ bản trước audit/consistency gates

Vị trí: `web/src/lib/report-pipeline/orchestrator.ts:653`, `:676`, `:705`, `:718`; `run-report-pipeline.ts:188`; `web/src/components/svi/svi-stream-analysis.tsx:1526`, `:1580`.

Pipeline emit `dimension_complete`, `criteria_synthesis` và executive summary trước audit/gates. `toWireEvents()` tạo legacy score/markdown ngay lúc đó. Gates sau đó có thể thay score, loại revenue claim và bổ sung blockers, nhưng không phát lại document cuối. Client xử lý `done` chỉ cập nhật cờ hoàn thành/thời gian. Persistence/cache còn sử dụng `state.dimResults` đã tạo trước gates.

**Ảnh hưởng:** người dùng có thể thấy score hoặc lời kết luận cũ trong màn hình phân tích/cache, trong khi `reportV2` đã được sửa. Khi một chapter được reconcile về deterministic score, card streaming vẫn có thể giữ score trước reconcile.

**Sửa:** giữ streaming là preview; sau audit phát `report_finalized` mang document đã kiểm tra. Tạo mọi legacy projection, cache, snapshot và email từ document cuối cùng đó.

**Kiểm chứng:** ép chapter score khác deterministic quá tolerance và một TRE claim thiếu evidence; so sánh score/verdict/citations ở final SSE, legacy snapshot, ReportV2 và cache replay.

### 3. P1 — Upload deck mới vẫn có thể dùng scoring của analysis cũ

Vị trí: `web/src/lib/report-pipeline/run-report-pipeline.ts:455`, `:470`, `:517`.

Khi đã có account/analysis, code thay `latestAnalysis.raw_input` bằng deck mới nhưng giữ `ctx.sviAnalysis` và criteria context từ lần load trước. Chỉ nhánh chưa có analysis mới tạo `syntheticDeckContext()` và score deck mới.

**Ảnh hưởng:** narrative đọc deck B nhưng điểm, stage và các dữ kiện tính toán có thể thuộc analysis A. Consistency gate sau đó có thể kéo score về dữ liệu A thay vì deck B. Test hiện tại cho deck chỉ xác nhận raw text đổi, chưa khẳng định score được tính lại.

**Sửa:** xây context có version cho mỗi input; recompute signals/scoring/criteria khi deck đổi, đồng thời định nghĩa rõ evidence dự án nào được phép bổ sung.

**Kiểm chứng:** account có analysis A pre-revenue, upload deck B có input khác rõ rệt; orchestrator phải nhận scoring của B, không phụ thuộc việc account đã từng chạy analysis.

### 4. P1 — Cache deck thiếu context và làm mất trạng thái chất lượng

Vị trí: `web/src/lib/report-pipeline/run-report-pipeline.ts:450`, `:477`, `:494`, `:543`.

Cache đọc theo hash deck + user và kiểm tra pipeline version, nhưng không tách project, locale, tier, evidence version. Hash được tính sau khi cắt deck còn 8.000 ký tự. Cache hit trả `report: null`, `chapters: []`, không có valuation/executive document, và luôn báo `degradedSections: []`, `deadlineHit: false`.

**Ảnh hưởng:** cùng user đổi ngôn ngữ, bổ sung bằng chứng hoặc đổi project/tier có thể nhận lại kết quả không phù hợp; hai deck khác phần cuối cũng có thể dùng cùng cache. Báo cáo từng degraded mất trạng thái đó khi replay. Upsert conflict chỉ theo `deck_hash` còn khiến các user có cùng deck có thể thay phiên ghi đè một cache entry; lookup user hiện có chặn việc đọc chéo trực tiếp.

**Sửa:** hash toàn bộ input; key bao gồm owner/project, locale, tier, score/pipeline version và fingerprint evidence; lưu immutable final ReportV2 cùng quality metadata, rồi derive wire view khi replay.

**Kiểm chứng:** đổi từng yếu tố phải cache miss; unchanged context phải cho cùng kết quả và cùng trạng thái degraded/quality.

### 5. P1 — Guest flow có thể giao báo cáo dù scrape/PDF thất bại

Vị trí: `web/src/lib/guest-analysis/runner.ts:274`, `:284`, `:311`, `:531`, `:539`, `:547`; `web/src/lib/email.ts:2867`.

- Scrape lỗi trả cấu trúc rỗng, nhưng `rawText` vẫn chứa URL. URL dài hơn 20 ký tự vượt kiểm tra input tối thiểu và đi vào scoring dù không lấy được nội dung website.
- PDF/render/storage lỗi chỉ được log, sau đó vẫn ghi `status: delivered`.
- Nếu tạo signed URL lỗi, storage key được đặt vào `reportPdfUrl`; email template dùng trực tiếp làm href.

**Ảnh hưởng:** đơn đã trả tiền có thể nhận phân tích từ riêng URL, không có PDF, hoặc nút tải không dùng được. “Delivered” không phản ánh đầy đủ sản phẩm đã giao.

**Sửa:** kiểm tra chất lượng nội dung trích xuất độc lập URL; giữ trạng thái `needs_input`/retry khi không có nội dung. Tách analysis complete, PDF ready, email delivered. Lưu storage key riêng, cấp download URL qua endpoint khi đọc; không đưa key vào href.

**Kiểm chứng:** scrape timeout/403, tài liệu rỗng, render lỗi, upload lỗi, signed URL lỗi, email lỗi; UI và trạng thái order phải mô tả đúng phần đã/ chưa hoàn thành.

### 6. P2 — Website analyzer tạo điểm giả định nhưng gắn nhãn Lighthouse

Vị trí: `web/src/lib/analyzer/website.ts:52`, `:132`, `:149`; `score.ts:136`; `types.ts:19`.

Khi PageSpeed không khả dụng, heuristic vẫn sinh perf/SEO/a11y từ HTML. Nếu không fetch được HTML, baseline vẫn cho SEO 60 và accessibility 70; size HTML rỗng cũng được cộng performance. Kết quả không có trường nguồn đo, nhưng rationale gọi các chỉ tiêu là “Lighthouse performance/SEO/accessibility”.

**Ảnh hưởng:** trạng thái không đo được bị trình bày như một phép đo; điểm này còn có thể ảnh hưởng technical score và valuation adjustment.

**Sửa:** giữ `null/not_assessed` khi fetch thất bại; thêm `measurementSource`, `measuredAt`, `fetchStatus`; heuristic phải được ghi rõ là estimate và không mang nhãn Lighthouse. Phân biệt unknown với score 0.

### 7. P2 — Hai Button API tiếp tục tạo hai ngôn ngữ thiết kế

Vị trí: `web/src/components/ui/button.tsx:6`, `:13`, `:61`; `web/src/components/marketing/template/ui.tsx`; `web/src/components/marketing/template/primitives.ts:79`.

Button cũ mặc định brand blue, `rounded-2xl`, glow/scale và có size 32/36px. Button template dùng semantic action navy, `rounded-lg`, minimum 44px và có loading contract. Có 53 file app/components tham chiếu đường dẫn Button cũ; đây là thống kê import, không khẳng định cả 53 màn hình đều hiển thị sai vì một số có thể override variant.

**Sửa:** một implementation dùng semantic tokens; wrapper tương thích cho API cũ; migrate default và các CTA quan trọng có visual check. Thống nhất loading, disabled, error, focus và icon-button semantics.

### 8. P2 — Tài liệu design chưa có một nguồn chuẩn rõ ràng

Vị trí: `web/design-system/blockid/MASTER.md`; `docs/design/unicorn-template.md`; `web/src/app/globals.css`.

`MASTER.md` vẫn hướng dark/teal, max-w-7xl và CTA `/score`. Template v2 chỉ định light/navy, max-w-6xl và CTA `/analyze`. CSS giữ nhiều thế hệ palette. Tài liệu template cũng mô tả nav/copy khác navigation và headline quan sát được trên live.

**Ảnh hưởng:** người hoặc agent làm màn hình mới có thể tuân thủ hai tài liệu hợp lệ nhưng tạo giao diện khác nhau. Các guard về màu không đảm bảo hierarchy, content density hoặc data semantics đồng nhất.

**Sửa:** đánh dấu tài liệu cũ superseded và trỏ tới bản duy nhất; cập nhật bản chuẩn theo quyết định sản phẩm đang dùng; kiểm tra tokens/components và screenshot của các journey chính. Việc giữ alias CSS để tương thích có thể tiếp tục, nhưng không dùng để tạo component mới.

## Design cần đồng bộ cụ thể

| Hạng mục | Chuẩn đề xuất dựa trên template hiện có |
|---|---|
| Màu và bề mặt | White/soft-grey; navy cho CTA chính; cyan-muted cho accent; status có icon + label, không chỉ màu |
| Typography | Inter cho nội dung; mono cho số liệu cần so sánh; một thang heading/body/caption; tách độ dày báo cáo khỏi hero marketing |
| Component | Một Button, Field, Card, Badge, Table, Modal; chung loading/empty/error/partial/complete |
| Layout | Chung gutter và spacing scale; container có variant rõ cho marketing/workspace/report; một hierarchy CTA theo persona |
| Thuật ngữ | Một tên chính cho sản phẩm báo cáo; giải thích quan hệ giữa SVI, readiness, verdict và evidence confidence |
| Score | Cùng scale, label, version và timestamp trên stream/dashboard/report/PDF/email; unknown không hiển thị thành 0 |
| Evidence | Verified, founder-reported, estimated, missing, conflicting; xem được nguồn, thời kỳ và lý do confidence |
| Kết luận | Nêu nhận định, bằng chứng chính, điều kiện còn thiếu và hành động tiếp theo trước phần giải thích dài |
| Báo cáo | Một final ReportV2 dùng chung web/PDF/email; cùng snapshot ID và không đổi số khi đổi surface |
| Ngôn ngữ | Tách UI locale khỏi nội dung AI; cache phải tôn trọng locale; ghi rõ phần chưa dịch |

Nhận xét quan sát: homepage và analyze đã có nền sáng, navy CTA, khoảng trắng và chữ dễ đọc; không cần khởi động một palette mới. Trên mobile `/tbr/demo`, viewport đầu chủ yếu dành cho giới thiệu dài và CTA, chưa thấy dashboard kết quả; nên rút giới thiệu và đưa phần tóm tắt báo cáo lên sớm. Cookie panel chiếm đáng kể vùng nhìn; cần kiểm tra thao tác khi panel mở. Đây là đề xuất UX từ ảnh mẫu, không phải kết luận mọi trang bị che thao tác.

Browser ghi nhận hai CSP inline-script errors trên các trang đã mở. Các trang vẫn render và hydrate đủ để tương tác/navigate; chưa xác minh script bị chặn phục vụ chức năng gì. Cần kiểm tra HTML/hash manifest/deployed SHA trước khi gọi đây là lỗi chặn người dùng; không nới CSP theo suy đoán.

## Đo chất lượng kết quả: phần còn thiếu

Bộ test đang bảo vệ nhiều contract, nhưng hai repro citation vẫn lọt. Test đạt không tương đương factual accuracy đạt. Nên bổ sung bộ input chuẩn có người kiểm duyệt và oracle cho từng claim:

- Dữ liệu đủ, thiếu, mâu thuẫn, website không truy cập được, deck chỉ có ảnh, thông tin ở cuối deck, bản EN/VI.
- Cùng input/evidence/version: điểm deterministic phải giống nhau qua mọi surface; output AI không được bổ sung số liệu ngoài nguồn.
- Đo riêng: extraction accuracy, factual precision, citation correctness, missing-data honesty, cross-surface parity, completion/delivery rate và action usefulness.
- Phân biệt calibration score với khả năng dự báo kết quả kinh doanh. `web/content/reports/svi-backtest-latest.json` tự khai `rank_calibration_only`, N=49, chỉ 1 pre-seed; pooled valuation rho=0,9366 không chứng minh độ chính xác định giá cho startup mới. Series-A round rho=0,0917 với N=16 cho thấy cần xem theo stage thay vì chỉ số pooled.
- Lưu bộ kết quả benchmark theo model/prompt/pipeline version; thay provider chỉ được rollout khi không làm giảm factual/citation precision trên bộ chuẩn.

## Thứ tự thực hiện

1. **P1 chất lượng:** bỏ factual metrics từ fallback, reconcile recommendation/narrative; sửa citation verification; recompute context khi deck đổi; finalize report sau gates; cache theo context đầy đủ; sửa guest extraction/delivery.
2. **P2 đồng bộ:** hợp nhất Button/tokens/docs và trạng thái bằng chứng; thống nhất document contract giữa các loại báo cáo.
3. **Kiểm chứng sản phẩm:** chạy golden dataset, so sánh web/PDF/email, kiểm tra authenticated journeys và failure states; bổ sung visual regression ở 375/768/1440px.

Ảnh review: `output/playwright/review-home-desktop.png`, `review-report-desktop.png`, `review-report-mobile.png`, `review-analyze-mobile.png`. Log test/typecheck của lượt review nằm ở `/tmp/blockid-review-tests.log` và `/tmp/blockid-review-typecheck.log`.
