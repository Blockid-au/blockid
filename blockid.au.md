# BlockID.au — Yêu Cầu Dự Án Và Kế Hoạch Triển Khai

**Ngày cập nhật:** 2026-05-07  
**Trạng thái:** Master planning document tổng hợp từ blueprint, GTM, upgrade plan và source hiện tại.  
**Nguồn:** `blockid_master_project_blueprint_v1.md`, `blockid_gtm_sales_first_v1.md`, `blockid_upgrade_solution_plan_v2.md`, `web/README.md`

---

## 1. Tóm Tắt Dự Án

BlockID là nền tảng AI fundraising readiness, ownership trust và pre-diligence infrastructure cho startup và SME tư nhân tại Úc.

Tầm nhìn dài hạn:

> BlockID trở thành trust layer cho private capital markets.

Trong 6 tháng đầu, BlockID không nên bán như một nền tảng cap table thuần túy, marketplace, blockchain product hoặc liquidity platform. Wedge thương mại sắc nhất là:

> AI fundraising readiness + term sheet / dilution copilot cho founder Úc đang gọi vốn.

Mục tiêu sản phẩm ngắn hạn:

> Founder có thể gửi cho investor một link investor-ready đáng tin, dễ giải thích và có proof trong vòng 10 phút.

Định hướng sản phẩm mới cần được đưa vào toàn bộ roadmap:

> BlockID.au là AI trust layer và enterprise-grade ownership intelligence platform cho fundraising, valuation, dataroom và ownership management.

Điểm khác biệt lớn:

> **AI-powered fundraising, valuation and ownership infrastructure for private companies.**

BlockID có thể được cung cấp như SaaS platform hoặc standalone/private deployment cho SME, startup, accelerator, advisor, investor, shareholder và các tổ chức cần quản lý private-company trust data. AI là lớp intelligence bên trong sản phẩm, không phải định vị thương hiệu chính.

---

## 2. Định Vị

### Định vị chính

**BlockID is an enterprise-grade AI trust layer for fundraising, valuation and ownership management across private companies.**

### Phiên bản ngắn

**Investor-ready in 10 minutes. Verified for diligence.**

### Founder-facing

**Know what investors will question before the meeting.**

### Investor-facing

**A tamper-evident pre-diligence pack for Australian startup fundraising.**

### Advisor-facing

**A standardized readiness dashboard for every founder client.**

### Platform-facing

**A SaaS or standalone/private platform for SMEs, startups, investors, shareholders, advisors and related private-company stakeholders.**

### Positioning guardrail

Do not position BlockID as an "AI agent product". AI-powered workflows and assistant-like experiences can exist inside the platform, but external positioning should emphasize trust layer, enterprise platform, SaaS/standalone deployment, ownership intelligence and investor-ready infrastructure.

### Elevator Pitch Version

**You know how...**  
Startups waste weeks managing fundraising documents, ownership records, investor updates and financial reports across disconnected tools.

**Well what we do is...**  
BlockID.au uses an AI-powered trust layer to automate datarooms, manage shares, analyze business performance, forecast valuation and generate proof-backed investor-ready reports in minutes.

**In fact...**  
We're building the AI trust layer for fundraising — helping startups manage ownership smarter, predict company value and raise capital with confidence.

---

## 3. ICP Và Thị Trường Ưu Tiên

### Tier 1 — Beachhead ICP trong 6 tháng đầu

Founder Úc từ pre-seed đến Series A đang gọi vốn trong 0-6 tháng tới.

| Tiêu chí | Giá trị |
|---|---|
| Địa lý | Sydney, Parramatta, Melbourne |
| Stage | Pre-seed đến Series A |
| Raise size | AUD 200k-5M |
| Revenue | AUD 0-5M ARR |
| Headcount | 2-30 |
| Tech maturity | Dùng Stripe, Xero/MYOB hoặc HubSpot |
| Pain trigger | Đang chuẩn bị hoặc đang chạy round |
| Budget signal | Đã trả tiền luật sư cho SAFE/term sheet trong 12 tháng gần nhất |

### Tier 2 — Expansion ICP

- Accountants phục vụ 20+ SME/startup clients
- Startup lawyers
- Angel syndicates và family offices
- Accelerators, incubators, venture studios

### Tier 3 — Enterprise ICP

- Holding companies có nhiều công ty con
- Venture studios quy mô lớn
- Family offices cần quản trị nhiều private holdings

---

## 4. Core Problem

Startup và SME tư nhân đang vận hành identity, ownership, valuation và due diligence bằng nhiều hệ thống rời rạc:

- spreadsheets
- PDFs
- email
- accounting software
- legal documents
- manual governance
- investor records tách rời

Hệ quả:

- ownership không rõ
- valuation thiếu tin cậy
- governance yếu
- due diligence tốn thời gian
- investor confidence thấp
- fundraising chậm
- dữ liệu lịch sử khó chứng minh

Vấn đề cốt lõi:

> Private companies thiếu một persistent trust identity.

---

## 5. Product Wedge

### Wedge artifact

**Investor-Ready Score™**

Một score 0-100 có thể tạo nhanh, giải thích được, xuất PDF và chia sẻ bằng investor link.

Score gồm 5 sub-scores:

- Financial Traction
- Cap Table Hygiene
- Governance Readiness
- Documentation Quality
- Fundraising Clarity

Investor-Ready Score không được định vị như final valuation. Phải định vị là:

> Fundraising readiness and evidence quality score.

### Promise

Founder nhận được:

- một score dễ hiểu
- một PDF shareable
- một investor view link
- một action plan
- một checklist để biết investor sẽ hỏi gì
- proof trail để chứng minh artifact không bị sửa sau khi gửi

---

## 6. Yêu Cầu Sản Phẩm

### Product Pillar — BlockID Intelligence Layer

BlockID Intelligence Layer là trục khác biệt chính của sản phẩm:

> **AI trust layer and enterprise platform for SME/startup fundraising, valuation, ownership management and investor/shareholder intelligence.**

Lớp intelligence này phải được thiết kế như một hệ thống AI-powered workflow có thể đọc dữ liệu, phân tích, tạo action plan, hỏi thêm thông tin thiếu, sinh investor-ready artifacts và cập nhật readiness liên tục. Có thể đóng gói dưới dạng SaaS hoặc standalone/private solution tùy nhu cầu dữ liệu, bảo mật và triển khai của khách hàng.

#### Capability 1 — Analyze Startup Data

Intelligence layer cần phân tích được:

- business data
- financial reports
- accounting data
- Xero / Stripe / MYOB data khi tích hợp đã sẵn sàng
- cap table và shareholder records
- fundraising inputs: stage, sector, raise target, valuation/cap, runway, ARR/MRR

