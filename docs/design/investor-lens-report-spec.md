# Trusted Business Report — thiết kế lại UI/UX v2 (Investor Lens)

**Trạng thái:** `SPEC THỊ GIÁC v2 — PLAN ONLY, chưa code` · **Ngày:** 23/09/2026 · **Thay:** spec v1 cùng file (rev đầu ngày 23/09)
**Phạm vi và thứ tự triển khai:** [G31 Investor Lens plan](../plans/g31-investor-lens-biz-trust-report-2026-09-23.md) §5, §7 · SOT §10.13, §12.10
**Amend:** [analyze-report-dashboard-spec.md](analyze-report-dashboard-spec.md) (Zone 2 → Priority Matrix; Zone 1/3 theo §4 dưới đây) · [tbr-v3-investor-report-spec.md](tbr-v3-investor-report-spec.md) §2 (thứ tự mục) và §5 (dashboard tiles). Anatomy dimension (§3) và print rules (§5) của v3 giữ nguyên, trừ phần ghi rõ ở đây.
**Design system:** [unicorn-template.md](unicorn-template.md), light only. **Không thêm palette, font hay dark band.**

---

## 0. Hướng thiết kế

**Một câu:** Trusted Business Report trông như **một research note của quỹ đầu tư, in ra được và đọc được trong 60 giây**, không phải một dashboard SaaS hay một landing page.

| Nguyên tắc | Nghĩa trong thiết kế |
|---|---|
| **Quyết định trước, phân tích sau** | Người đọc gặp kết luận, giá trị và rủi ro trước; phương pháp và SVI ở cuối |
| **Theo thứ tự investor ưu tiên** | Mọi danh sách tín hiệu (matrix, chương, rail, drawer, PDF, cohort) theo **một** thứ tự cố định: **Team → Traction → Moat → Liquidity → Cap Table → IP** (+ ESG khi trọng yếu) |
| **Điểm luôn đi cùng bằng chứng** | Không có ô số nào đứng một mình. Score (thanh đặc navy) và confidence (thước 6 nấc cyan) có hai hình dạng khác nhau |
| **Thành thật như một tính năng** | Chưa đủ bằng chứng, report bị degraded hay benchmark thiếu `n` đều được nói thẳng, ngay cạnh con số liên quan |
| **Mật độ có kiểm soát** | Mặt trước bị khóa cứng ở 4 chỉ số · 6 tín hiệu · 3 · 3 · 3. Chiều sâu mở tại chỗ bằng drawer/accordion |
| **Một nguồn, mọi bề mặt** | Web = PDF = DOCX = e-mail, dựng từ cùng revision |

**Đề xuất bị loại:** công cụ design gợi ý hướng “data dashboard” nền tối (OLED) + Fira Code/Fira Sans + accent xanh lá. **Không dùng**, vì trái light-only (§10.11 SOT, D18) và hệ font đã khóa. Giữ lại từ gợi ý đó: màu trạng thái có icon/chữ, mật độ cao nhưng quét được, radar chỉ là phụ (khả năng tiếp cận hạng B, bắt buộc có bar/table thay thế), lưới <20 ô trình bày bằng bảng.

---

## 1. Kiến trúc thông tin theo tầng đọc

| Tầng | Thời gian | Người đọc hỏi | Mục |
|---|---|---|---|
| **L0 Glance** | 5 giây | Có nên mở tiếp không? | Masthead · 4 chỉ số · meeting label |
| **L1 Brief** | 60 giây | Vì sao, rủi ro gì, hỏi gì? | 02 Priority Matrix · triptych (3 lý do / 3 điều chặn deal / 3 câu hỏi) · 03 Evidence (tóm tắt) |
| **L2 Analysis** | 3–10 phút | Từng mặt mạnh yếu thế nào? | 04 Business · **05 Team · 06 Traction · 07 Market · 08 Moat & IP · 09 Liquidity · 10 Capital & Governance** · 11 Valuation · 12 Risks · 13 Questions |
| **L3 Audit** | Khi cần | Dựa vào đâu, tính thế nào? | 14 SVI Detail · 15 90-Day Plan · 16 Evidence Register & Audit |

**Thứ tự 16 mục = thứ tự ưu tiên của plan mới.** Tầng L2 đi theo thứ tự investor: Team trước Traction, Traction trước Market. Market đứng sau Traction vì investor hỏi “khách hàng có kéo không?” trước “thị trường lớn không?”. IP được gộp cạnh Moat vì đó là cùng một câu hỏi phòng thủ. Liquidity và Cap Table đứng trước Valuation vì chúng quyết định valuation có ý nghĩa hay không.

---

## 2. Khung trang (page shell)

