# G30: review lại plan và kết quả Claude Code — chất lượng report trước

Ngày: 23/09/2026. Baseline source: `f925ad948e698224f755aeace766dbb82d9c7bfc`.
Review này đối chiếu source, test, log local và tài liệu chính thức; không phải
biên nhận triển khai hoặc một benchmark inference mới. Thay đổi code bên dưới
đang ở working tree. Không sửa dữ liệu khách hàng, credits, routing production
hoặc kết quả report đã lưu. Các thay đổi O08 của lượt trước được giữ riêng.

## 1. Kết luận

Giữ DeepInfra làm primary. Chưa có bằng chứng để gọi bất kỳ model nào là
“chất lượng tốt nhất và rẻ nhất” cho toàn bộ report. Đơn vị tối ưu là **chi phí
cho một report đạt gates**, không phải giá token, số citation hoặc số từ.

Ưu tiên hiện tại: sửa đường hoàn thành report và thu được chẩn đoán timeout;
sau đó kiểm chứng claim/source/contradiction/valuation trên cùng final revision;
mới tối ưu role/model và giao diện. Không mở free fallback chưa qualified để
che lỗi pipeline. Không giảm các gates trong SOT §13.

## 2. Bằng chứng vận hành và nhận định cần sửa

Nguồn: `web/content/reports/tbr-quality.jsonl`, đọc lại trong lượt review này.
Từ `2026-09-21T11:34` có 33 dòng: 30 dòng degraded cả 8 chương, 2 dòng không
degraded chương nào, 1 dòng degraded một phần. Đây là tập log quan sát được,
không phải toàn bộ account traffic hoặc corpus holdout. Tổng `costUsd` ghi
nhận là USD0.8162; chưa phải invoice reconciled hoặc complete attempt cost.

| Thời điểm UTC 23/09 | Words | Grounded share | Degraded | Consistency issues | Ý nghĩa |
|---|---:|---:|---:|---:|---|
| 01:12 | 0 | 0 | 8 | 0 | Không có nội dung để kết luận “không mâu thuẫn” |
| 04:06 | 6,417 | 0.73 | 0 | 6 | Sinh được văn bản, chưa đạt chất lượng; còn 8 pending dimensions |
| 06:51 | 0 | 0 | 8 | 0 | Report fail; log ghi provider DeepInfra bị struck |
| 07:41 | 0 | 0 | 8 | 0 | Report fail lặp lại sau thay đổi transport |

Review “29 lần liên tục 0 chữ” phản ánh mốc trước run04:06, không phải trạng
thái cuối ngày. Không được dùng một run6,417 từ để đánh dấu sự cố đã đóng.