Output:

- founder-readable business snapshot
- investor readiness risks
- missing data questions
- data quality/confidence score
- action plan để cải thiện dữ liệu trước khi gửi investor

#### Capability 2 — Automated Dataroom

Intelligence layer cần hỗ trợ:

- tự organize documents theo investor-ready structure
- auto checklist theo stage/sector/raise type
- verify document completeness
- realtime updates khi founder thay đổi dữ liệu
- map mỗi document vào readiness/report/proof trail

Output:

- dataroom readiness status
- missing document list
- document risk flags
- investor-ready folder structure
- suggested owner/reviewer cho từng item

#### Capability 3 — Smart Share Management

Intelligence layer cần hỗ trợ ownership workflows:

- manage ownership records
- issue shares workflow support
- track shareholders
- dilution simulation
- option pool management
- founder control impact
- event history/provenance

Output:

- cap table health summary
- dilution forecast
- shareholder movement summary
- option pool impact
- governance/action checklist

#### Capability 4 — AI Market Intelligence

Intelligence layer cần phân tích:

- market category
- competitor landscape
- valuation benchmark signals
- growth opportunities
- investor fit / matching signals

Output:

- competitor comparison
- market positioning brief
- benchmark valuation context
- investor thesis fit reasons
- growth opportunity list

Guardrail:

- Investor matching là discovery support, không phải marketplace hoặc securities offer.

#### Capability 5 — AI Financial Intelligence

Intelligence layer cần tự động phân tích:

- cashflow
- total revenue
- total cost
- burn rate
- runway
- profit/loss
- fundraising readiness

Output:

- financial health summary
- burn/runway alerts
- readiness impact
- founder action plan
- investor-facing financial explanation

#### Capability 6 — AI Valuation Engine

Intelligence layer cần có valuation intelligence, nhưng không định vị như final valuation.

Capabilities:

- estimate company valuation range
- benchmark valuation
- analyze risk
- generate investor scoring
- forecast enterprise value scenarios

Output:

- valuation range with assumptions
- benchmark context
- risk-adjusted narrative
- investor-ready valuation explanation
- confidence and missing-data indicators

Guardrail:

- Luôn ghi rõ valuation là estimate/model output dựa trên assumptions, không phải investment advice hoặc formal valuation.

#### Capability 7 — Predictive Investment Intelligence

Intelligence layer cần hỗ trợ dự báo:

- growth
- future valuation
- shareholder value
- investment potential
- red flags

Output:

- scenario forecast
- shareholder value outlook
- upside/downside drivers
- red flag list
- next-best actions để tăng readiness/value

#### Capability 8 — Investor Intelligence Layer

Intelligence layer cần phân tích investor engagement:

- track investor activity
- identify who viewed reports
- measure engagement
- investor heat scoring
- readiness analytics

Output:

- investor engagement timeline
- investor heat score
- most-viewed sections
- follow-up recommendations
- founder activity dashboard

Privacy:

- Không expose raw IP.
- Engagement scoring phải minh bạch và dùng để hỗ trợ founder follow-up, không claim investor intent chắc chắn.

### P0 — Investor-Ready Score v2

Nâng cấp từ score v1 hiện có.

Yêu cầu:

- score 0-100
- 5 sub-scores
- confidence score
- missing data checklist
- evidence/rationale cho từng sub-score
- benchmark intake fields: stage, sector, ARR band, raise target, valuation/cap
- founder action plan
- score version
- investor-safe explanation text
- PDF export
- shareable investor link

Definition of done:

- Founder hoàn thành flow trong dưới 10 phút.
- Score có thể giải thích được mà không cần sales call.
- PDF và investor link dùng cùng dữ liệu source.
- Score được lưu vào database nếu Supabase đã cấu hình.

### P0 — Term Sheet AI v2 + Dilution Simulator

Nâng cấp từ Term Sheet AI v1 hiện có.

Yêu cầu:

- paste/upload term sheet text
- extracted key terms table
- clause confidence
- plain-English summary
- severity-ranked red flags
- founder-friendly vs investor-friendly classification
- AU market comparison
- dilution impact
- control impact
- option pool impact
- lawyer questions
- founder action items
- structured output được validate bằng schema

Các term cần extract:

- valuation cap / pre-money valuation
- discount
- liquidation preference
- anti-dilution
- pro-rata rights
- MFN
- board rights
- drag-along / tag-along
- vesting
- ESOP top-up
- conversion mechanics

Definition of done:

- Demo có thể paste term sheet và trả về analysis trong một flow rõ ràng.
- Output tránh legal-advice claim.
- Có demo fallback nếu API key chưa cấu hình.

### P0 — Data Room Checklist MVP

Không bắt đầu bằng upload AI phức tạp. Ship checklist trước.

Sections:

- Corporate
- Cap Table
- Financing Documents
- Governance
- Financials
- Tax / R&D / ESIC
- Product / Customers
- Legal / IP

Mỗi item cần có:

- status
- investor-readiness impact
- why it matters
- who should review it
- upload placeholder

### P0 — Investor View Link v2

Nâng cấp từ `/s/[slug]` hiện có.

Yêu cầu:

- per-investor link records
- investor email association
- unique view tracking
- time/view analytics
- founder activity dashboard
- optional score-viewed email notification
- expiry/revoke controls cho paid tiers

Definition of done:

- Founder biết investor nào đã mở link.
- View tracking không expose raw IP.
- Email notification có rate-limit hoặc preferences trước khi bật production.

### P1 — Fundraising Readiness Report

Nâng cấp từ score PDF hiện có.

Report gồm:

- Investor-Ready Score
- sub-score explanations
- missing-data checklist
- cap table / dilution summary
- term sheet risk summary
- data room checklist summary
- proof status
- recommended founder actions

Definition of done:

- PDF đủ tốt để founder gửi investor.
- Nội dung không claim là legal, tax hoặc investment advice.
- Report có thể link tới proof record.

### P1 — Proof Infrastructure MVP

Blockchain không phải product chính trong 90 ngày đầu. Dùng proof infrastructure để tạo tamper-evidence.

Yêu cầu:

- canonical JSON serialization
- SHA-256 hoặc BLAKE3 hashing
- append-only trust events trong Postgres/Supabase
- score snapshot proof
- PDF hash
- proof id
- verify page
- downloadable proof certificate
- optional Merkle batch root

Không lưu on-chain:

- PDFs
- financial statements
- passport/KYC data
- raw cap table data
- personal information cần sửa/xóa theo privacy obligations

### P1 — Document Proof Vault

Cho phép tạo integrity proof cho:

- term sheets
- SAFEs
- share certificates
- shareholder agreements
- board resolutions
- investor-ready PDFs

