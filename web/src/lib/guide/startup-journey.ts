// Track B B2 + B3 + B4 — startup-journey guide content library, chapters 1–12.
//
// Structured content module holding the guided-walkthrough chapters described
// in docs/plans/reseller-module-plan.md § U.8 and § U.9. Chapters 1–4 (B2)
// cover Vision → Idea Validation → Market Research → MVP; chapters 5–8 (B3)
// cover PMF → Revenue → Growth → Team; chapters 9–12 (B4) cover Funding-Ready
// → Fundraise/Term Sheet → Post-Funding/Scale → Exit/Beyond.
//
// Consumed by:
//   - web/src/app/guide/[chapter]/page.tsx (marketing surface)
//   - web/src/app/workspace/guide/[chapter]/page.tsx (workspace surface)
//
// Kept in TS (not on-disk markdown) so both EN and VI copy live beside each
// other and stay type-checked. A mirror EN dump lives at
// docs/guides/startup-journey/chapter-{01..12}.md for offline reading and
// contributor pull-requests, but the pages read from this module — the .md
// files are documentation, not runtime.

import { PHASE_LABELS, type PhaseLabel } from "@/lib/showcase/gallery";
import { div83aQualifyingTestsFor } from "@/lib/compliance/div83a-qualifying-tests";

export type ChapterSlug =
  | "01-vision"
  | "02-idea-validation"
  | "03-market-research"
  | "04-mvp"
  | "05-pmf"
  | "06-revenue"
  | "07-growth"
  | "08-team"
  | "09-funding"
  | "10-fundraise"
  | "11-scale"
  | "12-exit";

export interface LocalisedText {
  en: string;
  vi: string;
}

export interface LocalisedList {
  en: string[];
  vi: string[];
}

/** One authored section inside a chapter (heading + prose bullets). */
export interface ChapterSection {
  id: string;
  heading: LocalisedText;
  body: LocalisedList;
}

/** A single guide chapter — matches the six-item spec in U.8 point 2. */
export interface Chapter {
  slug: ChapterSlug;
  phase: number;                     // 1..12 — aligns with PHASE_LABELS
  order: number;                     // 1..12 — surface ordering
  phaseLabel: PhaseLabel;            // sourced from PHASE_LABELS for consistency
  title: LocalisedText;
  summary: LocalisedText;            // one-paragraph blurb for the hero + card grid
  founderAction: LocalisedText;      // (a) what the founder does this phase
  agentsInvoked: LocalisedList;      // (b) which agent(s) they invoke
  expectedOutputs: LocalisedList;    // (c) expected outputs + how to interpret
  commonPitfalls: LocalisedList;     // (d) common pitfalls
  showcaseExample: LocalisedText;    // (e) "what this looks like on BlockID.au"
  cta: LocalisedText;                // call to action into the workspace
  sections?: ChapterSection[];       // optional deeper prose sections
  // Optional legal/qualifying-tests checklist rendered under its own heading.
  // Used for chapters that gate on a formal statutory test (e.g. chapter 08
  // reproduces the eight Division 83A start-up concession criteria so founders
  // can walk them without leaving the guide).
  qualifyingTests?: LocalisedList;
}

