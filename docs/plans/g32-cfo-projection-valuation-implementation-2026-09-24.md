# G32 — CFO-led projection và valuation: kế hoạch thực hiện chi tiết

**Ngày:** 24/09/2026. **Trạng thái: PARTIAL IMPLEMENTATION DEPLOYED — FULL FINANCIAL ACCEPTANCE OPEN.** Scenario/projection/provider/criteria release đã live trên hai site lúc 23:33 UTC: BlockID `871f2fee425f7faf5cbaa487fb4d14a78eb587ea`, SVI `edebcea1127c6432282cf541f5b1f54e7bc47649` ([deployment receipt](../reviews/2026-09-24-cfo-production-deployment.md)). Scenario vẫn `scenario_only`, panel vẫn shadow-only; không đồng nghĩa định giá chính thức hoặc G32 hoàn tất. Founder yêu cầu bổ sung: định giá doanh nghiệp do CFO phụ trách, dựa trên phương pháp quốc tế và financial projections; cải tiến điểm theo đánh giá AI agents; đối chiếu đồng bộ các phương pháp đã nghiên cứu và tích hợp trong CFO AI Agent BlockID.

Đây là đặc tả chi tiết của **SOT §9.4–9.5, A04/A05 và V01–V04**, không goal/backlog mới. G31 trình bày kết quả; G33 cung cấp nền ổn định/persistence. Yêu cầu tiếp theo “hãy làm toàn bộ” cho phép bắt đầu implementation. Tiến độ thực tế được ghi riêng trong [execution receipt](../reviews/2026-09-24-cfo-implementation-receipt.md); không thay giá hay trần US$0.50/report. Source implementation không đồng nghĩa production activation hoặc hoàn thành toàn G31/G32/G33.

## 1. Kết quả cần đạt

**Một CFO methodology registry → một bộ dữ liệu và giả định có nguồn → một mô hình dự phóng → các phương pháp đủ điều kiện → reconciliation → một valuation revision dùng trên cả hai app.**

CFO chịu trách nhiệm lựa chọn/giải thích phương pháp, projection và việc đối chiếu kết quả. CDO xác minh dữ liệu; các agents chuyên môn cung cấp bằng chứng và đánh giá. Engine deterministic tính dòng tiền, chiết khấu, cap table và giá trị. Người review xử lý judgement quan trọng chưa đủ căn cứ. CFO AI không tự phát minh số tiền, benchmark, WACC hay xác suất chỉ để hoàn thành report.

Hai đầu ra song hành, cùng `evidence_set_hash` và ngày đánh giá:

- **Assessment/SVI:** agent rubric 52 câu, panel ba family và contribution ledger theo G32.
- **Valuation:** projection/market/asset/instrument methods dựa vào business drivers và dữ liệu thị trường có nguồn. Điểm từng tiêu chí chỉ ảnh hưởng qua mapping được hiệu chuẩn; không lấy tổng SVI nhân thành tiền.

Điểm tăng không buộc định giá tăng: lãi suất thị trường tăng, runway giảm hoặc nhu cầu vốn cao hơn có thể làm valuation giảm. Report phải giải thích chênh lệch này bằng delta drivers.

## 2. Cơ sở quốc tế và cách áp dụng

Nguồn official được kiểm tra 24/09/2026; bảng sau là cơ sở thiết kế, **không chứng nhận sản phẩm hiện tuân thủ chuẩn**. Implementation phải lập clause-to-requirement matrix theo phiên bản được phép truy cập, không suy toàn bộ điều khoản từ trang giới thiệu.