Lưu:

- document hash
- document type
- company id
- uploader/signer reference
- timestamp
- proof status

Không claim thay thế legal execution.

### P1 — Cap Table Health Check

Xây trên Cap Table Diff hiện có.

Yêu cầu:

- detect ownership/cap table hygiene issues
- show dilution before/after
- option pool impact
- founder control impact
- board/shareholder PDF export
- link vào Fundraising Readiness Report

### P1 — AU Compliance Mini-Checkers

Yêu cầu:

- ABN / ACN / ASIC profile status
- ESIC pre-check
- R&D Tax Incentive readiness
- ASIC share register hygiene
- proprietary company shareholder-count warning
- fundraising disclosure risk pre-check
- data room privacy hygiene

Guardrails:

- ESIC/R&D là pre-check, không phải advice.
- Term sheet output là analysis, không phải legal advice.
- Investor matching là discovery support, không phải securities offer.
- CSF, secondary liquidity và marketplace cần legal review trước launch.

### P2 — Investor Matching Lite

Không launch marketplace.

Yêu cầu:

- suggested investor profiles
- thesis fit
- cheque size fit
- stage fit
- geography fit
- match reasons
- warm intro notes

Tránh language giống regulated capital raising marketplace.

---

## 7. Yêu Cầu Kỹ Thuật

### Stack hiện tại

- Frontend: Next.js App Router, React, TypeScript, Tailwind v4
- UI: Lucide, shadcn-style primitives
- Backend: Next.js route handlers
- Database: Supabase/Postgres
- Email: Resend
- AI: Anthropic Claude Sonnet qua structured output
- PDF: `@react-pdf/renderer`
- Deploy: Docker Compose + Caddy
- Hosting target: VPS self-hosted sau Caddy

### Production requirements

- HTTPS cho `https://blockid.au`
- `https://www.blockid.au` redirect 308 về apex
- Caddy auto TLS
- HSTS
- CSP
- API CORS chỉ cho `https://blockid.au`
- non-root container
- healthcheck
- Supabase service-role key chỉ dùng server-side
- graceful demo/no-op fallback khi Supabase, Resend hoặc Anthropic chưa cấu hình

### Data requirements

Capture để xây data moat:

- score history
- missing document patterns
- extracted term sheet clauses
- cap table mistakes
- valuation/cap ranges
- sector/stage benchmarks
- investor view behavior
- founder actions taken
- final raise outcomes
- advisor review outcomes

---

## 8. Trạng Thái Source Hiện Tại

| Capability | Status | Source |
|---|---|---|
| Marketing landing page | Shipped | `web/src/app/page.tsx`, `web/src/components/landing/*` |
| Investor-Ready Score intake | Shipped v1 | `web/src/app/score/page.tsx`, `web/src/app/score/score-form.tsx` |
| Score engine | Shipped v1 | `web/src/lib/score.ts` |
| Score API | Shipped | `web/src/app/api/score/route.ts` |
| Score persistence | Shipped | `web/supabase/migrations/0001_init.sql`, `web/src/lib/supabase.ts` |
| Investor View Link | Shipped v1 | `web/src/app/s/[slug]/page.tsx` |
| Investor view tracking | Shipped v1 | `web/src/app/s/[slug]/page.tsx`, `web/src/lib/iphash.ts` |
| Score PDF | Shipped | `web/src/app/s/[slug]/pdf/route.ts`, `web/src/lib/pdf/score-pdf.tsx` |
| Lead capture | Shipped | `web/src/app/api/lead/route.ts` |
| Resend score-ready email | Shipped | `web/src/lib/email.ts` |
| Score-viewed email template | Present, not fully wired | `web/src/lib/email.ts` |
| Founder Dilution Calculator | Shipped | `web/src/app/tools/dilution/*` |
| Cap Table Diff | Shipped | `web/src/app/tools/cap-table/*`, `web/src/lib/cap-table.ts` |
| Term Sheet AI page/API | Shipped v1 | `web/src/app/tools/term-sheet/*`, `web/src/app/api/term-sheet/route.ts` |
| Claude structured analysis | Shipped v1 | `web/src/lib/term-sheet/*` |
| Docker/Caddy deploy | Shipped | `web/Dockerfile`, `web/docker-compose.yml`, `web/infra/*` |

---

## 9. Implementation Map

### Requirement Group A — Score v2 Upgrade

Update:

- `web/src/lib/score.ts`
- `web/src/app/score/score-form.tsx`
- `web/src/app/api/score/route.ts`
- `web/supabase/migrations/*`
- `web/src/lib/pdf/score-pdf.tsx`

Add:

- confidence score
- missing input checklist
- benchmark intake fields
- founder action plan
- score version
- rationale/evidence per sub-score

### Requirement Group B — Investor Link v2

Update:

- `web/src/app/s/[slug]/page.tsx`
- `web/src/app/score/score-form.tsx`
- `web/supabase/migrations/*`

Add:

- per-investor link records
- investor email association
- analytics dashboard
- expiry/revoke controls
- optional `sendScoreViewed` wiring

### Requirement Group C — Fundraising Readiness Report

Update:

- `web/src/app/s/[slug]/pdf/route.ts`
- `web/src/lib/pdf/score-pdf.tsx`
- `web/src/lib/term-sheet/*`
- `web/src/lib/cap-table.ts`

Add:

- combined readiness report sections
- proof status section
- recommended action plan

### Requirement Group D — Term Sheet AI v2

Update:

- `web/src/app/tools/term-sheet/term-sheet-tool.tsx`
- `web/src/app/api/term-sheet/route.ts`
- `web/src/lib/term-sheet/analyze.ts`
- `web/src/lib/term-sheet/schema.ts`

Add:

- clause confidence
- extracted terms export
- lawyer questions
- founder action items
- persisted analysis records
- proof hook

### Requirement Group E — Data Room Checklist MVP

New:

- `web/src/app/tools/data-room/page.tsx`
- `web/src/app/tools/data-room/data-room-checklist.tsx`
- future `web/src/app/api/data-room/route.ts`

### Requirement Group F — Proof Infrastructure MVP

New:

- `web/src/lib/proofs/hash.ts`
- `web/src/lib/proofs/canonical-json.ts`
- `web/src/app/api/proofs/score/route.ts`
- `web/src/app/verify/[proofId]/page.tsx`
- migration cho `trust_events`, `score_proofs`, `document_proofs`, `anchor_batches`

### Requirement Group G — BlockID Intelligence Layer Foundation

Goal:

> Xây intelligence layer thống nhất cho fundraising readiness, dataroom automation, ownership management, financial intelligence, valuation intelligence và investor intelligence.

New:

- `web/src/lib/intelligence/context.ts`
- `web/src/lib/intelligence/tools.ts`
- `web/src/lib/intelligence/planner.ts`
- `web/src/lib/intelligence/schemas.ts`
- `web/src/lib/intelligence/memory.ts`
- `web/src/app/api/intelligence/route.ts`
- `web/src/app/intelligence/page.tsx`
- migrations cho `intelligence_sessions`, `intelligence_messages`, `intelligence_tasks`, `intelligence_insights`, `intelligence_tool_runs`

Initial tools:

- `analyze_startup_data`
- `analyze_financials`
- `analyze_cap_table`
- `generate_dataroom_checklist`
- `analyze_term_sheet`
- `simulate_dilution`
- `estimate_valuation_range`
- `benchmark_market`
- `score_investor_engagement`
- `generate_investor_report`

Intelligence context inputs:

- score submissions
- term sheet analyses
- data room checklist state
- cap table/dilution inputs
- investor link activity
- future Xero / Stripe / MYOB sync data
- document proof metadata

Definition of done:

- Founder có thể hỏi một câu như: "Am I ready to raise AUD 1M?" và nhận được structured answer gồm readiness, gaps, risks, next actions và artifacts cần tạo.
- Intelligence output có schema validation.
- Mỗi insight có source reference hoặc confidence indicator.
- Hệ thống không đưa legal/tax/investment advice claim.
- Sensitive data không được gửi ra third-party AI nếu chưa có control rõ ràng.

### Requirement Group H — Financial, Market And Valuation Intelligence

Goal:

> Biến BlockID từ readiness checklist thành intelligence engine có khả năng giải thích cashflow, runway, valuation, market benchmark và investment potential.

New / update:

- `web/src/lib/financials/metrics.ts`
- `web/src/lib/financials/schema.ts`
- `web/src/lib/valuation/engine.ts`
- `web/src/lib/valuation/benchmarks.ts`
- `web/src/lib/market/competitors.ts`
- `web/src/lib/market/investor-fit.ts`
- `web/src/app/tools/valuation/page.tsx`
- `web/src/app/tools/financial-health/page.tsx`

Metrics:

- revenue
- costs
- gross margin where applicable
- burn rate
- runway
- profit/loss
- growth rate
- cash conversion signal
- fundraising readiness impact

Definition of done:

- Founder có financial health summary rõ ràng.
- Valuation output là range + assumptions + confidence, không phải single definitive number.
- Market benchmark có source/date/assumption labels.
- Investor matching dùng language "fit / discovery / suggested profiles", không dùng language của marketplace.

---

## 10. Requirement Intake Log

Phần này ghi nhận các yêu cầu đã được thống nhất để tránh thất lạc khi chuyển sang code.

| Nhóm yêu cầu | Nội dung đã ghi nhận | Trạng thái tài liệu | Trạng thái code |
|---|---|---|---|
| Positioning | BlockID là enterprise-grade AI trust layer cho fundraising, valuation và ownership management across private companies. Không định vị là AI agent product. | Recorded | Landing copy partial |
| Deployment model | Có thể cung cấp dưới dạng SaaS hoặc standalone/private solution cho SMEs, startups, investors, shareholders, advisors, accelerators và related stakeholders. | Recorded | Planned |
| Intelligence layer | AI là lớp intelligence/workflow bên trong platform, không phải định vị thương hiệu chính. | Recorded | Planned |
| Analyze Startup Data | Phân tích business data, financial reports, accounting data, Xero/Stripe/MYOB future data, cap table. | Recorded | Planned |
| Automated Dataroom | Auto-organize documents, checklist, verify completeness, investor-ready structure, realtime updates. | Recorded | Checklist shipped, automation planned |
| Smart Share Management | Ownership management, issue shares workflow support, shareholder tracking, dilution, option pool. | Recorded | Dilution + cap table tools shipped light |
| AI Market Intelligence | Market analysis, competitor comparison, valuation benchmark context, growth opportunities, investor fit. | Recorded | Planned |
| AI Financial Intelligence | Cashflow, revenue, cost, burn, runway, P/L, fundraising readiness. | Recorded | Planned |
| AI Valuation Engine | Valuation range, benchmark valuation, risk analysis, investor scoring, forecast enterprise value scenarios. | Recorded | Planned |
| Predictive Investment Intelligence | Growth forecast, future valuation scenarios, shareholder value outlook, red flags. | Recorded | Planned |
| Investor Intelligence Layer | Investor activity tracking, viewed reports, engagement, heat score, readiness analytics. | Recorded | View tracking shipped light |
| Proof infrastructure | Canonical hash, score proof, document proof, verify page, proof certificate. | Recorded | Planned |
| Guardrails | No legal/tax/investment advice claim; no raw IP exposure; no sensitive personal data on-chain; valuation is estimate with assumptions. | Recorded | Partial |
| Landing page | Why/How/What, audience, problems, solution, elevator pitch, value, share/manage, trust strip. | Recorded | Shipped |

---

## 11. Code Implementation Preparation Plan

Mục tiêu của phần này là biến yêu cầu tổng thể thành lộ trình kỹ thuật sẵn sàng để bắt đầu code.

### 11.1 Nguyên tắc triển khai

- Build theo vertical slices, mỗi slice có schema, logic, API, UI và test/build verification.
- Ưu tiên dùng dữ liệu hiện có: `scores`, `score_views`, Term Sheet AI, Data Room Checklist, Cap Table/Dilution tools.
- Không đổi định vị public thành "AI agent"; trong code có thể dùng `intelligence` namespace cho AI-powered workflows.
- Mọi output quan trọng cần có `confidence`, `sources`, `missingData`, `guardrailText`.
- Không block demo khi thiếu Supabase/AI provider; giữ fallback như pattern hiện tại.
- Không lưu sensitive data on-chain; proof chỉ hash canonical artifacts.

### 11.2 Sprint 0 — Codebase Preparation

Goal:

> Chuẩn bị foundation để các sprint sau không bị rối module/schema.

Files to inspect first:

- `web/src/lib/score.ts`
- `web/src/app/api/score/route.ts`
- `web/src/app/score/score-form.tsx`
- `web/src/app/s/[slug]/page.tsx`
- `web/src/app/s/[slug]/activity/page.tsx`
- `web/src/lib/term-sheet/schema.ts`
- `web/src/lib/term-sheet/analyze.ts`
- `web/src/lib/cap-table.ts`
- `web/src/app/tools/data-room/data-room-checklist.tsx`
- `web/supabase/migrations/0001_init.sql`
- `web/supabase/migrations/0002_score_v2.sql`

Add / update:

- `web/src/lib/intelligence/schemas.ts`
- `web/src/lib/intelligence/context.ts`
- `web/src/lib/intelligence/guardrails.ts`
- `web/src/lib/intelligence/sources.ts`
- `web/supabase/migrations/0003_intelligence_foundation.sql`

Database migration draft:

- `intelligence_sessions`
- `intelligence_messages`
- `intelligence_insights`
- `intelligence_tasks`
- `intelligence_tool_runs`

Acceptance criteria:

- TypeScript schemas compile.
- Migration can run idempotently.
- No UI change required.
- `npm run lint` and `npm run build` pass.

### 11.3 Sprint 1 — Intelligence Readiness Q&A MVP

Goal:

> Founder hỏi readiness question và nhận structured answer dựa trên Score, Data Room Checklist, Term Sheet/Dilution context.

Add:

- `web/src/lib/intelligence/readiness.ts`
- `web/src/lib/intelligence/tools.ts`
- `web/src/app/api/intelligence/route.ts`
- `web/src/app/intelligence/page.tsx`
- `web/src/app/intelligence/intelligence-workspace.tsx`

API contract:

```ts
POST /api/intelligence
{
  "question": "Am I ready to raise AUD 1M?",
  "scoreId": "optional-share-slug",
  "context": {
    "companyName": "...",
    "stage": "seed",
    "raiseTargetAud": 1000000
  }
}
```

Response shape:

```ts
{
  "summary": "...",
  "readiness": "ready | needs_work | high_risk",
  "confidence": 0,
  "sources": [],
  "gaps": [],
  "risks": [],
  "nextActions": [],
  "recommendedArtifacts": [],
  "guardrailText": "..."
}
```

Acceptance criteria:

- Works without AI key using deterministic fallback.
- Uses Score v2 data when `scoreId` exists.
- Every answer includes confidence, sources and guardrail text.
- No legal/tax/investment advice claim.

### 11.4 Sprint 2 — Automated Dataroom Intelligence

Goal:

> Nâng checklist hiện có thành dataroom readiness system.

Update:

- `web/src/app/tools/data-room/data-room-checklist.tsx`

Add:

- `web/src/lib/dataroom/schema.ts`
- `web/src/lib/dataroom/rules.ts`
- `web/src/lib/dataroom/readiness.ts`
- `web/src/app/api/data-room/route.ts`
- `web/supabase/migrations/0004_dataroom.sql`

Database:

- `datarooms`
- `dataroom_items`
- `dataroom_events`

Core rules:

- Corporate
- Cap Table
- Financing Documents
- Governance
- Financials
- Tax / R&D / ESIC
- Product / Customers
- Legal / IP

Acceptance criteria:

- Checklist can produce readiness percent.
- Items show status, why it matters, impact and reviewer.
- Intelligence layer can read dataroom state.
- UI remains useful before upload automation exists.

### 11.5 Sprint 3 — Smart Share Management And Ownership Intelligence

Goal:

> Chuẩn hóa ownership/cap table workflows để phục vụ dilution, option pool và shareholder intelligence.

Update:

- `web/src/lib/cap-table.ts`
- `web/src/app/tools/cap-table/cap-table-diff.tsx`
- `web/src/app/tools/dilution/dilution-calculator.tsx`

Add:

- `web/src/lib/ownership/schema.ts`
- `web/src/lib/ownership/health.ts`
- `web/src/lib/ownership/events.ts`
- `web/src/lib/ownership/option-pool.ts`
- `web/supabase/migrations/0005_ownership.sql`

Database:

- `companies`
- `shareholders`
- `ownership_events`
- `option_pools`
- `share_classes`

Acceptance criteria:

- Can calculate ownership summary.
- Can model dilution before/after round.
- Can flag unclear ownership, missing shareholder agreement, ESOP risk, control risk.
- All output labels are analysis/support, not legal advice.

### 11.6 Sprint 4 — AI Financial Intelligence

Goal:

> Tạo financial health engine trước khi tích hợp OAuth.

Add:

- `web/src/lib/financials/schema.ts`
- `web/src/lib/financials/metrics.ts`
- `web/src/lib/financials/readiness.ts`
- `web/src/app/tools/financial-health/page.tsx`
- `web/src/app/tools/financial-health/financial-health-tool.tsx`
- `web/src/app/api/financial-health/route.ts`

Inputs:

- revenue
- costs
- cash balance
- monthly burn
- runway
- gross margin where applicable
- ARR/MRR
- growth rate

Future connector requirements:

- Xero mapping
- Stripe mapping
- MYOB mapping

Acceptance criteria:

- Manual financial input works.
- Outputs cashflow, revenue, cost, burn, runway, P/L and readiness impact.
- Missing data clearly shown.
- Can feed Intelligence Readiness Q&A.

### 11.7 Sprint 5 — AI Valuation Engine

Goal:

> Tạo valuation range + assumptions engine, không tạo final valuation claim.

Add:

- `web/src/lib/valuation/schema.ts`
- `web/src/lib/valuation/engine.ts`
- `web/src/lib/valuation/benchmarks.ts`
- `web/src/lib/valuation/scenarios.ts`
- `web/src/app/tools/valuation/page.tsx`
- `web/src/app/tools/valuation/valuation-tool.tsx`
- `web/src/app/api/valuation/route.ts`

Outputs:

- valuation range
- assumptions
- benchmark context
- risk factors
- confidence
- base/upside/downside scenarios

Acceptance criteria:

- Output is a range, not a single definitive number.
- Uses visible assumptions and confidence.
- Includes guardrail: estimate only, not investment advice or formal valuation.
- Can feed Fundraising Readiness Report.

### 11.8 Sprint 6 — Market And Investor Intelligence

Goal:

> Tạo market/investor intelligence không biến thành marketplace.

Add:

- `web/src/lib/market/schema.ts`
- `web/src/lib/market/competitors.ts`
- `web/src/lib/market/investor-fit.ts`
- `web/src/lib/investors/engagement.ts`
- `web/src/lib/investors/heat-score.ts`
- `web/src/app/s/[slug]/activity/page.tsx` update
- `web/src/app/api/investor-activity/route.ts`

Outputs:

- competitor comparison
- market positioning brief
- growth opportunities
- investor fit reasons
- engagement timeline
- investor heat score
- follow-up recommendations

Acceptance criteria:

- Heat score uses transparent signals: recency, repeat views, section engagement, report downloads.
- Does not claim investor intent as certainty.
- Does not facilitate securities transaction or marketplace activity.

### 11.9 Sprint 7 — Proof Infrastructure

Goal:

> Tạo tamper-evident proof cho score/report/document artifacts.

Add:

- `web/src/lib/proofs/canonical-json.ts`
- `web/src/lib/proofs/hash.ts`
- `web/src/lib/proofs/certificate.ts`
- `web/src/app/api/proofs/score/route.ts`
- `web/src/app/verify/[proofId]/page.tsx`
- `web/supabase/migrations/0006_proofs.sql`