### 2.1 Desktop ≥1280 px — ba vùng

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ APP HEADER (giữ shell hiện có)                                                        │
├──────────────┬──────────────────────────────────────────────────┬────────────────────┤
│ SECTION RAIL │ MAIN COLUMN  (max 760 px chữ · 1040 px bảng)      │ DECISION RAIL      │
│ 220 px       │                                                  │ 280 px, sticky     │
│ sticky       │ Masthead                                         │ ┌────────────────┐ │
│              │ Top metrics (4)                                  │ │◉ WORTH         │ │
│ 01 Snapshot  │ Meeting label + luận điểm                        │ │  INVESTIGATING │ │
│ 02 Priorities│ 02 Investor Priority Matrix                      │ │ A$4.2–8.5M     │ │
│ 03 Evidence  │ Triptych                                         │ │ Evidence 82%   │ │
│ ─ Analysis ─ │ 03 Evidence & Confidence                         │ │ ▰▰▰▰▰▱         │ │
│ 04 Business  │ ...                                              │ ├────────────────┤ │
│ 05 Team    ● │                                                  │ │ Hỏi trước (3)  │ │
│ 06 Traction● │                                                  │ │ 1 … 2 … 3 …    │ │
│ 07 Market  ◐ │                                                  │ ├────────────────┤ │
│ 08 Moat&IP ◐ │                                                  │ │ [Tải PDF brief]│ │
│ 09 Liquid. ◌ │                                                  │ │ [Chia sẻ]      │ │
│ 10 Capital ▲ │                                                  │ │ [Yêu cầu BC]   │ │
│ 11 Valuation │                                                  │ └────────────────┘ │
│ 12 Risks     │                                                  │ RPT-8F2A · SVI 2.2 │
│ 13 Questions │                                                  │ Snapshot 23/09     │
│ ─ Audit ──── │                                                  │                    │
│ 14 SVI       │                                                  │                    │
│ 15 Plan      │                                                  │                    │
│ 16 Register  │                                                  │                    │
└──────────────┴──────────────────────────────────────────────────┴────────────────────┘
```

- **Section rail:** mỗi mục có số, tên và **chấm trạng thái** của tín hiệu tương ứng (icon nhỏ + `aria-label`). Mục đang đọc được đánh dấu bằng thanh navy 3 px bên trái. Nhóm được chia bằng nhãn “Analysis” / “Audit”.
- **Decision rail:** chỉ xuất hiện sau khi masthead cuộn khỏi màn hình (`IntersectionObserver`), để không lặp dữ liệu ở fold đầu. Rail nhắc lại kết luận, giá trị, confidence, 3 câu hỏi và các hành động. Đây là **nơi duy nhất có nút hành động chính** khi đang đọc sâu.
- **Main column:** đoạn văn giới hạn 65–75 ký tự/dòng. Bảng được rộng tới 1040 px.

### 2.2 Tablet 768–1279 px

- Section rail thu thành **tab strip ngang dính dưới header** (cuộn ngang, `min-w-0 overflow-x-auto`).
- Decision rail chuyển thành **thanh tóm tắt dính đầu trang** cao 48 px: meeting label · giá trị · confidence · nút “⋯ Hành động”.

### 2.3 Mobile 375 px

```
┌ ← Reports   RPT-8F2A  ⋯ ┐   header 48 px
├─────────────────────────┤
│ Acme Compliance         │
│ B2B SaaS · Seed · NSW   │
├─────────────────────────┤
│ A$4.2M – A$8.5M         │   định giá luôn là số đầu tiên
│ base A$6.1M · 4 methods │
├────────────┬────────────┤
│ Evidence   │ SVI        │
│ 82% ▰▰▰▰▰▱ │ 71 Strong  │
├────────────┴────────────┤
│ Verified L3 · Financials│
├─────────────────────────┤
│ ◉ WORTH INVESTIGATING   │
│ “Verified recurring …”  │
├─────────────────────────┤
│ ▲ Điều có thể chặn (3)  │   rủi ro trước điểm mạnh
│ ✓ Vì sao đáng xem (3)   │
│ ? Hỏi trước (3)         │
├─────────────────────────┤
│ Team      ✓ Strong    › │   matrix = thẻ 72 px
│ 84 ████  91% ▰▰▰▰▰▱ ↑   │
│ Traction  ✓ Strong    › │
│ …                       │
├─────────────────────────┤
│ [Mục lục ▾]  [PDF] [⋯]  │   thanh dưới dính, 56 px + safe area
└─────────────────────────┘
```

- **Mục lục** mở dạng bottom sheet liệt kê 16 mục kèm trạng thái. Không dùng bottom nav cho report.
- Drawer tín hiệu mở toàn màn hình, có nút đóng 44 px ở góc và vuốt xuống để đóng.
- Không có cuộn ngang ở bất kỳ vùng nào. Bảng rộng chuyển thành danh sách thẻ, không co chữ.

---

## 3. Design tokens (dùng lại, không tạo mới)

### 3.1 Màu theo vai trò

| Vai trò | Token / giá trị | Dùng cho |
|---|---|---|
| Nền trang | `bg-surface` `#ffffff` | Toàn trang |
| Nền phụ | `bg-surface-sunken` `#f7f8fa` | Zebra, track của thanh, callout |
| Chữ chính | `text-primary` (ink) | Body, số liệu |
| Chữ phụ | `text-ink-muted` | Nhãn, caption (≥4.5:1 trên nền trắng) |
| Hành động chính | navy `#1b2a5e` | 1 nút chính mỗi vùng, thanh score, rule callout, rail active |
| Accent thông tin | cyan-muted `#0e7490` | Link, thước confidence, trạng thái Moderate/Developing |
| Tích cực | `text-bull` `#047857` | Strong, điểm mạnh |
| Cảnh báo | `text-warn` `#b45309` | Watch, cần làm rõ, Stale |
| Tiêu cực | `text-bear` `#b91c1c` | Material issue, rủi ro |
| Chart phụ | palette `lib/report-visuals/palette.ts` | Cap table stacked bar, dimension bars |

