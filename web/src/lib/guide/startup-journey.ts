// Track B B2 — startup-journey guide content library, chapters 1–4.
//
// Structured content module holding the guided-walkthrough chapters described
// in docs/plans/reseller-module-plan.md § U.8 and § U.9. Chapters 1–4 cover
// Vision → Idea Validation → Market Research → MVP / Product Discovery — the
// first four rows of the U.9 journey matrix. Chapters 5–12 land in B3 and B4.
//
// Consumed by:
//   - web/src/app/guide/[chapter]/page.tsx (marketing surface)
//   - web/src/app/workspace/guide/[chapter]/page.tsx (workspace surface)
//
// Kept in TS (not on-disk markdown) so both EN and VI copy live beside each
// other and stay type-checked. A mirror EN dump lives at
// docs/guides/startup-journey/chapter-{01..04}.md for offline reading and
// contributor pull-requests, but the pages read from this module — the .md
// files are documentation, not runtime.

import { PHASE_LABELS, type PhaseLabel } from "@/lib/showcase/gallery";

export type ChapterSlug =
  | "01-vision"
  | "02-idea-validation"
  | "03-market-research"
  | "04-mvp";

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