Database:

- `trust_events`
- `score_proofs`
- `document_proofs`
- `anchor_batches`

Acceptance criteria:

- Score snapshot can generate proof id.
- Verify page can confirm hash/proof status.
- No raw PDFs or personal data stored on-chain.
- Proof can be included in PDF/report.

### 11.10 Sprint 8 — Fundraising Readiness Report v2

Goal:

> Gom score, financials, valuation, dataroom, ownership và investor intelligence thành investor-ready report.

Update:

- `web/src/lib/pdf/score-pdf.tsx`
- `web/src/app/s/[slug]/pdf/route.ts`
- `web/src/app/s/[slug]/page.tsx`

Add:

- `web/src/lib/report/readiness-report.ts`
- `web/src/lib/report/schema.ts`

Report sections:

- Investor-Ready Score
- financial health
- dataroom readiness
- ownership/cap table health
- valuation range
- term sheet risk summary
- proof status
- founder action plan

Acceptance criteria:

- PDF and investor link use the same source data.
- Report can be generated from demo fallback.
- Report includes proof status if available.
- Report avoids legal/tax/investment advice claims.

### 11.11 Sprint 9 — Packaging, Enterprise And Standalone Readiness

Goal:

> Chuẩn bị platform cho SaaS, advisor/accelerator dashboards và future standalone/private deployment.

Add / update:

- tenant/company model
- role model: founder, advisor, investor, shareholder, admin
- advisor dashboard requirements
- accelerator cohort dashboard requirements
- environment separation for SaaS vs private deployment
- data export/import requirements

Future files:

- `web/src/lib/tenancy/schema.ts`
- `web/src/lib/access-control/roles.ts`
- `web/src/app/dashboard/page.tsx`
- `web/src/app/advisor/page.tsx`
- `web/src/app/accelerator/page.tsx`

Acceptance criteria:

- Docs clearly separate SaaS and standalone/private deployment needs.
- Role model supports investors/shareholders/advisors without exposing founder-only data.
- No enterprise claim depends on features not yet built unless marked planned.

### 11.12 Suggested Code Order

Thứ tự implement đề xuất:

1. `0003_intelligence_foundation.sql`
2. `src/lib/intelligence/schemas.ts`
3. `src/lib/intelligence/context.ts`
4. `src/lib/intelligence/guardrails.ts`
5. `src/lib/intelligence/readiness.ts`
6. `src/app/api/intelligence/route.ts`
7. `src/app/intelligence/page.tsx`
8. `src/app/intelligence/intelligence-workspace.tsx`
9. Dataroom schema/rules/API
10. Ownership schema/health/events
11. Financial metrics/tool/API
12. Valuation engine/tool/API
13. Investor engagement heat score
14. Proof infrastructure
15. Readiness Report v2

### 11.13 Verification Checklist For Every Sprint

- `npm run lint`
- `npm run build`
- route/API smoke test with `curl`
- demo fallback test without AI/Supabase where relevant
- no raw IP exposure
- no sensitive personal data on-chain
- no public copy positioning BlockID as an AI agent product
- guardrail text present where valuation/legal/tax/investment analysis appears
- source/confidence metadata present for intelligence outputs

---

## 12. Roadmap 30 / 60 / 90 Ngày

### Days 1-30 — Upgrade Existing Wedge

Ship:

- Investor-Ready Score v2
- confidence và missing-data explanation
- founder action plan
- benchmark intake fields
- Term Sheet AI v2 extracted terms table
- lawyer questions
- Data Room Checklist page
- internal proof record cho score snapshots
- Intelligence layer foundation design: schemas, tool registry, session model, guardrails
- Readiness answer MVP dùng dữ liệu score + checklist + term sheet/dilution inputs

Measure:

- score completion rate
- PDF downloads
- investor share links created
- term sheet analyses run
- lead-to-demo conversion
- intelligence queries asked
- intelligence outputs that lead to report/download/share action

### Days 31-60 — Commercial Proof Pack

Ship:

- Fundraising Readiness Report PDF
- per-investor View Link v2
- founder analytics dashboard
- document proof vault MVP
- SAFE / term sheet / shareholders agreement extraction MVP
- ESIC / R&D / ASIC mini-checkers
- AI Financial Intelligence MVP: revenue, cost, burn, runway, P/L, readiness impact
- AI Valuation Engine MVP: valuation range, assumptions, risk, confidence, benchmark context
- Smart Share Management v1: ownership summary, dilution forecast, option pool impact

Measure:

- investor link open rate
- repeat score generation
- paid pilot conversion
- proof page views
- founder willingness to pay for concierge pack
- valuation reports generated
- financial health reports generated
- cap table/ownership tasks completed

### Days 61-90 — Channel Pilot

Ship:

- accelerator cohort dashboard MVP
- lawyer/accountant review mode
- cap table health check
- proof certificate export
- investor welcome pack MVP
- optional external Merkle root anchoring pilot
- AI Market Intelligence MVP: competitor comparison, positioning brief, growth opportunities
- Investor Intelligence Layer v1: investor heat score, engagement timeline, follow-up recommendations
- Intelligence workspace page combining readiness, dataroom, ownership, valuation and investor engagement

Measure:

- channel-sourced signups
- founders per accelerator
- advisor review completion
- number of investor recipients
- paid pilots closed
- investor heat score usage
- follow-up recommendations accepted
- channel dashboard intelligence summaries generated

---

## 13. Roadmap 6 Tháng

| Tháng | Trọng tâm |
|---|---|
| Month 1 | Nâng Investor-Ready Score thành Score v2 explainable |
| Month 2 | Nâng Term Sheet AI thành demo-closing feature |
| Month 3 | Launch Fundraising Readiness Report và proof-backed investor links |
| Month 4 | Launch Data Room Autopilot và document extraction |
| Month 5 | Launch Cap Table Health Check và AU compliance pack |
| Month 6 | Launch accelerator/lawyer/accountant dashboards |

Intelligence layer sequencing:

| Tháng | Intelligence milestone |
|---|---|
| Month 1 | Intelligence foundation: schema, context, tools, guardrails, readiness Q&A MVP |
| Month 2 | Intelligence layer connects Score, Term Sheet AI, Dilution Simulator và Data Room Checklist |
| Month 3 | Intelligence layer generates Fundraising Readiness Report narrative và investor follow-up recommendations |
| Month 4 | Intelligence layer adds Financial Intelligence: revenue, cost, burn, runway, P/L, readiness impact |
| Month 5 | Intelligence layer adds Valuation + Ownership Intelligence: valuation range, risk, dilution, option pool, shareholder value scenarios |
| Month 6 | Intelligence layer adds Market + Investor Intelligence: competitor comparison, investor fit, heat score, channel dashboard summaries |