- Màu trạng thái chỉ dùng cho **icon, viền và nền 8%**. Chữ vẫn là ink để giữ tương phản.
- Không dùng hex thô trong className (guard hiện có).

### 3.2 Chữ

| Vai trò | Font | Cỡ / line-height | Weight |
|---|---|---|---|
| Display (định giá) | IBM Plex Mono `tabular-nums` | 48/56 (desktop) · 36/44 (mobile) | 600 |
| H1 tên công ty | Space Grotesk | 32/40 · 26/32 | 600 |
| H2 mục | Space Grotesk | 24/32 · 20/28 | 600 |
| H3 khối con | Inter | 18/28 | 600 |
| Body | Inter | 16/26 | 400 |
| Phụ | Inter | 14/22 | 400 |
| Nhãn/kicker | Inter uppercase, tracking +0.04em | 12/16 | 500 |
| Số trong bảng/tile | IBM Plex Mono `tabular-nums` | 14–32 | 500–600 |

Chữ nhỏ nhất là 12 px (web) và 9,5 pt (PDF). Số mục dùng mono (`05`) để tạo nhịp như research note.

### 3.3 Khoảng cách, bo góc, đổ bóng, lớp

- **Spacing** theo thang 4 px:
  - trong component: 8/12/16;
  - padding thẻ: 20/24;
  - giữa khối trong mục: 24/32;
  - giữa mục: 64 (desktop) / 48 (mobile).
- **Bo góc:** thẻ 12, chip 999 (pill), nút 10, bảng 12 ở khung ngoài. Theo unicorn-template.
- **Đổ bóng:** chỉ 2 mức: thẻ (`shadow-sm`) và drawer/sheet (`shadow-xl` + scrim 40%). Không dùng shadow để trang trí.
- **Z-index:** nội dung 0 · rail dính 10 · thanh dưới mobile 20 · drawer 40 · toast 100.
- **Icon:** Lucide, stroke 1.75, kích thước 14 (chip) / 16 (hàng) / 20 (tiêu đề). Không dùng emoji.

### 3.4 Chuyển động

- Mở drawer 200 ms ease-out, đóng 140 ms. Accordion 180 ms.
- Không animate số và thanh. Không có hiệu ứng vào trang.
- `prefers-reduced-motion`: tắt toàn bộ chuyển động và giữ nguyên trạng thái.

---

## 4. Thiết kế từng mục (theo thứ tự ưu tiên)

### 01 Investor Snapshot

**Masthead**

- Kicker: `TRUSTED BUSINESS REPORT`.
- Tên công ty (H1).
- Dòng meta: sector · stage · jurisdiction.
- Dòng provenance mono 12 px: `Snapshot 23/09/2026 · SVI 2.2.0 · RPT-8F2A · 42 claims · 2 sources live`. Click để tới mục 16.
- Badge phụ: `ABN verified`, `Free report 1/2`, `Bản đã lưu 12/08 — có bản mới hơn ›` khi đang xem revision cũ.

**4 chỉ số** (grid 12 cột, tỷ lệ 5 · 3 · 2 · 2)

