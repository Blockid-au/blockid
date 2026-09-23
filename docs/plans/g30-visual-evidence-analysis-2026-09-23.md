# G30 — Phân tích hình ảnh trong tài liệu, slide và ảnh upload

> **Quyết định founder23/09, cập nhật mới nhất:** tối đa **US$0.50/report** cho tổng AI chữ + ảnh, chỉ DeepInfra; không provider trả phí khác. Founder yêu cầu bỏ test và triển khai xong deploy live ngay. Các câu chưa chốt budget/đợi benchmark trước activation bên dưới là lịch sử bị thay bởi chỉ đạo này; quality acceptance vẫn là mục tiêu chưa chứng nhận.
> **Implementation `6cb2d2db7` (BlockID), `1a1fd3f` (SVI):** shared durable spend ledger, exact vision model `Qwen/Qwen3-VL-235B-A22B-Instruct`, structured unverified observations; direct PNG/JPEG/WebP, tối đa3 trang/ảnh mỗi tài liệu trong55s. PDF render theo trang; PPTX/DOCX chỉ đọc ảnh nhúng, chưa render đầy đủ layout slide. SVI giữ số liệu tài chính từ native text riêng, không dùng OCR/vision chưa xác minh làm financial inputs. Đã live23/09,10:29UTC: BlockID4120/warm4119, SVI4207/warm4206; [receipt](../reviews/2026-09-23-deepinfra-visual-budget-live.md). Không suy operational rollout là semantic quality certification.