### Lộ Trình Thực Hiện Chi Tiết Cho BlockID Intelligence Layer

#### Sprint 1 — Intelligence Foundation And Safety

Deliverables:

- Intelligence session model
- tool registry
- output schemas
- company context loader
- source/confidence metadata format
- advice guardrails
- audit log cho tool runs

Tasks:

- định nghĩa `IntelligenceContext` gồm company profile, score, dataroom, cap table, term sheet, investor activity
- tạo schema cho `IntelligenceAnswer`, `IntelligenceInsight`, `IntelligenceTask`, `ArtifactRecommendation`
- tạo guardrail text cho legal/tax/investment advice
- log mọi intelligence workflow action vào `intelligence_tool_runs`

Acceptance criteria:

- Intelligence layer trả lời được readiness question bằng structured JSON.
- Mỗi insight có source/confidence.
- Không có output claim thay thế lawyer/accountant/investment advisor.

#### Sprint 2 — Analyze Startup Data + Dataroom Automation

Deliverables:

- startup data analyzer
- dataroom checklist generator
- missing document detector
- investor-ready folder structure
- realtime checklist refresh rules

Tasks:

- map các data inputs hiện có từ Score, Term Sheet AI và Data Room Checklist
- tạo rule engine cho required documents theo stage/sector/raise type
- tạo document readiness status: missing, partial, ready, review required
- tạo UI cho intelligence recommendations trong `/intelligence` hoặc dashboard tương lai

Acceptance criteria:

- Founder thấy danh sách documents cần chuẩn bị.
- Intelligence layer giải thích vì sao từng document quan trọng với investor.
- Checklist thay đổi khi founder đổi stage/raise target.

#### Sprint 3 — Smart Share Management + Cap Table Intelligence

Deliverables:

- ownership summary
- shareholder tracking model
- dilution simulator integration
- option pool impact
- founder control impact
- cap table health checklist

Tasks:

- chuẩn hóa cap table input model
- kết nối Cap Table Diff/Dilution tools vào intelligence tools
- tạo ownership risk flags: unclear ownership, missing ESOP, excessive dilution, control risk
- tạo event model chuẩn bị cho proof/provenance

Acceptance criteria:

- Intelligence layer giải thích được round mới ảnh hưởng founder ownership thế nào.
- Intelligence layer nêu được option pool impact.
- Intelligence layer tạo được cap table action checklist.

#### Sprint 4 — AI Financial Intelligence

Deliverables:

- financial metrics engine
- cashflow/revenue/cost/burn/runway/P&L summary
- fundraising readiness impact
- Xero / Stripe / MYOB connector requirements

Tasks:

- tạo `financials/metrics.ts`
- tạo schema cho manual financial intake trước khi OAuth sẵn sàng
- định nghĩa connector mapping cho Xero, Stripe, MYOB
- tạo investor-safe financial narrative

Acceptance criteria:

- Founder nhận financial health summary rõ ràng.
- Intelligence layer phát hiện runway/burn risks.
- Output có confidence/missing-data indicators.

#### Sprint 5 — AI Valuation Engine + Predictive Intelligence

Deliverables:

- valuation range engine
- assumptions model
- benchmark context
- risk-adjusted valuation narrative
- future valuation scenarios
- shareholder value forecast

Tasks:

- tạo valuation input schema: ARR/MRR, growth, margin, burn, runway, sector, stage, raise target
- tạo valuation range logic dựa trên assumptions và benchmark bands
- tạo scenario model: base, upside, downside
- tạo red flag engine cho investment potential

Acceptance criteria:

- Intelligence layer tạo valuation range, không tạo single definitive valuation.
- Mỗi range có assumptions, risk và confidence.
- Founder thấy upside/downside drivers rõ ràng.

#### Sprint 6 — Market Intelligence + Investor Intelligence Layer

Deliverables:

- competitor comparison
- market positioning brief
- growth opportunity list
- investor fit signals
- investor heat score
- engagement timeline
- follow-up recommendations

Tasks:

- tạo competitor/market schema
- tạo investor activity aggregation từ investor links
- tạo heat scoring dựa trên views, recency, sections viewed, repeat engagement
- tạo follow-up suggestion templates

Acceptance criteria:

- Founder biết investor nào engaged nhất.
- Intelligence layer đề xuất follow-up phù hợp.
- Heat score không claim chắc chắn investor intent.

#### Cross-Cutting Workstream — Proof, Privacy And Compliance

Áp dụng cho mọi sprint:

- không lưu sensitive data on-chain
- hash canonical artifacts khi cần proof
- không expose raw IP
- mọi AI output quan trọng có source/confidence
- investor matching chỉ là discovery support
- valuation là estimate dựa trên assumptions
- legal/tax/investment advice guardrails luôn hiển thị ở các output liên quan

Success target cuối tháng 6:

- 100 paying logos
- 1,000 free scores generated
- 5 accelerator/advisor channel partners
- AUD 30k+ MRR
- 500+ structured company benchmarks captured
- 1,000+ intelligence insights generated with source/confidence metadata
- 100+ investor engagement timelines analyzed

---

## 14. Long-Term Roadmap

### Phase 1 — Shipped / current foundation

- Marketing site
- Investor-Ready Score MVP
- Founder Dilution Calculator
- Supabase persistence
- Resend transactional email
- Score PDF
- Investor View Link
- view tracking
- Cap Table Diff
- Term Sheet AI v1

### Phase 2 — Near-term upgrade

- Score v2
- Term Sheet AI v2
- Data Room Checklist
- Fundraising Readiness Report
- Investor analytics v2
- proof infrastructure MVP
- BlockID Intelligence Layer foundation
- AI readiness Q&A
- intelligence-generated founder action plan

### Phase 3 — Growth

- Cap Table OS
- One-Click Data Room
- Comparable Companies with real data
- Stripe/Xero OAuth
- advisor dashboards
- accelerator dashboards
- AI Financial Intelligence
- AI Valuation Engine
- Smart Share Management
- Investor Intelligence Layer

### Phase 4 — Trust infrastructure

- governance workflows
- blockchain audit anchors
- proof certificates
- investor APIs
- private listings only after legal review
- predictive investment intelligence
- market intelligence benchmarks
- workflow automation across dataroom, ownership and investor engagement

### Phase 5+ — Deferred vision

- sovereign enterprise chains
- marketplace
- secondary liquidity
- tokenized ownership
- digital ownership exchange

Do not build Phase 5 until there are at least 100 paying customers and clear legal review.

---

## 15. GTM Plan