| Nguồn | Nguyên tắc dùng trong thiết kế |
|---|---|
| [IVSC — IVS](https://ivsc.org/standards/), đặc biệt IVS 101–106 và IVS 200 | Xác định scope, basis, inputs, model và hồ sơ giải trình; định giá business interests phải phân biệt loại quyền sở hữu. Đối chiếu edition áp dụng tại valuation date. [Thông báo edition effective 31/01/2025](https://ivsc.org/new-edition-of-the-international-valuation-standards-ivs-published/) |
| [IPEV December 2025](https://www.privateequityvaluation.com/Portals/0/Documents/Guidelines/2025%20IPEV%20Valuation%20Guidelines.pdf), §2.6–2.7, §3.2–3.4, §3.7–3.10 | Chọn kỹ thuật theo tình huống, calibration/backtesting, cash flows/discounting, market inputs và rights. Giao dịch gần nhất là điểm đối chiếu cần đánh giá lại tại ngày đo lường, không giá bất biến. Tách giá trị doanh nghiệp khỏi giá trị instrument |
| [Damodaran — valuation foundations](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/background/valintro.htm), [growth drivers](https://people.stern.nyu.edu/adamodar/New_Home_Page/littlebook/growthvaluedrivers.htm) | Growth phải gắn với reinvestment và economics; cash flow, risk và thời gian chuyển sang trưởng thành phải nhất quán. Đây là tài liệu phương pháp học thuật, không cơ quan chứng nhận |

DCF/market/asset approaches là phương pháp định giá; **projection methodologies** là cách xây dữ liệu tương lai phục vụ chúng. Không coi “có bảng 3 năm” là đã có DCF. Berkus/Payne Scorecard, VC method và First Chicago là techniques/heuristics có điều kiện, không tự gọi tất cả là chuẩn IVS/IPEV hoặc bắt buộc mọi startup chạy đủ số phương pháp.

## 3. Đối chiếu nghiên cứu và source CFO đang có

Baseline đọc source: BlockID `c2e147066`; SVI `565250b`. Tên file và nhãn shipped trong tài liệu lịch sử không chứng minh integration/acceptance hiện tại.

| Tài liệu/module hiện có | Phần tái dùng | Phần cần sửa/hợp nhất theo plan |
|---|---|---|
| `.claude/goals/cfo-vc-valuation.md` | Market sizing, projections36tháng, unit economics, scenarios, workbook, use-of-funds | Bỏ yêu cầu “never one method”/4methods mọi report; “discounted EBITDA” chưa đủ FCF; KPI độ dài hoặc tương quan giá raise không thay accuracy |
| `.claude/goals/valuation-engine-v2.md` | Catalog Berkus/Scorecard/multiples, ý tưởng backtesting | Pillar A$750k khác CFO A$500k; score→money, AI premium, stage anchors phải reconcile có version/source; round size không phải valuation |
| `docs/plans/misc/2026-08/DESIGN_CLEVEL_DCF_INTEGRATION.md` | DCF/scenario/sensitivity và phối hợp nhiều agents | WACC35%, terminal growth3%, capex0 hoặc fixed margins chỉ là giả định lịch sử, không default chuẩn quốc tế; không tự chạy15narratives nightly |
| `docs/plans/misc/2026-08/REVENUE_FORECAST_DESIGN.md` | Monthly drivers, financial model/workbook và scenario UX | Không coi assumptions là actual; không tự kích hoạt credit charge cũ hoặc score boost khi tạo model |
| `web/src/lib/agents/cfo-valuation.ts` | Public API, inputs/results, unit economics, method rows; compatibility adapter | `dcf_proxy` hiện ARR×(lower multiple+1), không DCF. Revenue/comparables/tax-adjusted ARR phụ thuộc cùng driver; bỏ “đồng thuận độc lập” và tax uplift cơ học |
| `web/src/lib/c-level/compute-c-level-dcf.ts` | Có engine deterministic discounting5năm, projection input, sensitivity | WACC42/38/34%, g4%, anonymised comp constants và tax/payout presets chưa phải qualified inputs. Review math/provenance trước tái dùng; không nói repo hoàn toàn chưa có DCF |
| `web/src/lib/clevel-valuation.ts` / `agents/deep-valuation.ts` | Các method helpers và consumer inventory | Gỡ blend chứa SVI; bỏ default WACC35%/arbitrary range và engine cạnh tranh |
| `web/src/lib/forecast-builder.ts`, `financial-projections.ts`, `agents/cfo-financial-projection.ts`, `agents/cfo-projection-norms.ts` | Forecast drivers, scenarios, schedules, CSV/PDF và norms registry | Hợp nhất metric definitions/horizon; bổ sung balance sheet/working capital/capex/debt/tax; cash không chỉ cộng accounting profit; norms thiếu nguồn không thành facts |
| `web/src/lib/valuation/{sector-multiples,comparables-repo}.ts`, `lib/exits/au-benchmark.ts` | Approved source rows, URL/date, comparables selection | Phân loại valuation vs round proceeds vs exit value; match metric/date/currency/rights; illustrative comps không tính vào observed n |
| `web/src/lib/report-pipeline/gather.ts`, `revenue-qualification.ts`, `submitted-financial-context.ts` | Source gates, observation/rejection reasons | Xây producer thật; registry rỗng hiện khóa revenue path. Không chỉ thêm allowlist ID hoặc bắt pre-revenue phải có MRR |
| SVI `src/lib/decision/valuation-engine.ts`, `financial-evidence.ts`, `financial-metrics.ts` | Source quote checks, legacy reader compatibility | Thay standalone preset multiples/SAM capture/claim-count scoring bằng cùng CFO method contract; đồng bộ financial extraction eligibility |

**Deliverable đầu tiên:** CFO method crosswalk cho từng method/helper: `keep / correct / replace / retire / legacy-read-only`, công thức, units, source, current callers, test oracle, version và người review. Mọi method cũ phải có disposition, không âm thầm bỏ nghiên cứu hay gọi toàn bộ là usable.

## 4. CFO methodology registry và dữ liệu chuẩn

Thiết kế registry dùng chung hai site, không duplicate model logic. Mỗi method có ID/version, basis of value, source references, applicability/exclusions, required inputs, equation/spec, output basis (EV/equity/instrument), uncertainty policy, validation fixtures và status. Các phiên bản projection/scoring/benchmark/FX/discount-rate/capital structure được pin vào final revision.

Mỗi input giữ: business/entity/project, valuation date, metric/units/currency, kỳ đo và frequency, historical/forecast period, actual hay management forecast, evidence ID/quote/page/cell, source observation date, source-quality status, assumption owner và lý do. `management_stated`, `source_verified`, `derived`, `assumed`, `missing`, `conflicted` tách riêng; authenticated source không tự chứng minh audited accounts.

Founder forecast đủ traceability có thể dùng làm scenario input có nhãn, không đòi tương lai được “verified actual”; thiếu bằng chứng làm thay đổi eligibility/uncertainty, không tự thay giá trị bằng0. Scenario sandbox và accepted business valuation tách biệt. Thay slider tạo scenario fork, không tự cập nhật official SVI/valuation.

CFO agent output contract đề xuất: input/evidence references, selected/rejected methods và lý do, driver proposals/bounds, scenario rationale, conflicts, missing inputs, calibration references và review-needed flags. Engine result trả về cho CFO để giải thích; auditor đối chiếu mọi số trong narrative với result, không cho AI sửa số tính toán.

## 5. Projection methodologies cần triển khai

### 5.1 Hai horizon liên kết, một bộ drivers

- **Operating model:** monthly36tháng cho revenue/cost/cash/runway; quarterly/yearly rollup từ cùng bảng, không agent lập lại độc lập.
- **Valuation model:** annual5năm mặc định thiết kế; mở rộng tới giai đoạn steady state khi có cơ sở. Không ép terminal growth ổn định ở năm5 nếu business chưa trưởng thành; thiếu cơ sở thì `scenario_only/not_estimable`.
- Actual periods và forecast periods không overlap; giữ opening balances và reconciliation với báo cáo gốc. Drivers phải có source/assumption và ngày hiệu lực, không dùng thông tin tương lai khi backtest.

### 5.2 Bottom-up theo business model, top-down là kiểm tra biên

| Business model | Revenue/cost drivers bắt buộc |
|---|---|
| Subscription/SaaS | Opening customers/MRR + cohorts/new customers + expansion − churn/contraction; pricing/ARPU, capacity, CAC và lag; NRR không cộng trùng gross growth |
| Marketplace | Buyers/sellers, transaction volume, GMV, take rate/refunds/payment fees; net revenue tách GMV |
| Services/agency | Billable headcount × utilisation × rate × working time; hiring capacity, collection lag, delivery cost |
| Commerce/hardware | Units × price, returns/discounts, unit COGS, inventory/capex/warranty và channel economics |
| Pre-revenue/deeptech | Milestones, launch dates, probability/review state khi có cơ sở, sales ramp, production/R&D/regulatory funding; không tự dùng TAM×1% làm revenue |
| Khác/chưa support | Explicit unsupported/custom-reviewed template; không ép vào SaaS |

Top-down TAM/SAM/SOM kiểm feasibility với khách hàng có thể phục vụ và sales capacity; không tự đưa TAM vào company value. CMO cung cấp thị trường/competition, CRO funnel/pricing/conversion, CTO/CPO product/capex/roadmap, CHRO headcount, COO delivery/working capital, CLO terms/contingencies; CFO reconcile overlaps.

### 5.3 Financial statements và scenarios

Projection cần linked P&L, balance sheet và cash-flow schedules: revenue recognition/cash collection, COGS, opex, D&A, capex, receivables/payables/inventory, cash taxes/loss carryforward theo input hợp lệ, debt/interest/repayment, financing và shares. Unmodelled schedules phải ghi rõ giới hạn, không gắn nhãn fully integrated3-statement.

Bear/base/bull thay **drivers có lý do**: sales ramp/churn/pricing/margin/hiring/capex/working capital/funding timing. Không nhân valuation cuối ±30%. Base management case khác CFO assessed case khi assumptions không được chứng minh. Funding need là kết quả của cash schedule; cash âm phải flag funding gap hoặc modeled financing, không giả doanh nghiệp hoạt động vô hạn không cần vốn.

Mọi scenario phải khớp identities, cash roll-forward, capacity bounds và consistent currency/nominal-real/tax basis. Scenario probabilities chỉ dùng khi có căn cứ và review; nếu chưa có, hiển thị range không weighted expected value. Monte Carlo là mở rộng sau calibration nếu có distribution/correlation đủ căn cứ, không bắt buộc pha đầu.

## 6. Phương pháp định giá và selection rules

| Method | Đầu vào/điều kiện | Vai trò và giới hạn |
|---|---|---|
| DCF–FCFF | Qualified driver-based forecast, capex/NWC/tax, currency-consistent WACC, terminal assumptions và funding feasibility | Primary khi hợp lý; EV từ operating cash flow, không discounted revenue/EBITDA proxy |
| DCF–FCFE / investment cash flows | Debt/financing và distributions/capital calls đủ rõ, cost of equity nhất quán | Equity/instrument valuation trực tiếp; không trừ debt thêm lần nữa; complex instrument cần specialist-reviewed model |
| Market multiples / transactions | Comparable selection log, revenue/EBITDA metric cùng period/basis, currency/date/rights, material adjustments | Primary/cross-check tùy case; loss-making không EV/negative EBITDA; không trung bình preset multiplier thành consensus |
| Recent orderly financing calibration | Transaction date/price/rights/primary-secondary mix và known-or-knowable changes | Calibrate model tại transaction date rồi cập nhật drivers/market, không ép forecast đạt founder ask |
| VC method | Exit metric/multiple/horizon, required return assumptions, funding rounds/dilution/rights | Scenario cross-check; target fund IRR không mặc nhiên là WACC; tránh survival/dilution/discount double counting |
| First Chicago / scenario valuation | Scenario-specific cash flows/terminal/funding; reviewable probabilities khi aggregation | Theo từng case; không có probabilities thì giữ scenarios riêng, không tự chia đều1/3 |
| Adjusted net assets / replacement-cost approach | Asset/liability values, ownership, obsolescence/contingencies đủ nguồn | Phù hợp asset-heavy/holding hoặc cross-check; going-concern value không đồng nhất liquidation value |
| Berkus / Payne Scorecard / milestone | Pre-revenue, đủ evidence và regional transaction reference hợp lệ | Heuristic indicative range; không thay chuẩn cash-flow nếu đủ dữ liệu; pillar values/factors phải calibrate và disclose |

Không bắt buộc đủ7methods hoặc weighted average mọi result. CFO chọn primary, cross-check, assumptions và lý do loại methods; reconcile chênh lệch theo dữ liệu/basis, không lấy method count làm confidence. Formal fair-value compliance chỉ claim khi toàn scope/documentation/reviewer đáp ứng, không từ tên method.

### 6.1 Công thức/bridge để implementation có oracle

- `FCFF = EBIT − cash taxes on operating profit + D&A − CapEx − Δ operating NWC`. Thuế theo schedule; không cho lợi nhuận âm tự sinh tax refund khi chưa có quyền hoàn.
- `EV = Σ FCFF_t / discount_factor_t + PV(terminal_value)`. Cash-flow timing và rate period phải khớp; chọn end-year/mid-year có policy, không trộn monthly rate với annual flow.
- Gordon terminal chỉ khi steady-state phù hợp: `TV_n = FCFF_(n+1)/(WACC−g)` và `WACC>g`; reinvestment năm n+1 phải hỗ trợ growth. Exit multiple TV là alternative/cross-check, không cộng cả hai.
- `Equity = operating EV + non-operating assets/excess cash − debt/debt-like claims − other applicable claims`, tránh cộng cash đã nằm trong cash flow hoặc trừ liabilities hai lần. Allocate các class theo rights/waterfall; không chia đều preferred/common khi rights khác nhau.
- Với **simple primary priced-equity round** không fees/secondary/convertibles: `post-money = new primary cash / investor ownership`; `pre-money = post-money − new primary cash`. Raise/dilution là **post-money**, không pre-money. Khi terms khác, dùng cap-table scenario engine thay shortcut.
- FCFE discounted bằng cost of equity; FCFF discounted bằng WACC. Không tự đặt WACC35/38%, g3/4%, monthly growth hoặc margin theo stage như dữ liệu doanh nghiệp.

Discount-rate memo ghi valuation date/currency, basis, capital structure, cost of equity/debt, tax assumptions, source và applicable premiums. Cùng risk không vừa haircut cash flows vừa tăng discount rate vừa giảm scorecard factor nếu chưa chứng minh không trùng. RDTI theo eligible cash-flow/tax schedule; ESIC investor benefit tách khỏi operating EV, không tự cộng20% valuation.

## 7. Đồng bộ assessment/score với CFO và valuation

### 7.1 Agent-to-driver crosswalk bắt buộc

Mỗi mapping: `question_id → criterion/dimension → owner/panel result → evidence IDs → financial driver/method → transformation version → bound/units → materiality → reviewer`. Đây là mapping có kiểm chứng, không một hệ scoring thứ ba.

| Đánh giá có evidence | Cách tác động hợp lệ | Không tự suy |
|---|---|---|
| Retention/traction từ CRO/CDO | Cohort/churn/expansion và revenue-quality; update projection nếu cùng kỳ/source | +SVI tự tăng revenue/multiple |
| Market/competition từ CMO | Sales/pricing/penetration constraints, comparator relevance | TAM lớn tự cho market share hoặc premium |
| Team/execution từ CHRO/COO | Milestone timing/capacity scenario có lý do; calibrated scorecard factor | Team score cao tự giảm WACC5% |
| Tech/product/IP từ CTO/CPO/CLO | Launch/capex/maintenance/licensing assumptions có source | Mọi IP claim tăng terminal value |
| Finance/governance từ CFO/CLO | Reconcile cash/debt/rights, contingent liabilities, methods eligibility | Missing evidence coi là zero hoặc tự xác suất thất bại |

### 7.2 Luật scoring/projection đồng bộ

1. Giữ G32 rubric0–4/N/A, ba family và median/abstention theo §9.4.8. CFO không độc quyền nâng financial score hoặc tự làm cả ba judge. Model policy DeepInfra và budget giữ nguyên.
2. **Cùng accepted evidence revision** cập nhật assessment ledger và các driver đủ điều kiện; scoring version khác valuation methodology version, nhưng dependency hashes phải trùng. Derived ratio đi qua deterministic source checks trước dùng trong rubric.
3. Scorecard dùng **question-level calibrated assessment**, không total SVI. Confidence/evidence quality kiểm applicability/uncertainty; nếu dùng factor attenuation, dùng đúng một lần với formula version có bounds. Không vừa q×e rồi nhân e lại không chủ ý. Missing evidence không tự đủ điều kiện factor1.0/average company.
4. Financial readiness/projection quality được chấm theo evidence, completeness, consistency và track record; **forecast cao hoặc valuation cao không tăng SVI**. Dữ liệu mới có thể làm điểm giảm. Chạy lại/mua credits/sửa wording không tăng điểm.
5. Không dùng valuation output làm input để chấm lại SVI rồi dùng SVI tạo valuation trong cùng revision. Dòng dependencies một chiều từ evidence/assessment tới financial assumptions, sau đó valuation.
6. Backtest forecast-vs-actual chỉ dùng actuals phát sinh sau đó để đánh giá forecasting track record ở revision mới; không hồi tố snapshot cũ. Human overrides có reason/source/expiry và audit trail.
7. Mỗi lần update có delta bridge: evidence mới → rubric change → driver change → cash-flow change → method/result change; tách market-rate/comps movement khỏi business improvement. Attribution dùng fixed-order bridge có interaction residual hoặc phương pháp đã ghi rõ, không giả các sensitivity độc lập cộng được.

## 8. Output/report và đồng bộ các consumer

CFO report luôn có: basis/date/currency/instrument; historical-vs-forecast tables; assumptions/evidence; method eligibility; projections36tháng +5năm/đến steady-state; cash funding gap/use-of-funds; unit economics khi hợp lệ; EV→equity/pre-post/share-class bridge; method ranges và reconciliation; tornado3–5drivers + discount/growth sensitivity; accepted/rejected comps log; score/valuation delta explanation; missing inputs và next action.

Projection preview cho thay assumption tại chỗ, nhưng phải gắn “scenario” và không overwrite accepted result. Workbook/XLSX xuất từ cùng calculation payload gồm Sources, Assumptions, Actuals, Projections, DCF, Comparables, Scenarios, Cap Table và Method Versions; không gọi AI lại để tạo số trong Excel. Không bắt buộc cài thư viện mới trước inventory khả năng hiện tại.

Web BlockID, SVI, PDF/DOCX/email/workbook/API dùng same immutable valuation result/hash. C-level daily report đọc cùng result; khi cần cập nhật evidence tạo revision mới. Legacy SVI/cfo_v1 outputs chỉ đọc lịch sử có nhãn; share-price/vesting/dividends không rewrite số đã phát hành, và valuation scenario không tự thực hiện giao dịch/issuance.

## 9. Implementation slices trong backlog hiện hữu

Các nhãn **V04-P0…P8 là substeps**, không IDs thay V01–V04/A04/A05. Owner CFO+CTO phối hợp CDO/QA; bảng dưới đây là scope/acceptance gốc; trạng thái từng slice nằm trong execution receipt, không tự đổi tất cả thành done khi có code. Activation theo G33 S1/S3/S5/S6; G31 render qua shared projection.

| Slice | Owner/dependency | Công việc và vị trí dự kiến | Artifact / acceptance trước chuyển tiếp |
|---|---|---|---|
| V04-P0 — crosswalk | CFO/CDO; làm docs độc lập | Inventory bảng§3, rà tất cả callers/methods/defaults; pin standards/source versions và basis | Method disposition matrix đủ, không orphan method; reconcile pillars/anchors/DCF labels; analyst review |
| V04-P1 — inputs | CDO/CTO/CFO; V01/E01/E02 | Hợp nhất financial evidence contract và producers qua gather/financial-evidence/forecast inputs; table/cell provenance; actual vs assumption | Positive trusted source path; missing≠zero; valid explicit zero; dates/currency/tenant/conflicts; pre-revenue không bị MRR gate |
| V04-P2 — projection core | CFO/CTO; P1 | Review/tái dùng forecast-builder/financial-projections/CFO projections; linked schedules và sector adapters | Monthly/yearly identities; actual reconciliation; cash funding feasibility; management/base/bear/bull driver tests; no fixed defaults labelled actual |
| V04-P3 — valuation core | CFO/CTO; P0–P2 | Một versioned method registry/core; reuse audited discount helpers; FCFF/FCFE, market, calibration, VC/scenario, asset approach; unsupported methods explicit | Independent numeric oracle; EV/equity/rights/terminal/discount basis; method eligibility; no proxy labelled DCF; no forced blending |
| V04-P4 — score-driver sync | CFO/CDO/agent owners; A05/SV0–SV3,P1–P3 | 52question crosswalk, accepted assessment→bounded assumption mapping, version/hash binding | Same facts same result; no aggregate SVI→money; no feedback loop/double count; rerun+0; evidence change delta explainable |
| V04-P5 — reconciliation | CFO/reviewer/QA; P3–P4,V03 | Calibrate with qualifying recent transactions, accepted/rejected comps, scenario/tornado, expert challenge and holdout | Input-at-date backtest; error/interval coverage/bias by cohort; calibration residual disclosed; analyst reproduction of material values; no success claimed from correlation alone |
| V04-P6 — publish/parity | CTO/CFO/UI; F02/F04/T02/O08,P5 | Immutable result+assessment dependency snapshot, save/read-back, CFO narrative audit; report/API/export/workbook adapters | Complete/reload/share/export same values/units/source/version; failed retry keeps old report; scenario sandbox isolated |
| V04-P7 — migrate consumers | CTO/CFO; P6,SV1/SV5,G31 | Both apps and first-analysis/tools/C-level jobs/share-price/vesting/dividends retire duplicate engines | Caller inventory100% disposition; historical financial rights preserved; explicit model change vs evidence change; controlled shadow diff |
| V04-P8 — qualify/activate | QA/CFO/release owner; G33 stability,SV4/5,V02/3,Q02 | Corpus qualification, canary, same contract rollout both sites, monitor cost/latency/quality and rollback | All numerical/provenance/rights gates; same threshold obligations SOT§13; exact SHA/build receipts; not done just because UI has a number |

CFO prompt changes chỉ sau input/method contract: đọc accepted inputs → recommend eligible methods/assumptions → code calculates → independent checks → CFO explains → final audit/persist. Không chạy một prompt khổng lồ để model tự tạo ba financial statements và định giá không kiểm chứng.

## 10. Acceptance corpus và kiểm chứng cần làm khi triển khai

Tái dùng Q01/Q0240dev/20holdout, thêm cases chưa có; không tự mở thêm ngân sách inference. Golden scoring30–50firm của G32 có thể cùng corpus khi đáp ứng independent labels và giữ holdout nguyên vẹn.

1. SaaS thực có cohort/churn/ARR; marketplace có GMV/net revenue; services capacity-limited; hardware có capex/inventory; pre-revenue có milestone/financing constraints; business không đủ dữ liệu.
2. Negative FCF, negative EBITDA, tax losses/no cash refund, debt draw/repayment, excess cash, seasonality, terminal chưa ổn định, WACC≤g và FX/nominal-real mismatch.
3. Currency header ở bảng, nhiều kỳ, source conflict, founder forecast vs actual, USD không rate/date, management ask chỉ cross-check; cùng số nhưng khác entity không merge.
4. Priced round/simple dilution identity, SAFE/preferred/secondary/fees khác basis, liquidation waterfall; funding proceeds không là operating revenue; issued shares/dividends không bị đổi lịch sử.
5. Đồng evidence nhưng đổi model/prompt có methodology revision; rerun không đổi score; better evidence làm score tăng nhưng valuation có thể giảm khi rates/risk/cash needs tăng.
6. Numeric tests bằng oracle độc lập: exact rounding policy; monetary outputs sai lệch không vượt tolerance định nghĩa trước theo currency, không trộn tolerance mô hình thị trường với arithmetic accuracy. Tất cả material narrative numbers khớp engine và source status.
7. Explainability: reviewer tái tạo được mọi method output; comps đủ basis/date/source; `not_estimable` chỉ đúng method thiếu, các method khác không bị tắt toàn cục.
8. Persist/reload/cache/public/private/PDF/DOCX/email/XLSX parity, reviewer access, revoked permission, job retry/idempotency, billing và US$0.50 cap gồm failed/unknown attempts.

**Oracle minh họa để viết tests sau này, không dữ liệu doanh nghiệp:** primary raise A$1m với ownership20% → post-money A$5m, pre-money A$4m. FCFF cuối mỗi năm A$100 mãi mãi, WACC10%, g0 và không growth/reinvestment thiếu: EV A$1.000; excess cash A$200, debt A$300 và không claims khác → equity A$900. Dùng fixtures này để bắt nhầm pre/post-money, EV/equity, double-count terminal/cash và percent units; không dùng làm benchmark thực tế.

Không hứa “±30% valuation accuracy”, không lấy r>0.7/word count/4methods làm nghiệm thu. Model validation đo coverage, signed/absolute errors, bias, applicability và assumptions ở từng cohort; thresholds thị trường phải được reviewer chốt trước holdout, không tune sau để đạt.

## 11. Quy tắc đóng scope

Mỗi substep ghi riêng planned/implemented/validated/deployed/accepted. Chuẩn quốc tế được **đối chiếu** qua registry và hồ sơ reviewer; chưa ghi “IVS/IPEV-compliant” nếu chưa đủ điều kiện. Chỉ dẫn “chưa code” là trạng thái lúc lập spec, đã được tiếp nối bởi yêu cầu “hãy làm toàn bộ”. Các slice đang triển khai theo execution receipt; acceptance/canary/human calibration và positive producer chưa đạt vẫn mở. Không rewrite lịch sử quyền sở hữu hoặc đưa scenario thành accepted valuation.