| Tile | Giá trị chính | Dòng phụ | Khi thiếu dữ liệu |
|---|---|---|---|
| **Indicative pre-money** | `A$4.2M – A$8.5M` 48 px | `base A$6.1M · 4 methods` | “Chưa đủ bằng chứng để định giá” + 2 CTA; không in khoảng mờ |
| **Evidence confidence** | `82%` + thước 6 nấc | `12 claims verified · 3 founder-stated` | `—` + “Chưa có bằng chứng kiểm chứng” |
| **SVI** | `71 /100` + band chữ | `▲+3 vs 12/08 · index 128 ⓘ` | `—` + “Chưa đánh giá” |
| **Verification** | `L3` | nhãn chữ “Financials attested” | `L0 · Chưa xác minh` |

**Meeting label**

- Chip lớn 40 px (icon + nhãn) và câu luận điểm ≤2 dòng.
- Dòng 12 px bên dưới: “BlockID sắp xếp bằng chứng; nhà đầu tư ra quyết định. Thông tin chung, không phải tư vấn tài chính.”
- Tooltip của chip hiện **luật đã kích hoạt** (`B: 1 claim trọng yếu chưa kiểm chứng`).

**Triptych** (3 cột; mobile theo thứ tự Rủi ro → Điểm mạnh → Câu hỏi)

| Cột | Tiêu đề | Icon / viền | Mỗi mục |
|---|---|---|---|
| 1 | Vì sao đáng tìm hiểu | `ArrowUpRight` / bull | Tiêu đề ≤8 từ · một dòng bằng chứng có footnote · chip tín hiệu (`Team`) · ▸ mở tại chỗ |
| 2 | Điều có thể chặn thương vụ | `AlertTriangle` / bear | Như trên + chip `Mức độ cao · Chưa kiểm chứng` |
| 3 | Hỏi trước buổi gặp | `HelpCircle` / warn | Số thứ tự · câu hỏi · “vì sao hỏi” · nút “Yêu cầu bằng chứng” (evaluator) hoặc “Bổ sung” (founder) |

### 02 Investor Priority Matrix (visual đặc trưng)

| Cột | Rộng | Nội dung |
|---|---|---|
| Tín hiệu | 180 | Tên + câu hỏi investor (14 px muted, ẩn dưới 1024) |
| Trạng thái | 150 | `StatusChip` |
| Điểm | 160 | `ScoreBar` + số |
| Bằng chứng | 170 | `ConfidenceMeter` + % + tên bậc |
| Độ mới | 100 | `FreshnessBadge` |
| Xu hướng | 70 | `TrendGlyph` |
| Bằng chứng chính | còn lại | 1 dòng, link mở drawer |

- 6 hàng theo đúng thứ tự Team → Traction → Moat → Liquidity → Cap Table → IP. Hàng ESG (nếu có) nằm cuối, có nhãn “Trọng yếu với ngành”.
- Hàng cao 56 px, zebra, cả hàng là vùng click (mở `SignalDrawer`, tới chương bằng deep link `#signal-traction`).
- Hàng có narrative gap mang **dải warn 3 px bên trái** kèm tooltip “Luận điểm mạnh, bằng chứng yếu”.
- Dưới bảng là link “Cách tính và ánh xạ SVI”, mở accordion giải thích 6 tín hiệu ↔ 13 criteria ↔ 8 dimension.
- Báo cáo đầu tiên không có trend: cột Xu hướng ghi “Lần đầu”.
- Dưới 768 px bảng chuyển thành thẻ (§2.3).

### 03 Evidence & Confidence

- **Trái:** `EvidenceLadder`, thang dọc 6 bậc (cao nhất ở trên). Mỗi bậc gồm nhãn, % bậc, số claim và thanh đếm cyan. Bậc không có claim ghi “0”, không ẩn.
- **Phải:** dải freshness 5 ô (Live/Current/Aging/Stale/Unknown) có số lượng, và danh sách **3 claim ít tin cậy nhất** (`ClaimRow`), có CTA nâng bậc (“Kết nối Stripe để chuyển từ Founder stated lên Transaction evidence”).
- Câu tóm tắt: “Traction được hỗ trợ bởi dữ liệu giao dịch; Moat chủ yếu dựa vào lời founder.”

### 04 Business Overview

Bốn ô ngắn (Vấn đề · Khách hàng · Sản phẩm · Mô hình doanh thu), mỗi ô ≤60 từ, có footnote. Kèm một dòng “Giai đoạn / thời kỳ số liệu”.

### 05–10 Signal chapters — một anatomy chung

Áp dụng cho Team, Traction, Moat & IP, Liquidity, Capital & Governance. Market (07) dùng anatomy dimension v3.