Đối chiếu read-only [public status](https://blockid.au/api/status) ngày23/09:
HTTP200, version `v3.33.3`, serving SHA
`97f6a1ef7bb5fa439e2081a6f200d2658aba4424`, trạng thái `watch`.
Cửa sổ24h ghi15 runs, degradedShare0.93, groundedShareMedian/Latest0.73,
costUsdMedian0.0041 và1 budget overrun. Grounding summary loại các run fully
degraded khỏi median/latest, nên0.73 không chứng minh run mới nhất thành công;
HTTP200 cũng không chứng minh report khỏe. Đây là snapshot quan sát, không
phải kết quả triển khai bản sửa working tree hoặc bằng chứng chi phí đầy đủ.

## 3. Findings theo mức ưu tiên

| ID | Mức | Finding đã đối chiếu | Xử lý / gate còn lại |
|---|---|---|---|
| RQ01 | P0 | Hai timeout song song của cùng model được cộng vào strike của cả DeepInfra; scoped report chỉ có provider này nên mất luôn các model khác | Đã thêm regression tái hiện và đổi scoped timeout sang khóa `provider/model`. 429/overload vẫn có circuit provider; deadline/budget vẫn giữ. Chưa chứng minh đã hết timeout thực tế |
| RQ02 | P0 | `inprocessFetch` không xử lý response `aborted/error/close` và thiếu socket/TTFB evidence | Tách transport, bắt response bị đứt ngay; timings/counts không chứa prompt/key; ghi reservation duration ở lỗi DeepInfra. Giữ kết nối mới theo bản sửa Claude. Local HTTP integration kiểm tra 8 request song song, timeout trước/sau headers và truncated body |
| RQ03 | P0 | Scoped report không có attempt permit vẫn có thể fallback transport sang subprocess sau lỗi bất ngờ, tạo thêm request ngoài model ladder | Chặn subprocess replay trong scoped policy. Model alternative vẫn chạy trong budget. Không cho rằng timeout đồng nghĩa provider chưa tính phí |
| RQ04 | P0 | `groundedShare`, word count, citation count không chứng minh claim được nguồn hỗ trợ | Giữ E03/F02/Q02: entity/metric/unit/period/qualifier, actual/founder-stated/assumed; 0 critical error/contradiction. Không nới audit hoặc tự gắn thêm citation để đạt KPI |
| RQ05 | P1 | `dcf_proxy = ARR × (multiLow + 1)`; `risk_factor_summation` là ARR multiple với tax adjustment; `comparables` là sector/growth multiple | Sửa tên/rationale/weighted-estimate copy trong producer, prompt facts và shared web/export strings; thêm cảnh báo cùng ARR, không independent confirmation. Giữ keys và số để tương thích. Calibration, tax uplift và confidence formula vẫn cần V01–V03; đổi tên không làm phép tính đúng hơn |
| RQ06 | P1 | Narrative criterion bị withheld khi audit/conflict chưa sạch | Đây là guard có chủ đích trong `withCriterionAnalysis`, không nên bỏ để tăng độ dài. Cần sửa findings upstream và đánh giá khả năng trả lời từng câu hỏi |
| RQ07 | P1 | “Một model prompt có nhiều citation” bị diễn giải thành model tốt nhất; chi phí37 call bị gọi worst case | Chỉ là shortlist/projection. Bỏ câu cost worst-case trong code; giữ task-specific holdout, retries/failed attempts và cost-per-accepted-report |
| RQ08 | P1 | Paid spend chủ yếu được ghi sau `callProvider` thành công; không thể lấy log successful calls làm total invoice | O02 phải có attempt ID + actual/unknown usage + conservative hold/reconcile cho mọi run. Research có coordinator riêng, chưa chứng minh mọi report call dùng được nó |
| RQ09 | P1 | Baseline GATHER market research vẫn có nhánh dùng model knowledge; website lineage foundation không đồng nghĩa independent research đầy đủ | R01–R04 cần fetch/read/source snapshot + relevance/counter-evidence + coverage state. Source-backed competitor3–5 là mục tiêu khi đủ nguồn; không điền bịa cho đủ số |
| RQ10 | P1 | Report-surface plan ghi “pha1 đủ để bán” dù quality/reliability/billing gates còn mở | Sửa thành phạm vi UI pha1. Controlled-sale vẫn cần S03, không suy từ giao diện hoặc một demo đẹp |
| RQ11 | P1 | Valuation backtest cross-check in median post-money với N=1/N=3, bỏ qua shared n≥10 rule; tái hiện trong source test và PDF fixture | Đã áp dụng `mayShowPercentile` ở producer cho round/valuation medians và narrative, ghi insufficient-sample reason; test biên9→10 riêng từng sample. Historical snapshots và authored stage/sector anchors vẫn cần audit riêng, không claim mọi reader đã có gate |

RQ01 chỉ chứng minh lỗi cô lập failure-domain bằng regression, không chứng minh
nguyên nhân mạng của 16 timeout trong bản bàn giao. Cần một lượt inference có
diagnostic mới để phân biệt socket chưa cấp, đã gửi/chưa có headers và body bị
ngắt. Phần này còn mở; không tăng timeout/concurrency hàng loạt theo phỏng đoán.

## 4. Đối chiếu góp ý của Claude

Đã đọc pre-presentation review, degradation handover, AI routing policy,
analyze/pitchbook investigation, investor report surface và website/text intent
review; đối chiếu canonical SOT và các implementation receipts liên quan.

| Góp ý | Kết quả review |
|---|---|
| Token1,275/reasoning là root cause đã được chứng minh | Rút kết luận. Claude đã tự đính chính: structured floor2,600; normal chapter prompt khác classify/degraded prose. Reasoning overhead vẫn đáng đo, nhưng không phải root cause đã xác lập |
| Bỏ keep-alive là sửa xong incident | Không đúng. Handover ghi chính run sau patch vẫn fail. Giữ thay đổi vì có một stall reproduction, thêm diagnostics và regression |
| D-A1: DeepInfra primary, V3.2 → Qwen3-235B → V4-Flash | Report ladder đã có ở baseline; không cần viết router mới. Đây là provisional shortlist, chưa phải qualification đầy đủ |
| D-A2: bỏ gpt-oss120b khỏi report/synthesis | Đã có trong source; classify giữ riêng. Zero citations trong một prompt/provider là cảnh báo, không phải kết luận tổng quát về năng lực model |
| D-A3: tắt thinking | Source hiện gửi cho các DeepSeek IDs đã liệt kê. Giữ cấu hình hiện có; không suy việc tắt reasoning luôn tối ưu mọi tác vụ/synthesis phức tạp |
| D-A4/D-A5: qualified free fallback | Đồng ý có điều kiện. Groq20b mâu thuẫn với model floor hiện deny≤20b; không đưa vào chỉ vì có6 citations. Loader hiện scoped OpenRouter và `executionAllowed:false`, không tự qualify Groq/Gemini. Cần account quota, zero-charge proof, privacy và exact endpoint eval trước activation |
| D-A6: health probe | `answeredWithContent` và max64 đã có; không còn “200 là healthy” ở helper này. Tuy nhiên một câu “ok” vẫn chỉ là liveness, không phải report-grade health; `endpointFor` helper này không chứa DeepInfra. Paid-provider monitoring dùng evidence riêng, không suy đã covered |
| D-A7: discovery pinning | Vẫn cần cho generic/free consumers. Frozen scoped ladder đã ngăn discovery thay report models; không gán generic cron ranking là nguyên nhân trực tiếp của scoped report failure |
| Đếm >5,000 words và groundedShare>0 để nghiệm thu | Chỉ là smoke, bỏ vai trò release gate. Không ép dài ở case thiếu dữ liệu. Dùng SOT §13: 100% applicable questions có state, critical citations100%, noncritical precision≥98%, specificity≥90% và 0 unresolved critical contradictions |
| Một report dùng chung; bỏ preview trùng; guest links giữ nguyên | Đồng ý. `/analyze` đã có canonical ReportV2; hợp nhất projection/navigation, không dựng pipeline/schema thứ hai |
| 16 câu hỏi investor | Map vào13criteria/52question IDs và intent coverage; presentation grouping không thay canonical ontology hoặc tạo thêm16 calls mặc định |
| Multi-file/XLSX/CSV | Giá trị cao cho tài chính nhưng sau extraction/security/provenance gates; không chặn xử lý incident và truth contract hiện tại |
| Sửa title/body lệch, Stripe contradiction, benchmark thiếu n, labels nội bộ | Giữ trong U01/E02/E03/Q02. Một phần thấy trong synthetic fixture; cần fixture-specific repro và producer fix, không gọi toàn bộ live customer reports bị cùng lỗi. PDF spot check xác nhận thêm low-n cross-check, đã sửa producer ởRQ11. Internal audit labels và các vấn đề khác chưa được coi là đóng |
| Chuyển guest vào workspace, iframe SVI, thay ReportV2 | Đồng ý quyết định bỏ. Giữ signed links, quyền truy cập và một final revision; repo SVI không nằm trong lượt sửa này |

## 5. Model/cost policy sau review

Không đổi primary sang nhà cung cấp khác, không bật paid spillover, không ghi
đè file model lists do cron sở hữu. Report ladder đang giữ:

1. `deepseek-ai/DeepSeek-V3.2` — primary hiện tại.
2. `Qwen/Qwen3-235B-A22B-Instruct-2507` — alternative hiện tại.
3. `deepseek-ai/DeepSeek-V4-Flash` — alternative nhanh/chi phí thấp theo smoke cũ.

**Synthesis hiện KHÁC report:** V3.2 → V4-Flash → `moonshotai/Kimi-K2.6`.
D-A1 đề xuất cả hai giống nhau nhưng source chưa làm như vậy. Chưa thay một
model chưa eval bằng một model khác chưa eval cho synthesis; phải benchmark
exact role/config trước, và ghi nhận Kimi không có evidence trong bảng3 model.

Giá standard USD/1M tokens, kiểm tra trang chính thức23/09:

| Exact ID | Input | Output | Cached input |
|---|---:|---:|---:|
| [DeepSeek-V3.2](https://deepinfra.com/deepseek-ai/DeepSeek-V3.2) | 0.26 | 0.38 | 0.13 |
| [Qwen3-235B-A22B-Instruct-2507](https://deepinfra.com/Qwen/Qwen3-235B-A22B-Instruct-2507) | 0.09 | 0.55 | Chưa niêm yết ở trang đã đọc |
| [DeepSeek-V4-Flash](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash) | 0.09 | 0.18 | 0.018 |
| [DeepSeek-V4-Flash-0731](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash-0731) | 0.06 | 0.18 | 0.015 |

`V4-Flash-0731` **có trang chính thức**, nên không giữ khẳng định tuyệt đối
“ID không tồn tại” từ một catalogue snapshot. Trang public không chứng minh
account hiện tại gọi được model hoặc model đạt report gates; không tự thêm vào
allowlist. Giá cache không đồng nghĩa đã có cache hit; không cộng dồn ưu đãi
hoặc hứa chi phí mỗi report trước khi đo actual usage.

Benchmark cần hai tầng: (1) synthetic role tests EN/VI, malformed/missing/conflict,
claim/source fidelity, returned model, latency và complete usage; (2) end-to-end
report trên40development/20holdout, giữ20holdout ngoài prompt tuning. Cho model
rẻ chạy extraction/normalization khi đạt cùng quality floor; dùng model mạnh
cho material reasoning/challenge khi trigger rõ. Cache relevant evidence theo
scope/revision; retry phần lỗi rồi reconcile summary, không chạy lại mọi agent.

## 6. Thứ tự trong cùng backlog G30

| Nhóm SOT | Trạng thái qua review này | Bước tiếp theo |
|---|---|---|
| P01 | Revalidated baseline/plan hierarchy | Gắn bằng chứng theo SHA; không lấy header “PLAN ONLY” làm trạng thái thực thi |
| O01/O02 | Source fixes + local regression, chưa live verified | Diagnostic inference có budget; actual attempt cost; task/role qualification |
| Q01/E01/E02/E03 | Có contracts/fixtures từng phần; chưa full semantic certification | Corpus allowed snapshots, exact quotes/locators, units/time/entity, contradiction và unsupported claims |
| F01/F02/F03/F04 | Extraction/final projection foundations có; atomic revisions/legacy delivery còn mở | Same final revision ở response/save/reload/export; không publish degraded hoặc mất report cũ khi retry |
| A01/A02/A03 | Giữ criterion-specific assessment, final audit và investor implications | 52question coverage states + intent coverage; evidence→reason→implication→next check |
| R01/R02/R03/R04 | Source retrieval/scoped foundations không đồng nghĩa full baseline research đã verified | Search/fetch/read thực, competitor relevance/counter-evidence, bounded depth và budget |
| V01/V02/V03 | Sửa copy/labels source; chưa sửa/certify valuation methodology | Independent inputs, applicability, AR/MRR periods, correlated-method confidence, empirical comparables; abstain nếu thiếu |
| U01/U02/U07 | Shared projection giữ; export label regression/visual spot check | Brief/detail/evidence parity, material caveats visible, persisted latest semantics |
| U03/U04/U05/U06 | Tiếp tục canonical design/route/copy queue sau report blockers | Không hứa chất lượng hoặc “real runs” bằng fixtures; không làm redesign thành critical path của incident |
| T01/T02 | Storage/lineage/restore chưa đóng bằng review source này | Atomic/recoverable saves, old links, permission/cache boundaries |
| B01/B02/B03/U08 | Không thay giá/credits hoặc bật deep purchase trong lượt này | Giữ price/fulfillment/quote/reserve/capture/refund gates trước paid research |
| O03/O04 | Real customer-path verification/remaining linked-surface issues còn mở | Free1/free2/paid3, failure/retry/delivery; marketing/index route claims tách khỏi report proof |
| O05/O06/O07/O08/O09 | Existing ops gates giữ; O08 helper của lượt trước không hoàn tất durable jobs | Origin capacity, warm recovery, monitoring và job ownership; off-host DR theo founder deferral |
| Q02/S01/S02/S03 | Chưa đạt controlled-sale hoặc scale certification | Holdout reviewers, ≥50 E2E/2days đạt≥95%, buyer usefulness, complete cost/accepted report, sign-off |

Đây là review và reprioritization trong **cùng queue**, không task board thứ hai.
Không gọi các nhóm chưa kiểm chứng là “done” chỉ vì unit tests hoặc source tồn tại.

## 7. Thay đổi và validation trong lượt này

- Transport diagnostics phân biệt socket/DNS/TCP/TLS/request-finished/headers/
  first byte/bytes received; failure counters theo model không gắn nhầm provider
  unavailable. Không log prompt, key hoặc URL path trong diagnostics.
- Xử lý response abort/error/close; scoped policy không replay bằng subprocess.
- Nhãn/rationale định giá đúng với công thức hiện tại; “weighted estimate”
  thay “consensus”, có giải thích dependence giữa các phương pháp.
- Chặn backtest median dưới10 mẫu ở dữ liệu/narrative mới; giữ count và lý do
  withheld, không thay số nhỏ bằng0 hoặc một estimated median.
- Full TypeScript check đã pass bằng `npm run typecheck`.
- Relevant AI/transport/pipeline/report/render/export suites: **67 files,
  1,321 tests passed**, Vitest4.1.6, final run23/09 lúc08:45UTC. Gồm local HTTP
  integration, parallel timeout/model fallback, valuation sample-floor biên9/10,
  shared web copy và PDF/DOCX exports. Log local:
  `/tmp/blockid-report-review-passing-tests.log`.
- `git diff --check -- docs web/src` pass.
- PDF demo synthetic đã render27pages; MuPDF raster spot check trang định giá
  xác nhận tên phương pháp/bảng không overlap/cắt nội dung. Đây không phải
  report AI mới hoặc chứng nhận toàn bộ nội dung demo.
- Không chạy paid inference, không gửi email, không apply migration hoặc deploy
  trong lượt review này. Ngân sách benchmark đã hỏi riêng, chưa có câu trả lời
  tại thời điểm viết; phần review/local tests tiếp tục độc lập.

Chưa thể xác nhận incident đã hết, model nào thắng holdout, chi phí actual mỗi
accepted report, hoặc live web/PDF/DOCX đạt toàn bộ gates. Các kết luận đó cần
evidence mới theo đúng các bước còn mở ở trên.