Ngày: 23/09/2026. Trạng thái: **REQUIREMENT ADDED / CHƯA IMPLEMENTED HOẶC LIVE VERIFIED**.
Theo yêu cầu founder, áp dụng cho **blockid.au và startupvalueindex.com**.
Đây là đặc tả thành phần của [SOT G30 §5.1](SOURCE-OF-TRUTH.md#51-phân-tích-hình-ảnh-trên-blockid-và-startup-value-index), không tạo backlog độc lập.

## 1. Kết quả cần đạt

Report phải sử dụng được thông tin nằm trong ảnh, không chỉ text layer: biểu đồ
doanh thu/traction, bảng tài chính chụp màn hình, sơ đồ sản phẩm/quy trình,
ảnh giao diện, competitive matrix và scan. Áp dụng cho ảnh trong PDF/PPTX/DOCX,
slide được render và ảnh upload trực tiếp hoặc kèm tài liệu/text trong cùng run.
Đầu vào khác nhau đi vào cùng evidence/criteria/final-revision contract.

Phân tích phải phân biệt điều ảnh thể hiện, claim của người cung cấp và suy luận
của hệ thống. Screenshot dashboard không tự chứng minh doanh thu đã kiểm toán;
logo không tự chứng minh quan hệ khách hàng; mockup không chứng minh sản phẩm đã
vận hành. Không suy năng lực founder từ ngoại hình hoặc chất lượng thiết kế deck.

## 2. Intake và extraction

- Pha đầu nhận JPEG, PNG, WebP trực tiếp; PDF/PPTX/DOCX giữ format hiện có và thêm
  đường đọc ảnh. HEIC/TIFF/SVG/GIF và format khác chỉ mở sau khi có converter,
  giới hạn và acceptance riêng; UI/API phải nêu rõ unsupported, không nhận rồi bỏ.
- Cùng tab Files: chọn file, kéo thả và dán ảnh từ clipboard khi trình duyệt hỗ trợ;
  preview, xoay ảnh, sắp thứ tự, đặt mô tả tùy chọn và xóa trước khi submit.
  Ảnh trực tiếp tính vào giới hạn file của intake. Crop/rotate tạo derivative có
  lineage; giữ tham chiếu original khi được quyền lưu, không sửa nguồn âm thầm.
- Kiểm MIME/decoded content, kích thước byte/pixel sau giải nén, số trang/slide,
  tổng pixel, render timeout và tổng tài nguyên của job. Trần số cụ thể phải chốt
  bằng load/cost test trước mở; không coi giới hạn file 25 MB đủ bảo vệ rendering.
  Parser/converter bị cô lập, không thực thi macro hoặc tự fetch external assets.
- Đọc native text trước; render trang/slide để giữ vị trí nhãn, legend, trục,
  callout và quan hệ giữa các thành phần. PDF có text vẫn có thể có chart cần
  vision; không dùng điều kiện “có text thì bỏ toàn bộ ảnh”.
- Phân loại vùng text/table/chart/diagram/product screenshot/decorative. OCR phục
  vụ chữ; vision phục vụ ngữ nghĩa và bố cục. Bảng có native cells ưu tiên dữ liệu
  gốc; đối chiếu ảnh khi cần. Crop độ phân giải cao chỉ cho vùng cần đọc kỹ.
- Mọi trang và vùng phát hiện có trạng thái: extracted, partial, unreadable,
  skipped_decorative, budget_blocked, unsupported hoặc failed, cùng lý do.
  Không âm thầm bỏ trang cuối hoặc biến ngân sách hết thành “không có dữ liệu”.
  Nội dung trọng yếu không đọc được phải dẫn tới needs_input/partial theo F01/F02.

## 3. Evidence, kiểm chứng và report

- Versioned visual evidence gắn site/tenant/business/input snapshot/revision,
  original file hash, page/slide/image ID, region ID, bbox và coordinate space,
  rotation/crop transform, derivative hash, extractor/model/prompt version.
  Metadata không đồng nghĩa có quyền giữ original; nguồn không còn thì ghi rõ.
- Lưu riêng OCR text, observed visual facts, interpreted claims và uncertainty;
  model confidence không thay verification. Trích dẫn ảnh dẫn tới đúng trang/vùng
  của snapshot, không chỉ tên file và không dùng caption AI như quote nguồn gốc.
- Chart/table giữ series, axis, legend, unit/currency, scale/log scale, kỳ dữ liệu,
  actual/forecast và footnotes. Số chỉ ước lượng từ vị trí pixel phải ghi khoảng/
  approximate; không biến thành exact financial input. Không đọc được thì abstain.
- Reconcile native text/OCR/vision với file khác: giữ cả nguồn khi mâu thuẫn,
  phân biệt duplicate với independent corroboration. Text và ảnh của cùng claim
  không được tính thành hai bằng chứng độc lập hoặc tăng điểm hai lần.
- Map accepted claims về13 criteria/52 questions và lớp16 investor questions hiện
  có. SVI score và valuation chỉ nhận evidence đủ điều kiện theo methodology;
  không tăng điểm do upload nhiều ảnh, ảnh đẹp hoặc model diễn đạt tự tin.
- Web mở thumbnail/page/region và transcript dễ đọc; PDF/DOCX có source locator,
  limitation và permitted preview khi phù hợp. Saved/share/export dùng cùng final
  revision; quyền riêng tư quyết định được thấy ảnh gốc hay chỉ kết luận đã cho phép.
  EN/VI thể hiện rõ “Quan sát từ ảnh”, “Ước lượng”, “Chưa đọc được”, “Cần xác minh”.

## 4. AI chính từ DeepInfra và kiểm soát chi phí

DeepInfra là primary cho vision cũng như report. **Không mặc định text ladder
V3.2/Qwen3-235B/V4-Flash có image-input support.** Tạo role/policy vision riêng;
chỉ pin exact model ID sau khi xác minh official capability, endpoint/account
access, image limits, giá hiện hành và benchmark tài liệu thật được phép dùng.
Spec này chưa chọn model hoặc xác nhận giá, không tự bật provider trả phí khác.

Pipeline đề xuất: local native extraction/OCR và dedupe → chọn vùng liên quan
→ vision đã qualified → structured evidence validation → synthesis/audit hiện có.
Giữ page overview cho context; không gửi lại cả deck tới từng analysis agent.
Escalate vùng khó/material sang model vision mạnh hơn chỉ trong budget; nếu không
có model qualified hoặc provider lỗi, giữ extraction đã có và báo limitation.

Cache theo content hash + transform/resolution + extractor/model/prompt policy
trong đúng permission scope; không dùng cache xuyên tenant để lộ dữ liệu.
Giới hạn image count/pixels/calls/retries/concurrency/time theo job; ghi cả render,
OCR, image/input/output usage, failed/unknown attempts và cache hits. Reserve chi
phí trước request theo cơ chế tính phí thực của model; không giả định ảnh chỉ tốn
text tokens. Đo **chi phí/report đạt chuẩn**, p50/p95 latency và completion rate;
không chọn model chỉ vì token rẻ. Benchmark trả phí vẫn cần ngân sách đã cấp.

## 5. Quyền dữ liệu và vận hành hai site

Ảnh và OCR đều là untrusted evidence; prompt/instruction ẩn trong ảnh không được
đổi rubric, gọi tool, lộ dữ liệu hoặc thành user intent. Không gửi nội dung ảnh
private vào search query. Provider chỉ nhận dữ liệu theo processing/retention
authority hiện có; xóa metadata không cần thiết khỏi derivative gửi inference.

Original, thumbnails, crops, OCR, embeddings/cache và exports phải nằm trong
retention/erasure/revocation contract; không mặc định bật full-input retention
đang default-off ở SVI. Cross-site identity không tự cấp quyền đọc ảnh hoặc ví.
Mỗi site có adapter, permission checks, feature flag, rollout/rollback và evidence
riêng; không cần iframe hoặc rewrite schema report của SVI để dùng chung contract.
Lỗi vision/retry/deploy giữ report tốt trước đó; checkpoint vùng đã hoàn tất và
idempotent publication/billing theo O08/F02/B02, đọc lại ảnh/kết quả không charge mới.

## 6. Mapping vào queue G30 và thứ tự triển khai

**Chỉ đạo founder bổ sung23/09: triển khai tới đâu, deploy live tới đó.** Chia
thành các phần hoàn chỉnh, deploy ngay mỗi phần đủ dependencies/release gates,
không đợi đủ mọi modality hoặc cả hai site cùng lúc. Mỗi site kiểm tra sau deploy,
ghi serving SHA, scope thực sự bật và rollback riêng. Foundation chưa qualified
có thể ship dưới flag tắt; không gọi đó là khả năng phân tích ảnh đã hoạt động.
Ngân sách inference và các gate còn thiếu vẫn giữ nguyên.

| Bước | Work items hiện có | Kết quả phải có |
|---|---|---|
| Contract + corpus | E01/Q01/T01 | Visual locators/states/permissions, source-backed EN/VI fixtures và compatibility cho report cũ |
| Extraction + intake | F01/E02/U07 | Direct images, embedded images và slide rendering; text/OCR/vision reconciliation, bounded resources |
| Provider qualification | O01/O02/Q02 | Exact DeepInfra vision model/config, budget/usage evidence, timeout/fallback tests |
| Analysis + publication | E03/A01–A03/V01–V03/F02–F03 | Verified visual claims, no double count, conditional financial inputs, immutable accepted revision |
| Presentation + lifecycle | U01/U02/T01–T02/O08/B02–B03 | Region drill-down, export parity, cache/erase/retry và charge correctness |
| Hai-site rollout | O03/Q02/S01/S03 | Feature flags từng site, real customer-path evidence và rollback; không claim cả hai live từ một site |

Contract/corpus có thể chuẩn bị trong lúc sửa report incident. Paid vision và
customer activation chỉ sau reliability, budget, privacy và quality gates;
không thay critical path sửa completion/truth hiện tại. Không tạo work-item IDs
mới hoặc thay bảng45 items chỉ vì thêm modality.

## 7. Acceptance bắt buộc

- Mở rộng corpus40 development/20 holdout ở SOT §13, giữ split theo nguồn/doanh
  nghiệp: tối thiểu12 visual development và8 visual holdout; bao phủ ảnh trực tiếp,
  scan, slide mixed text/image, chart/table, diagram/UI, EN/VI, chữ nhỏ/xoay/mờ,
  trang cuối, trục cắt/log scale, forecast, conflicting/duplicate và prompt injection.
- Annotation có expected observations, units/periods, region locators, allowed
  uncertainty và forbidden conclusions; human review claim material. Không chỉ
  chấm OCR accuracy hoặc để model tự đánh giá output của chính nó.
- 100% trang/ảnh có processing state; 100% visual critical claims traceable và
  source-supported đúng vùng; **0 critical factual/numeric error**, **0 unresolved
  critical contradictions**; citation precision không critical ≥98% theo §13.
  Missing/blurred không thành số0 hoặc fact; approximate không thành exact valuation.
- Thiếu nguồn thì abstain, nhưng all-abstain không được coi thành công: ≥95% facts
  trọng yếu được annotator xác định đọc được phải được trích đúng trên visual
  holdout; báo riêng coverage theo modality/ngôn ngữ, denominator và sample count.
- Duplicate/native-vs-image không tăng score; thay sai unit/period/series bị chặn;
  prompt injection không đổi policy hoặc tạo tool action. Wrong-tenant/private
  share/revoked access không đọc được original/derivative/cache.
- Cùng case qua hai site đạt cùng evidence semantics, thiếu dữ liệu và traceability;
  differences do rubric có version/reason. Web/reopen/share/PDF/DOCX cùng revision.
- Limit exceeded, provider timeout, partial extraction, retry/cancel/restart và
  failed save không mất report trước hoặc duplicate charge. Benchmark báo complete
  cost/accepted report, p95 latency, completion và unknown charges; numeric cost/
  latency ceiling phải chốt trước activation, không được để TBD rồi gọi đạt.

Hoàn tất cập nhật plan không đồng nghĩa đã bổ sung khả năng đọc ảnh vào production.