```
05  TEAM — Management Track Record                    [✓ Strong]  84 ████  91% ▰▰▰▰▰▱  Current  ↑
    “Đội này có thực thi được không?”
┌ Kết luận (≤40 từ, câu đầu mang phán đoán) ─────────────────────────────────────┐
└────────────────────────────────────────────────────────────────────────────────┘
 Bằng chứng then chốt (≤5 ClaimRow)          │  Điều hỗ trợ (≤3)  ✓
  Prior exit verified   A$12M  ASIC · 2019   │  Điều còn thiếu (≤3) ?
  12 yrs sector         LinkedIn · 35%       │  [Narrative gap callout nếu có]
 [Khối riêng của tín hiệu — bảng dưới]
 Câu hỏi sinh ra (≤2) → mục 13
 Ánh xạ: FTV (chính) · CGH, IRI (phụ) · criteria founder_profile, team, team_structure   (12 px muted)
```

| Tín hiệu | Khối riêng |
|---|---|
| 05 Team | Lưới “độ đầy đủ đội” (CEO/CTO/Commercial/…: ✓ có · ○ trống · ? chưa rõ); chip key-person dependency |
| 06 Traction | 4 KPI tile nhỏ (ARR/MRR · tăng trưởng · khách trả tiền · khách lớn nhất %), mỗi tile có nguồn + độ mới; sparkline doanh thu khi có ≥3 kỳ (kèm bảng) |
| 07 Market | Anatomy dimension v3 + bảng đối thủ 3–5 (G30 R04) + khối ESG khi trọng yếu |
| 08 Moat & IP | `MoatBreakdown`: 5 hàng (Tech · Data · IP · Network · Distribution), mỗi hàng có score + confidence riêng; bên dưới là IP checklist (assignment · patents/TM · data · licences) |
| 09 Liquidity | Banner cố định “Các con đường khả dĩ — không phải dự báo thoát vốn”; ≤3 `LiquidityRoutes`; chip buyer class; bảng comps có nguồn (tên · năm · bên mua · lý do · link); danh sách blockers (`Lock`). **Không có số A$ exit** |
| 10 Capital & Governance | `CapTableBar` hai hàng (hiện tại / sau vòng tới, giả định) + bảng + danh sách giả định; `GovernanceChecklist` (vesting · SHA · board · ESOP plan · IP assignment); cờ đỏ dạng callout bear. Không có dữ liệu → thẻ xám “Chưa có cap table” + CTA, và không vẽ chart rỗng |

### 11 Valuation

Giữ thiết kế v3 (range bar + bảng phương pháp + kịch bản), thêm:

- Hàng “Phương pháp **không** dùng + lý do + CTA” (vd. “Revenue multiple — cần doanh thu kiểm chứng: kết nối Xero”).
- Khối “Biến nhạy nhất” gồm 2–3 biến, mỗi biến có thanh tornado nhỏ và bảng thay thế.
- Nhãn phương pháp theo đổi tên của G30 (§Zone 5 dashboard spec).

### 12 Key Risks

- **Bên trái:** bảng 3×3 (severity × probability) + cột “Chưa xác định”. Mỗi ô ghi **số lượng**, không dùng gradient nhiệt. Theo quy tắc chart, lưới dưới 20 ô là bảng.
- **Bên phải:** bảng top 5 với các cột: Rủi ro · Mức độ · Xác suất · Bằng chứng (thước) · Thời gian · Kiểm soát được · Giảm thiểu · Câu hỏi liên kết.
- Rủi ro thiếu bằng chứng có chip outline “Chưa kiểm chứng” (không dùng màu đỏ).

### 13 Questions to Investigate

- Danh sách 3–7 thẻ đánh số. Mỗi thẻ gồm:
  - câu hỏi (H3);
  - “Vì sao hỏi”: khoảng trống hoặc mâu thuẫn cụ thể, có link claim;
  - chip tín hiệu;
  - mức ưu tiên (Cao/Trung bình);
  - hành động theo vai trò.
- **Evaluator:** “Thêm vào câu hỏi cho founder” + trạng thái (Chưa hỏi / Đã gửi / Đã trả lời).
- **Founder:** “Trả lời bằng bằng chứng” → evidence hub.
- Câu hỏi có trạng thái mâu thuẫn luôn lên đầu, viền bear.

### 14 SVI Detail

- Bar ngang 8 dimension + dải p25–p75 và `n` (v3 §5). Khi `n<10` thì ẩn dải và ghi rõ.
- 8 chương dimension theo anatomy v3 §3, **mặc định đóng trên web** (accordion); PDF Full in đầy đủ.
- Radar (nếu giữ) là hình phụ có bảng kèm theo.

### 15 90-Day Plan