### One-sentence GTM

> BlockID is the AI valuation and investor-ready platform built for Australian founders raising their next round — get your Investor-Ready Score in 5 minutes, free.

### Elevator pitch

> Startups waste weeks managing fundraising documents, ownership records, investor updates and financial reports across disconnected tools. BlockID.au uses an AI-powered trust layer to automate datarooms, manage shares, analyze business performance, forecast valuation and generate proof-backed investor-ready reports in minutes. We are building the AI trust layer for fundraising — helping startups manage ownership smarter, predict company value and raise capital with confidence.

### Phase 1 — Months 0-3

Founder-led design partner mode.

Goals:

- 30 design partners
- 10 paying logos
- 5 video testimonials
- 1 anchor case study

Actions:

- 20 founder discovery interviews
- 3 design partners signed first
- MVP scope locked around Score + Cap Table + Stripe/Xero plug
- founder personally onboards each customer

### Phase 2 — Months 3-6

Wedge growth + accelerator channel.

Goals:

- 100 paying logos
- 1,000 free Score users
- AUD 30k MRR
- 1 anchor accelerator partnership

Actions:

- public Investor-Ready Score
- SEO Founder Dilution Calculator
- accelerator warm intro campaign
- hire/assign BD for accelerator relationships

### Phase 3 — Months 6-12

Channel scale.

Goals:

- 500 paying logos
- AUD 150k MRR
- 5 accelerator partnerships

Actions:

- Xero/MYOB accountant channel
- startup lawyer referral channel
- VC Investor Welcome Pack
- buy-side reporting dashboard

---

## 16. Pricing Và Packaging

| Tier | Price | Included |
|---|---:|---|
| Free | AUD 0 | Investor-Ready Score, PDF, basic share link, public dilution calculator |
| Founder | AUD 99/mo | Score history, founder action plan, investor link tracking, data room checklist, basic Term Sheet AI credits |
| Growth | AUD 499/mo | Term Sheet AI + dilution simulator, Fundraising Readiness Report, per-investor share links, document proof vault, cap table health check, priority support |
| Pilot Concierge | AUD 5,000 once-off | founder interview, cleaned report, cap table health check, term sheet review pack, data room setup, proof-backed PDF, testimonial commitment |
| Accelerator / Advisor | Custom | cohort dashboard, client readiness dashboard, aggregate analytics, white-label report, referral/revenue share |
| Enterprise | AUD 50k-500k/year | multi-entity trust infrastructure, future sovereign/enterprise chain features |

Important:

> Pilot Concierge at AUD 5,000 is the first-30-customers SKU.

---

## 17. Sales Motion Và Demo

### 5-minute demo script

1. Hook: "Most SME valuations are made up."
2. Live demo: connect or simulate Stripe + Xero, generate Investor-Ready Score.
3. Paste term sheet, show redline + dilution simulation.
4. Send Investor View Link, show view notification/analytics.
5. Show AU comparable/benchmark framing.
6. Close with Pilot Concierge offer.

### Objection handling

| Objection | Response |
|---|---|
| Why not Carta? | Carta is US-centric; BlockID is AU-native with ASIC/ESIC/R&D readiness, AI pre-diligence and investor-ready proof. |
| Why blockchain? | It is optional proof infrastructure, not a token product. It proves score/document integrity. |
| We use spreadsheets. | BlockID turns messy data into an investor-ready artifact in minutes. |
| Too expensive. | Free score now; paid tiers unlock tracking, reports, Term Sheet AI and concierge readiness. |
| Investors will not trust AI valuation. | BlockID does not sell a black-box final valuation; it shows evidence quality, benchmarks, assumptions and red flags. |
| Data is sensitive. | Use encryption, AU data residency where configured, server-side secrets, hashed IP tracking and no personal data on-chain. |

---

## 18. Channels

| Channel | Offer | Incentive |
|---|---|---|
| Accountants | Co-branded valuation/readiness reports | Revenue share + client retention |
| Startup lawyers | Cap table/term sheet workflow | Referral fee |
| Accelerators | White-label cohort dashboard | Cohort analytics + founder artifact |
| VCs / angels | Investor Welcome Pack | Standardized portfolio reporting |
| Venture studios | Multi-entity dashboard | Portfolio management |

---

## 19. Metrics

### Weekly metrics

- Free Investor-Ready Scores generated
- Free Score to paid conversion
- Score completion rate
- PDF downloads
- investor share links created
- investor link open rate
- term sheet analyses run
- repeat score generation within 90 days
- paid pilot conversions
- MRR
- channel-sourced signups
- number of investor recipients

### Anti-metrics before 100 paying customers

- blockchain transaction count
- sovereign chain deployments
- marketplace listings
- token activity
- secondary liquidity activity

---

## 20. Compliance And Risk Guardrails

Avoid positioning as:

- crypto exchange
- token speculation product
- public securities exchange
- regulated capital raising marketplace
- replacement for lawyers/accountants/tax advisors

Use positioning:

- private digital ownership infrastructure
- AI-powered trust infrastructure
- fundraising readiness layer
- pre-diligence trust pack
- tamper-evident proof layer

Legal review required before:

- CSF workflows
- investor marketplace
- secondary liquidity
- securities transaction facilitation
- tokenized ownership
- KYC/AML expansion

Privacy requirements:

- Do not store personal data on-chain.
- Hash only canonical artifacts for proof.
- Do not submit sensitive personal data to public AI tools without controls.
- Use AU data residency claims only when actually configured.

---

## 21. Defensibility

Moats to build:

- AU-native compliance moat: ASIC, ABR, ESIC, R&D, AUSTRAC alignment
- data moat: private AU SME/startup benchmark dataset
- trust moat: tamper-evident score and document proofs
- workflow moat: pre-diligence pack that founders, lawyers, accountants and investors all use
- channel moat: accelerator/advisor dashboards
- network moat: every investor view creates buy-side signal and distribution

---

## 22. Definition Of Done For Future Updates

Any code update that changes product scope must update this plan.

Minimum update:

- update source path/status in section 8
- update relevant requirement group
- update roadmap priority if sequencing changes
- mark capability as `Planned`, `Partial`, `Shipped v1`, `Shipped`, or `Deferred`
- keep `web/README.md` source docs list current

---

## 23. Final Recommendation

Keep the long-term BlockID vision, but execute the next 6 months with discipline:

1. Sell the fundraising readiness artifact.
2. Make AI explainable, structured and Australia-native.
3. Use blockchain only for proof, not hype.
4. Build the data moat through every score, term sheet, cap table and investor view.
5. Win channels before building marketplace liquidity.

The strongest near-term product is:

> The AI pre-diligence trust pack Australian founders send before investors ask the hard questions.
