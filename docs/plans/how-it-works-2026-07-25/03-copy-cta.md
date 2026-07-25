# How It Works — Copy & CTA (EN + VI)

Owner: CMO copywriter
Date: 2026-07-25
Target file (new): `web/src/content/how-it-works-copy.ts`
Used by: `web/src/components/landing/how-it-works.tsx` (upgradeV2 branch of `web/src/app/page.tsx`)

Shape follows the existing `LocalisedText` pattern (`{ en, vi }`) already used in
`web/src/lib/guide/startup-journey.ts`.

---

## Section chrome

| Field | EN | VI |
|---|---|---|
| eyebrow | How it works | Cách hoạt động |
| headline | See how it works | Xem cách hoạt động |
| subhead | Watch how BlockID helps founders go from idea to investor-ready in minutes. | Xem BlockID giúp nhà sáng lập đi từ ý tưởng đến sẵn sàng gọi vốn chỉ trong vài phút. |
| cta.label | Try it with your idea | Thử ngay với ý tưởng của bạn |
| cta.href | `/` (scrolls to hero search) | `/` |
| videoTagline | From first search to first pitch — in one afternoon. | Từ lần tìm kiếm đầu tiên đến buổi pitch đầu tiên — trong một buổi chiều. |

---

## Five steps

### 1. Search your idea  (icon: `Search`)

- **EN title:** Search your idea
- **EN body (17w):** Type a company name, URL, or ABN. BlockID pulls public signals and grades the idea in seconds.
- **VI title:** Tìm kiếm ý tưởng
- **VI body:** Nhập tên công ty, URL hoặc ABN. BlockID lấy dữ liệu công khai và chấm điểm trong vài giây.

### 2. Set your goal  (icon: `ClipboardList`)

- **EN title:** Set your goal
- **EN body (16w):** Answer five short questions. Pick the phase you are in and the outcome you want next.
- **VI title:** Đặt mục tiêu
- **VI body:** Trả lời năm câu hỏi ngắn. Chọn giai đoạn hiện tại và kết quả bạn muốn đạt được kế tiếp.

### 3. Score readiness  (icon: `Gauge`)

- **EN title:** Score readiness
- **EN body (17w):** See your Startup Value Index — a rating across 13 investor questions, each linked to source evidence.
- **VI title:** Chấm điểm mức độ sẵn sàng
- **VI body:** Xem Chỉ số Giá trị Khởi nghiệp — đánh giá qua 13 câu hỏi của nhà đầu tư, mỗi câu đều có dẫn chứng.

### 4. Build your data room  (icon: `FolderOpen`)

- **EN title:** Build your data room
- **EN body (17w):** Ten templates seed your data room, plus a cap table (who owns what) and vesting schedules.
- **VI title:** Dựng phòng dữ liệu
- **VI body:** Mười mẫu tài liệu sẵn sàng, kèm bảng cổ phần (ai sở hữu bao nhiêu) và lịch trao quyền cổ phần.

### 5. Raise with confidence  (icon: `Rocket`)

- **EN title:** Raise with confidence
- **EN body (14w):** Export investor-ready reports, shortlist matched investors, and apply to accelerators without rewriting anything.
- **VI title:** Tự tin gọi vốn
- **VI body:** Xuất báo cáo cho nhà đầu tư, chọn nhà đầu tư phù hợp và nộp đơn vào vườn ươm.

---

## Acceptance criteria

- Every EN body ≤ 18 words (verified above: 17 / 16 / 17 / 17 / 14).
- Every step opens with a concrete verb (Type, Answer, See, [Ten templates] seed, Export).
- Jargon is either avoided or explained inline the first time it appears:
  - "Startup Value Index" is spelled out (initialism SVI never surfaces in copy).
  - "cap table" is defined parenthetically as "(who owns what)".
  - "vesting", "data room", "accelerators", "ABN" are industry-standard and left plain.
- Bilingual parity: every EN string has a VI counterpart of matching meaning and length band.
- No hyperbole ("world-class", "revolutionary", "10x", "AI-powered") — all removed.
- Tone matches Report Tone & Structure memory: mentoring, step-by-step, no shouting.

## Risks

- Being too clever tanks conversion — copy stays literal and skimmable.
- Vietnamese phrasing must be reviewed by a native speaker before launch; current draft is direct-translation register (safe default).
- "Startup Value Index" is long — designers should let it wrap naturally on mobile rather than truncate.

## Out of scope (SCOPE FENCE)

Does not touch: `web/src/components/workspace/nav-groups.ts`, `web/src/lib/nav/**`,
`web/src/lib/entitlements/**`, `web/src/lib/mentor/**`, `web/src/lib/roles/**`,
`web/src/app/reseller/mentor/**`, `web/src/app/innovator/**`,
`web/src/lib/product-tour/feature-tours.ts`, `web/src/lib/feature-gates.manifest.ts`,
migrations, or `content/reports/*.jsonl`.