- Giữ ImprovementPlan v3.
- Thêm khối founder “**3 bằng chứng tăng niềm tin investor nhiều nhất**”. Mỗi mục: hành động · tín hiệu được nâng · bậc hiện tại → bậc sau (vd. `Founder stated 20% → Transaction evidence 90%`) · CTA.
- Chỉ in “+N SVI” khi lift là quy tắc xác định.
- Money on the table là khối con cuối mục.

### 16 Evidence Register & Audit

- Bảng claim có tìm kiếm và lọc (tín hiệu · bậc · độ mới · trạng thái).
- Provenance card: Report ID · Company ID · Methodology · Engine · Snapshot · sources · evidence count · connector freshness · evaluator overrides · audit ref.
- Kèm methodology rút gọn và disclaimer.

---

## 5. Trạng thái (phần quyết định cảm giác “chuyên nghiệp”)

| Trạng thái | Nhận diện | Thiết kế |
|---|---|---|
| **Đang chạy** | Job chưa final | Skeleton đúng hình từng khối (masthead, 4 tile, 6 hàng, 3 cột). Timeline stage + ETA (G30 C3). Không dùng spinner giữa trang. Không nhảy layout |
| **Sơ bộ** | Preview trước final | Nhãn `Sơ bộ` trên meeting label và watermark nhạt “Preliminary” trên bản in |
| **Degraded** (**đang xảy ra thật**: telemetry 23/09 06:51 và 07:41 ghi 8/8 chương degraded, 0 từ) | `quality.degradedSections > 0` | Banner warn dưới masthead: “Phần phân tích văn bản chưa dựng được cho {n} mục; kết quả dưới đây chỉ dựa trên điểm và bằng chứng đã ghi nhận.” Lens (01–03, matrix) **vẫn hiển thị** vì là derivation xác định. Chương thiếu narrative hiện thẻ “Chưa có phân tích văn bản” + nút “Phân tích lại mục này” (theo contract quote/credit G30 C2). **Không** in đoạn văn rỗng hoặc placeholder |
| **Chưa đủ bằng chứng** | confidence <35% hoặc score null | Chip xám viền đứt + CTA cụ thể. Không in 0 |
| **Bị khóa (free sau grant)** | Trim level | 01–03 luôn mở. Chương bị khóa hiện thẻ compact + unlock rail (G19/G25, review-before-pay). Không làm mờ số của lens |
| **Revision cũ** | Đang xem snapshot cũ | Banner info: “Đang xem bản 12/08. Bản mới nhất 23/09 ›”. Trend so với bản trước của chính revision đó |
| **Chia sẻ công khai** | `/tbr/[token]` | Ẩn nút sửa/founder CTA; evidence riêng tư hiển thị “Nguồn riêng — cần quyền truy cập”, không leak |
| **Lỗi tải** | Reader lỗi | Thẻ lỗi có nguyên nhân + “Thử lại”. Không có trang trắng |

---

## 6. Biến thể theo vai trò

| Vai trò | Khác biệt |
|---|---|
| **Investor / public share** | Mặc định như trên; decision rail có PDF brief, chia sẻ |
| **Evaluator** (workspace/dossier) | Decision rail thêm “Quyết định của bạn” (pass/track/proceed, conviction), badge “Bằng chứng đã đổi sau quyết định”, câu hỏi có trạng thái; override dimension hiện dấu ✎ cạnh score |
| **Founder** | Khối “3 bằng chứng tăng niềm tin nhiều nhất” đặt ngay sau triptych; CTA connector/upload thay cho “Yêu cầu bằng chứng”; không đổi kết luận hay nhãn |

Một component chung, khác nhau qua prop `viewer` (không tách trang).

---

## 7. Component (thư mục `components/tbr/v2/lens/`)

