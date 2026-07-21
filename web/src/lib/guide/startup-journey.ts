// Track B B2 + B3 — startup-journey guide content library, chapters 1–8.
//
// Structured content module holding the guided-walkthrough chapters described
// in docs/plans/reseller-module-plan.md § U.8 and § U.9. Chapters 1–4 (B2)
// cover Vision → Idea Validation → Market Research → MVP; chapters 5–8 (B3)
// cover PMF → Revenue → Growth → Team. Chapters 9–12 land in B4.
//
// Consumed by:
//   - web/src/app/guide/[chapter]/page.tsx (marketing surface)
//   - web/src/app/workspace/guide/[chapter]/page.tsx (workspace surface)
//
// Kept in TS (not on-disk markdown) so both EN and VI copy live beside each
// other and stay type-checked. A mirror EN dump lives at
// docs/guides/startup-journey/chapter-{01..08}.md for offline reading and
// contributor pull-requests, but the pages read from this module — the .md
// files are documentation, not runtime.

import { PHASE_LABELS, type PhaseLabel } from "@/lib/showcase/gallery";

export type ChapterSlug =
  | "01-vision"
  | "02-idea-validation"
  | "03-market-research"
  | "04-mvp"
  | "05-pmf"
  | "06-revenue"
  | "07-growth"
  | "08-team";

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