const CHAPTERS: Chapter[] = [
  {
    slug: "01-vision",
    phase: 1,
    order: 1,
    phaseLabel: PHASE_LABELS[1],
    title: {
      en: "Chapter 1 — Vision & Day-0 Idea",
      vi: "Chương 1 — Tầm nhìn & Ý tưởng ban đầu",
    },
    summary: {
      en: "Turn a one-line idea into a workspace. Day 0 is about naming the problem, the audience, and the change you want to make — before you write a line of code or a dollar of financials.",
      vi: "Biến ý tưởng một dòng thành không gian làm việc thực sự. Ngày 0 là lúc bạn gọi tên vấn đề, khách hàng và sự thay đổi bạn muốn tạo ra — trước khi viết dòng code hay đồng doanh thu đầu tiên.",
    },
    founderAction: {
      en: "Create a new workspace (via /svi or a reseller invite link like ?via=INFOVISION20). Type the one-line idea, target customer, and the change you want to see. That single sentence becomes the seed for every downstream artefact.",
      vi: "Tạo một không gian làm việc mới (qua /svi hoặc liên kết mời từ đại lý như ?via=INFOVISION20). Nhập ý tưởng một dòng, khách hàng mục tiêu và thay đổi bạn muốn tạo. Câu đó sẽ là hạt giống cho mọi tài liệu tiếp theo.",
    },
    agentsInvoked: {
      en: [
        "CMO agent — drafts a market-context memo from the one-liner (industry, buyer archetype, competitive space).",
        "CEO agent — writes an initial vision statement and 90-day priority list.",
        "Auto-DataRoom — provisions the Vision / folder with the idea summary and CMO memo.",
      ],
      vi: [
        "Đại lý CMO — soạn bản ghi bối cảnh thị trường từ ý tưởng một dòng (ngành, khách hàng, cạnh tranh).",
        "Đại lý CEO — viết tuyên bố tầm nhìn ban đầu và danh sách ưu tiên 90 ngày.",
        "DataRoom tự động — mở thư mục Vision / với bản tóm tắt ý tưởng và bản ghi CMO.",
      ],
    },
    expectedOutputs: {
      en: [
        "idea-summary.md — the one-liner, target customer and change hypothesis in a single doc.",
        "market-context-memo.md — CMO's read of the industry and closest three competitors.",
        "svi_analyses row (initial) — three-question SVI scaffold with placeholder scores you refine in Chapter 2.",
        "How to read the CMO memo: skim the 'closest competitors' block first — if the list surprises you, your framing may be off. Adjust the one-liner before you spend credits on deeper research.",
      ],
      vi: [
        "idea-summary.md — câu một dòng, khách hàng mục tiêu và giả thuyết thay đổi trong một tài liệu.",
        "market-context-memo.md — góc nhìn CMO về ngành và ba đối thủ gần nhất.",
        "Hàng svi_analyses (khởi tạo) — khung SVI ba câu hỏi với điểm giữ chỗ mà bạn sẽ tinh chỉnh ở Chương 2.",
        "Cách đọc bản ghi CMO: đọc trước khối 'đối thủ gần nhất' — nếu danh sách gây bất ngờ, có thể cách bạn định nghĩa ý tưởng chưa đúng. Sửa câu một dòng trước khi tiêu credit cho nghiên cứu sâu hơn.",
      ],
    },
    commonPitfalls: {
      en: [
        "Writing the one-liner in feature language ('we build an app that…') instead of outcome language ('we help X do Y in half the time'). Outcome framing gives the CMO agent something to search.",
        "Skipping the target-customer field. Every downstream agent uses it as a filter; leaving it blank produces generic reports.",
        "Trying to price or valuate before Chapter 2. SVI cannot score what has not been validated — anchor on the idea first.",
      ],
      vi: [
        "Viết câu một dòng theo ngôn ngữ tính năng ('chúng tôi làm app…') thay vì ngôn ngữ kết quả ('chúng tôi giúp X làm Y nhanh gấp đôi'). Ngôn ngữ kết quả giúp CMO có cái để tra cứu.",
        "Bỏ trống ô khách hàng mục tiêu. Mọi đại lý tiếp theo dùng ô này làm bộ lọc; để trống sẽ ra báo cáo chung chung.",
        "Cố định giá hoặc định giá trước Chương 2. SVI không thể chấm điểm cái chưa được xác thực — bám vào ý tưởng trước.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's own Chapter 1 doc is public at /showcase/blockid. The seed one-liner reads 'BlockID helps Australian founders answer where their startup is, what it's worth, and what to do next' — you can see the CMO memo that generated from it and how the vision statement evolved when the CEO agent iterated at Chapter 6.",
      vi: "Chương 1 của chính BlockID.au công khai tại /showcase/blockid. Câu một dòng khởi tạo là 'BlockID giúp founder Úc biết startup đang ở đâu, giá trị bao nhiêu và bước tiếp theo là gì' — bạn có thể xem bản ghi CMO sinh ra từ nó và tuyên bố tầm nhìn tiến hóa như thế nào khi đại lý CEO lặp lại ở Chương 6.",
    },
    cta: {
      en: "Ready to start? Open /svi and type your one-liner — the CMO agent begins the moment you hit Analyze.",
      vi: "Sẵn sàng bắt đầu? Mở /svi và nhập câu một dòng — đại lý CMO khởi động ngay khi bạn nhấn Phân tích.",
    },
  },
  {
    slug: "02-idea-validation",
    phase: 2,
    order: 2,
    phaseLabel: PHASE_LABELS[2],
    title: {
      en: "Chapter 2 — Idea Validation",
      vi: "Chương 2 — Xác thực ý tưởng",
    },
    summary: {
      en: "Answer the 13-criteria SVI questionnaire and upload any evidence you already have. This is where a hunch becomes a scored startup — with a numeric SVI and a per-criterion breakdown.",
      vi: "Trả lời bảng câu hỏi SVI 13 tiêu chí và tải lên bằng chứng bạn đã có. Đây là lúc linh cảm trở thành startup có điểm — với chỉ số SVI và phân tích theo từng tiêu chí.",
    },
    founderAction: {
      en: "From the workspace, open Score → Full SVI. Answer all 13 criteria honestly (guessing produces guesswork reports). Upload any evidence you have — landing-page mocks, interview notes, LOIs, market data.",
      vi: "Từ không gian làm việc, mở Chấm điểm → SVI đầy đủ. Trả lời trung thực cả 13 tiêu chí (đoán mò sẽ ra báo cáo đoán mò). Tải lên bằng chứng nếu có — landing page, phỏng vấn, LOI, dữ liệu thị trường.",
    },
    agentsInvoked: {
      en: [
        "SVI scoring engine — produces the 13-criterion score and roadmap position.",
        "CMO agent (deep) — competitor scan, TAM / SAM / SOM sizing, initial buyer persona.",
        "CDO agent — data-quality check on evidence you uploaded (are the sources credible?).",
        "Landing-page draft — CMO writes a first landing-page copy block into the DataRoom.",
      ],
      vi: [
        "Bộ máy chấm SVI — sinh ra điểm 13 tiêu chí và vị trí trên bản đồ tăng trưởng.",
        "Đại lý CMO (sâu) — quét đối thủ, ước lượng TAM/SAM/SOM, chân dung khách hàng đầu tiên.",
        "Đại lý CDO — kiểm tra chất lượng dữ liệu trên bằng chứng bạn tải lên (nguồn có đáng tin không?).",
        "Bản nháp landing page — CMO viết khối copy landing page đầu tiên vào DataRoom.",
      ],
    },
    expectedOutputs: {
      en: [
        "svi_analyses.report_pdf_url — the full 13-criterion PDF, downloadable and shareable.",
        "competitor-scan.md — three to five nearest competitors with feature diff and pricing.",
        "market-sizing.md — TAM/SAM/SOM with sources; watch for round numbers, they are usually estimates.",
        "landing-page-draft.md — headline, sub-headline, three benefit bullets, call-to-action.",
        "How to read the score: don't fixate on the total. Look at the two lowest criteria — that is your evidence gap, and Chapter 3 is designed to close it.",
      ],
      vi: [
        "svi_analyses.report_pdf_url — PDF 13 tiêu chí đầy đủ, tải xuống và chia sẻ được.",
        "competitor-scan.md — ba đến năm đối thủ gần nhất với so sánh tính năng và giá.",
        "market-sizing.md — TAM/SAM/SOM có nguồn; để ý con số tròn, thường là ước tính.",
        "landing-page-draft.md — tiêu đề, phụ đề, ba lợi ích, lời kêu gọi hành động.",
        "Cách đọc điểm: đừng quá tập trung vào tổng. Nhìn hai tiêu chí thấp nhất — đó là khoảng trống bằng chứng, và Chương 3 được thiết kế để lấp nó.",
      ],
    },
    commonPitfalls: {
      en: [
        "Answering the questionnaire aspirationally ('we will have 1000 users'). The engine expects present state; future state belongs in the projections in Chapter 6.",
        "Uploading only pitch decks. Decks are output, not evidence — the CDO agent will flag them as weak. Prefer interview transcripts, LOIs, wait-list snapshots.",
        "Ignoring the landing-page draft because it 'is not the final copy'. It is a hypothesis you can test in Chapter 4 with real traffic; ship it.",
      ],
      vi: [
        "Trả lời khảo sát theo mong ước ('chúng tôi sẽ có 1000 người dùng'). Bộ máy cần trạng thái hiện tại; trạng thái tương lai thuộc phần dự phóng ở Chương 6.",
        "Chỉ tải lên pitch deck. Deck là đầu ra, không phải bằng chứng — CDO sẽ đánh dấu là yếu. Ưu tiên bản ghi phỏng vấn, LOI, danh sách chờ.",
        "Bỏ qua bản nháp landing page vì 'chưa phải bản chính'. Đó là một giả thuyết bạn có thể kiểm chứng ở Chương 4 với lưu lượng thật; hãy đưa nó lên.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's SVI first scored at Phase 2 — you can see the exact 13-criterion breakdown at /showcase/blockid. The two lowest criteria were 'validated revenue' and 'competitive moat'; watch how Chapters 3 and 5 target those specifically instead of trying to lift the total uniformly.",
      vi: "SVI của BlockID.au được chấm lần đầu ở Chương 2 — bạn xem chi tiết 13 tiêu chí tại /showcase/blockid. Hai tiêu chí thấp nhất là 'doanh thu đã xác thực' và 'hào cạnh tranh'; xem cách Chương 3 và Chương 5 nhắm chính xác vào đó thay vì nâng đều tổng điểm.",
    },
    cta: {
      en: "Open Score → Full SVI in your workspace. Set aside 20 minutes; upload one credible piece of evidence per criterion where you can.",
      vi: "Mở Chấm điểm → SVI đầy đủ trong không gian làm việc. Dành 20 phút; tải lên một bằng chứng đáng tin cho mỗi tiêu chí nếu có thể.",
    },
  },
  {
    slug: "03-market-research",
    phase: 3,
    order: 3,
    phaseLabel: PHASE_LABELS[3],
    title: {
      en: "Chapter 3 — Market Research",
      vi: "Chương 3 — Nghiên cứu thị trường",
    },
    summary: {
      en: "Go from a scanned market map to actionable buyer personas and a competitor matrix you can defend to an investor. This chapter is where credits pay for depth — CMO runs deep passes rather than surface scans.",
      vi: "Chuyển từ bản đồ thị trường sơ bộ sang chân dung khách hàng khả thi và ma trận đối thủ đủ chắc để bảo vệ trước nhà đầu tư. Đây là chương credit đầu tư cho chiều sâu — CMO chạy phân tích chuyên sâu thay vì quét bề mặt.",
    },
    founderAction: {
      en: "Trigger the CMO deep-research agent from the workspace shortcut. Optionally upload interview notes (five to ten customer chats is a strong signal). Review the competitor matrix and mark rows that feel wrong — the agent re-runs on flagged rows.",
      vi: "Kích hoạt CMO nghiên cứu sâu từ phím tắt trong không gian làm việc. Nếu có, tải lên bản ghi phỏng vấn (năm đến mười buổi trò chuyện đã là tín hiệu mạnh). Xem ma trận đối thủ và đánh dấu dòng cảm thấy sai — đại lý sẽ chạy lại các dòng bị gắn cờ.",
    },
    agentsInvoked: {
      en: [
        "CMO agent (deep pass) — full competitive matrix with pricing, positioning and funding history.",
        "AU-comparable-raises benchmark — Australian precedent rounds in your segment.",
        "CDO agent — validates the sources cited in the competitor matrix.",
        "Customer-persona agent — synthesises interviews (or public data) into two or three persona docs.",
      ],
      vi: [
        "Đại lý CMO (chuyên sâu) — ma trận cạnh tranh đầy đủ với giá, định vị và lịch sử gọi vốn.",
        "So chuẩn gọi vốn tương đương AU — các vòng gọi vốn Úc trong phân khúc của bạn.",
        "Đại lý CDO — xác thực nguồn trích dẫn trong ma trận đối thủ.",
        "Đại lý chân dung khách hàng — tổng hợp phỏng vấn (hoặc dữ liệu công khai) thành hai hoặc ba tài liệu chân dung.",
      ],
    },
    expectedOutputs: {
      en: [
        "competitor-matrix.pdf — feature × pricing × positioning table. Every cell has a source citation.",
        "customer-personas.md — two or three named personas with jobs-to-be-done and objection paths.",
        "au-comparable-raises.md — public AU rounds in your segment, last 24 months.",
        "How to read the persona doc: focus on the objections, not the demographics. The objection list is your Chapter 4 MVP feature backlog in disguise.",
      ],
      vi: [
        "competitor-matrix.pdf — bảng tính năng × giá × định vị. Mọi ô đều có nguồn trích dẫn.",
        "customer-personas.md — hai hoặc ba chân dung có tên, có việc-cần-làm và các điểm phản đối.",
        "au-comparable-raises.md — các vòng gọi vốn công khai tại Úc trong phân khúc bạn, 24 tháng gần nhất.",
        "Cách đọc tài liệu chân dung: tập trung vào phản đối, không phải nhân khẩu học. Danh sách phản đối chính là backlog tính năng MVP cho Chương 4 dưới lớp vỏ khác.",
      ],
    },
    commonPitfalls: {
      en: [
        "Optimising the competitor matrix into a 'we win everything' green-tick chart. Investors read that as denial. Leave in the two or three columns where a competitor is stronger — and plan how to close them.",
        "Skipping the AU comparable-raises pack because your investor is offshore. Australian precedent still anchors valuation talk with any AU-domiciled fund.",
        "Building personas from imagined users. If you have not talked to five real prospects, run the CMO synthetic-persona mode with public data and mark it 'synthetic' — do not pretend it is real research.",
      ],
      vi: [
        "Chỉnh ma trận đối thủ thành biểu đồ 'chúng tôi thắng mọi thứ' toàn dấu tick xanh. Nhà đầu tư đọc là bạn đang phủ nhận. Giữ lại hai ba cột đối thủ mạnh hơn — và có kế hoạch thu hẹp khoảng cách.",
        "Bỏ qua gói AU comparable-raises vì nhà đầu tư ở nước ngoài. Tiền lệ Úc vẫn neo cuộc nói chuyện định giá với mọi quỹ có trụ sở Úc.",
        "Xây chân dung từ khách hàng tưởng tượng. Nếu chưa nói chuyện với năm khách hàng thật, chạy chế độ persona giả lập của CMO với dữ liệu công khai và ghi rõ 'giả lập' — đừng giả vờ đó là nghiên cứu thật.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's Chapter 3 pack lives in the /guide/reports gallery under Phase 3 — three CMO deep-research memos, one competitor matrix, one AU-raises benchmark. Notice the matrix leaves two cells red: 'brand recognition' and 'existing accelerator relationships'. That admission became the reseller strategy (Track A).",
      vi: "Gói Chương 3 của BlockID.au nằm trong thư viện /guide/reports mục Phase 3 — ba ghi chú nghiên cứu sâu CMO, một ma trận đối thủ, một benchmark AU. Chú ý ma trận để đỏ hai ô: 'nhận diện thương hiệu' và 'quan hệ với accelerator'. Sự thừa nhận đó trở thành chiến lược đại lý (Track A).",
    },
    cta: {
      en: "Book five customer calls this week. Feed the transcripts into the CMO persona agent — that combination beats any purely synthetic research.",
      vi: "Đặt năm buổi trò chuyện khách hàng tuần này. Đưa bản ghi vào đại lý chân dung khách hàng của CMO — kết hợp đó mạnh hơn mọi nghiên cứu thuần giả lập.",
    },
  },
  {
    slug: "04-mvp",
    phase: 4,
    order: 4,
    phaseLabel: PHASE_LABELS[4],
    title: {
      en: "Chapter 4 — MVP & Product Discovery",
      vi: "Chương 4 — MVP & Khám phá sản phẩm",
    },
    summary: {
      en: "Ship a minimal product surface and a public landing page that can measure demand. Two integrations activate here — GitHub for source-of-truth and Google Analytics for demand signal.",
      vi: "Ra mắt bề mặt sản phẩm tối thiểu và trang landing công khai có thể đo nhu cầu. Hai tích hợp được kích hoạt ở đây — GitHub làm nguồn sự thật và Google Analytics cho tín hiệu nhu cầu.",
    },
    founderAction: {
      en: "Link a GitHub (or GitLab) repository at Workspace → Integrations → Source repo. Draft a product brief with the two most important features from your persona objections. Publish a landing page — the CMO draft from Chapter 2 is a starting point.",
      vi: "Liên kết kho GitHub (hoặc GitLab) tại Không gian làm việc → Tích hợp → Kho nguồn. Soạn tóm tắt sản phẩm với hai tính năng quan trọng nhất từ phản đối của chân dung khách hàng. Xuất bản landing page — bản nháp CMO từ Chương 2 là điểm khởi đầu.",
    },
    agentsInvoked: {
      en: [
        "CTO agent — architecture note + tech-stack recommendation aligned to your team's skills.",
        "CPO agent — product-brief PDF: two-features-in, three-features-out, why.",
        "CMO agent — landing-page finalisation with the Phase 3 persona objections addressed.",
        "GitHub integration — reads public repo metadata (last commit, languages, stars). No code contents are fetched.",
      ],
      vi: [
        "Đại lý CTO — ghi chú kiến trúc + đề xuất tech stack phù hợp kỹ năng của đội.",
        "Đại lý CPO — PDF tóm tắt sản phẩm: hai tính năng có, ba tính năng không, vì sao.",
        "Đại lý CMO — hoàn thiện landing page có xử lý các phản đối chân dung từ Chương 3.",
        "Tích hợp GitHub — đọc metadata kho công khai (commit mới nhất, ngôn ngữ, sao). Không tải nội dung mã.",
      ],
    },
    expectedOutputs: {
      en: [
        "product-brief.pdf — feature list, non-goals, first-user story, effort estimate.",
        "architecture-note.md — CTO's recommended stack with trade-offs; use it as a starting point, not a mandate.",
        "landing-page live at blockid.au/showcase/<slug> or your own domain — GA measurement ID stamped.",
        "projects.repo_url stamped — last-commit sparkline appears on the reseller's Progression view (metadata only).",
        "How to read the CTO note: the trade-offs section matters more than the stack choice. If a trade-off surprises you, ask the CTO agent to redo the pass with an emphasis you value (speed vs cost vs team fit).",
      ],
      vi: [
        "product-brief.pdf — danh sách tính năng, những gì không làm, câu chuyện người dùng đầu tiên, ước lượng công.",
        "architecture-note.md — stack CTO đề xuất kèm đánh đổi; dùng làm điểm khởi đầu, không phải mệnh lệnh.",
        "landing page hoạt động tại blockid.au/showcase/<slug> hoặc tên miền riêng — có gắn GA measurement ID.",
        "projects.repo_url được đóng dấu — sparkline commit mới nhất xuất hiện ở tab Tiến trình của đại lý (chỉ metadata).",
        "Cách đọc ghi chú CTO: phần đánh đổi quan trọng hơn lựa chọn stack. Nếu một đánh đổi gây bất ngờ, yêu cầu CTO chạy lại với trọng số khác (tốc độ vs chi phí vs năng lực đội).",
      ],
    },
    commonPitfalls: {
      en: [
        "Building three months of MVP before publishing a landing page. Landing pages are a demand experiment — ship it in week one, iterate on copy while code is being written.",
        "Linking a private repo. BlockID only reads public metadata; a private repo just shows an empty sparkline and no confidence signal to a reseller.",
        "Ignoring the GA measurement ID. Chapter 7 depends on this stream; skipping it delays your growth signals by weeks.",
      ],
      vi: [
        "Xây MVP ba tháng trước khi lên landing page. Landing page là thí nghiệm nhu cầu — lên ngay tuần đầu, chỉnh copy khi mã đang được viết.",
        "Liên kết kho riêng tư. BlockID chỉ đọc metadata công khai; kho riêng tư chỉ hiện sparkline trống và không tín hiệu cho đại lý.",
        "Bỏ qua GA measurement ID. Chương 7 phụ thuộc luồng này; bỏ qua sẽ trễ tín hiệu tăng trưởng nhiều tuần.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's Chapter 4 milestone `mvp_scoped` is in milestone-report-state.json — the /showcase/blockid page reads it live. Notice the product brief scoped down from eleven features to four (SVI scoring, workspace shell, DataRoom, reseller attribution); the other seven became the Track A/B roadmap you are reading right now.",
      vi: "Milestone `mvp_scoped` Chương 4 của BlockID.au nằm trong milestone-report-state.json — trang /showcase/blockid đọc trực tiếp. Chú ý tóm tắt sản phẩm thu hẹp từ mười một tính năng xuống bốn (chấm SVI, vỏ workspace, DataRoom, gán đại lý); bảy tính năng còn lại thành lộ trình Track A/B mà bạn đang đọc.",
    },
    cta: {
      en: "Set aside one week for a landing-page + repo-link pass. Everything else in Chapter 4 layers on top — start with those two.",
      vi: "Dành một tuần cho lượt landing page + liên kết kho. Mọi thứ khác trong Chương 4 xếp lên trên — bắt đầu bằng hai việc này.",
    },
  },
  {
    slug: "05-pmf",
    phase: 5,
    order: 5,
    phaseLabel: PHASE_LABELS[5],
    title: {
      en: "Chapter 5 — PMF & Early Traction",
      vi: "Chương 5 — PMF & Traction ban đầu",
    },
    summary: {
      en: "Move from 'people click' to 'people come back'. PMF is a retention story, not a traffic story — Chapter 5 is where you log real users, first revenue and cohort retention, then let the CDO agent audit whether the signal is real.",
      vi: "Chuyển từ 'người ta bấm' sang 'người ta quay lại'. PMF là câu chuyện giữ chân, không phải câu chuyện traffic — Chương 5 là nơi bạn ghi nhận người dùng thật, doanh thu đầu tiên và giữ chân theo cohort, rồi để đại lý CDO kiểm tra xem tín hiệu có thật hay không.",
    },
    founderAction: {
      en: "Log first users, first revenue and retention data. Connect the founder's own Stripe account in test-mode (this is separate from BlockID's own Auschain Stripe — it wires your future gateway). Feed at least two consecutive weeks of retention numbers so a cohort curve becomes possible.",
      vi: "Ghi nhận người dùng đầu tiên, doanh thu đầu tiên và dữ liệu giữ chân. Kết nối tài khoản Stripe riêng của founder ở chế độ test (khác với Stripe Auschain của BlockID — đây là cổng thanh toán tương lai của bạn). Cung cấp ít nhất hai tuần dữ liệu giữ chân liên tiếp để có thể vẽ đường cohort.",
    },
    agentsInvoked: {
      en: [
        "CDO agent — runs a data-quality audit on the numbers you logged; flags cohorts too small to conclude anything.",
        "CDO agent (PMF pass) — computes a PMF signal (retention slope + revenue slope + qualitative 'would-be-very-disappointed %').",
        "CFO agent (light) — updates the unit-economics doc with the first CAC and LTV estimate, tagged as provisional.",
        "Retention-cohort chart — auto-drawn from the weekly buckets into the DataRoom under traction/.",
      ],
      vi: [
        "Đại lý CDO — kiểm tra chất lượng dữ liệu bạn nhập; đánh dấu các cohort quá nhỏ để kết luận.",
        "Đại lý CDO (lượt PMF) — tính tín hiệu PMF (độ dốc giữ chân + độ dốc doanh thu + tỷ lệ 'sẽ rất thất vọng nếu mất sản phẩm').",
        "Đại lý CFO (nhẹ) — cập nhật tài liệu unit-economics với ước lượng CAC và LTV đầu tiên, đánh dấu là tạm thời.",
        "Biểu đồ giữ chân cohort — tự vẽ từ các bucket theo tuần vào DataRoom mục traction/.",
      ],
    },
    expectedOutputs: {
      en: [
        "pmf-signal.md — retention slope + revenue slope + qualitative PMF percentage, with a colour band (red/amber/green).",
        "cohort-retention.pdf — weekly cohort curve for the last eight weeks (or as many as you have).",
        "unit-economics-provisional.md — CAC + LTV + gross margin, tagged 'provisional' until Chapter 6 CFO run.",
        "stripe-founder-testmode.md — checklist confirming your own Stripe test-mode account is wired and a $1 test charge succeeded.",
        "How to read the PMF band: amber is the honest answer for most Phase-5 startups. Green with fewer than 30 real users is almost always a small-sample illusion — the CDO agent will label it 'insufficient sample' rather than green.",
      ],
      vi: [
        "pmf-signal.md — độ dốc giữ chân + độ dốc doanh thu + tỷ lệ PMF định tính, với dải màu (đỏ/vàng/xanh).",
        "cohort-retention.pdf — đường cohort tuần trong tám tuần gần nhất (hoặc bao nhiêu bạn có).",
        "unit-economics-provisional.md — CAC + LTV + biên gộp, đánh dấu 'tạm thời' đến khi CFO chạy chính thức ở Chương 6.",
        "stripe-founder-testmode.md — checklist xác nhận tài khoản Stripe test của bạn đã kết nối và một giao dịch thử $1 thành công.",
        "Cách đọc dải PMF: vàng là câu trả lời trung thực cho hầu hết startup Phase 5. Xanh với dưới 30 người dùng thật gần như luôn là ảo giác cỡ mẫu — CDO sẽ ghi 'mẫu chưa đủ' thay vì xanh.",
      ],
    },
    commonPitfalls: {
      en: [
        "Claiming PMF from a single week of retention. The cohort curve needs at least four weekly buckets before the slope becomes readable — the CDO agent will refuse to grade sooner.",
        "Confusing paid trials with retention. A paid trial user who never returns after trial-end is a churned user, not a retained one — the cohort chart correctly ignores them.",
        "Skipping the founder's own Stripe test-mode connection because 'we don't sell yet'. Wiring it in Chapter 5 (even to a dummy price) gets the schema ready so Chapter 7 growth wiring is a one-click flip, not a two-week project.",
      ],
      vi: [
        "Tuyên bố PMF từ một tuần giữ chân duy nhất. Đường cohort cần ít nhất bốn bucket tuần trước khi độ dốc có thể đọc — CDO sẽ từ chối chấm sớm hơn.",
        "Nhầm trial trả phí với giữ chân. Người dùng trial trả phí không quay lại sau khi hết trial là khách rời bỏ, không phải giữ chân — biểu đồ cohort loại họ đúng.",
        "Bỏ qua kết nối Stripe test-mode của founder vì 'chúng tôi chưa bán'. Kết nối ở Chương 5 (dù với giá giả) chuẩn bị schema để Chương 7 chỉ cần bật, không tốn hai tuần.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's own Chapter 5 was tricky — 'PMF for a startup-scoring startup' is a chicken-and-egg problem. The showcase workspace at /showcase/blockid shows how CDO agent labelled the first four weeks 'insufficient sample' before finally flipping to amber at week six on the reseller-funnel cohort. That honest amber, not a fake green, is what the plan expects.",
      vi: "Chương 5 của chính BlockID.au khó — 'PMF cho startup chấm điểm startup' là bài toán con-gà-quả-trứng. Workspace showcase tại /showcase/blockid cho thấy CDO đánh dấu bốn tuần đầu 'mẫu chưa đủ' trước khi chuyển sang vàng ở tuần thứ sáu trên cohort funnel đại lý. Vàng trung thực đó, không phải xanh giả tạo, mới là điều kế hoạch mong đợi.",
    },
    cta: {
      en: "Open the workspace Traction tab and log week-1 to week-N retention for the users you have today, however few. Two rows is enough to start — the CDO agent will tell you honestly how much more data it needs.",
      vi: "Mở tab Traction trong không gian làm việc và ghi giữ chân tuần 1 đến tuần N cho người dùng hiện có, dù ít. Hai dòng cũng đủ để bắt đầu — CDO sẽ nói thẳng cần thêm bao nhiêu dữ liệu.",
    },
    // atlassian-standard-mapping-goal.md P5-tax-invoice-checker-ch5-section
    // (§1 phase 5 "first invoice/tax-invoice conformant to ATO GST-tax-invoice
    // rules"): Chapter 5 is where founders raise their first paid invoice.
    // The pure lib + wizard + persistence + tile + compliance panel are all
    // live; the guide-side reference was still missing so founders had no
    // path from Chapter 5 into the /workspace/tax-invoice-checker surface.
    // General information only — the AFSL / tax-agent boundary is preserved
    // by the disclaimer that ships on every checker output.
    sections: [
      {
        id: "ato-tax-invoice-checker",
        heading: {
          en: "First paid invoice — the ATO tax-invoice format checklist most AU founders get wrong on receipt #1",
          vi: "Hoá đơn có thu tiền đầu tiên — checklist định dạng tax invoice ATO nhiều founder Úc làm sai từ hoá đơn #1",
        },
        body: {
          en: [
            "Why it matters at Chapter 5: your first paid customer is also the first person who can lodge a GST input-tax-credit claim using your invoice. Get the format wrong and they either can't claim (bad look) or claim invalidly and forward the ATO problem back to you (worse look). Fixing the template once, at receipt #1, avoids reissuing every invoice you'll ever raise.",
            "The ATO tax-invoice rules live in A New Tax System (Goods and Services Tax) Act 1999 s 29-70(1). Under A$82.50 (GST-inclusive) a tax invoice is not required at all — a plain receipt is fine. Between A$82.50 and A$1,000 you need the seven standard fields. At A$1,000 and above you also need the recipient's identity and their ABN (or address, if the recipient has no ABN).",
            "Seven required fields for any tax invoice ≥ A$82.50: (1) the words 'Tax invoice' clearly stated; (2) your identity (business name); (3) your ABN; (4) the invoice issue date; (5) a description of the item(s) sold with quantity where applicable; (6) the GST-inclusive total; (7) either the GST amount (typically total ÷ 11 for a fully taxable supply) OR the statement 'Total price includes GST'. If your supply is GST-free (e.g. exports, some health / education) or input-taxed (e.g. residential rent, financial supplies), you don't add GST — but a plain receipt is still fine unless the customer requests a tax invoice.",
            "Two extra fields at A$1,000+ (large invoices): the recipient's identity (name or business name) and their ABN (or address if they have no ABN). Skipping this on a $1,001 invoice is the single most common Chapter-5 mistake — the receipt-below-A$82.50 case is much rarer than founders think and doesn't apply once you're raising real invoices.",
            "Recipient-Created Tax Invoices (RCTI) are the s 29-70(3) carve-out: the buyer issues the tax invoice to the seller. Common in fresh-produce markets, some commissions and platform payouts (Uber, DoorDash). If you're the seller and your buyer issues you an RCTI, you're not obliged to issue your own — but you do need a written RCTI agreement with the buyer before the first one.",
            "GST cross-check: for a fully-taxable supply the GST component is exactly total ÷ 11 (because GST is added on top: 10 × 1.1 = 11). If the declared GST doesn't match the total ÷ 11 within A$0.02 (rounding tolerance), your template is either double-taxing, under-taxing, or mixing GST-free and taxable lines without a per-line breakdown. The checker's A$0.02 tolerance mirrors the ATO's cent-rounding guidance.",
            "How BlockID.au surfaces this: /workspace/tax-invoice-checker is the founder-facing wizard — paste or type the invoice fields, hit Assess, and the pure checker (web/src/lib/compliance/tax-invoice-checker.ts) returns the 3-band classification (under_threshold / standard / large) plus missing-field slots + warnings + the ATO disclaimer. Hit Save to snapshot the assessment into compliance_tax_invoice_checks; the /dashboard/compliance panel then shows the latest-band chip so a future auditor sees the audit trail. The ABN checksum reuses the same P1g modulus-89 validator that /api/abr/lookup runs, so a typo'd ABN gets caught before the invoice ships.",
            "Founder next step for Chapter 5: run one real invoice you've raised (or the template you plan to raise from) through /workspace/tax-invoice-checker. Fix any red slots today, save the snapshot for the data-room audit trail, and re-run the checker whenever you rev the template. This is a 5-minute Chapter-5 task that removes a Chapter-9 diligence question the reviewer would otherwise flag.",
          ],
          vi: [
            "Tại sao quan trọng ở Chương 5: khách hàng có thu tiền đầu tiên cũng là người đầu tiên có thể xin credit thuế GST đầu vào bằng hoá đơn của bạn. Định dạng sai thì họ không claim được (xấu) hoặc claim không hợp lệ và đẩy vấn đề ATO ngược về bạn (tệ hơn). Sửa template một lần ngay hoá đơn #1 tránh phát hành lại toàn bộ hoá đơn sau này.",
            "Quy tắc tax invoice ATO nằm ở A New Tax System (Goods and Services Tax) Act 1999 s 29-70(1). Dưới A$82.50 (đã gồm GST) không cần tax invoice — biên nhận thường là đủ. Từ A$82.50 đến A$1,000 cần bảy trường tiêu chuẩn. Từ A$1,000 trở lên cần thêm danh tính người mua và ABN của họ (hoặc địa chỉ nếu không có ABN).",
            "Bảy trường bắt buộc cho tax invoice ≥ A$82.50: (1) chữ 'Tax invoice' ghi rõ; (2) danh tính bạn (tên doanh nghiệp); (3) ABN của bạn; (4) ngày phát hành; (5) mô tả hàng/dịch vụ kèm số lượng khi phù hợp; (6) tổng cộng đã gồm GST; (7) hoặc số tiền GST (thường tổng ÷ 11 cho cung ứng chịu thuế toàn phần) HOẶC câu 'Total price includes GST'. Nếu cung ứng của bạn miễn GST (xuất khẩu, một số y tế / giáo dục) hoặc chịu thuế đầu vào (thuê nhà ở, dịch vụ tài chính) thì không cộng GST — biên nhận đơn giản vẫn đủ trừ khi khách yêu cầu tax invoice.",
            "Hai trường thêm khi ≥ A$1,000 (hoá đơn lớn): danh tính người mua (tên hoặc tên doanh nghiệp) và ABN của họ (hoặc địa chỉ nếu không có ABN). Bỏ sót ở hoá đơn $1,001 là lỗi phổ biến nhất Chương 5 — trường hợp dưới A$82.50 hiếm hơn founder tưởng và không áp dụng khi bạn đã phát hành hoá đơn thật.",
            "Recipient-Created Tax Invoices (RCTI) là ngoại lệ s 29-70(3): người mua phát hành tax invoice cho người bán. Phổ biến ở chợ nông sản, một số hoa hồng và trả tiền qua nền tảng (Uber, DoorDash). Nếu bạn là người bán và người mua phát RCTI cho bạn thì bạn không cần phát hành riêng — nhưng phải có thoả thuận RCTI bằng văn bản với người mua trước khi phát cái đầu tiên.",
            "Kiểm tra GST chéo: với cung ứng chịu thuế toàn phần, GST đúng bằng tổng ÷ 11 (vì GST cộng thêm: 10 × 1.1 = 11). Nếu GST khai không khớp tổng ÷ 11 trong biên độ A$0.02 (dung sai làm tròn) thì template hoặc đánh thuế hai lần, đánh thiếu, hoặc trộn dòng miễn GST với dòng chịu thuế mà không tách theo dòng. Dung sai A$0.02 của checker theo hướng dẫn làm tròn xu của ATO.",
            "BlockID.au bề mặt hoá thế nào: /workspace/tax-invoice-checker là wizard cho founder — dán hoặc nhập các trường hoá đơn, bấm Assess, và bộ kiểm thuần (web/src/lib/compliance/tax-invoice-checker.ts) trả về phân loại 3 dải (under_threshold / standard / large) kèm ô trường thiếu + cảnh báo + disclaimer ATO. Bấm Save để lưu snapshot vào compliance_tax_invoice_checks; bảng /dashboard/compliance sau đó hiển thị chip dải mới nhất để auditor tương lai thấy dấu vết audit. Kiểm tra checksum ABN dùng lại validator modulus-89 P1g cùng /api/abr/lookup, nên ABN gõ nhầm bị bắt trước khi hoá đơn phát đi.",
            "Bước tiếp theo cho founder Chương 5: chạy một hoá đơn thật đã phát (hoặc template dự định phát) qua /workspace/tax-invoice-checker. Sửa ô đỏ hôm nay, lưu snapshot cho dấu vết audit data-room, và chạy lại checker mỗi lần đổi template. Đây là task 5 phút Chương 5 loại bỏ câu hỏi diligence Chương 9 mà reviewer sẽ nêu.",
          ],
        },
      },
    ],
  },
  {
    slug: "06-revenue",
    phase: 6,
    order: 6,
    phaseLabel: PHASE_LABELS[6],
    title: {
      en: "Chapter 6 — Revenue & Business Model",
      vi: "Chương 6 — Doanh thu & Mô hình kinh doanh",
    },
    summary: {
      en: "Turn provisional numbers into a defensible 3-year projection, a burn curve and a break-even chart. The CFO agent runs the model; you approve or challenge the assumptions. Australian GST and Stripe live-mode readiness are checked here.",
      vi: "Biến các con số tạm thời thành dự phóng 3 năm có thể bảo vệ, đường burn và biểu đồ break-even. Đại lý CFO chạy mô hình; bạn duyệt hoặc phản biện các giả định. GST Úc và sẵn sàng Stripe live-mode được kiểm tra ở đây.",
    },
    founderAction: {
      en: "Open Workspace → Financials → Projection. Review each assumption card (pricing tiers, gross margin, churn, CAC, sales-cycle days) and either approve or override with your own value + a note explaining why. Iterate the pricing memo until the top-line makes sense against Chapter 3's competitor pricing.",
      vi: "Mở Không gian làm việc → Tài chính → Dự phóng. Xem từng thẻ giả định (bậc giá, biên gộp, churn, CAC, ngày chu kỳ bán hàng) và duyệt hoặc ghi đè giá trị của bạn kèm ghi chú lý do. Lặp lại memo giá cho đến khi doanh thu top-line hợp lý so với giá đối thủ ở Chương 3.",
    },
    agentsInvoked: {
      en: [
        "CFO agent — 3-year projection (P&L + cash-flow + burn) as DOCX and XLSX via web/src/lib/docx.",
        "CFO agent (break-even) — computes months-to-break-even under three scenarios (base / bull / bear) with the assumption diff shown.",
        "CFO agent (pricing memo) — recommends a tier structure defensible against the Chapter 3 competitor matrix.",
        "au-compliance agent — GST-registration checklist (turnover threshold, quarterly BAS cycle, invoice format).",
      ],
      vi: [
        "Đại lý CFO — dự phóng 3 năm (P&L + dòng tiền + burn) dạng DOCX và XLSX qua web/src/lib/docx.",
        "Đại lý CFO (break-even) — tính số tháng để hoà vốn theo ba kịch bản (cơ sở / lạc quan / bi quan) kèm sai khác giả định.",
        "Đại lý CFO (memo giá) — đề xuất cấu trúc bậc giá bảo vệ được so với ma trận đối thủ Chương 3.",
        "Đại lý au-compliance — checklist đăng ký GST (ngưỡng doanh thu, chu kỳ BAS theo quý, định dạng hoá đơn).",
      ],
    },
    expectedOutputs: {
      en: [
        "financial-model.xlsx — 3-year P&L + cash-flow + burn, one sheet per scenario.",
        "financial-model.docx — narrative summary you can send to a mentor for review before Chapter 9.",
        "pricing-memo.md — proposed tier structure with per-tier target ARPU and expected mix.",
        "gst-readiness.md — au-compliance checklist with green/amber/red per line (ABN status, GST rego, BAS frequency, tax invoice format).",
        "stripe-livemode-readiness.md — pre-flight checklist for switching your own Stripe from test to live (business verification, bank account, statement descriptor, currency).",
        "How to read the projection: the base scenario is what happens if nothing surprises you. The bear scenario is what you plan for. If bear month-24 shows insolvency, you either shorten payback or raise sooner — the CFO agent will highlight that automatically.",
      ],
      vi: [
        "financial-model.xlsx — P&L + dòng tiền + burn 3 năm, mỗi sheet một kịch bản.",
        "financial-model.docx — tóm tắt lời văn có thể gửi mentor xem trước Chương 9.",
        "pricing-memo.md — cấu trúc bậc giá đề xuất với ARPU mục tiêu và mix kỳ vọng cho từng bậc.",
        "gst-readiness.md — checklist au-compliance với xanh/vàng/đỏ cho từng dòng (trạng thái ABN, đăng ký GST, chu kỳ BAS, định dạng hoá đơn thuế).",
        "stripe-livemode-readiness.md — checklist trước khi bật Stripe từ test sang live (xác minh doanh nghiệp, tài khoản ngân hàng, statement descriptor, tiền tệ).",
        "Cách đọc dự phóng: kịch bản cơ sở là điều xảy ra nếu không có bất ngờ. Kịch bản bi quan là điều bạn lên kế hoạch. Nếu tháng 24 bi quan cho thấy mất khả năng thanh toán, bạn phải rút ngắn payback hoặc gọi vốn sớm hơn — CFO sẽ tô sáng tự động.",
      ],
    },
    commonPitfalls: {
      en: [
        "Approving every CFO assumption without pushback. The CFO agent's default is credible-but-conservative; you know your niche better on at least three cards, so override them.",
        "Building the projection off a base scenario that assumes PMF has already been proven. If Chapter 5 says amber, the base scenario should reflect amber, not green.",
        "Skipping the GST-readiness checklist because turnover is under the A$75k threshold. Investors still ask; a green GST line by Chapter 9 shortens diligence.",
      ],
      vi: [
        "Duyệt mọi giả định CFO mà không phản biện. Mặc định của CFO là hợp lý nhưng thận trọng; bạn hiểu ngách của mình hơn ở ít nhất ba thẻ, hãy ghi đè.",
        "Xây dự phóng trên kịch bản cơ sở giả định PMF đã được chứng minh. Nếu Chương 5 nói vàng, kịch bản cơ sở phải phản ánh vàng, không phải xanh.",
        "Bỏ qua checklist GST vì doanh thu dưới ngưỡng A$75k. Nhà đầu tư vẫn hỏi; dòng GST xanh ở Chương 9 rút ngắn quá trình due-diligence.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's Chapter 6 pack — financial-model.xlsx, pricing-memo.md, gst-readiness.md — is in the /guide/reports gallery under Phase 6. Notice the pricing memo recommends a reseller-wholesale tier (40% margin share) that the CFO ran once for the base scenario and once assuming the accelerator partner didn't sign. Both scenarios flow into the same milestone `financials_v1`.",
      vi: "Gói Chương 6 của BlockID.au — financial-model.xlsx, pricing-memo.md, gst-readiness.md — nằm trong thư viện /guide/reports mục Phase 6. Chú ý memo giá đề xuất một bậc wholesale cho đại lý (chia biên 40%) mà CFO chạy một lần cho kịch bản cơ sở và một lần giả định đối tác accelerator không ký. Cả hai đổ về cùng milestone `financials_v1`.",
    },
    cta: {
      en: "Book two hours this week to sit with the CFO assumption cards. Override at least three; approve the rest. The projection is only as strong as your willingness to push back on the defaults.",
      vi: "Dành hai giờ tuần này ngồi với các thẻ giả định của CFO. Ghi đè ít nhất ba; duyệt phần còn lại. Dự phóng chỉ mạnh khi bạn sẵn sàng phản biện các mặc định.",
    },
    // Deep-dive prose sections for chapter 06. `rnd-tax-incentive` closes the
    // atlassian-standard-mapping-goal.md P1j gap (§1 phase 6 "R&D Tax Incentive
    // dedicated section"): the R&DTI is an AU-specific cashflow lever that
    // returns 43.5% of eligible R&D spend as a refundable tax offset for
    // companies with aggregated turnover < A$20M — often the single biggest
    // cheque a pre-revenue AU startup receives. General information only, not
    // tax advice; the AusIndustry registration + ATO Schedule 743 lodgment is
    // a two-step process founders routinely miss the deadline on.
    sections: [
      {
        id: "rnd-tax-incentive",
        heading: {
          en: "R&D Tax Incentive — the 43.5% refund most AU founders forget until it's too late",
          vi: "Ưu đãi thuế R&D — khoản hoàn 43.5% mà nhiều founder Úc quên đến khi hết hạn",
        },
        body: {
          en: [
            "What it is: the R&D Tax Incentive (R&DTI) is a joint AusIndustry + ATO programme. Australian-resident R&D entities with aggregated turnover under A$20M get a refundable tax offset equal to their company tax rate + 18.5 percentage points (currently ~43.5%). Above A$20M the offset is non-refundable and tiered (8.5% or 16.5% premium above the corporate tax rate depending on R&D intensity).",
            "Who qualifies as an R&D entity: an Australian-resident body corporate (or foreign corporation with a permanent establishment here) that self-assesses at least one eligible core R&D activity for the income year. Sole traders, partnerships and trusts do NOT qualify — you must be a Pty Ltd / Ltd.",
            "Core vs supporting activities (this is where refunds die): a core activity is an experimental activity whose outcome cannot be known in advance, conducted for the purpose of generating new knowledge (Industry Research and Development Act 1986 s355-25). A supporting activity is directly related to a core activity. If your work is 'engineering to spec' with no experiment, it fails core — no matter how technically hard. Document the hypothesis + unknown outcome + experiment method before you start coding.",
            "Minimum spend threshold: notional deductions must total ≥ A$20,000 in the income year to claim (some exceptions for research service provider spend). Below that, keep the records but claim next year when your total qualifies.",
            "The 10-month deadline that catches founders out: registration is with AusIndustry via the R&DTI customer portal, and must be lodged within 10 months after the end of the company's income year. Standard 30-June year-end → registration deadline is 30 April the following year. Miss it and the entire year's claim is void — no extensions except in narrow force majeure cases.",
            "Two-step process (both required): (1) register the R&D activities with AusIndustry (business.gov.au); (2) claim the offset in the company income tax return via Schedule 743 (Research and Development Tax Incentive schedule). Registration alone does not deliver cash; the ATO does that after the tax return is assessed.",
            "Records you must keep contemporaneously: hypothesis / experiment design docs, technical progress notes, time-sheets or effort estimates per employee, invoices for R&D expenditure, apportionment methodology for mixed R&D + non-R&D salaries. AusIndustry can audit any registration for four years post-lodgment and demand contemporaneous evidence — after-the-fact reconstruction is a well-known audit trigger.",
            "Common expenditure pitfalls: capital expenditure (buildings, generic laptops) is excluded; R&D on behalf of a foreign parent needs an Advance / Overseas Finding; feedstock (materials consumed in the R&D) has separate rules; interest, core-technology acquisition, and expenditure not at risk (e.g. grant-funded portions) are excluded. When in doubt, exclude and add back in next year with a private ruling.",
            "How BlockID.au surfaces this: data-room folder 11 item 'R&D Tax Incentive Claims' (data-room-templates.ts:1256) is the artefact slot; the compliance-calendar (Chapter 11 CTA) fires the 30-April reminder 60 days out; the au-compliance agent will draft the AusIndustry activity descriptions from your product roadmap + engineering notes. For eligibility questions beyond the self-assessment, engage a registered R&D Tax Advisor (RTAA) before Chapter 9 — advisor fees are themselves usually claimable.",
          ],
          vi: [
            "Là gì: R&D Tax Incentive (R&DTI) là chương trình phối hợp giữa AusIndustry và ATO. Các đơn vị R&D cư trú Úc có doanh thu hợp nhất dưới A$20 triệu được hưởng khoản bù trừ thuế hoàn lại bằng thuế suất doanh nghiệp cộng 18.5 điểm phần trăm (hiện ~43.5%). Trên A$20 triệu, khoản bù trừ không hoàn lại và phân bậc (8.5% hoặc 16.5% cao hơn thuế suất tuỳ cường độ R&D).",
            "Ai đủ tư cách là đơn vị R&D: công ty (body corporate) cư trú Úc, hoặc công ty nước ngoài có cơ sở thường trú tại Úc, tự đánh giá có ít nhất một hoạt động R&D lõi đủ điều kiện trong năm tài chính. Cá nhân kinh doanh, hợp danh và trust KHÔNG đủ điều kiện — bạn phải là Pty Ltd / Ltd.",
            "Hoạt động lõi vs hỗ trợ (chỗ này giết claim): hoạt động lõi là thử nghiệm mà kết quả không thể biết trước, thực hiện nhằm tạo tri thức mới (Industry Research and Development Act 1986 s355-25). Hoạt động hỗ trợ liên quan trực tiếp đến hoạt động lõi. Nếu công việc chỉ là 'kỹ thuật theo yêu cầu' không có thử nghiệm, không đủ lõi — bất kể độ khó kỹ thuật. Ghi lại giả thuyết + kết quả chưa biết + phương pháp thử nghiệm trước khi bắt tay vào code.",
            "Ngưỡng chi tiêu tối thiểu: tổng khấu trừ danh nghĩa phải ≥ A$20,000 trong năm để được claim (một số ngoại lệ cho chi cho nhà cung cấp dịch vụ nghiên cứu). Dưới ngưỡng đó, giữ hồ sơ và claim năm sau khi đủ.",
            "Hạn 10 tháng nhiều founder bỏ lỡ: đăng ký với AusIndustry qua cổng khách hàng R&DTI, phải nộp trong vòng 10 tháng sau khi kết thúc năm tài chính công ty. Năm tài chính 30-06 → hạn đăng ký là 30-04 năm sau. Bỏ lỡ là mất toàn bộ claim năm đó — không có gia hạn ngoài trường hợp bất khả kháng rất hẹp.",
            "Quy trình hai bước (bắt buộc cả hai): (1) đăng ký hoạt động R&D với AusIndustry (business.gov.au); (2) khai bù trừ trong tờ khai thuế thu nhập doanh nghiệp qua Schedule 743 (Research and Development Tax Incentive schedule). Đăng ký không thôi không mang lại tiền; ATO chỉ giải ngân sau khi tờ khai thuế được xử lý.",
            "Hồ sơ phải lưu đồng thời: tài liệu thiết kế giả thuyết / thử nghiệm, ghi chú tiến độ kỹ thuật, bảng chấm công hoặc ước lượng công sức từng nhân viên, hoá đơn chi phí R&D, phương pháp phân bổ lương R&D và không-R&D. AusIndustry có thể audit bất kỳ đăng ký nào trong 4 năm sau khi nộp và yêu cầu bằng chứng đồng thời — dựng lại hồ sơ sau này là trigger audit nổi tiếng.",
            "Bẫy chi tiêu thường gặp: chi tiêu vốn (nhà xưởng, laptop dùng chung) bị loại; R&D làm cho công ty mẹ nước ngoài cần Advance / Overseas Finding; feedstock (nguyên liệu tiêu hao trong R&D) có quy tắc riêng; lãi vay, mua core-technology, và chi không ở rủi ro (ví dụ phần được tài trợ bởi grant) bị loại. Khi nghi ngờ, loại trừ và thêm lại năm sau qua private ruling.",
            "BlockID.au bề mặt hoá thế nào: mục 'R&D Tax Incentive Claims' trong data-room folder 11 (data-room-templates.ts:1256) là ô artefact; compliance-calendar (CTA Chương 11) bắn nhắc 30-04 trước 60 ngày; đại lý au-compliance sẽ soạn mô tả hoạt động AusIndustry từ product roadmap + ghi chú engineering. Với các câu hỏi đủ điều kiện vượt ngoài tự đánh giá, hãy tương tác với R&D Tax Advisor đã đăng ký (RTAA) trước Chương 9 — phí tư vấn thường cũng claim được.",
          ],
        },
      },
    ],
  },
  {
    slug: "07-growth",
    phase: 7,
    order: 7,
    phaseLabel: PHASE_LABELS[7],
    title: {
      en: "Chapter 7 — Growth & Analytics",
      vi: "Chương 7 — Tăng trưởng & Phân tích",
    },
    summary: {
      en: "Turn on the real analytics stream. GA4 connects to your live property; the founder's own Stripe flips from test to live. A weekly SVI-refresh cron starts writing SVI deltas so growth becomes visible on a sparkline, not a spreadsheet.",
      vi: "Bật luồng phân tích thật. GA4 kết nối với property live của bạn; Stripe riêng của founder chuyển từ test sang live. Một cron làm mới SVI hàng tuần bắt đầu ghi delta SVI để tăng trưởng hiện lên sparkline, không phải bảng tính.",
    },
    founderAction: {
      en: "In Workspace → Integrations, connect GA4 (paste the property ID + grant the service account viewer access) and switch Stripe from test-mode to live-mode. Then open Workspace → SVI → Weekly refresh and set the day-of-week + time-of-day for the recurring pull.",
      vi: "Tại Không gian làm việc → Tích hợp, kết nối GA4 (dán property ID + cấp quyền viewer cho service account) và chuyển Stripe từ test-mode sang live-mode. Sau đó mở Không gian làm việc → SVI → Làm mới hàng tuần và đặt ngày trong tuần + giờ cho lần kéo dữ liệu định kỳ.",
    },
    agentsInvoked: {
      en: [
        "GA4 pull worker — reads sessions + conversions + top-referrers weekly into svi_signals; no PII surfaces.",
        "Stripe live pull worker — reads MRR + churn + refunds weekly into revenue_events for the founder's own gateway.",
        "CMO agent (growth playbook) — produces a 12-week acquisition plan tied to the two highest-signal channels from GA4.",
        "Referrals scaffold — enables the existing referrals infra with a founder-branded referral link + reward config.",
      ],
      vi: [
        "Worker kéo GA4 — đọc sessions + conversions + referrer hàng tuần vào svi_signals; không lộ PII.",
        "Worker kéo Stripe live — đọc MRR + churn + refund hàng tuần vào revenue_events cho cổng thanh toán riêng của founder.",
        "Đại lý CMO (playbook tăng trưởng) — sản xuất kế hoạch acquisition 12 tuần gắn với hai kênh tín hiệu cao nhất từ GA4.",
        "Khung referrals — bật hạ tầng referrals hiện có với link giới thiệu gắn thương hiệu founder + cấu hình phần thưởng.",
      ],
    },
    expectedOutputs: {
      en: [
        "svi_signals rows — one weekly bucket per week, populated from GA4 + Stripe live pulls; visible as a sparkline on the workspace dashboard.",
        "growth-playbook.md — CMO's 12-week plan with weekly hypotheses, budget guardrails and a fallback if any hypothesis dies at week two.",
        "weekly-delta.pdf — auto-emailed weekly delta summarising SVI change + top-3 movers, sent to the founder's inbox every Monday (or your chosen day).",
        "referrals-config.md — reward tier, terms, anti-abuse guardrails; ships disabled until you approve one final review.",
        "How to read the weekly delta: single-week jumps mean nothing (noise). Look at three consecutive weeks in the same direction — that is a trend the CMO agent will start iterating the growth playbook on.",
      ],
      vi: [
        "Hàng svi_signals — một bucket tuần cho mỗi tuần, đổ từ GA4 + Stripe live; hiện dưới dạng sparkline trên dashboard workspace.",
        "growth-playbook.md — kế hoạch 12 tuần của CMO với giả thuyết theo tuần, khoản ngân sách hộ lan và phương án dự phòng nếu giả thuyết chết ở tuần thứ hai.",
        "weekly-delta.pdf — tóm tắt delta hàng tuần được email tự động, gửi vào hộp thư founder mỗi thứ Hai (hoặc ngày bạn chọn).",
        "referrals-config.md — bậc thưởng, điều khoản, chống lạm dụng; ra mắt ở trạng thái tắt cho đến khi bạn duyệt lần review cuối.",
        "Cách đọc delta tuần: nhảy vọt một tuần không có ý nghĩa (nhiễu). Xem ba tuần liên tiếp cùng hướng — đó là xu hướng để CMO bắt đầu lặp playbook tăng trưởng.",
      ],
    },
    commonPitfalls: {
      en: [
        "Turning on GA4 without a measurement plan. If you cannot name your primary conversion event, the GA4 stream is just noise — write the plan first, wire the property second.",
        "Flipping Stripe live-mode without the Chapter 6 readiness checklist green. Live-mode with an unverified business account will queue the payout, not deliver it.",
        "Setting the weekly SVI refresh to Monday 09:00 (everyone does). Pick a day/time when you actually have thirty minutes to read the delta — otherwise it becomes an unread email.",
      ],
      vi: [
        "Bật GA4 mà chưa có kế hoạch đo lường. Nếu bạn chưa gọi tên được sự kiện chuyển đổi chính, luồng GA4 chỉ là nhiễu — viết kế hoạch trước, kết nối property sau.",
        "Chuyển Stripe live-mode mà chưa xanh checklist Chương 6. Live-mode với tài khoản doanh nghiệp chưa xác minh sẽ giữ payout, không giải ngân.",
        "Đặt làm mới SVI hàng tuần thứ Hai 09:00 (ai cũng làm). Chọn ngày/giờ bạn thực sự có ba mươi phút đọc delta — nếu không, nó thành email chưa mở.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's own weekly SVI cron fires Sunday 03:15 UTC (13:15 AEST). Look at /showcase/blockid — the growth strip shows the three-week trailing SVI slope, and the /guide/reports Phase 7 bucket carries the last four growth-playbook revisions. Notice the playbook was rewritten at week five when the accelerator channel out-performed content by 3x.",
      vi: "Cron SVI hàng tuần của chính BlockID.au chạy Chủ Nhật 03:15 UTC (13:15 AEST). Xem /showcase/blockid — dải tăng trưởng hiển thị độ dốc SVI ba tuần trailing, và mục Phase 7 của /guide/reports mang bốn phiên bản playbook tăng trưởng gần nhất. Chú ý playbook được viết lại ở tuần thứ năm khi kênh accelerator vượt content gấp 3 lần.",
    },
    cta: {
      en: "Block a 90-minute Chapter 7 session: wire GA4, flip Stripe live, set the SVI cron day. Then commit to reading the first three weekly deltas out loud with a co-founder — the first three are where the pattern shows.",
      vi: "Đặt phiên Chương 7 kéo dài 90 phút: kết nối GA4, bật Stripe live, chọn ngày cron SVI. Sau đó cam kết đọc to ba delta tuần đầu cùng đồng sáng lập — ba tuần đầu là nơi mẫu hình lộ ra.",
    },
  },
  {
    slug: "08-team",
    phase: 8,
    order: 8,
    phaseLabel: PHASE_LABELS[8],
    title: {
      en: "Chapter 8 — Team & Culture",
      vi: "Chương 8 — Đội ngũ & Văn hóa",
    },
    summary: {
      en: "Add co-founders, first hires and an ESOP scheme. The CHRO agent produces an org-chart and role definitions; if the Share Management add-on is active the cap table and vesting schedules populate here — Div83A tax-concession checklist runs so early ESOP grants qualify.",
      vi: "Thêm đồng sáng lập, các nhân sự đầu tiên và một scheme ESOP. Đại lý CHRO sản xuất sơ đồ tổ chức và định nghĩa vai trò; nếu add-on Share Management đang bật, cap table và lịch vesting sẽ được đổ vào đây — checklist ưu đãi thuế Div83A chạy để các grant ESOP sớm đủ điều kiện.",
    },
    founderAction: {
      en: "Add each co-founder and hire in Workspace → Team. Draft the ESOP scheme rules (pool size, vesting schedule, cliff, exercise window). If you have the Share Management add-on, review the cap table draft the CHRO produces and approve or override each row before it becomes the source of truth for Chapter 11 blockchain sync.",
      vi: "Thêm mỗi đồng sáng lập và nhân sự trong Không gian làm việc → Đội ngũ. Soạn quy tắc scheme ESOP (kích thước pool, lịch vesting, cliff, cửa sổ thực hiện). Nếu bạn có add-on Share Management, xem bản nháp cap table do CHRO tạo và duyệt/ghi đè từng dòng trước khi nó trở thành nguồn sự thật cho đồng bộ blockchain ở Chương 11.",
    },
    agentsInvoked: {
      en: [
        "CHRO agent — org-chart with roles, seniority bands, expected 90/180-day hires.",
        "CHRO agent (role definitions) — a JD-style doc per open role, tuned for the AU tech market.",
        "CHRO agent (ESOP scheme) — scheme rules doc: pool size, vesting, cliff, exercise, tag-along, drag-along.",
        "Div83A checker — runs web/src/lib/div83a-checker.ts against each early grant; flags any at risk of losing the tax concession.",
        "Cap-table draft — populated only if Share Management add-on is active; otherwise a sample layout doc explains what would be produced.",
      ],
      vi: [
        "Đại lý CHRO — sơ đồ tổ chức với vai trò, dải seniority, các vị trí dự kiến tuyển trong 90/180 ngày.",
        "Đại lý CHRO (định nghĩa vai trò) — tài liệu kiểu JD cho mỗi vị trí mở, chỉnh cho thị trường tech AU.",
        "Đại lý CHRO (scheme ESOP) — tài liệu quy tắc scheme: kích thước pool, vesting, cliff, thực hiện, tag-along, drag-along.",
        "Bộ kiểm tra Div83A — chạy web/src/lib/div83a-checker.ts cho từng grant sớm; đánh dấu các grant có nguy cơ mất ưu đãi thuế.",
        "Bản nháp cap table — chỉ đổ dữ liệu nếu add-on Share Management đang bật; nếu không, tài liệu mẫu giải thích những gì sẽ được tạo.",
      ],
    },
    expectedOutputs: {
      en: [
        "org-chart.pdf — visual org tree with expected next-6-month hires shown as dashed nodes.",
        "role-definitions/*.md — one JD per open role; each references the Chapter 6 unit-economics pack so salary bands are defensible.",
        "esop-scheme.md — full scheme rules doc, ready for legal review before you issue the first grant.",
        "div83a-check.md — per-grant checklist with green/amber/red, plus the fix suggested for any amber/red row (usually valuation timing).",
        "cap-table-draft.csv (if add-on active) — one row per shareholder + option holder, ready for the Chapter 11 blockchain sync.",
        "How to read the org-chart: dashed nodes are hires you plan; solid nodes are people who exist. Solid-to-dashed ratio tells you whether the plan is realistic — three dashed per solid is aggressive, five per solid needs Chapter 9 funding first.",
      ],
      vi: [
        "org-chart.pdf — cây tổ chức trực quan với các vị trí tuyển 6 tháng tới thể hiện bằng nút nét đứt.",
        "role-definitions/*.md — một JD cho mỗi vị trí mở; mỗi JD tham chiếu gói unit-economics Chương 6 để dải lương bảo vệ được.",
        "esop-scheme.md — tài liệu quy tắc scheme đầy đủ, sẵn cho legal review trước khi phát hành grant đầu tiên.",
        "div83a-check.md — checklist theo grant với xanh/vàng/đỏ, kèm cách sửa cho các dòng vàng/đỏ (thường là thời điểm định giá).",
        "cap-table-draft.csv (nếu add-on đang bật) — mỗi dòng một cổ đông + người giữ option, sẵn cho đồng bộ blockchain Chương 11.",
        "Cách đọc sơ đồ tổ chức: nút nét đứt là các vị trí bạn dự kiến; nút nét liền là người đã có. Tỷ lệ nét liền so với nét đứt cho biết kế hoạch có thực tế hay không — ba nét đứt cho mỗi nét liền là tham vọng, năm nét đứt cần Chương 9 gọi vốn trước.",
      ],
    },
    commonPitfalls: {
      en: [
        "Issuing ESOP grants before running the Div83A checker. A late valuation or the wrong grant date can disqualify the tax concession — un-doing that requires a re-issue at the correct valuation, and rare early hires walk when they see the swap.",
        "Building an org-chart with only present hires. The dashed-hire layer is what makes the chart useful for Chapter 9 investor conversations — leaving it blank makes the team look understaffed.",
        "Populating the cap table without the Share Management add-on. The draft doc explains what you would get, but the actual populated table needs the add-on active — trying to keep the cap table in a side spreadsheet defeats the Chapter 11 blockchain-sync pipeline.",
      ],
      vi: [
        "Phát hành grant ESOP trước khi chạy bộ kiểm tra Div83A. Định giá trễ hoặc ngày grant sai có thể loại bỏ ưu đãi thuế — sửa lại phải phát hành lại theo định giá đúng, và các nhân sự sớm hiếm có thể rời đi khi thấy cuộc trao đổi.",
        "Xây org-chart chỉ có nhân sự hiện tại. Lớp nhân sự nét đứt mới làm biểu đồ hữu ích cho các cuộc trò chuyện với nhà đầu tư ở Chương 9 — để trống khiến đội ngũ trông thiếu người.",
        "Điền cap table mà chưa bật add-on Share Management. Tài liệu nháp giải thích bạn sẽ nhận được gì, nhưng bảng thực sự cần add-on đang bật — cố giữ cap table trên bảng tính bên ngoài phá vỡ pipeline đồng bộ blockchain Chương 11.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's Chapter 8 milestone `team_v1` and its ESOP scheme doc live in the /guide/reports Phase 8 bucket. The Div83A check flagged one early grant amber (grant date pre-dated the first valuation by three weeks); the fix — a re-grant at the first-valuation date — is documented in the follow-up note. Investors read that trail and take it as evidence of good governance, not as a red flag.",
      vi: "Milestone `team_v1` Chương 8 của BlockID.au và tài liệu scheme ESOP nằm trong mục Phase 8 của /guide/reports. Bộ kiểm tra Div83A đánh dấu một grant sớm màu vàng (ngày grant sớm hơn định giá đầu tiên ba tuần); cách sửa — phát hành lại vào ngày định giá đầu tiên — được ghi trong ghi chú tiếp theo. Nhà đầu tư đọc dấu vết đó như bằng chứng quản trị tốt, không phải cờ đỏ.",
    },
    cta: {
      en: "Draft the ESOP scheme this week; run the Div83A checker on any grants already made. If you have the Share Management add-on, walk the CHRO's cap-table draft with a co-founder before approving each row — three eyes catch what two miss.",
      vi: "Soạn scheme ESOP tuần này; chạy bộ kiểm tra Div83A cho các grant đã phát hành. Nếu có add-on Share Management, đi qua bản nháp cap table của CHRO với đồng sáng lập trước khi duyệt từng dòng — ba con mắt bắt lỗi mà hai bỏ sót.",
    },
    // atlassian-standard-mapping-goal.md §1 phase 7/8 P2 gaps + Q6 + Q7:
    // culture rituals are the last non-legal callouts in the phase gap matrix.
    // ShipIt (Q7) is Atlassian's quarterly 24-hour hackathon started in 2005 —
    // the pattern most cited by AU tech founders as "the ritual we copied".
    // Pledge 1% (Q6) is the opt-in equity/product/profit/time pledge Atlassian
    // co-founded with Salesforce + Rally in 2014; the guide surfaces it as a
    // soft nudge only — never opt-out — because a forced commitment defeats
    // the point and can create Corporations Act director-duty tension if the
    // pledge is signed before the cap table has room for it.
    sections: [
      {
        id: "culture-rituals-shipit",
        heading: {
          en: "Culture rituals — quarterly ShipIt inspiration (Atlassian's 24-hour hackathon)",
          vi: "Nghi thức văn hoá — cảm hứng ShipIt hàng quý (hackathon 24 giờ của Atlassian)",
        },
        body: {
          en: [
            "What ShipIt is: Atlassian's internal 24-hour hackathon, started 2005 (originally called 'FedEx Day' — deliver in 24 hours). Any employee can form a team, pitch any idea in-scope for the company, and demo the working artefact 24 hours later. Winners are voted by peers, not managers. Runs quarterly; every quarter, without exception, for 20+ years.",
            "Why it works: (a) it lets engineers surface roadmap ideas the exec team hasn't heard, (b) it makes cross-functional collaboration cheap for one day so people learn who to talk to on day two, and (c) shipped artefacts routinely become production features — Confluence Blueprints, Jira Automation Rules, and Rovo's earliest prototype all started as ShipIt entries per Atlassian's 20-year retrospective.",
            "How to adapt it for a five-person startup: keep the 24-hour clock, drop the tournament theatre. Pick one Friday-Saturday per quarter; everyone (founders + engineers + first ops hire) picks a project outside their current sprint; demo Saturday afternoon; anyone who wants to keeps building on Monday. The point is not the prize — the point is a legal window to break the sprint plan without guilt.",
            "Guardrails that stop it becoming a productivity-theatre ritual: (i) no assigned teams — self-organising only; (ii) demos are shown, not slides — if you cannot demo, you cannot present; (iii) IP produced during ShipIt sits under the same IP Assignment Deed as regular work (see Chapter 4 P4 gap on the deed template); (iv) the CEO does not veto any pitch pre-demo — the ritual dies the first time an idea is killed before the 24 hours.",
            "When to start the ritual: earliest at team_v1 milestone (this chapter) once you have three or more people. Below three people it is just a hackathon on a normal Saturday. Above three people the cadence stops slipping if you protect it with a recurring calendar block owned by the CEO — not the CHRO — so it survives when hiring gets busy.",
            "How to record it in the workspace: create a workspace project 'shipit-{quarter}' at the start of each quarter; the CHRO agent will draft the pitch-log template, the CEO agent will draft a one-page retrospective the following Monday summarising which entries the team wants to keep building. Both docs land in data-room folder 6 (Team & Advisors) under 'Culture rituals' — a small but visible cultural artefact when a Chapter 9 investor asks how the team spends its slack time.",
            "AU nuance: ShipIt hours worked by permanent staff count as ordinary hours under the Fair Work Act 2009 National Employment Standards, not as unpaid overtime — pay staff for the day, pay any casual at their base rate. Contractors who join ShipIt do so under their existing services agreement; do NOT extend the deed for a one-day sprint without a variation letter or the ownership of any output can be contested later.",
            "How BlockID.au surfaces this: the Chapter 8 CTA (`team_v1`) now links out to /guide/reports Phase 8 with a ShipIt template kit — pitch log, retro template, and a one-page 'why we picked this ritual' brief drafted by the CHRO agent for anyone who needs to sell the block-time to a founding team that has never run one.",
          ],
          vi: [
            "ShipIt là gì: hackathon 24 giờ nội bộ của Atlassian, khởi động năm 2005 (ban đầu tên 'FedEx Day' — giao hàng trong 24 giờ). Bất kỳ nhân viên nào cũng có thể lập đội, đề xuất ý tưởng trong phạm vi công ty, và demo sản phẩm hoạt động sau 24 giờ. Người thắng do đồng nghiệp bình chọn, không phải quản lý. Chạy hàng quý; mỗi quý, không ngoại lệ, hơn 20 năm.",
            "Vì sao nó hiệu quả: (a) để kỹ sư đưa lên ý tưởng roadmap mà đội exec chưa nghe, (b) khiến cộng tác đa chức năng trở nên rẻ trong một ngày để mọi người biết cần nói chuyện với ai ngày hôm sau, và (c) sản phẩm ShipIt thường xuyên trở thành tính năng production — Confluence Blueprints, Jira Automation Rules, và bản prototype sớm nhất của Rovo đều khởi đầu là các bài ShipIt theo báo cáo 20 năm của Atlassian.",
            "Cách áp dụng cho startup năm người: giữ đồng hồ 24 giờ, bỏ vẻ ngoài thi thố. Chọn một cặp Thứ Sáu–Thứ Bảy mỗi quý; ai cũng (founder + engineer + nhân sự ops đầu tiên) chọn một dự án ngoài sprint hiện tại; demo chiều Thứ Bảy; ai muốn xây tiếp thứ Hai thì cứ xây tiếp. Điểm chính không phải giải thưởng — điểm chính là cửa sổ hợp lệ để phá kế hoạch sprint mà không cảm thấy có lỗi.",
            "Rào chắn giữ nó khỏi thành nghi thức sân khấu năng suất: (i) không phân đội — chỉ tự tổ chức; (ii) demo là hiển thị, không phải slide — không demo được thì không trình bày; (iii) IP tạo trong ShipIt nằm dưới cùng IP Assignment Deed như công việc thường (xem gap P4 Chương 4 về mẫu deed); (iv) CEO không phủ quyết bất kỳ pitch nào trước demo — nghi thức chết ngay lần đầu ý tưởng bị giết trước 24 giờ.",
            "Khi nào bắt đầu nghi thức: sớm nhất tại mốc team_v1 (chương này) khi đã có ba người trở lên. Dưới ba người chỉ là hackathon trên một Thứ Bảy bình thường. Trên ba người, cadence sẽ ngừng trôi nếu bạn bảo vệ nó bằng một block lịch định kỳ do CEO sở hữu — không phải CHRO — để nó tồn tại khi tuyển dụng bận rộn.",
            "Cách ghi lại trong workspace: tạo project workspace 'shipit-{quý}' vào đầu mỗi quý; đại lý CHRO sẽ soạn mẫu nhật ký pitch, đại lý CEO sẽ soạn tóm tắt hồi cứu một trang vào thứ Hai kế tiếp về những bài đội muốn xây tiếp. Cả hai tài liệu vào data-room folder 6 (Team & Advisors) dưới 'Culture rituals' — một artefact văn hoá nhỏ nhưng nhìn thấy được khi nhà đầu tư Chương 9 hỏi đội dùng thời gian rảnh như thế nào.",
            "Điều đặc thù AU: giờ ShipIt của nhân viên chính thức tính là giờ thường theo National Employment Standards của Fair Work Act 2009, không phải overtime không lương — trả lương cho ngày đó, trả nhân viên casual theo mức cơ bản. Nhà thầu tham gia ShipIt theo hợp đồng dịch vụ hiện có; KHÔNG mở rộng deed cho một sprint một ngày mà không có variation letter, nếu không quyền sở hữu bất kỳ output nào có thể bị tranh chấp sau này.",
            "BlockID.au bề mặt hoá thế nào: CTA Chương 8 (`team_v1`) giờ liên kết ra /guide/reports Phase 8 kèm bộ mẫu ShipIt — nhật ký pitch, mẫu retro, và bản tóm tắt một trang 'tại sao chúng tôi chọn nghi thức này' do đại lý CHRO soạn cho ai cần thuyết phục đội sáng lập chưa từng chạy chưa quen với việc chặn khối thời gian này.",
          ],
        },
      },
      {
        id: "pledge-1-percent",
        heading: {
          en: "Pledge 1% — the opt-in equity/product/profit/time pledge Atlassian co-founded",
          vi: "Pledge 1% — cam kết opt-in cổ phần/sản phẩm/lợi nhuận/thời gian mà Atlassian đồng sáng lập",
        },
        body: {
          en: [
            "What Pledge 1% is: a global movement co-founded in 2014 by Atlassian, Salesforce and Rally Software (source: pledge1percent.org/history). A company signs up to pledge any one — or any mix — of four ledgers: 1% of equity, 1% of profit, 1% of product (free or discounted access for eligible non-profits), or 1% of employee time (paid volunteering hours). No one of the four is more valid than another; the mix is defended in the company's own Chapter 12 exit-readiness pack.",
            "Why founders sign at Chapter 8 rather than at exit: the cheapest lever is 1% equity signed at seed valuation — a A$3M post-money seed costs A$30K of stock; the same 1% at a A$500M exit costs A$5M. Founders who defer routinely find the cap-table conversation harder every round; Chapter 8 (before the ESOP is issued) is the last window where the pledge fits without renegotiation.",
            "Guardrail: soft nudge only — the platform never opts you in. This section exists because AU founders repeatedly report finding out about Pledge 1% at Chapter 12 and wishing they'd known at Chapter 8. It is not a fundraise gate, not a compliance requirement, and not a scoring input — the SVI does not read this checkbox. Sign only when you and every co-founder can defend the pledge with the same conviction.",
            "How the equity 1% is structured in AU: usually a warrant or option granted to a Pledge-1% Foundation (or a bare trust) with a strike price at the seed valuation, exercisable on a liquidity event. This preserves cap-table cleanliness through subsequent rounds while locking in the seed-valuation cost. Do not issue as ordinary shares before Chapter 11 — a Pledge-1% shareholder on the register at Chapter 9 adds a voting party to every board resolution.",
            "Tax treatment (AU-specific): a donation of the exercised warrant proceeds to a DGR-endorsed (Deductible Gift Recipient) charity is tax-deductible under ITAA 1997 s30-15; a donation to a non-DGR entity is not. Confirm DGR status via the ATO ABN Lookup before signing — the Pledge 1% Foundation's AU vehicle is DGR-endorsed, but many local grantee charities are not. If the exit is a scrip-for-scrip acquisition (Subdiv 124-M), the deemed disposal at CGT event A1 can create a tax liability before cash lands — plan the timing with your accountant.",
            "Product-1% and Time-1% are the fastest to start: (a) product-1% just means committing to offer the free/discounted tier to eligible non-profits; the auto-DataRoom template pack includes an 'eligible non-profit terms' rider your CLO can review in 30 minutes. (b) time-1% is one paid volunteering day per employee per quarter (approx. 8 hours × 4 quarters ≈ 1% of a 2,000-hour work year); the CHRO agent drafts the leave-policy variation and the Fair Work interaction (paid volunteering hours count toward ordinary hours, not annual leave).",
            "Why not now, then: the honest reason to wait — you are still in idea validation and the pledge could commit a percentage the surviving business cannot support. Signal to yourself: revisit at Chapter 11 (`scale_v1`) if you cannot commit at Chapter 8; anchor the revisit in the compliance-calendar so the decision is deliberate, not accidental.",
            "How to sign (external, not on BlockID.au): visit pledge1percent.org, sign the corporate commitment, upload the counter-signature to data-room folder 6 (Team & Advisors) → 'Culture rituals'. BlockID.au does not intermediate the pledge — Pledge 1% is a third-party non-profit, and the platform surfaces the option as guidance only, never as a fundraise gate or scoring input.",
          ],
          vi: [
            "Pledge 1% là gì: phong trào toàn cầu được đồng sáng lập năm 2014 bởi Atlassian, Salesforce và Rally Software (nguồn: pledge1percent.org/history). Công ty đăng ký cam kết một — hoặc kết hợp — bốn sổ cái: 1% cổ phần, 1% lợi nhuận, 1% sản phẩm (truy cập miễn phí hoặc giảm giá cho tổ chức phi lợi nhuận đủ điều kiện), hoặc 1% thời gian nhân viên (giờ tình nguyện có trả lương). Không có sổ nào hợp lệ hơn sổ khác; sự kết hợp được bảo vệ trong gói exit-readiness Chương 12 của chính công ty.",
            "Vì sao founder ký ở Chương 8 thay vì ở exit: đòn bẩy rẻ nhất là 1% cổ phần ký ở định giá seed — seed A$3M post-money tốn A$30K cổ phiếu; cùng 1% ở exit A$500M tốn A$5M. Founder trì hoãn thường xuyên thấy trò chuyện cap-table khó hơn mỗi vòng; Chương 8 (trước khi phát hành ESOP) là cửa sổ cuối để cam kết vừa vặn mà không phải đàm phán lại.",
            "Rào chắn: chỉ nhắc nhẹ — nền tảng không bao giờ tự động opt bạn vào. Mục này tồn tại vì các founder AU thường xuyên báo cáo biết đến Pledge 1% ở Chương 12 và ước gì biết ở Chương 8. Đây không phải cổng gọi vốn, không phải yêu cầu tuân thủ, và không phải đầu vào chấm điểm — SVI không đọc checkbox này. Chỉ ký khi bạn và mọi đồng sáng lập có thể bảo vệ cam kết với cùng niềm tin.",
            "Cấu trúc 1% cổ phần trong AU: thường là warrant hoặc option cấp cho Pledge-1% Foundation (hoặc bare trust) với giá thực hiện ở định giá seed, thực hiện khi có sự kiện thanh khoản. Cách này giữ sạch cap table qua các vòng sau trong khi khoá chi phí ở định giá seed. Không phát hành dưới dạng cổ phần thường trước Chương 11 — cổ đông Pledge-1% trên sổ ở Chương 9 thêm một bên biểu quyết cho mọi nghị quyết hội đồng quản trị.",
            "Xử lý thuế (đặc thù AU): quyên góp tiền thu từ thực hiện warrant cho tổ chức từ thiện được ATO công nhận DGR (Deductible Gift Recipient) được khấu trừ thuế theo ITAA 1997 s30-15; quyên góp cho tổ chức không DGR thì không. Xác nhận trạng thái DGR qua ATO ABN Lookup trước khi ký — vehicle AU của Pledge 1% Foundation có DGR, nhưng nhiều tổ chức từ thiện được cấp phát tại địa phương thì không. Nếu exit là scrip-for-scrip (Subdiv 124-M), khoản deemed disposal ở sự kiện CGT A1 có thể tạo nghĩa vụ thuế trước khi tiền về — lập lịch cùng kế toán.",
            "Product-1% và Time-1% là dễ khởi động nhất: (a) product-1% chỉ nghĩa là cam kết cung cấp bậc miễn phí/giảm giá cho tổ chức phi lợi nhuận đủ điều kiện; bộ mẫu auto-DataRoom bao gồm rider 'điều khoản tổ chức phi lợi nhuận đủ điều kiện' mà CLO của bạn có thể review trong 30 phút. (b) time-1% là một ngày tình nguyện có trả lương mỗi nhân viên mỗi quý (khoảng 8 giờ × 4 quý ≈ 1% năm làm việc 2,000 giờ); đại lý CHRO soạn variation chính sách nghỉ và tương tác Fair Work (giờ tình nguyện có trả lương tính là giờ thường, không phải nghỉ phép năm).",
            "Vì sao chưa phải bây giờ, khi đó: lý do trung thực để chờ — bạn vẫn đang validate ý tưởng và cam kết có thể ràng buộc phần trăm mà doanh nghiệp sống sót không thể hỗ trợ. Tự tín hiệu cho mình: xem lại ở Chương 11 (`scale_v1`) nếu chưa thể cam kết ở Chương 8; neo lần xem lại vào compliance-calendar để quyết định là chủ ý, không phải tình cờ.",
            "Cách ký (bên ngoài, không trên BlockID.au): truy cập pledge1percent.org, ký cam kết doanh nghiệp, tải bản counter-signed lên data-room folder 6 (Team & Advisors) → 'Culture rituals'. BlockID.au không trung gian cam kết — Pledge 1% là tổ chức phi lợi nhuận bên thứ ba, và nền tảng bề mặt hoá tuỳ chọn này chỉ như hướng dẫn, không bao giờ như cổng gọi vốn hay đầu vào chấm điểm.",
          ],
        },
      },
    ],
    // Mirrors the eight criteria evaluated by web/src/lib/div83a-checker.ts
    // (Income Tax Assessment Act 1997 Subdivision 83A-B / 83A-C). Source of
    // truth for the plain-language strings lives in
    // web/src/lib/compliance/div83a-qualifying-tests.ts so this chapter, the
    // funding gate, and the ESS scheme-rules template all read the same list.
    qualifyingTests: {
      en: [...div83aQualifyingTestsFor("en")],
      vi: [...div83aQualifyingTestsFor("vi")],
    },
  },
  {
    slug: "09-funding",
    phase: 9,
    order: 9,
    phaseLabel: PHASE_LABELS[9],
    title: {
      en: "Chapter 9 — Funding-Ready",
      vi: "Chương 9 — Sẵn sàng gọi vốn",
    },
    summary: {
      en: "Assemble the investor pack, organise the data room into the standard sections, and let the LLM-auditor self-review the whole set before you send it out. Chapter 9 is the last dress rehearsal — the room only opens to investors once every red-flag from the audit is resolved.",
      vi: "Tập hợp bộ tài liệu cho nhà đầu tư, sắp xếp data room theo các mục chuẩn, và để LLM-auditor tự chấm toàn bộ trước khi bạn gửi ra ngoài. Chương 9 là buổi tổng duyệt cuối — phòng chỉ mở cho nhà đầu tư khi mọi cờ đỏ từ audit đã được xử lý.",
    },
    founderAction: {
      en: "Open Workspace → Data Room → Investor pack. Approve the auto-drafted investor deck (or override slides), then invite three trusted reviewers (mentor, ex-founder, angel) to leave feedback. Once every red-flag from the LLM-auditor is resolved, mark the data room 'shareable' — that flip is what unlocks Chapter 10.",
      vi: "Mở Không gian làm việc → Data Room → Gói nhà đầu tư. Duyệt bản nháp deck (hoặc ghi đè slide), sau đó mời ba reviewer đáng tin (mentor, cựu founder, angel) để lại phản hồi. Khi mọi cờ đỏ từ LLM-auditor đã xử lý, đánh dấu data room 'sẵn sàng chia sẻ' — cái flip đó mở khoá Chương 10.",
    },
    agentsInvoked: {
      en: [
        "CEO agent — auto-drafts the investor deck DOCX from the Chapters 1–8 artefacts (vision, market, product, financials, team).",
        "Data-room organiser — moves every DataRoom document into the standard sections (product / team / financials / legal / traction) using data-room-templates.ts.",
        "LLM-auditor (ADK Agent Garden) — self-reviews the whole investor pack; flags inconsistencies between the deck, the projection, and the traction numbers.",
        "IR (Investor Relations) agent — writes the outreach one-pager and the follow-up email template calibrated to your ideal-investor persona.",
        "CLO agent (light) — spot-checks the standard investor-facing agreements (NDA, term-sheet draft, side-letter template) for AU-law defaults.",
      ],
      vi: [
        "Đại lý CEO — tự soạn deck nhà đầu tư DOCX từ các sản phẩm Chương 1–8 (vision, thị trường, sản phẩm, tài chính, đội ngũ).",
        "Bộ sắp xếp data room — chuyển mọi tài liệu DataRoom vào các mục chuẩn (product / team / financials / legal / traction) qua data-room-templates.ts.",
        "LLM-auditor (ADK Agent Garden) — tự review toàn bộ gói nhà đầu tư; đánh dấu bất nhất giữa deck, dự phóng, và số liệu traction.",
        "Đại lý IR (Quan hệ nhà đầu tư) — viết one-pager tiếp cận và mẫu email follow-up hiệu chỉnh theo chân dung nhà đầu tư lý tưởng.",
        "Đại lý CLO (nhẹ) — soát lướt các thoả thuận chuẩn nhà đầu tư (NDA, bản nháp term-sheet, side-letter) theo mặc định luật AU.",
      ],
    },
    expectedOutputs: {
      en: [
        "investor-deck.docx — auto-drafted 12–15 slide deck; every claim carries a footnote to the DataRoom artefact that backs it.",
        "data-room-index.md — every folder + document listed in the standard section order, plus a 'What lives here' one-liner per folder.",
        "audit-report.md — LLM-auditor findings grouped by severity (red/amber/green); resolve every red before you invite an investor.",
        "outreach-onepager.pdf — IR agent's one-page cold-outreach summary (problem, traction, ask, contact).",
        "milestone `investor_ready` in milestone-report-state.json — flipped only when the data room is marked shareable.",
        "How to read the audit report: don't try to argue every amber. The three or four points that recur across mentor + auditor + ex-founder reviews are the ones investors will ask about — fix those, then send.",
      ],
      vi: [
        "investor-deck.docx — deck 12–15 slide tự soạn; mọi tuyên bố có footnote dẫn về tài liệu DataRoom hậu thuẫn.",
        "data-room-index.md — mọi thư mục + tài liệu liệt kê theo thứ tự mục chuẩn, kèm câu 'Trong đây có gì' cho mỗi thư mục.",
        "audit-report.md — phát hiện của LLM-auditor gom nhóm theo mức độ (đỏ/vàng/xanh); xử lý mọi cờ đỏ trước khi mời nhà đầu tư.",
        "outreach-onepager.pdf — one-page cold-outreach của IR (vấn đề, traction, mức xin, liên hệ).",
        "milestone `investor_ready` trong milestone-report-state.json — chỉ bật khi data room đánh dấu sẵn sàng chia sẻ.",
        "Cách đọc audit report: đừng cố phản biện mọi amber. Ba bốn điểm lặp lại qua mentor + auditor + cựu founder chính là điều nhà đầu tư sẽ hỏi — sửa những điểm đó, rồi gửi.",
      ],
    },
    commonPitfalls: {
      en: [
        "Sending the data room before the auditor resolves reds. A reviewer who spots the inconsistency you missed passes on the deal — and the pass propagates in the AU angel network faster than any positive signal.",
        "Inviting fifteen reviewers to hedge. Three deep readers beat fifteen shallow scrollers; the auditor + three humans is the sweet spot the plan expects.",
        "Treating the investor deck as final. It is a rehearsal artefact — you will re-draft slide 3 (traction) and slide 8 (ask) at least twice during Chapter 10 conversations. Ship it 'good-enough', iterate on real feedback.",
      ],
      vi: [
        "Gửi data room trước khi auditor xử lý các đỏ. Reviewer bắt được bất nhất mà bạn bỏ sót sẽ pass deal — và cái pass đó lan trong mạng angel AU nhanh hơn mọi tín hiệu tích cực.",
        "Mời mười lăm reviewer để phòng hờ. Ba người đọc sâu ăn đứt mười lăm người lướt; auditor + ba người là điểm ngọt kế hoạch mong đợi.",
        "Coi deck nhà đầu tư là bản cuối. Đó là sản phẩm tổng duyệt — bạn sẽ viết lại slide 3 (traction) và slide 8 (mức xin) ít nhất hai lần trong các cuộc trò chuyện Chương 10. Ra bản 'đủ tốt', lặp lại trên phản hồi thật.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's Chapter 9 pack is live in /guide/reports Phase 9. Notice the audit report flagged the projection's Bear-scenario CAC at $180 while the pricing memo assumed $120 — the fix (a footnote reconciling the two) is documented, and the milestone `investor_ready` only flipped after that inconsistency landed a green check. That kind of visible trail is what investors read as governance maturity.",
      vi: "Gói Chương 9 của BlockID.au đang chạy tại /guide/reports Phase 9. Chú ý audit report đánh dấu CAC kịch bản Bear là $180 trong khi memo giá giả định $120 — cách sửa (footnote hoà giải hai con số) đã được ghi, và milestone `investor_ready` chỉ bật sau khi bất nhất đó nhận dấu xanh. Loại dấu vết nhìn thấy được đó chính là điều nhà đầu tư đọc như sự chín chắn quản trị.",
    },
    cta: {
      en: "Set aside one full afternoon this week for the auditor pass. Read every red-flag out loud with a co-founder — reading aloud surfaces the awkward phrasings that will blow up in an investor Q&A.",
      vi: "Dành nguyên một buổi chiều tuần này cho lượt auditor. Đọc to từng cờ đỏ cùng đồng sáng lập — đọc to phơi bày các cách diễn đạt vụng về sẽ nổ tung trong Q&A với nhà đầu tư.",
    },
  },
  {
    slug: "10-fundraise",
    phase: 10,
    order: 10,
    phaseLabel: PHASE_LABELS[10],
    title: {
      en: "Chapter 10 — Fundraise & Term Sheet",
      vi: "Chương 10 — Gọi vốn & Term Sheet",
    },
    summary: {
      en: "Share the data room with real investors, receive term sheets, and get an AI + CLO legal review on each one. The plan is deliberate about wording: the optional blockchain hash of a term sheet is an immutable record for later verification — not legal notarisation, which is a reserved role under Australian law.",
      vi: "Chia sẻ data room với nhà đầu tư thật, nhận term sheet, và có review AI + CLO cho từng bản. Kế hoạch chọn từ có chủ đích: hash blockchain tuỳ chọn cho term sheet là bản ghi bất biến để xác minh sau — không phải công chứng pháp lý, vì 'notary' là vai trò dành riêng theo luật Úc.",
    },
    founderAction: {
      en: "Send data-room access via the NDA workflow (each investor gets a unique token — click-tracked, revocable). When a term sheet comes back, upload it into Workspace → Fundraise → Term sheet review. Approve the AI + CLO redline; iterate with the investor on the two or three clauses flagged. If you want tamper-evidence, opt in to the optional blockchain hash step — the hash is written to the private EVM (per project_blockchain_explorer) as an immutable record.",
      vi: "Gửi truy cập data room qua workflow NDA (mỗi nhà đầu tư nhận token duy nhất — có theo dõi click, có thể thu hồi). Khi term sheet quay về, tải lên Không gian làm việc → Gọi vốn → Review term sheet. Duyệt bản redline AI + CLO; lặp lại với nhà đầu tư trên hai ba điều khoản bị đánh dấu. Nếu muốn chống giả mạo, chọn bước hash blockchain tuỳ chọn — hash được ghi lên EVM riêng (theo project_blockchain_explorer) làm bản ghi bất biến.",
    },
    agentsInvoked: {
      en: [
        "Term-sheet AI review — the existing term_sheet_ai entitlement kicks in; produces a clause-by-clause redline with plain-English explanations.",
        "CLO agent (deep) — legal red-flag report via compliance-checker.ts; flags any clause that departs from AU-standard early-stage terms.",
        "AU-comparable-raises agent — benchmarks the valuation + terms against public AU rounds in your segment, last 12 months.",
        "IR agent (negotiation prep) — writes talking-points for the two or three clauses most likely to move; includes an anchor-and-concede script.",
        "Blockchain-hash worker (optional) — computes SHA-256 of the term-sheet PDF and writes {hash, cid, chain, block, ts} to a blockchain_records table; the term sheet itself is NEVER uploaded to chain.",
      ],
      vi: [
        "Review term sheet AI — entitlement term_sheet_ai hiện có kích hoạt; sinh redline theo từng điều khoản với giải thích tiếng thường.",
        "Đại lý CLO (chuyên sâu) — báo cáo cờ đỏ pháp lý qua compliance-checker.ts; đánh dấu mọi điều khoản lệch chuẩn early-stage AU.",
        "Đại lý AU-comparable-raises — benchmark định giá + điều khoản so với các vòng gọi vốn AU công khai trong phân khúc, 12 tháng gần nhất.",
        "Đại lý IR (chuẩn bị đàm phán) — viết talking-points cho hai ba điều khoản dễ dịch chuyển nhất; gồm script anchor-and-concede.",
        "Worker hash blockchain (tuỳ chọn) — tính SHA-256 của PDF term sheet và ghi {hash, cid, chain, block, ts} vào bảng blockchain_records; bản term sheet KHÔNG BAO GIỜ được tải lên chain.",
      ],
    },
    expectedOutputs: {
      en: [
        "term-sheet-review.pdf — clause-by-clause redline with the AI's plain-English gloss and the CLO agent's AU-law risk rating per clause.",
        "au-comparable-raises-benchmark.md — table of comparable AU rounds (stage, sector, valuation, key terms) with your term sheet positioned inside the range.",
        "negotiation-talkingpoints.md — three-point script per contested clause (anchor / walk-back / minimum acceptable).",
        "svi_analyses row updated with deal_valuation + deal_status='in_negotiation' — surfaces on the reseller's Timeline as 'Term sheet in review'.",
        "blockchain-hash-receipt.json (optional) — {hash, chain_id: 420, block_number, timestamp}; sits alongside the term sheet in the DataRoom for future verification.",
        "How to read the CLO risk rating: any red rating on liquidation preference, drag-along threshold, or founder-vesting clauses is negotiable — those are usually the anchor points the investor put in to test how much you know. Concede the flavours (definitions, cure periods) and hold the substance (participation, ratchets, board consent).",
      ],
      vi: [
        "term-sheet-review.pdf — redline theo từng điều khoản kèm chú thích tiếng thường của AI và xếp hạng rủi ro luật AU của CLO cho từng điều khoản.",
        "au-comparable-raises-benchmark.md — bảng các vòng AU tương đương (giai đoạn, ngành, định giá, điều khoản chính) với term sheet của bạn được đặt trong dải.",
        "negotiation-talkingpoints.md — script ba điểm cho mỗi điều khoản tranh chấp (anchor / walk-back / mức tối thiểu chấp nhận).",
        "Hàng svi_analyses cập nhật với deal_valuation + deal_status='in_negotiation' — hiện trên Timeline đại lý như 'Term sheet in review'.",
        "blockchain-hash-receipt.json (tuỳ chọn) — {hash, chain_id: 420, block_number, timestamp}; nằm cạnh term sheet trong DataRoom để xác minh sau này.",
        "Cách đọc xếp hạng rủi ro của CLO: mọi đỏ trên liquidation preference, ngưỡng drag-along, hay điều khoản founder-vesting đều có thể đàm phán — thường đó là các điểm neo nhà đầu tư đưa vào để thử xem bạn biết bao nhiêu. Nhường phần hình thức (định nghĩa, thời hạn khắc phục) và giữ phần bản chất (participation, ratchets, đồng thuận board).",
      ],
    },
    commonPitfalls: {
      en: [
        "Confusing the optional blockchain hash with legal notarisation. It is neither — 'notary' is a reserved title under Australian law; the hash is a tamper-evidence record you can point to years later to prove the PDF hasn't been edited. Do not describe it as notarised in any external communication.",
        "Uploading the actual term-sheet content to the chain. The chain gets the hash only; the private EVM (per project_blockchain_explorer) is not confidential storage.",
        "Signing the first term sheet because it 'looks fine'. The AI + CLO review + the AU-comparable-raises benchmark exist so you can push back knowing which of your terms are already above-market and which are anchor bids — use them.",
        "Ignoring the reseller Timeline surface. The reseller sees deal-in-progress metadata (valuation + status) but no term-sheet content; if you don't want that visibility, mark the deal 'private' in Workspace → Fundraise, otherwise assume the reseller will congratulate you at week two.",
      ],
      vi: [
        "Nhầm hash blockchain tuỳ chọn với công chứng pháp lý. Nó không phải — 'notary' là chức danh dành riêng theo luật Úc; hash là bản ghi chống giả mạo bạn có thể chỉ vào nhiều năm sau để chứng minh PDF chưa bị chỉnh. Đừng mô tả nó là 'công chứng' trong bất kỳ trao đổi bên ngoài nào.",
        "Tải nội dung term sheet lên chain. Chain chỉ nhận hash; EVM riêng (theo project_blockchain_explorer) không phải kho lưu trữ bảo mật.",
        "Ký term sheet đầu tiên vì 'trông ổn'. Review AI + CLO + benchmark AU-comparable-raises tồn tại để bạn phản biện khi biết điều khoản nào đã trên thị trường và điều khoản nào chỉ là neo — hãy dùng chúng.",
        "Bỏ qua Timeline của đại lý. Đại lý thấy metadata deal-đang-tiến-hành (định giá + trạng thái) nhưng không thấy nội dung term sheet; nếu không muốn hiện diện đó, đánh dấu deal 'riêng tư' ở Không gian làm việc → Gọi vốn, nếu không hãy cho rằng đại lý sẽ chúc mừng bạn ở tuần thứ hai.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au itself is pre-revenue at Phase 10 for now, so the /showcase/blockid page renders the milestone as 'planned, not yet triggered' with a link back to the /guide/reports Phase 10 sample pack that shows the artefacts a real Phase-10 team produces. When BlockID.au closes its own first round, the milestone will flip live automatically — that is the point of dogfooding.",
      vi: "Bản thân BlockID.au ở Phase 10 hiện chưa có doanh thu, nên trang /showcase/blockid hiển thị milestone là 'dự kiến, chưa kích hoạt' với liên kết về gói mẫu Phase 10 trong /guide/reports cho thấy các sản phẩm mà đội Phase-10 thực sự tạo ra. Khi BlockID.au đóng vòng đầu, milestone sẽ tự động bật — đó chính là điểm của việc dogfood chính mình.",
    },
    cta: {
      en: "Do not accept the first term sheet in the room. Run the AI + CLO review, read the AU-comparable-raises benchmark, and come back with a counter that adjusts at least two clauses — investors expect this and respect founders who negotiate calmly with data.",
      vi: "Đừng nhận term sheet đầu tiên trong phòng. Chạy review AI + CLO, đọc benchmark AU-comparable-raises, và quay lại với counter chỉnh ít nhất hai điều khoản — nhà đầu tư mong đợi điều này và tôn trọng founder biết đàm phán bình tĩnh với dữ liệu.",
    },
    sections: [
      {
        id: "primary-vs-secondary",
        heading: {
          en: "Primary vs Secondary — which round are you actually running?",
          vi: "Sơ cấp (Primary) vs Thứ cấp (Secondary) — bạn thực sự đang chạy vòng nào?",
        },
        body: {
          en: [
            "The distinction. A primary round issues NEW shares — the company's bank balance goes up, ownership dilutes. A secondary round transfers EXISTING shares from an early shareholder (founder / employee / seed investor) to a new one — the company's bank balance moves zero, only the cap-table register lines swap. Every AU raise is one, the other, or a documented mix; ask this question before you send the first term sheet back.",
            "The Atlassian precedent — both of Atlassian's pre-IPO rounds were 100% secondary. In July 2010, Accel Partners paid US$60M to EXISTING Atlassian shareholders; the company itself received nothing (it was already profitable, ~US$55M cash-on-hand — see TechCrunch 2010-07-14). In April 2014, T. Rowe Price paid US$150M secondary at a US$3.3B post-money. Both worked because the founders built a cash-generating business first — /guide/06-revenue is how you get there.",
            "When secondary is the right call. Consider it when (a) the company genuinely does not need the cash (profitable or well-capitalised), (b) early shareholders or employees want liquidity before an exit, and (c) an incoming investor wants a bigger slice than a primary round can offer without heavy dilution. Never run a secondary just because it sounds sophisticated — a secondary marketed as 'funding the business' is a primary in disguise and the ATO / ASIC disclosure treatment differs.",
            "s708 exemption re-analysis. The Corporations Act 2001 (Cth) s707 on-sale rule kicks in the moment shares originally issued under a s708 exemption are re-sold within 12 months — the seller must self-classify whether the re-sale is itself a personal offer under s708(1), a wholesale-client transfer under s761G(7), a sophisticated-investor sale under s708(8), or triggers a fresh disclosure document. The s708(1) 20-investor / A$2M / 12-month counter applies to primary AND secondary re-sales — do not double-count exemption headroom, and log each transferee row via the /dashboard/data-room Folder 2 Secondary Transactions Register (data-room-templates.ts item 2.9).",
            "Right of First Refusal (ROFR) + pre-emptive rights. Every AU shareholders' agreement drafted from a Blackbird / AirTree public template contains a Right of First Refusal clause: an existing shareholder wanting to sell must first offer the shares to the company / other shareholders on the same terms before hitting the market. Skipping ROFR in a secondary is the fastest way to blow up an investor relationship — run the ROFR waiver process through /dashboard/data-room (Folder 1 board minutes + Folder 2 shareholders agreement) BEFORE the Share Purchase Agreement is signed, not after.",
            "Documentation split. A primary uses a Subscription Agreement (new shares issued under s254A Corporations Act) + a board resolution + an ASIC Form 484 notification within 28 days. A secondary uses a Share Purchase Agreement between the seller and buyer + a share transfer form (SPP-01 or state equivalent) + stamp-duty check (some states impose duty on unquoted share transfers; NSW abolished 2016, VIC imposes on 'landholder' companies only) + an ASIC Form 484 change-of-member. Blackbird / AirTree templates cover both; link out from Workspace → Fundraise once you know the path.",
            "Tax treatment diverges hard. For the COMPANY, a primary raise is a capital contribution — NOT assessable income. For the SELLING SHAREHOLDER in a secondary, the sale is a CGT event A1 (ITAA 1997 s104-10) — assessable in the year of the contract. Selling founders should check the Small Business CGT Concessions (ITAA 1997 Div 152) and the general 50% CGT discount for shares held > 12 months (ITAA 1997 Div 115). Critically: ESIC eligibility (ITAA 1997 Div 360, 20% investor offset + 10-year CGT exemption) DOES NOT survive a secondary — the tax offset attaches only to NEWLY-issued shares, so a secondary marketed to angels as 'ESIC-qualifying' is misleading and can trigger a s911A / s1041H exposure.",
            "How BlockID.au wires the split. Workspace → Fundraise tags a round `primary`, `secondary`, or `mixed`; the AI term-sheet review agent applies different clause weights — secondaries emphasise ROFR + tag-along + reps-of-title + no-encumbrance warranties, primaries emphasise pre-emptive + anti-dilution + information rights. The blockchain-hash worker treats both identically (SHA-256 of the executed PDF to the private EVM, chainId 420). The reseller Timeline surface shows deal_type alongside deal_valuation so an accelerator can distinguish a founder cashing out from a founder scaling up.",
          ],
          vi: [
            "Điểm phân biệt. Vòng sơ cấp phát hành cổ phần MỚI — số dư ngân hàng công ty tăng, tỷ lệ sở hữu bị pha loãng. Vòng thứ cấp chuyển nhượng cổ phần HIỆN CÓ từ một cổ đông sớm (founder / nhân viên / nhà đầu tư seed) sang người mới — số dư ngân hàng công ty không đổi, chỉ dòng trong sổ đăng ký cổ đông thay tên. Mọi vòng gọi vốn AU đều là một trong hai, hoặc là hỗn hợp có chứng từ; hỏi câu này trước khi bạn gửi lại term sheet đầu tiên.",
            "Tiền lệ Atlassian — cả hai vòng trước IPO của Atlassian đều là 100% thứ cấp. Tháng 7/2010, Accel Partners trả US$60M cho các cổ đông HIỆN CÓ của Atlassian; bản thân công ty không nhận đồng nào (đã có lãi, khoảng US$55M tiền mặt sẵn có — theo TechCrunch 2010-07-14). Tháng 4/2014, T. Rowe Price trả US$150M thứ cấp ở định giá post-money US$3.3B. Cả hai đều thành công vì founder đã xây được doanh nghiệp sinh dòng tiền trước — /guide/06-revenue là cách để đến đó.",
            "Khi nào thứ cấp là lựa chọn đúng. Cân nhắc khi (a) công ty thực sự không cần tiền (đã có lãi hoặc đã đủ vốn), (b) cổ đông sớm hoặc nhân viên muốn có thanh khoản trước khi exit, và (c) nhà đầu tư mới muốn tỷ lệ lớn hơn mức mà một vòng sơ cấp có thể cấp mà không pha loãng mạnh. Đừng bao giờ chạy thứ cấp chỉ vì nghe có vẻ 'cao cấp' — một vòng thứ cấp được rao là 'để nuôi công ty' thực chất là vòng sơ cấp cải trang, và cách xử lý công bố của ATO / ASIC là khác.",
            "Xem lại miễn trừ s708. Quy định on-sale s707 Corporations Act 2001 (Cth) kích hoạt ngay khi cổ phần ban đầu phát hành theo miễn trừ s708 được bán lại trong vòng 12 tháng — người bán phải tự phân loại: bán lại có phải là personal offer theo s708(1), hay là chuyển nhượng cho wholesale client theo s761G(7), hay là bán cho sophisticated investor theo s708(8), hay kích hoạt tài liệu công bố mới. Bộ đếm 20 nhà đầu tư / A$2M / 12 tháng của s708(1) áp dụng cho CẢ sơ cấp VÀ bán lại thứ cấp — đừng đếm trùng dư địa miễn trừ, và ghi mỗi dòng người nhận chuyển nhượng vào Sổ Giao dịch Thứ cấp trong /dashboard/data-room Folder 2 (data-room-templates.ts mục 2.9).",
            "Quyền ưu tiên mua (ROFR) + quyền phát hành trước. Mọi shareholders' agreement AU soạn từ mẫu công khai của Blackbird / AirTree đều có điều khoản Right of First Refusal: cổ đông hiện tại muốn bán phải chào bán trước cho công ty / các cổ đông khác cùng điều kiện trước khi ra thị trường. Bỏ qua ROFR trong một vòng thứ cấp là cách nhanh nhất để phá hỏng quan hệ nhà đầu tư — chạy quy trình miễn ROFR qua /dashboard/data-room (biên bản hội đồng Folder 1 + shareholders agreement Folder 2) TRƯỚC khi ký Share Purchase Agreement, không phải sau.",
            "Chứng từ tách đôi. Sơ cấp dùng Subscription Agreement (cổ phần mới phát hành theo s254A Corporations Act) + nghị quyết hội đồng + thông báo ASIC Form 484 trong 28 ngày. Thứ cấp dùng Share Purchase Agreement giữa người bán và người mua + biểu chuyển nhượng cổ phần (SPP-01 hoặc tương đương bang) + kiểm tra thuế stamp-duty (một số bang thu duty cho chuyển nhượng cổ phần chưa niêm yết; NSW đã bỏ 2016, VIC chỉ áp cho công ty 'landholder') + ASIC Form 484 đổi thành viên. Mẫu Blackbird / AirTree phủ cả hai; liên kết ra từ Không gian làm việc → Gọi vốn khi bạn biết chọn đường nào.",
            "Xử lý thuế lệch hoàn toàn. Với CÔNG TY, huy động sơ cấp là khoản đóng góp vốn — KHÔNG phải thu nhập chịu thuế. Với CỔ ĐÔNG BÁN trong thứ cấp, giao dịch là sự kiện CGT A1 (ITAA 1997 s104-10) — chịu thuế trong năm ký hợp đồng. Founder bán ra nên kiểm tra Ưu đãi CGT Doanh nghiệp Nhỏ (ITAA 1997 Div 152) và giảm 50% CGT chung cho cổ phần giữ > 12 tháng (ITAA 1997 Div 115). Quan trọng: điều kiện ESIC (ITAA 1997 Div 360, offset 20% + miễn CGT 10 năm) KHÔNG tồn tại sau thứ cấp — offset thuế chỉ gắn với cổ phần PHÁT HÀNH MỚI, nên một vòng thứ cấp rao với angel là 'đủ điều kiện ESIC' là gây hiểu nhầm và có thể kích hoạt phơi nhiễm s911A / s1041H.",
            "Cách BlockID.au triển khai phân tách. Không gian làm việc → Gọi vốn gắn nhãn vòng là `primary`, `secondary`, hoặc `mixed`; đại lý AI review term sheet áp trọng số điều khoản khác nhau — thứ cấp nhấn ROFR + tag-along + reps-of-title + bảo đảm không nghĩa vụ, sơ cấp nhấn pre-emptive + anti-dilution + quyền thông tin. Worker hash blockchain xử lý cả hai như nhau (SHA-256 PDF đã ký lên EVM riêng, chainId 420). Timeline đại lý hiện deal_type bên cạnh deal_valuation để một accelerator phân biệt được founder đang cashing out với founder đang scale.",
          ],
        },
      },
      {
        id: "dual-class-decision",
        heading: {
          en: "Dual-class share structure — decision point (single-class is the AU default)",
          vi: "Cấu trúc cổ phần hai hạng (dual-class) — điểm quyết định (một hạng là mặc định AU)",
        },
        body: {
          en: [
            "The default is single-class. Every Australian Pty Ltd or Ltd company incorporated under the Corporations Act 2001 (Cth) issues one class of ordinary shares by default — one share, one vote, one distribution right. This is what your ASIC Form 201 asks for, what the replaceable rules (Chapter 2D) assume, and what every AU-standard shareholders' agreement template from Blackbird / AirTree is drafted against. If you want anything else, you are making a deliberate, expensive, reversible-only-by-court structural choice.",
            "What dual-class actually is. In a dual-class structure the founders (or a founder-controlled entity) hold Class B shares carrying enhanced voting rights (typically 10 votes each, sometimes 20) while every outside investor and public holder gets Class A ordinary (one vote each). Class B rarely trades and usually auto-converts to Class A on transfer, on the founder ceasing to be an employee, or after a sunset period. The point is founder control after outside capital arrives — not economic upside (dividends and liquidation are typically pari passu).",
            "Why ASX blocks it. ASX Listing Rule 6.9 requires that ordinary shares carry one vote per share on a poll for all matters requiring shareholder approval; a proposal to list ordinary shares with unequal voting rights is inconsistent with LR 6.9 and would be knocked back at the pre-listing review. There is no petition-for-waiver track that has ever worked for a straight tech founder-control case. Practically: if your intended exit is an ASX IPO, you cannot use dual-class — plan single-class from day zero.",
            "The Atlassian precedent. Atlassian is Australian in every meaningful sense (Sydney HQ, UNSW founders, most engineers here) but is NOT an Australian-listed company. In 2014 the founders reorganised into Atlassian Corporation Plc (UK) as the holding company specifically to gain access to a dual-class-capable listing regime (see /showcase/atlassian page.tsx:128-136); in 2015 that Plc was the entity that listed on NASDAQ at US$21 with Class A / Class B dual-class from day one; in 2022 the group redomiciled again UK Plc → Delaware via a Court-sanctioned Scheme of Arrangement (page.tsx:175-181). The dual-class hunger drove three separate re-domicile events — none of them cheap, none of them fast.",
            "The two live paths if you want dual-class. (1) UK Plc holding company — cross-border scheme, Companies Act 2006, UK High Court sanction, Australian shareholder tax rollover under ITAA 1997 Subdiv 124-M possible but must be modelled per-shareholder (CGT rollover is elective, not automatic, and does not extend to ESIC-elected shares); expect A$300k+ legal + tax + PR + registrar fees, 4-9 months elapsed. (2) Delaware C-corp holding company — Delaware General Corporation Law s102(a)(4) explicitly permits classes and series with different voting rights; but a Delaware flip triggers PFIC exposure for US holders, forces Australian shareholders to make a Subdiv 124-M election again, and every future ATO / IRS interaction is now bi-jurisdictional (transfer pricing, GILTI, controlled-foreign-company reporting). Expect A$500k+ and a 6-12 month rolling legal + tax project.",
            "Governance and investor-appetite reality check. AU institutional investors and most AU-based VC LPs treat dual-class as an amber flag — the AICD's 2024 Governance Principles note it as a structure that concentrates control at the expense of independent board oversight, and index inclusion (S&P/ASX, MSCI) frequently applies weight adjustments or exclusions for stapled dual-class stock. Blackbird / AirTree / Square Peg have all funded dual-class US-domiciled AU-founded companies (Canva, Culture Amp), so the appetite exists — but the term sheet you get for a Delaware-flipped dual-class Series A will typically carry a sunset clause (7–10 years or IPO+5, whichever earlier) and a protective-provisions basket that neutralises the enhanced voting on the topics investors actually care about (issuing new senior stock, changing the certificate, appointing the CFO).",
            "The BlockID.au boundary — surfaces the decision, does NOT generate offshore incorporation documents. Workspace → Fundraise → Structure asks the founder the four questions that actually matter (intended listing venue, founder-control horizon, willingness to run a bi-jurisdictional tax file, tolerance for A$300k+ upfront cost) and returns a recommendation of single-class / UK-Plc-dual-class / Delaware-dual-class with the trade-offs written out. It does NOT auto-generate the Scheme of Arrangement, the Delaware certificate of incorporation, or the PFIC election; those are Corrs / Herbert Smith Freehills / DLA Piper / Cooley territory and touching them without a licensed lawyer exposes the founder to s911A Corporations Act (financial services) and s923B (using restricted words like 'lawyer' / 'legal advice') risk. The BlockID.au output is a founder-education artefact plus a warm-intro list of AU firms with dual-class-flip experience — not a substitute for that engagement.",
            "The single-class-with-founder-protections alternative. Before spending A$300k on a redomicile, most AU founders should exhaust the softer levers first — a founder-shares-vested-at-double-trigger clause, a founder-veto over specific board matters written into the shareholders' agreement (change of CEO, sale under $X, dilutive issue below the last round), a right-of-first-refusal on any transfer to a competitor, and a founder-nominee director seat that survives dilution. These sit inside a standard AU single-class Blackbird / AirTree template and give ~70% of the control benefit of dual-class at ~5% of the structural cost. Chapter 10's AI + CLO review agent surfaces each of these as clause suggestions when the founder flags 'control-sensitive' in Workspace → Fundraise; that is almost always the right first step before you start hiring a Delaware corporate counsel.",
          ],
          vi: [
            "Mặc định là một hạng cổ phần. Mọi công ty Pty Ltd hay Ltd của Úc thành lập theo Corporations Act 2001 (Cth) phát hành một hạng cổ phần thường (ordinary shares) theo mặc định — một cổ phần, một phiếu bầu, một quyền chia lợi tức. Đây là những gì ASIC Form 201 hỏi, là giả định của các quy tắc thay thế (Chapter 2D), và là cơ sở mà mọi shareholders' agreement chuẩn AU của Blackbird / AirTree được soạn thảo. Nếu bạn muốn khác đi, bạn đang thực hiện một lựa chọn cấu trúc có chủ ý, tốn kém, chỉ có thể đảo ngược bằng phán quyết toà.",
            "Dual-class thực chất là gì. Trong cấu trúc dual-class, founder (hoặc một pháp nhân do founder kiểm soát) nắm Class B carrying quyền biểu quyết tăng cường (thường 10 phiếu / cổ phần, đôi khi 20) trong khi mọi nhà đầu tư bên ngoài và cổ đông đại chúng nhận Class A ordinary (một phiếu / cổ phần). Class B hiếm khi giao dịch và thường tự động chuyển thành Class A khi chuyển nhượng, khi founder nghỉ việc, hoặc sau một thời gian sunset. Mục đích là founder giữ kiểm soát sau khi có vốn ngoài — không phải upside kinh tế (cổ tức và thanh lý thường ngang bằng — pari passu).",
            "Vì sao ASX chặn. Quy tắc niêm yết ASX Listing Rule 6.9 yêu cầu cổ phần thường mang một phiếu bầu cho mỗi cổ phần khi biểu quyết bằng poll với mọi vấn đề cần chấp thuận cổ đông; một đề xuất niêm yết cổ phần thường với quyền biểu quyết không bình đẳng không nhất quán với LR 6.9 và sẽ bị bác ngay trong khâu tiền-niêm-yết. Không có con đường xin miễn nào từng thành công cho một tình huống founder-control kiểu tech thuần tuý. Trên thực tế: nếu exit dự định của bạn là IPO ASX, bạn không thể dùng dual-class — hãy lên kế hoạch một hạng từ ngày 0.",
            "Tiền lệ Atlassian. Atlassian là công ty Úc theo mọi nghĩa thực chất (HQ Sydney, founder UNSW, đa số kỹ sư ở Úc) nhưng KHÔNG phải công ty niêm yết Úc. Năm 2014 các founder tái cơ cấu thành Atlassian Corporation Plc (UK) làm holding company chính là để tiếp cận một chế độ niêm yết cho phép dual-class (xem /showcase/atlassian page.tsx:128-136); năm 2015 chính Plc đó là pháp nhân niêm yết NASDAQ ở US$21 với dual-class Class A / Class B ngay từ ngày đầu; năm 2022 nhóm redomicile lần nữa UK Plc → Delaware qua một Scheme of Arrangement được toà phê chuẩn (page.tsx:175-181). Ham muốn dual-class đã dẫn tới ba lần re-domicile riêng biệt — không lần nào rẻ, không lần nào nhanh.",
            "Hai con đường thực tế nếu muốn dual-class. (1) UK Plc holding company — scheme xuyên biên giới, Companies Act 2006, cần High Court UK phê chuẩn, cổ đông Úc có thể xin rollover thuế theo ITAA 1997 Subdiv 124-M nhưng phải mô hình hoá từng người (rollover CGT là lựa chọn, không tự động, và không mở rộng cho cổ phần đã đăng ký ESIC); dự kiến A$300k+ phí luật + thuế + PR + registrar, 4-9 tháng thực thi. (2) Delaware C-corp holding company — Delaware General Corporation Law s102(a)(4) cho phép rõ ràng các classes và series với quyền biểu quyết khác nhau; nhưng flip sang Delaware kích hoạt phơi nhiễm PFIC cho cổ đông Mỹ, buộc cổ đông Úc lại phải làm election Subdiv 124-M lần nữa, và mọi tương tác ATO / IRS tương lai giờ là song-tài-phán (transfer pricing, GILTI, báo cáo controlled-foreign-company). Dự kiến A$500k+ và dự án luật + thuế 6-12 tháng liên tục.",
            "Kiểm tra thực tế về governance và khẩu vị nhà đầu tư. Nhà đầu tư tổ chức Úc và đa số LP-VC gốc AU coi dual-class là cờ vàng — Governance Principles 2024 của AICD ghi nhận đây là cấu trúc tập trung kiểm soát đánh đổi giám sát board độc lập, và việc index inclusion (S&P/ASX, MSCI) thường điều chỉnh trọng số hoặc loại trừ cổ phiếu dual-class kèm theo. Blackbird / AirTree / Square Peg đều đã rót vốn vào các công ty dual-class đăng ký Mỹ gốc Úc (Canva, Culture Amp), nên khẩu vị vẫn tồn tại — nhưng term sheet dual-class Series A Delaware-flipped thường kèm điều khoản sunset (7–10 năm hoặc IPO+5, tuỳ điều nào trước) và một rổ điều khoản bảo vệ trung hoà quyền biểu quyết tăng cường trên các chủ đề nhà đầu tư thực sự quan tâm (phát hành cổ phần cao cấp mới, đổi giấy chứng nhận, bổ nhiệm CFO).",
            "Ranh giới của BlockID.au — hiện quyết định, KHÔNG sinh chứng từ thành lập nước ngoài. Không gian làm việc → Gọi vốn → Cấu trúc hỏi founder bốn câu thực sự quan trọng (venue niêm yết dự định, chân trời founder-control, sẵn sàng vận hành hồ sơ thuế song-tài-phán, sức chịu đựng chi phí upfront A$300k+) và trả về khuyến nghị một-hạng / UK-Plc-dual-class / Delaware-dual-class kèm trade-off được viết ra. NÓ KHÔNG tự sinh Scheme of Arrangement, certificate of incorporation Delaware, hay PFIC election; đó là lãnh địa của Corrs / Herbert Smith Freehills / DLA Piper / Cooley, và động vào mà không có luật sư được cấp phép sẽ khiến founder phơi nhiễm s911A Corporations Act (dịch vụ tài chính) và s923B (dùng từ hạn chế như 'lawyer' / 'legal advice'). Đầu ra của BlockID.au là sản phẩm giáo dục founder + danh sách warm-intro các hãng AU có kinh nghiệm dual-class-flip — không phải thay thế cho việc thuê hãng đó.",
            "Lựa chọn thay thế: một-hạng cộng các bảo vệ founder. Trước khi chi A$300k redomicile, đa số founder AU nên vắt kiệt các đòn bẩy mềm trước — điều khoản founder-shares-vested-at-double-trigger, quyền phủ quyết founder trên các vấn đề board cụ thể ghi vào shareholders' agreement (thay CEO, bán dưới $X, phát hành pha loãng dưới vòng gần nhất), quyền ưu tiên mua (ROFR) trên mọi chuyển nhượng cho đối thủ, và một ghế director founder-nominee tồn tại qua các vòng pha loãng. Những điều khoản này nằm gọn trong template một-hạng chuẩn AU của Blackbird / AirTree và cho ~70% lợi ích kiểm soát của dual-class với ~5% chi phí cấu trúc. Đại lý review AI + CLO của Chương 10 sẽ đề xuất từng điều khoản này khi founder gắn cờ 'control-sensitive' ở Không gian làm việc → Gọi vốn; đó gần như luôn là bước đầu tiên đúng đắn trước khi bắt đầu thuê corporate counsel Delaware.",
          ],
        },
      },
    ],
  },
  {
    slug: "11-scale",
    phase: 11,
    order: 11,
    phaseLabel: PHASE_LABELS[11],
    title: {
      en: "Chapter 11 — Post-Funding & Scale",
      vi: "Chương 11 — Sau gọi vốn & Mở rộng",
    },
    summary: {
      en: "The round has closed. Now the cap table hashes to the private EVM (Share Management add-on required), vesting schedules stamp, and the CEO agent starts auto-drafting a monthly board pack. Chapter 11 is where operational muscle memory takes over — you spend less time deciding, more time reading the weekly + monthly rhythms.",
      vi: "Vòng gọi vốn đã đóng. Giờ cap table hash lên EVM riêng (cần add-on Share Management), lịch vesting đóng dấu, và đại lý CEO bắt đầu tự soạn board pack hàng tháng. Chương 11 là lúc phản xạ vận hành lên tiếng — bạn dành ít thời gian quyết định hơn, nhiều thời gian đọc nhịp tuần + tháng hơn.",
    },
    founderAction: {
      en: "In Workspace → Cap Table (add-on required), approve each row of the final post-round cap table one more time — the approved snapshot is what hashes on-chain. Set the board-pack recipients (investors + board observers). Open Workspace → KPIs → Monthly cadence and confirm the day/time the board pack drafts + circulates. If any early hire's vesting was paused during the raise, restart it now.",
      vi: "Tại Không gian làm việc → Cap Table (cần add-on), duyệt lại từng dòng cap table cuối cùng sau vòng — snapshot đã duyệt chính là cái hash lên chain. Đặt người nhận board pack (nhà đầu tư + board observer). Mở Không gian làm việc → KPIs → Nhịp hàng tháng và xác nhận ngày/giờ board pack tự soạn + gửi. Nếu vesting của nhân sự sớm bị tạm dừng trong lúc gọi vốn, khởi động lại ngay.",
    },
    agentsInvoked: {
      en: [
        "Blockchain-sync worker — hashes the approved cap-table snapshot to the private EVM (chainId 420) via blockchain-sync.ts; writes {snapshot_hash, block_number, tx_hash} to blockchain_records.",
        "CHRO agent (vesting activator) — stamps the vesting schedule per grant into vesting_schedules; kicks off the monthly cliff-and-tranche accrual job.",
        "CEO agent (board pack) — auto-drafts a monthly board pack (SVI curve + KPI dashboard + runway update + top-3 asks) as PDF, emailed to board recipients on the configured day.",
        "CFO agent (runway monitor) — recomputes runway every Monday; if <9 months, escalates a warning card in the workspace and pings the founder via email-drip.ts.",
        "AU-compliance agent — checks quarterly BAS + annual company review deadlines land in the workspace calendar with 14-day lead reminders.",
      ],
      vi: [
        "Worker đồng bộ blockchain — hash snapshot cap table đã duyệt lên EVM riêng (chainId 420) qua blockchain-sync.ts; ghi {snapshot_hash, block_number, tx_hash} vào blockchain_records.",
        "Đại lý CHRO (kích hoạt vesting) — đóng dấu lịch vesting cho từng grant vào vesting_schedules; kích hoạt job tính cliff và tranche hàng tháng.",
        "Đại lý CEO (board pack) — tự soạn board pack hàng tháng (đường SVI + dashboard KPI + cập nhật runway + top-3 mức xin) dạng PDF, email đến người nhận board theo ngày đã cấu hình.",
        "Đại lý CFO (giám sát runway) — tính lại runway mỗi thứ Hai; nếu <9 tháng, đẩy thẻ cảnh báo trong không gian làm việc và ping founder qua email-drip.ts.",
        "Đại lý AU-compliance — kiểm tra hạn nộp BAS quý + review công ty hàng năm rơi vào lịch không gian làm việc kèm nhắc trước 14 ngày.",
      ],
    },
    expectedOutputs: {
      en: [
        "cap-table-onchain-receipt.json — {snapshot_hash, chain_id: 420, block_number, tx_hash, snapshot_at}; permanent record you can cite in any future dispute.",
        "vesting-schedules.csv — one row per grantee × tranche, with vested / unvested split refreshed monthly by the accrual job.",
        "board-pack-YYYY-MM.pdf — monthly investor + observer update, auto-emailed; 5–8 pages, structured (SVI + KPIs + wins + risks + asks).",
        "runway-monitor.md — updated every Monday; the amber / red band triggers a workspace card so you notice before the runway does.",
        "compliance-calendar.ics — subscribable calendar with BAS + annual review + statutory-lodgment dates, 14-day lead reminders enabled.",
        "How to read the board pack: the 'asks' block matters more than the KPI dashboard. Investors read KPIs in the elevator; they engage when they see the ask list and can help unblock at least one item. Never send a board pack with an empty ask list.",
      ],
      vi: [
        "cap-table-onchain-receipt.json — {snapshot_hash, chain_id: 420, block_number, tx_hash, snapshot_at}; bản ghi vĩnh viễn bạn có thể trích dẫn trong mọi tranh chấp tương lai.",
        "vesting-schedules.csv — mỗi dòng một grantee × tranche, với vested / unvested cập nhật hàng tháng bởi job tích luỹ.",
        "board-pack-YYYY-MM.pdf — cập nhật hàng tháng nhà đầu tư + observer, tự động email; 5–8 trang, có cấu trúc (SVI + KPIs + thắng lợi + rủi ro + mức xin).",
        "runway-monitor.md — cập nhật mỗi thứ Hai; dải amber / đỏ kích hoạt thẻ trong không gian làm việc để bạn để ý trước khi runway để ý.",
        "compliance-calendar.ics — lịch có thể đăng ký với ngày BAS + review hàng năm + nộp luật định, bật nhắc trước 14 ngày.",
        "Cách đọc board pack: khối 'mức xin' quan trọng hơn dashboard KPI. Nhà đầu tư đọc KPI trong thang máy; họ tham gia khi thấy danh sách mức xin và giúp gỡ ít nhất một mục. Đừng bao giờ gửi board pack với danh sách mức xin trống.",
      ],
    },
    commonPitfalls: {
      en: [
        "Skipping the on-chain cap-table hash because 'we can always do it later'. Later means never — the value of the hash is that it dates the snapshot; a hash written next quarter proves the cap table at next quarter, not at close.",
        "Letting the board pack drift into 'we shipped X features this month' narrative. Investors want the SVI slope + runway + top asks. Feature lists belong in the product-team standup, not the monthly board pack.",
        "Ignoring runway warnings because 'we can extend the round'. Extending a round takes 8–12 weeks in AU; if the amber card fires at 9 months, you have exactly one calm quarter to plan. Waiting until red is a panic quarter.",
        "Forgetting the AU-compliance calendar. A missed BAS lodgment is an ATO penalty; a missed annual company review is an ASIC late fee that scales — the calendar exists so neither happens.",
      ],
      vi: [
        "Bỏ qua hash cap table lên chain vì 'lúc nào cũng có thể làm sau'. Sau nghĩa là không bao giờ — giá trị của hash là nó ghi ngày snapshot; hash viết quý sau chứng minh cap table ở quý sau, không phải lúc đóng vòng.",
        "Để board pack trôi thành narrative 'tháng này chúng tôi ship X tính năng'. Nhà đầu tư muốn độ dốc SVI + runway + top mức xin. Danh sách tính năng thuộc standup đội sản phẩm, không phải board pack hàng tháng.",
        "Bỏ qua cảnh báo runway vì 'chúng tôi có thể gia hạn vòng'. Gia hạn một vòng ở AU tốn 8–12 tuần; nếu thẻ amber bật ở 9 tháng, bạn có đúng một quý bình tĩnh để lên kế hoạch. Đợi tới đỏ là quý hoảng loạn.",
        "Quên lịch AU-compliance. BAS nộp trễ là phạt ATO; review công ty hàng năm trễ là phí trễ ASIC leo thang — lịch tồn tại để cả hai không xảy ra.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au's Phase 11 rehearsal shows how the pipeline should feel even before the round closes — a sample cap-table snapshot, a sample board pack for month-1-post-close, and a runway-monitor doc that would fire amber at month-3 if traction slipped. Look at /showcase/blockid to see how the milestone `funded` slot renders in 'planned' state while the underlying infra is already primed to accept a real snapshot the day the round closes.",
      vi: "Tổng duyệt Phase 11 của BlockID.au cho thấy pipeline nên có cảm giác thế nào ngay cả trước khi vòng đóng — snapshot cap table mẫu, board pack mẫu cho tháng-1-sau-close, và tài liệu giám sát runway sẽ bật amber ở tháng-3 nếu traction trượt. Xem /showcase/blockid để thấy slot milestone `funded` hiển thị trạng thái 'dự kiến' trong khi hạ tầng bên dưới đã sẵn sàng nhận snapshot thật vào ngày vòng đóng.",
    },
    cta: {
      en: "This is a rhythm chapter, not a project chapter. Block a 30-minute Monday runway read and a 60-minute monthly board-pack review on your calendar this week — protect them the way you protect release deploys, and Chapter 11 runs itself.",
      vi: "Đây là chương nhịp điệu, không phải chương dự án. Đặt 30 phút đọc runway thứ Hai và 60 phút review board pack hàng tháng lên lịch tuần này — bảo vệ chúng như bạn bảo vệ deploy release, và Chương 11 sẽ tự chạy.",
    },
    // Deep-dive prose section for chapter 11. `acquisition-pattern` closes the
    // atlassian-standard-mapping-goal.md §1 phase 11 P1 gap ("acquisition-
    // pattern doc showing Atlassian's ~90% cash / 10% retention template"):
    // Atlassian's post-funding acquisitions (Trello 2017 US$425M, OpsGenie
    // 2018 US$295M, Loom 2023 US$975M) all followed the same ~90% cash + 10%
    // retention-RSU structure, which is a reusable template a scale-stage AU
    // founder can consume on either side of the deal (buyer or target). AU
    // tax nuances (Subdiv 124-M scrip-for-scrip rollover, deferred CGT via
    // earn-out arrangements) are AU-specific and rarely covered in the
    // US-heavy M&A literature. General information only — not personal
    // financial-product advice per s766B Corps Act 2001 (Cth).
    sections: [
      {
        id: "acquisition-pattern",
        heading: {
          en: "Acquisition pattern — Atlassian's ~90% cash / 10% retention-RSU template (Trello, OpsGenie, Loom)",
          vi: "Mẫu thương vụ mua lại — công thức ~90% tiền mặt / 10% RSU giữ chân của Atlassian (Trello, OpsGenie, Loom)",
        },
        body: {
          en: [
            "The pattern: Atlassian's three headline post-funding acquisitions all used the same headline mix — ~90% upfront cash to the target's cap table + ~10% in retention Restricted Stock Units (RSUs) vesting to the target's employees over 3–4 years. Trello 2017 US$425M, OpsGenie 2018 US$295M, Loom 2023 US$975M (sources: /showcase/atlassian TIMELINE lines 147-155, 157-165, 183-191; Atlassian FY18 + FY24 10-K supplementary schedules). The consistency is the artefact — an AU founder can point at three deals over six years and defend the same structure on their own transaction.",
            "Why the 90/10 split works: the cash tranche gives target investors + founders a clean exit at closing (they can move on, redeem, redeploy), and the RSU tranche keeps the target's engineering + product leadership incentivised to stay through integration. Retention drops off a cliff between month-12 and month-18 in most acquisitions; a 3-4 year RSU vest with a 12-month cliff pushes the drop-off past the point where the acquired team's institutional knowledge has usually transferred.",
            "How the RSU tranche is structured on Atlassian deals: separate from the deal consideration — the RSUs are granted by Atlassian (the buyer, listed on NASDAQ) to the target's employees on the day the deal closes, with a 1-year cliff + monthly vesting for the remaining 24-36 months. Grants are sized by role (typically 2-4× annual base salary as headline value) and are subject to continued-employment forfeiture. Founders of the target often get a larger grant (a 'founder retention bonus') that vests over 4 years — a signal to their investors that the founder is not planning to leave at year-2.",
            "AU tax treatment on the seller side (this is where AU founders lose money if they don't plan the structure): the cash component triggers CGT event A1 (ITAA 1997 s104-10) on the date of the contract, not the settlement date — the tax bill lands well before the wire clears if the deal has a long completion. Subdiv 124-M scrip-for-scrip rollover applies ONLY where the consideration is shares (not cash + shares), so a 90/10 cash+RSU deal does NOT qualify for rollover on the cash tranche. The RSU tranche, if the buyer is a listed company, may qualify for Subdiv 83A-C (deferred ESS) taxation for AU-resident employee recipients — check the buyer's ESS scheme rules before completion.",
            "Escrow + hold-back patterns you will negotiate: 10-15% of the cash consideration is typically held in escrow for 12-18 months to cover indemnity claims (breach of reps, undisclosed liabilities, tax reassessments). A separate 'special indemnity escrow' can be carved out for specific known risks (open litigation, disputed IP). For AU targets acquired by US listed buyers, an FIRB (Foreign Investment Review Board) approval condition precedent is standard when deal value exceeds A$339M (2026 threshold) or when the target holds sensitive tech; build 30-60 days of FIRB runway into the completion date.",
            "Disclosure-schedule prep (the piece founders under-invest in): the buyer's diligence questionnaire will demand 6-9 months of financial + ops history + a warranty of the cap table + IP register + employment terms + customer contracts. Every material contract with a change-of-control clause needs to be listed, and either counter-party consent obtained pre-completion or the deal completion made conditional on consent. Missing consents are the #1 cause of post-completion price adjustments (a 5-10% reduction is common when a top-3 customer contract had a CoC clause nobody flagged). BlockID's data-room folders 1, 2, 4, 5, 6, 7, 8 (data-room-templates.ts:428-1151) are structured so the schedule maps 1:1 to folder headings.",
            "Signals that you're actually a target (rather than pattern-matching an acquisition thesis): (a) an unsolicited approach from a strategic buyer's Corp Dev team, not a banker cold email; (b) a competitive bake-off starts when a second buyer surfaces within 4-6 weeks; (c) the buyer's CEO or product-lead reaches out directly after the initial Corp Dev intro (real interest surfaces in the first two calls, not month-3); (d) the buyer starts asking for detailed customer-cohort data + engineering-team org chart before financial diligence — they're de-risking retention, which is a buy-side signal. If none of these are present, you're pattern-matching, not being acquired.",
            "How BlockID.au surfaces this: the CFO agent's exit-readiness assemble (`/dashboard/exit-readiness` — see P12b-tile) now includes an 'acquisition-structure playbook' section citing the Atlassian 90/10 template + the AU tax + FIRB + escrow guardrails; the au-compliance agent drafts the FIRB pre-lodgment questionnaire when target-industry keywords hit the sensitive-tech list; the CLO agent runs the change-of-control clause scan across data-room folder 8 (Contracts & Agreements) 60 days out from any signed LOI. Engage a specialist M&A lawyer (Corrs, HSF, DLA, Gilbert + Tobin all have AU sell-side practices) before signing an LOI — the LOI is where 80% of the leverage is set.",
          ],
          vi: [
            "Mẫu chung: ba thương vụ mua lại tiêu biểu sau gọi vốn của Atlassian đều dùng cùng công thức đầu — ~90% tiền mặt trả trước cho cap table của target + ~10% Restricted Stock Units (RSU) giữ chân vesting cho nhân viên target trong 3–4 năm. Trello 2017 US$425M, OpsGenie 2018 US$295M, Loom 2023 US$975M (nguồn: /showcase/atlassian TIMELINE dòng 147-155, 157-165, 183-191; báo cáo bổ sung 10-K FY18 + FY24 của Atlassian). Sự nhất quán chính là artefact — founder AU có thể chỉ vào ba deal trong sáu năm và bảo vệ cùng một cấu trúc trên chính thương vụ của mình.",
            "Vì sao split 90/10 hoạt động: khối tiền mặt cho nhà đầu tư + founder của target một lối exit sạch tại closing (họ có thể chuyển tiếp, hoàn vốn, tái đầu tư), và khối RSU giữ động lực cho leadership kỹ thuật + sản phẩm của target ở lại xuyên qua giai đoạn tích hợp. Retention thường rơi mạnh giữa tháng 12 và tháng 18 trong hầu hết các thương vụ mua lại; một vest RSU 3-4 năm với cliff 12 tháng đẩy điểm rơi qua thời điểm mà tri thức tổ chức của đội được mua thường đã chuyển giao.",
            "Cách khối RSU được cấu trúc trên các thương vụ Atlassian: tách khỏi consideration deal — RSU do Atlassian (bên mua, niêm yết NASDAQ) cấp cho nhân viên target vào ngày deal đóng, với cliff 1 năm + vesting hàng tháng trong 24-36 tháng còn lại. Grant được cỡ theo vai trò (thường 2-4× lương cơ bản năm làm giá trị đầu) và có forfeiture theo điều kiện tiếp tục làm việc. Founder của target thường nhận grant lớn hơn ('founder retention bonus') vest trong 4 năm — tín hiệu gửi nhà đầu tư của họ rằng founder không tính rời năm-2.",
            "Xử lý thuế AU phía người bán (chỗ này founder AU mất tiền nếu không kế hoạch): thành phần tiền mặt kích hoạt sự kiện CGT A1 (ITAA 1997 s104-10) vào ngày hợp đồng, không phải ngày settlement — hoá đơn thuế đáp trước khi tiền về nếu deal có completion dài. Rollover Subdiv 124-M scrip-for-scrip CHỈ áp dụng khi consideration là cổ phần (không phải tiền + cổ phần), nên một deal 90/10 tiền+RSU KHÔNG đủ điều kiện rollover trên khối tiền mặt. Khối RSU, nếu bên mua là công ty niêm yết, có thể đủ điều kiện xử lý thuế Subdiv 83A-C (ESS hoãn) cho người nhận là nhân viên cư trú AU — kiểm tra quy tắc scheme ESS của bên mua trước completion.",
            "Mẫu escrow + hold-back bạn sẽ đàm phán: 10-15% consideration tiền mặt thường được giữ escrow 12-18 tháng để chi trả các khiếu nại bồi thường (vi phạm rep, nợ chưa công bố, đánh giá thuế lại). Một 'special indemnity escrow' riêng có thể được cắt ra cho các rủi ro biết trước cụ thể (kiện tụng đang mở, IP tranh chấp). Với target AU được bên mua Mỹ niêm yết mua, điều kiện tiên quyết phê duyệt FIRB (Foreign Investment Review Board) là chuẩn khi giá trị deal vượt A$339M (ngưỡng 2026) hoặc khi target giữ công nghệ nhạy cảm; đưa 30-60 ngày runway FIRB vào ngày completion.",
            "Chuẩn bị disclosure schedule (phần founder đầu tư ít): questionnaire diligence của bên mua sẽ yêu cầu 6-9 tháng lịch sử tài chính + vận hành + bảo đảm cap table + sổ IP + điều khoản nhân sự + hợp đồng khách hàng. Mọi hợp đồng vật chất có điều khoản change-of-control cần được liệt kê, và hoặc lấy consent của đối tác trước completion hoặc completion deal được đặt điều kiện consent. Consent thiếu là nguyên nhân #1 gây điều chỉnh giá sau completion (giảm 5-10% thường gặp khi một hợp đồng khách hàng top-3 có điều khoản CoC không ai để ý). Folder data-room 1, 2, 4, 5, 6, 7, 8 của BlockID (data-room-templates.ts:428-1151) được cấu trúc để schedule map 1:1 với tiêu đề folder.",
            "Tín hiệu bạn thực sự là target (thay vì pattern-match luận điểm mua lại): (a) tiếp cận không mời từ đội Corp Dev của một bên mua chiến lược, không phải email chào của banker; (b) bake-off cạnh tranh khởi động khi bên mua thứ hai xuất hiện trong 4-6 tuần; (c) CEO hoặc product-lead của bên mua liên hệ trực tiếp sau intro Corp Dev ban đầu (quan tâm thật sự xuất hiện trong hai cuộc đầu, không phải tháng-3); (d) bên mua bắt đầu hỏi dữ liệu cohort khách hàng chi tiết + org chart đội kỹ thuật trước diligence tài chính — họ đang de-risk retention, tín hiệu buy-side. Nếu không có tín hiệu nào, bạn đang pattern-match, không đang được mua.",
            "BlockID.au bề mặt hoá thế nào: assemble exit-readiness của đại lý CFO (`/dashboard/exit-readiness` — xem P12b-tile) giờ bao gồm mục 'playbook cấu trúc thương vụ' trích công thức 90/10 Atlassian + rào chắn thuế AU + FIRB + escrow; đại lý au-compliance soạn questionnaire pre-lodgment FIRB khi từ khoá ngành target chạm danh sách công nghệ nhạy cảm; đại lý CLO chạy quét điều khoản change-of-control xuyên data-room folder 8 (Contracts & Agreements) 60 ngày trước bất kỳ LOI đã ký. Tương tác với luật sư M&A chuyên (Corrs, HSF, DLA, Gilbert + Tobin đều có practice AU sell-side) trước khi ký LOI — LOI là nơi 80% đòn bẩy được thiết lập.",
          ],
        },
      },
    ],
  },
  {
    slug: "12-exit",
    phase: 12,
    order: 12,
    phaseLabel: PHASE_LABELS[12],
    title: {
      en: "Chapter 12 — Exit & Beyond",
      vi: "Chương 12 — Thoái vốn & Tương lai",
    },
    summary: {
      en: "The final chapter — either you are preparing for the next round with a stronger position, exploring an acquisition, or (if your reseller is an accelerator segment) rolling up into an LP-report bundle. Chapter 12 turns the workspace into a portfolio-view artefact that anyone downstream — LPs, acquirers, next-round investors — can read without you narrating.",
      vi: "Chương cuối cùng — hoặc bạn chuẩn bị cho vòng gọi vốn tiếp theo với vị thế mạnh hơn, hoặc đang khám phá thương vụ mua lại, hoặc (nếu đại lý của bạn là phân khúc accelerator) đóng gói vào bundle báo cáo LP. Chương 12 biến không gian làm việc thành sản phẩm dạng portfolio-view mà mọi bên downstream — LP, bên mua lại, nhà đầu tư vòng tiếp — có thể đọc mà không cần bạn kể.",
    },
    founderAction: {
      en: "Open Workspace → Exit-readiness. Pick the path: (a) next-round prep (Chapter 9 loop with the new numbers), (b) acquisition exploration (uploads NDAs + LOIs into the exit-readiness DataRoom section), or (c) LP-roll-up (if your reseller is an accelerator, opt in to the lp_report bundling so the reseller can include you in their quarterly LP update — you still control what fields surface). Whichever path, run the comparable-exits benchmark once so you know the market context.",
      vi: "Mở Không gian làm việc → Sẵn sàng thoái vốn. Chọn hướng: (a) chuẩn bị vòng tiếp (lặp lại Chương 9 với con số mới), (b) khám phá mua lại (tải NDA + LOI vào mục exit-readiness của DataRoom), hoặc (c) gom vào LP-roll-up (nếu đại lý là accelerator, đồng ý bundle lp_report để đại lý gồm bạn vào cập nhật LP hàng quý — bạn vẫn kiểm soát trường nào lộ ra). Bất kể hướng nào, chạy benchmark thoái vốn tương đương một lần để biết bối cảnh thị trường.",
    },
    agentsInvoked: {
      en: [
        "Exit-readiness agent — packages the last two years of SVI curve + KPI trend + cap-table history + on-chain hashes into a single exit-readiness PDF, ready for a data-room-of-record.",
        "AU-comparable-exits agent — benchmarks against public AU exits in your segment (recent 24 months); flags the two or three metrics acquirers weighted most heavily.",
        "CFO agent (valuation model) — recomputes the current valuation under acquisition scenarios (strategic vs financial buyer) with sensitivity bands.",
        "IR agent (portfolio bundling) — if the reseller is an accelerator, prepares the anonymised metrics slot that will fold into the reseller's quarterly LP report (lp_report entitlement, per plan §U.9 phase 12).",
        "CLO agent — flags any equity-cleanup work needed before an acquisition (unexercised options, unresolved SAFE conversions, ambiguous drag-along language).",
      ],
      vi: [
        "Đại lý exit-readiness — đóng gói đường SVI + xu hướng KPI + lịch sử cap table + hash on-chain hai năm gần nhất thành PDF sẵn sàng cho data-room-of-record.",
        "Đại lý AU-comparable-exits — benchmark theo các thương vụ AU công khai trong phân khúc (24 tháng gần nhất); đánh dấu hai ba chỉ số bên mua lại cân đo nặng nhất.",
        "Đại lý CFO (mô hình định giá) — tính lại định giá hiện tại theo kịch bản mua lại (chiến lược vs tài chính) với dải nhạy cảm.",
        "Đại lý IR (gom portfolio) — nếu đại lý là accelerator, chuẩn bị slot chỉ số ẩn danh sẽ gộp vào báo cáo LP hàng quý của đại lý (entitlement lp_report, theo kế hoạch §U.9 phase 12).",
        "Đại lý CLO — đánh dấu công việc dọn dẹp equity cần thiết trước khi mua lại (option chưa thực hiện, SAFE chưa chuyển đổi, ngôn ngữ drag-along mơ hồ).",
      ],
    },
    expectedOutputs: {
      en: [
        "exit-readiness.pdf — self-contained pack an acquirer or next-round lead can read without a live founder walkthrough; covers vision arc, traction, cap-table history (with on-chain receipts), team, unit economics, risks.",
        "au-comparable-exits-benchmark.md — most recent 5–10 AU exits in your segment with headline multiples + structure (all-cash / stock / earn-out); your position marked inside the range.",
        "valuation-model-exit.xlsx — two-scenario acquisition model (strategic + financial), with the CFO's sensitivity bands and a fair-value corridor.",
        "equity-cleanup.md (CLO agent) — punchlist of tidy-ups needed before signing; each item marked P1 (blocking) / P2 (fixable during diligence) / P3 (nice-to-have).",
        "lp-report-slot.md (if reseller is accelerator + opted in) — anonymised metrics contribution slot; you review + approve before the reseller's quarterly LP report locks.",
        "How to read the exit-readiness pack: the 'risks' section is the first thing an acquirer's diligence lead reads. Naming your own three biggest risks + how you are managing them beats letting them find surprises during Q&A — surprises kill more deals than known risks.",
      ],
      vi: [
        "exit-readiness.pdf — gói tự chứa mà bên mua lại hoặc lead vòng tiếp có thể đọc mà không cần founder walkthrough trực tiếp; gồm cung tầm nhìn, traction, lịch sử cap table (kèm receipt on-chain), đội ngũ, unit economics, rủi ro.",
        "au-comparable-exits-benchmark.md — 5–10 thương vụ AU gần nhất trong phân khúc với bội số headline + cấu trúc (toàn tiền / cổ phiếu / earn-out); vị trí của bạn được đánh dấu trong dải.",
        "valuation-model-exit.xlsx — mô hình mua lại hai kịch bản (chiến lược + tài chính), với dải nhạy cảm của CFO và hành lang giá trị hợp lý.",
        "equity-cleanup.md (đại lý CLO) — danh sách dọn dẹp trước khi ký; mỗi mục đánh P1 (chặn) / P2 (sửa được khi diligence) / P3 (có cũng tốt).",
        "lp-report-slot.md (nếu đại lý là accelerator + đã đồng ý) — slot đóng góp chỉ số ẩn danh; bạn xem + duyệt trước khi báo cáo LP hàng quý của đại lý khoá.",
        "Cách đọc gói exit-readiness: mục 'rủi ro' là điều đầu tiên lead diligence của bên mua lại đọc. Gọi tên ba rủi ro lớn nhất của mình + cách bạn đang xử lý ăn đứt việc để họ phát hiện bất ngờ trong Q&A — bất ngờ giết nhiều thương vụ hơn rủi ro đã biết.",
      ],
    },
    commonPitfalls: {
      en: [
        "Treating exit prep as an event, not a state. The best exits look inevitable in hindsight because the workspace has looked exit-ready since Chapter 9 — turning it on the week before signing is the tell that says 'we scrambled'.",
        "Opting into the accelerator LP-report bundle without reviewing the anonymised slot. Even anonymised, the shape of your revenue curve is recognisable to peers — read what fields surface before you approve, every quarter.",
        "Skipping equity cleanup because 'diligence will surface it anyway'. It will — and every P1 item that surfaces during diligence costs you a percentage point of valuation. Do the cleanup once, cite it in the exit-readiness pack, and diligence becomes verification instead of discovery.",
        "Believing there is a 'Chapter 13'. There isn't — Chapter 12 is intentionally the final chapter of the guided journey. After exit, you either start a new workspace (Chapter 1 with the compounded advantage of everything you learned) or transition into the reseller / accelerator role and help the next cohort walk the same 12 chapters.",
      ],
      vi: [
        "Coi chuẩn bị thoái vốn là sự kiện, không phải trạng thái. Các thương vụ thoái vốn tốt nhất trông có vẻ tất yếu khi nhìn lại vì không gian làm việc đã ở trạng thái sẵn sàng thoái vốn từ Chương 9 — bật nó tuần trước khi ký là dấu hiệu 'chúng tôi vội'.",
        "Đồng ý gộp vào LP-report của accelerator mà không xem slot ẩn danh. Ngay cả khi ẩn danh, hình dạng đường doanh thu vẫn nhận diện được với đồng nghiệp — đọc trường nào lộ ra trước khi duyệt, mỗi quý.",
        "Bỏ qua dọn dẹp equity vì 'diligence dù sao cũng sẽ phát hiện'. Sẽ phát hiện — và mỗi mục P1 lộ ra trong diligence tốn của bạn một điểm phần trăm định giá. Dọn dẹp một lần, trích dẫn trong gói exit-readiness, và diligence trở thành xác minh thay vì khám phá.",
        "Tin rằng có 'Chương 13'. Không có — Chương 12 có chủ ý là chương cuối cùng của hành trình có hướng dẫn. Sau thoái vốn, bạn hoặc bắt đầu không gian làm việc mới (Chương 1 với lợi thế cộng hưởng từ mọi thứ đã học) hoặc chuyển sang vai đại lý / accelerator và giúp cohort tiếp theo đi qua đúng 12 chương này.",
      ],
    },
    showcaseExample: {
      en: "BlockID.au keeps Phase 12 in 'planned' state on /showcase/blockid — deliberately, because exit prep for the platform itself is a Phase-11 monthly cadence question, not a one-shot event. What you can look at today is the shape of the exit-readiness template: the same 6-section PDF that a real Phase-12 startup would generate, with placeholders where your live data would sit. The reseller-lens LP-report slot is also mocked so you can preview exactly what an accelerator partner would see in their quarterly bundle.",
      vi: "BlockID.au giữ Phase 12 ở trạng thái 'dự kiến' trên /showcase/blockid — có chủ đích, vì chuẩn bị thoái vốn cho chính nền tảng là câu hỏi nhịp hàng tháng Phase-11, không phải sự kiện một lần. Điều bạn có thể xem hôm nay là hình dạng template exit-readiness: cùng PDF 6-mục mà startup Phase-12 thật sẽ sinh ra, với chỗ trống nơi dữ liệu sống của bạn sẽ nằm. Slot LP-report theo góc nhìn đại lý cũng được mô phỏng để bạn xem trước chính xác đối tác accelerator sẽ thấy gì trong bundle hàng quý.",
    },
    cta: {
      en: "Regardless of your exit path, run the exit-readiness pack once per quarter starting today. Even if the exit is three years away, quarterly rehearsals mean you never scramble — and every rehearsal produces a snapshot you can compare against later to see how the story has strengthened.",
      vi: "Bất kể hướng thoái vốn nào, chạy gói exit-readiness mỗi quý một lần bắt đầu từ hôm nay. Ngay cả khi thoái vốn còn ba năm nữa, tổng duyệt hàng quý nghĩa là bạn không bao giờ vội — và mỗi tổng duyệt tạo một snapshot bạn có thể so sánh sau này để thấy câu chuyện đã mạnh lên thế nào.",
    },
    // Deep-dive prose section for chapter 12. `redomicile-decision-tree`
    // closes the atlassian-standard-mapping-goal.md §1 phase 12 P2 gap
    // ("Scheme-of-Arrangement / redomicile decision-tree doc"): Atlassian's
    // 2022-10-03 UK Plc → Delaware redomicile via a UK Companies Act 2006
    // Part 26 Scheme of Arrangement (page.tsx:175-181) is the reference
    // pattern an AU founder considering a redomicile (typically driven by
    // a US IPO track, a Delaware C-corp acquisition, or dual-class
    // capability per Q4 / P1m) has to reason about. The Australian
    // analogue lives at Corporations Act 2001 (Cth) Part 5.1 s411 (member
    // scheme of arrangement, ASIC + Federal Court sanction). General
    // information only — not personal financial-product or tax advice per
    // s766B Corps Act 2001 (Cth); engage a specialist cross-border tax
    // adviser + ASIC-registered lawyer before signing a Scheme booklet.
    sections: [
      {
        id: "redomicile-decision-tree",
        heading: {
          en: "Redomicile decision-tree — Scheme of Arrangement, when it's worth it (Atlassian UK Plc → Delaware 2022 precedent)",
          vi: "Cây quyết định tái chọn cư trú pháp lý — Scheme of Arrangement, khi nào đáng làm (tiền lệ Atlassian UK Plc → Delaware 2022)",
        },
        body: {
          en: [
            "The reference precedent: Atlassian executed a UK Plc → Delaware redomicile on 2022-10-03 via a UK Companies Act 2006 Part 26 Scheme of Arrangement, sanctioned by the UK High Court (source: /showcase/atlassian TIMELINE lines 175-181). The UK Plc had itself been created in 2014 via an earlier scheme to unlock dual-class share capability (Class A / Class B — see chapter 10 dual-class-decision section, P1m). Redomiciling a second time in 2022 was driven by (a) shareholder base concentration in the US, (b) tax-treaty simplification under the Australia–US Convention, and (c) the operational drag of maintaining a UK holding-co with no UK operating footprint. The lesson for an AU founder: redomicile is a strategy tool, not a one-way door — the same mechanism can be re-run when the shareholder base or tax posture materially shifts.",
            "The three canonical AU-founder scenarios that trigger the conversation: (a) a Delaware-incorporated strategic buyer offers a share-for-share acquisition and needs the target under a Delaware C-corp for Section 368(a) reorganisation treatment, (b) a US IPO track requires either a US holding company for NYSE / NASDAQ listing eligibility or a dual-class structure ASX Listing Rule 6.9 will not permit (see P1m), (c) the majority of the cap table is US-resident and PFIC (Passive Foreign Investment Company) exposure under IRC §1297 is dragging on portfolio valuations at the US LP level. None of these is a green light on their own — each has an offshoring cost that a specialist tax adviser must weigh against the strategic benefit.",
            "The three mechanisms available under Australian law: (1) Member Scheme of Arrangement under Corporations Act 2001 (Cth) Part 5.1 s411 — ASIC review + Federal Court of Australia sanction + 75% shareholder majority in each class + 50% by number at the scheme meeting. This is the cleanest path and the one used by TechnologyOne (no), Xero (no — Xero moved via a different Kiwi mechanism), and most AU tech redomiciles. (2) Full company restructure under Corps Act s657A / s658A (takeover-bid form) — heavier, used when scheme approval is uncertain. (3) Direct asset transfer + winding-up — never the right answer for an operating company because it triggers CGT event A1 on every asset and terminates every contract with a change-of-control clause.",
            "AU tax treatment on the seller side — this is where the deal economics either survive or collapse. A Scheme of Arrangement that swaps AU shares for offshore shares (typical redomicile) triggers CGT event A1 (ITAA 1997 s104-10) on the exchange unless ITAA 1997 Subdiv 124-M scrip-for-scrip rollover applies. Subdiv 124-M requires (i) the acquirer to end up with ≥ 80% of the target's voting shares in the same transaction, (ii) all target shareholders in the same class to be offered participation, (iii) the consideration to consist wholly of shares in the acquirer (or its 100% parent). Cash consideration OR mixed cash+shares OR consideration from a partial-ownership acquirer all disqualify rollover on the cash tranche. Founders + investors who miss the rollover face an AU-tax liability at contract date, well before any liquidity event.",
            "Foreign Investment Review Board (FIRB) pre-lodgment — the mirror-image of the acquisition-pattern section (chapter 11, P11-acquisition-pattern). If the redomicile involves a foreign-incorporated acquirer taking > 20% of an AU business (or > 5% for a sensitive-sector business per Foreign Acquisitions and Takeovers Act 1975 (Cth)), FIRB approval is a condition precedent. 2026 monetary threshold: A$339M for non-sensitive private acquirers. Sensitive-sector list (defence, telco, critical infrastructure, cyber, quantum, biotech, media, agricultural land) triggers pre-lodgment at any value. Foreign-government-influenced acquirers trigger at A$0. Build 30-60 days of FIRB runway into the scheme timeline; a scheme booklet that says 'FIRB not required' when it in fact is will get the Federal Court to refuse sanction.",
            "The US-side cost the founder rarely models — after redomicile, the surviving AU operating subsidiary becomes a Controlled Foreign Corporation (CFC) under IRC §957 from the US parent's perspective, and any AU-resident individual shareholders holding shares in the new US parent become subject to US withholding under IRC §1441 (30% default, reducible to 15% for treaty-eligible AU residents under Article 10 of the Australia–US Convention). PFIC exposure at IRC §1297 disappears once the parent is US-incorporated but re-emerges if the US parent has > 75% passive income OR > 50% passive assets. GILTI (Global Intangible Low-Taxed Income) under IRC §951A applies to the AU subsidiary's excess return on tangible assets — a common surprise for founders who assumed the AU R&D Tax Incentive credits would flow through. All three need a US tax counsel opinion before the scheme booklet is filed.",
            "Timeline + cost you should budget for: from mandate to scheme completion is typically 4-9 months (scheme booklet drafting 6-8 weeks; ASIC + court review 4-6 weeks; scheme meeting notice period 28 days minimum; court sanction hearing 2-4 weeks after meeting; effective date 5-10 business days after sealed orders). Legal + accounting spend for a straightforward Scheme of Arrangement runs A$300k-A$800k (Corrs, HSF, DLA Piper, Gilbert + Tobin, King & Wood Mallesons all have AU sell-side scheme practices; Cooley or Wilson Sonsini for the Delaware side; Big-4 tax for the cross-border opinion). Add A$150k-A$300k for a US S-4 registration if you are simultaneously listing US shares. A UK Plc intermediary step (Atlassian's 2014 pattern) adds another A$200k-A$400k on top.",
            "How BlockID.au surfaces this and its boundary: the CFO agent's exit-readiness assemble (`/dashboard/exit-readiness` — see P12b-tile) surfaces a 'redomicile scenario' toggle when the CFO detects any of the three trigger scenarios above (US-resident cap table share, Delaware acquirer approach, dual-class request per P1m). The au-compliance agent generates the FIRB pre-lodgment questionnaire when target-industry keywords hit the sensitive-tech list. The CLO agent flags every material contract with a change-of-control clause 90 days out from any signed scheme intent. BlockID does NOT auto-draft the scheme booklet, the Delaware certificate of incorporation, the Subdiv 124-M private-ruling application, or the FIRB Form 202 — those are all specialist-lawyer + specialist-tax-adviser work products under s911A + s923B Corps Act 2001 (Cth) financial-services / legal-services boundaries. The scenarios where redomicile is actually worth it are narrow — for most AU founders the honest answer is 'not yet, and possibly never' and the surfaces above exist to help you rule it out cleanly, not to sell you an offshoring project.",
          ],
          vi: [
            "Tiền lệ tham chiếu: Atlassian đã thực hiện tái chọn cư trú pháp lý từ UK Plc sang Delaware ngày 2022-10-03 qua Scheme of Arrangement theo Companies Act 2006 (UK) Part 26, được Toà Cao Anh (UK High Court) phê chuẩn (nguồn: /showcase/atlassian TIMELINE dòng 175-181). Bản thân UK Plc đã được lập năm 2014 qua một scheme trước đó để mở khả năng dual-class (Class A / Class B — xem mục dual-class-decision chương 10, P1m). Tái chọn cư trú lần hai năm 2022 được thúc đẩy bởi (a) tập trung nhà đầu tư ở Mỹ, (b) đơn giản hoá hiệp định thuế theo Công ước Úc–Mỹ, và (c) chi phí vận hành duy trì holding-co UK không có hoạt động thực. Bài học cho founder AU: tái chọn cư trú là công cụ chiến lược, không phải cửa một chiều — cùng cơ chế có thể chạy lại khi cơ cấu cổ đông hoặc trạng thái thuế dịch chuyển.",
            "Ba kịch bản kinh điển của founder AU kích hoạt cuộc thảo luận: (a) bên mua chiến lược Delaware chào mua bằng cổ phần đổi cổ phần và cần target dưới Delaware C-corp để hưởng xử lý tái tổ chức theo Section 368(a), (b) lộ trình IPO Mỹ đòi công ty mẹ Mỹ để đủ điều kiện niêm yết NYSE / NASDAQ hoặc cấu trúc dual-class mà ASX Listing Rule 6.9 không cho phép (xem P1m), (c) phần đa cap table là người cư trú Mỹ và rủi ro PFIC (Passive Foreign Investment Company) theo IRC §1297 đang kéo định giá ở tầng LP Mỹ. Không cái nào là đèn xanh đơn lẻ — mỗi cái có chi phí offshoring mà cố vấn thuế chuyên phải cân nhắc so với lợi ích chiến lược.",
            "Ba cơ chế có sẵn theo luật Úc: (1) Member Scheme of Arrangement theo Corporations Act 2001 (Cth) Part 5.1 s411 — ASIC review + Federal Court of Australia phê chuẩn + đa số 75% cổ đông trong mỗi hạng + 50% theo số người tại họp scheme. Đây là con đường sạch nhất và là con đường hầu hết các trường hợp redomicile của công ty tech AU dùng. (2) Tái cấu trúc toàn phần theo Corps Act s657A / s658A (mẫu takeover-bid) — nặng nề hơn, dùng khi phê chuẩn scheme không chắc. (3) Chuyển tài sản trực tiếp + giải thể — không bao giờ đúng cho công ty đang vận hành vì kích hoạt sự kiện CGT A1 trên mọi tài sản và chấm dứt mọi hợp đồng có điều khoản change-of-control.",
            "Xử lý thuế AU phía người bán — đây là chỗ kinh tế deal hoặc sống hoặc sụp. Một Scheme of Arrangement đổi cổ phần AU lấy cổ phần offshore (redomicile điển hình) kích hoạt sự kiện CGT A1 (ITAA 1997 s104-10) tại thời điểm trao đổi trừ khi rollover Subdiv 124-M scrip-for-scrip áp dụng. Subdiv 124-M yêu cầu (i) bên mua kết thúc với ≥ 80% cổ phần biểu quyết của target trong cùng giao dịch, (ii) mọi cổ đông target trong cùng hạng được chào tham gia, (iii) consideration hoàn toàn là cổ phần của bên mua (hoặc công ty mẹ 100% của nó). Consideration bằng tiền HOẶC hỗn hợp tiền+cổ phần HOẶC consideration từ bên mua sở hữu một phần đều loại rollover khỏi khối tiền mặt. Founder + nhà đầu tư bỏ lỡ rollover đối mặt nghĩa vụ thuế AU tại ngày hợp đồng, trước bất kỳ sự kiện thanh khoản nào.",
            "Pre-lodgment với Foreign Investment Review Board (FIRB) — hình ảnh gương của mục acquisition-pattern (chương 11, P11-acquisition-pattern). Nếu redomicile liên quan bên mua nước ngoài lấy > 20% doanh nghiệp AU (hoặc > 5% cho ngành nhạy cảm theo Foreign Acquisitions and Takeovers Act 1975 (Cth)), phê chuẩn FIRB là điều kiện tiên quyết. Ngưỡng tiền 2026: A$339M cho bên mua tư nhân không nhạy cảm. Danh sách ngành nhạy cảm (quốc phòng, viễn thông, hạ tầng trọng yếu, cyber, quantum, biotech, truyền thông, đất nông nghiệp) kích hoạt pre-lodgment ở mọi giá trị. Bên mua chịu ảnh hưởng chính phủ nước ngoài kích hoạt ở A$0. Đưa 30-60 ngày runway FIRB vào timeline scheme; scheme booklet nói 'không cần FIRB' trong khi thực tế cần sẽ khiến Federal Court từ chối phê chuẩn.",
            "Chi phí phía Mỹ founder hiếm khi mô hình hoá — sau redomicile, công ty con vận hành AU còn lại trở thành Controlled Foreign Corporation (CFC) theo IRC §957 từ góc nhìn của công ty mẹ Mỹ, và cổ đông cá nhân cư trú AU giữ cổ phần trong công ty mẹ Mỹ mới chịu withholding Mỹ theo IRC §1441 (mặc định 30%, giảm xuống 15% cho người cư trú AU đủ điều kiện hiệp định theo Điều 10 Công ước Úc–Mỹ). Rủi ro PFIC ở IRC §1297 biến mất khi công ty mẹ là công ty Mỹ nhưng xuất hiện lại nếu công ty mẹ Mỹ có > 75% thu nhập thụ động HOẶC > 50% tài sản thụ động. GILTI (Global Intangible Low-Taxed Income) theo IRC §951A áp dụng cho lợi nhuận vượt của công ty con AU trên tài sản hữu hình — bất ngờ phổ biến cho founder giả định credit R&D Tax Incentive AU sẽ chảy qua. Cả ba đều cần ý kiến của luật sư thuế Mỹ trước khi scheme booklet nộp.",
            "Timeline + chi phí bạn nên dự trù: từ mandate đến hoàn thành scheme thường 4-9 tháng (soạn scheme booklet 6-8 tuần; ASIC + toà review 4-6 tuần; thời gian thông báo họp scheme tối thiểu 28 ngày; phiên phê chuẩn toà 2-4 tuần sau họp; ngày hiệu lực 5-10 ngày làm việc sau lệnh đóng dấu). Chi phí pháp lý + kế toán cho một Scheme of Arrangement thẳng thắn là A$300k-A$800k (Corrs, HSF, DLA Piper, Gilbert + Tobin, King & Wood Mallesons đều có practice sell-side scheme AU; Cooley hoặc Wilson Sonsini cho phía Delaware; Big-4 tax cho ý kiến cross-border). Thêm A$150k-A$300k cho đăng ký S-4 Mỹ nếu bạn đồng thời niêm yết cổ phần Mỹ. Bước trung gian UK Plc (mẫu 2014 của Atlassian) thêm A$200k-A$400k nữa.",
            "BlockID.au bề mặt hoá thế nào và ranh giới: assemble exit-readiness của đại lý CFO (`/dashboard/exit-readiness` — xem P12b-tile) bề mặt hoá toggle 'kịch bản redomicile' khi CFO phát hiện bất kỳ trong ba kịch bản kích hoạt trên (tỷ trọng cap table cư trú Mỹ, bên mua Delaware tiếp cận, yêu cầu dual-class theo P1m). Đại lý au-compliance sinh questionnaire pre-lodgment FIRB khi từ khoá ngành target chạm danh sách công nghệ nhạy cảm. Đại lý CLO đánh dấu mọi hợp đồng vật chất có điều khoản change-of-control 90 ngày trước bất kỳ ý định scheme đã ký. BlockID KHÔNG tự soạn scheme booklet, certificate of incorporation Delaware, đơn xin phán quyết riêng Subdiv 124-M, hay FIRB Form 202 — tất cả đều là sản phẩm của luật sư chuyên + cố vấn thuế chuyên theo ranh giới dịch vụ tài chính / dịch vụ pháp lý s911A + s923B Corps Act 2001 (Cth). Các kịch bản mà redomicile thực sự đáng làm là hẹp — với hầu hết founder AU câu trả lời trung thực là 'chưa, và có thể không bao giờ' và các surface trên tồn tại để giúp bạn loại trừ nó sạch, không phải để bán dự án offshoring cho bạn.",
          ],
        },
      },
    ],
  },
];

const BY_SLUG: Record<ChapterSlug, Chapter> = Object.fromEntries(
  CHAPTERS.map((c) => [c.slug, c]),
) as Record<ChapterSlug, Chapter>;

/** All authored chapters in publication order. */
export function listChapters(): Chapter[] {
  return [...CHAPTERS].sort((a, b) => a.order - b.order);
}

/** Get one chapter by slug, or null if the slug is not (yet) published. */
export function getChapter(slug: string): Chapter | null {
  return BY_SLUG[slug as ChapterSlug] ?? null;
}

/** True when the slug matches a live chapter — used to gate 404s. */
export function isChapterSlug(slug: string): slug is ChapterSlug {
  return slug in BY_SLUG;
}

/** All slugs, for generateStaticParams and sitemap emission. */
export function allChapterSlugs(): ChapterSlug[] {
  return CHAPTERS.map((c) => c.slug);
}

/** Prev/next helper for the chapter navigation footer. */
export function getAdjacentChapters(slug: ChapterSlug): {
  previous: Chapter | null;
  next: Chapter | null;
} {
  const ordered = listChapters();
  const idx = ordered.findIndex((c) => c.slug === slug);
  if (idx === -1) return { previous: null, next: null };
  return {
    previous: idx > 0 ? ordered[idx - 1] : null,
    next: idx < ordered.length - 1 ? ordered[idx + 1] : null,
  };
}