| Component | Vai trò | A11y |
|---|---|---|
| `LensMasthead` | §4-01 masthead + provenance | `h1` duy nhất; provenance là `<dl>` |
| `MetricTiles` / `MetricTile` | 4 tile | Mỗi tile là `<section aria-labelledby>` |
| `MeetingLabel` | Chip + luận điểm + luật | Tooltip mở bằng focus/tap, không chỉ hover |
| `LensTriptych` | 3 cột | `<ul>` mỗi cột; mục mở rộng dùng `<details>` |
| `PriorityMatrix` | Bảng 6 hàng / thẻ trên mobile | `<table>` + `<caption>`, `aria-sort` khi sắp xếp |
| `ScoreBar` | Score 0–100 | `role="img"` + `aria-label="Điểm 84 trên 100"` |
| `ConfidenceMeter` | 6 nấc | `aria-label="Bằng chứng 94%, bậc Transaction evidence"` |
| `StatusChip` | 6 trạng thái | Icon `aria-hidden`, chữ đọc được |
| `FreshnessBadge` · `TrendGlyph` | Độ mới · xu hướng | Chữ ẩn cho screen reader |
| `SignalDrawer` | Chi tiết tín hiệu tại chỗ | Dialog, focus trap, Esc, trả focus về hàng |
| `SignalChapter` | Anatomy chung 05–10 | `section#signal-<type>` deep link |
| `ClaimRow` · `EvidenceLadder` · `NarrativeGapCallout` | Bằng chứng | Link nguồn có mô tả |
| `MoatBreakdown` · `LiquidityRoutes` · `CapTableBar` · `GovernanceChecklist` | Khối riêng | Mọi chart có `<table>` thay thế |
| `RiskGrid` · `RiskTable` · `QuestionList` | 12, 13 | Bảng sắp xếp được |
| `FounderGapsPanel` · `DecisionRail` · `SectionRail` · `MobileReportBar` | Điều hướng/hành động | `nav aria-label`, `aria-current` |
| `DegradedBanner` · `RevisionBanner` · `LensSkeleton` | Trạng thái | `role="status"` |

Primitives dùng lại: `Card`, `Table/Th/Td`, `Section`, `StatTile`, `Callout` (`shared.tsx`, `components/marketing/template/ui.tsx`). **Không** tạo Button/Card thứ ba (G30 U03).

---

## 8. Chart và số liệu

| Dữ liệu | Hình | Lý do |
|---|---|---|
| 6 tín hiệu | Bảng có thanh (không phải chart) | So sánh chính xác, đọc được trên mobile |
| Evidence theo bậc | Bar ngang đếm | Xếp hạng/đếm; nhãn trực tiếp |
| 8 dimension | Bar ngang + dải p25–p75 | Radar chỉ là phụ (khả năng tiếp cận hạng B) |
| Cap table | Stacked bar 100% hai hàng | Tỷ lệ; ≤5 nhóm; kèm bảng |
| Rủi ro | Bảng 3×3 đếm | <20 ô: bảng thay heatmap |
| Doanh thu | Sparkline + bảng | Chỉ khi ≥3 kỳ có nguồn |
| Valuation | Range bar + tornado nhỏ | Khoảng và độ nhạy |

**Quy tắc chung:**

- Nhãn giá trị đặt trực tiếp trên chart, không cần legend khi có ≤2 series. Gridline nhạt, trục chỉ có các mốc 0/50/100.
- Số liệu dùng định dạng theo locale (`A$6.1M`, `23/09/2026`).
- Mọi chart có câu tóm tắt cho screen reader. Khi không có dữ liệu thì hiện empty state có hướng dẫn, không vẽ trục rỗng.

---

## 9. Print / PDF / DOCX

| Trang (A4) | Nội dung |
|---|---|
| **Brief** p.1 | Masthead · 4 tile · meeting label · Priority Matrix |
| Brief p.2 | Triptych · Evidence ladder · 3 claim ít tin cậy nhất |
| Brief p.3–4 | 12 Risks (top 5) · 13 Questions · disclaimer + provenance |
| **Full** | Brief + 04–16. Mỗi mục `break-before: page`; chương tín hiệu giữ tiêu đề với nội dung; drawer in ra thành bảng claim |

- **Footer:** `Trusted Business Report · {company} · RPT · SVI 2.2.0 · snapshot {date} · p. X/Y · General information, not financial advice`.
- **Ẩn khi in:** rail, nút, tooltip.
- **Thay icon bằng ký tự** (✓ ◐ ◌ ▲ ■ ?) + chữ, vì PDF/DOCX không phụ thuộc font icon.
- **DOCX:** tile thành bảng 2×2; matrix có header lặp; callout thành bảng một ô có nền nhạt; chart thành SVG raster cùng nguồn.
- **E-mail:** meeting label · 4 chỉ số dạng bảng · 3/3/3 · nút “Mở báo cáo” (link đúng revision).

---

## 10. Microcopy (EN / VI)

| Key | EN | VI |
|---|---|---|
| meeting.A | Strong case to investigate | Rất đáng tìm hiểu |
| meeting.B | Worth investigating | Đáng tìm hiểu |
| meeting.C | Major issues to resolve | Có vấn đề lớn cần giải quyết |
| meeting.D | Evidence incomplete | Chưa đủ bằng chứng |
| status.* | Strong · Moderate · Developing · Watch · Material issue · Insufficient evidence | Mạnh · Khá · Đang hình thành · Cần theo dõi · Vấn đề trọng yếu · Chưa đủ bằng chứng |
| signal.* | Team · Traction · Moat · Liquidity · Cap Table · IP Depth | Đội ngũ · Traction · Lợi thế cạnh tranh · Thanh khoản · Cơ cấu vốn · Chiều sâu IP |
| matrix.title | Investor priorities | Ưu tiên của nhà đầu tư |
| triptych.why / stop / ask | Why investigate · What could stop the deal · Ask before the meeting | Vì sao đáng tìm hiểu · Điều có thể chặn thương vụ · Hỏi trước buổi gặp |
| gap.callout | Strong narrative, weak evidence | Luận điểm mạnh, bằng chứng yếu |
| degraded.banner | Written analysis is unavailable for {n} sections; results below rely on recorded scores and evidence. | Chưa dựng được phân tích văn bản cho {n} mục; kết quả dưới đây chỉ dựa trên điểm và bằng chứng đã ghi nhận. |
| liquidity.banner | Possible routes, not an exit forecast | Các con đường khả dĩ, không phải dự báo thoát vốn |
| captable.missing | No cap table on file — upload to assess | Chưa có cap table — tải lên để đánh giá |
| founder.gaps | What would most increase investor confidence | Điều gì sẽ tăng niềm tin của nhà đầu tư nhiều nhất |
| rule | Every score shows the evidence behind it | Mỗi điểm số đều kèm bằng chứng đứng sau |

Mã FTV/MPC/… chỉ xuất hiện ở mục 14 và tooltip ánh xạ.

---

## 11. Thiết kế nào ship ở phase nào

| Phase (plan §7) | UI ship |
|---|---|
| R0 | Không đổi UI |
| R1a/b | Masthead mới · 4 tile · meeting label · 02 Matrix · triptych · 03 Evidence · SignalDrawer (bản đầu: claim rows từ citations) · **DegradedBanner** · Brief PDF p.1–2 · e-mail · SectionRail/DecisionRail/MobileReportBar với 01–03 + các mục cũ |
| R2 | 05 Team · 06 Traction · 08 Moat & IP (`SignalChapter`, `MoatBreakdown`, `ClaimRow`, freshness 5 bậc, trend theo tín hiệu); 14 SVI Detail gom và đóng mặc định |
| R3 | 12 Risks (`RiskGrid`/`RiskTable`) · 13 Questions · biến thể evaluator (câu hỏi, badge đổi bằng chứng) |
| R4 | 10 Capital & Governance (`CapTableBar`, `GovernanceChecklist`) |
| R5 | 09 Liquidity (`LiquidityRoutes`, comps, blockers) |
| R6 | Cohort: 6 cột chip theo cùng thứ tự + bộ lọc (dùng lại `StatusChip`, `ConfidenceMeter` bản nhỏ) |
| R7 | 04 Business · 07 Market (bảng đối thủ) · 11 Valuation (không dùng + tornado) · 15 founder gaps · 16 Register đầy đủ · PDF Full · biến thể founder hoàn chỉnh |

Sau mỗi phase, mọi mục chưa được thiết kế lại vẫn hiển thị bằng component v3 hiện có, đặt đúng vị trí trong thứ tự mới. Trang không bao giờ có lỗ hổng hay hai phiên bản của cùng một mục.

---

## 12. Nghiệm thu thiết kế (mỗi phase)

- [ ] Thứ tự tín hiệu Team → Traction → Moat → Liquidity → Cap Table → IP đồng nhất trên matrix, rail, chương, PDF, cohort.
- [ ] Mặt trước đúng 4/6/3/3/3; không có score tín hiệu thiếu confidence; mã SVI không xuất hiện trước mục 14.
- [ ] 375/768/1280/1440: không cuộn ngang; vùng chạm ≥44 px, cách nhau ≥8 px; thanh dưới mobile không che nội dung (safe area).
- [ ] Tương phản body ≥4.5:1, nấc rỗng/viền ≥3:1; mọi trạng thái có icon + chữ.
- [ ] Keyboard: tab theo thứ tự thị giác; drawer Esc/focus trap/trả focus; skip link tới nội dung; heading không nhảy cấp.
- [ ] Degraded fixture (8/8) hiện banner + lens, không có khối rỗng; insufficient fixture không in 0.
- [ ] CLS ≈ 0 khi dữ liệu về; không animate số; reduced motion được tôn trọng.
- [ ] Print Brief 2–4 trang, Full ngắt đúng mục, không có chữ <9,5 pt; DOCX có cùng thứ tự.
- [ ] Light-template guard xanh; không có hex thô; không có font mới; không lộ nhãn nội bộ.
- [ ] Chụp so sánh trước/sau 4 band demo + showcase + 1 report degraded, lưu trong receipt của phase.
