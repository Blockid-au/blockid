# Investor Lens — UI/UX spec cho Trusted Business Report

**Trạng thái:** `SPEC THỊ GIÁC — PLAN ONLY, chưa code` · **Ngày:** 23/09/2026
**Phạm vi và quyết định nằm ở:** [G31 Investor Lens plan](../plans/g31-investor-lens-biz-trust-report-2026-09-23.md)
**Sửa đổi (amend):** [analyze-report-dashboard-spec.md](analyze-report-dashboard-spec.md). Zone 2 “Signal strip” được thay bằng **Investor Priority Matrix**, và Zone 3 triptych đổi nhãn (xem §2). Các phần khác của spec đó giữ nguyên.
**Kế thừa:** [TBR v3 spec](tbr-v3-investor-report-spec.md) §3 (anatomy dimension), §5 (grid/print), §6 (free/paid).
**Design system:** [unicorn-template.md](unicorn-template.md), light only. **Không thêm palette hay font.**

---

## 1. Nguyên tắc

| # | Nguyên tắc | Hệ quả |
|---|---|---|
| L1 | **60 giây, một màn hình rưỡi** | Mặt trước chỉ có 4 chỉ số · 6 tín hiệu · 3 lý do · 3 rủi ro · 3 câu hỏi. Không có mục thứ tư |
| L2 | **Điểm và tin cậy là hai đại lượng, hai hình dạng** | Score dùng **thanh đặc navy**. Confidence dùng **thước 6 nấc cyan có nhãn bậc**. Không bao giờ trộn thành một thanh |
| L3 | **Ngôn ngữ investor trước, mã SVI sau** | Hiển thị “Team, Traction, Moat, Liquidity, Cap Table, IP”. Mã FTV/TRE… chỉ xuất hiện ở tooltip ánh xạ và mục 14 |
| L4 | **Mỗi kết luận truy được tới bằng chứng trong 1 click** | Mỗi hàng, mục hoặc câu hỏi đều có liên kết mở drawer claim tại chỗ |
| L5 | **Thiếu dữ liệu là trạng thái, không phải điểm thấp** | Hiển thị xám `Insufficient evidence` + CTA. Không in 0, không suy “Watch” |
| L6 | **Research note** | Masthead, đánh số mục, provenance. In ra là tài liệu hợp lệ. Web = PDF = DOCX |
| L7 | **Màu không bao giờ là kênh duy nhất** | Icon Lucide + nhãn chữ + màu token |

## 2. Bố cục Investor view (desktop 1440, `max-w-6xl`)

```
┌─ MASTHEAD ───────────────────────────────────────────────────────────────────┐
│ TRUSTED BUSINESS REPORT                                    [PDF] [Chia sẻ] [↻] │
│ Acme Compliance Pty Ltd   B2B SaaS · Seed · NSW, AU                          │
│ Snapshot 23/09/2026 · Methodology SVI 2.2.0 · RPT-8F2A · 42 claims · 2 sources live │
├─ TOP METRICS (4 ô, grid 12: 5 · 3 · 2 · 2) ──────────────────────────────────┤
│ INDICATIVE PRE-MONEY      │ EVIDENCE CONFIDENCE │ SVI          │ VERIFICATION │
│ A$4.2M – A$8.5M           │ 82%                 │ 71 /100      │ L3           │
│ base A$6.1M · 4 methods   │ ▰▰▰▰▰▱ connected    │ Strong ▲+3   │ Financials   │
│                           │ 12 claims verified  │ index 128 ⓘ  │ attested     │
├─ MEETING LABEL ──────────────────────────────────────────────────────────────┤
│ [◉ WORTH INVESTIGATING]  “Verified recurring revenue; ownership of the core  │
│  IP and SAFE dilution need answers before a term sheet.”   · evaluators decide │
├─ 02 INVESTOR PRIORITY MATRIX ────────────────────────────────────────────────┤
│ Signal      Status          Score          Evidence            Fresh  Trend  Key evidence            │
│ Team        ✓ Strong        ████████▌ 84   ▰▰▰▰▰▱ 91%          Current  ↑   Prior exit verified     │
│ Traction    ✓ Strong        ████████  80   ▰▰▰▰▰▰ 94%          Live     ↑   Stripe + Xero ARR       │
│ Moat        ◐ Moderate      ██████▌   66   ▰▰▰▰▱▱ 68%          Current  →   Product + IP documents  │
│ Liquidity   ◌ Developing    █████     50   ▰▰▱▱▱▱ 42%          —        →   Buyer map, no comps     │
│ Cap Table   ▲ Watch         ████▌     45   ▰▰▰▰▱▱ 71%          Aging    ↓   SAFE converts to 14%    │
│ IP Depth    ✓ Strong        ████████▌ 86   ▰▰▰▰▰▱ 86%          Current  ↑   GitHub + IP assignment  │
│                                                       [Xem cách tính · ánh xạ SVI ▸]      │
├─ TRIPTYCH ───────────────────────────────────────────────────────────────────┤
│ ✓ WHY INVESTIGATE (3)     │ ▲ WHAT COULD STOP THE DEAL (3) │ ? ASK BEFORE THE MEETING (3) │
│ Repeat founder            │ Customer concentration 28%     │ 1 What supports retention?  │
│  prior exit · 2 sources ▸ │  Xero · verified ▸             │  gap: no cohort data ▸      │
│ Verified ARR A$680K       │ SAFE dilution                  │ 2 Who owns the core IP?     │
│ Proprietary dataset       │ Exit case under-evidenced      │ 3 Which milestone unlocks…  │
└──────────────────────────────────────────────────────────────────────────────┘
  Rail trái (≥xl) / tab ngang (<xl): 01 Snapshot · 02 Priorities · 03 Evidence · 04 Business ·
  05 Team · 06 Traction · 07 Market · 08 Moat & IP · 09 Liquidity · 10 Capital · 11 Valuation ·
  12 Risks · 13 Questions · 14 SVI · 15 Plan · 16 Register
```

**Chiều cao mục tiêu:** masthead + metrics + meeting label nằm trọn trong fold đầu ở 1440×900. Matrix và triptych chiếm khoảng 0,5 màn hình tiếp theo.

### 2.1 Mobile 375

```
┌ Acme Compliance · Seed ┐
│ RPT-8F2A · 23/09 [⋯]   │
├────────────────────────┤
│ A$4.2M – 8.5M          │  ← định giá luôn lên đầu
│ base 6.1M · 4 methods  │
├───────────┬────────────┤
│ Evidence  │ SVI 71     │
│ 82% ▰▰▰▰▰▱│ Strong ▲+3 │
├───────────┴────────────┤
│ Verification L3 · Fin. │
├────────────────────────┤
│ ◉ WORTH INVESTIGATING  │
├────────────────────────┤
│ ▲ STOP THE DEAL (3)    │  ← rủi ro trước điểm mạnh trên mobile
│ ✓ WHY INVESTIGATE (3)  │
│ ? ASK FIRST (3)        │
├────────────────────────┤
│ Team      ✓ Strong     │  ← matrix = thẻ; chạm để mở
│ 84 ▰▰▰▰▰▱ 91% ↑        │
│ Traction  ✓ Strong …   │
└────────────────────────┘
```

Ở 375 px: thẻ tín hiệu cao 64–72 px và cả thẻ là vùng chạm. Tab section cuộn ngang (`min-w-0 overflow-x-auto`). Không có nút nào nhỏ hơn 44 px.

## 3. Component

Đặt trong `components/tbr/v2/lens/`. Dùng primitives `Card`, `Table/Th/Td`, `Section` và `StatTile`/`Callout` của `shared.tsx`.

| Component | Mô tả | Chi tiết thị giác |
|---|---|---|
| `LensMasthead` | Danh tính + provenance rút gọn + hành động | Kicker 12 px uppercase `text-ink-muted`. Tên công ty 32 px Space Grotesk. Dòng provenance 12 px mono; click mở provenance đầy đủ (mục 16) |
| `LensMetricTile` ×4 | Valuation · Evidence · SVI · Verification | Nhãn 12 px uppercase; giá trị 48 px (valuation) hoặc 32 px (còn lại) IBM Plex Mono `tabular-nums`; một dòng phụ 14 px. Chưa định giá được thì ghi “Chưa đủ bằng chứng để định giá” + 2 CTA, không in khoảng mờ (G30 B2) |
| `MeetingLabelChip` | Band A–D với nhãn trung tính | Chip 40 px, nền nhạt theo status + chữ ink đậm + icon. Tooltip hiện luật đã kích hoạt (`B:unverified`). Câu luận điểm ≤2 dòng. Sub-line “evaluators decide” 12 px |
| `PriorityMatrix` | 6 hàng (+ESG khi trọng yếu) | `<table>` thật (a11y), hàng 52 px, zebra `bg-surface-sunken`. Cột số căn phải. Click hàng mở `SignalDrawer`. Cột “Key evidence” cắt 1 dòng + tooltip. <768 px chuyển thành danh sách thẻ |
| `ScoreBar` | Score 0–100 | Thanh 6 px, track `surface-sunken`, fill navy `#1b2a5e`, nhãn số mono bên phải. Score `null` thì hiện `—` + nhãn “chưa đánh giá”, không có track |
| `ConfidenceMeter` | 6 nấc theo thang evidence | 6 ô 10×6 px cách 2 px. Ô đầy = cyan `#0e7490`, ô rỗng = viền muted. Nhãn “94% · Transaction evidence”. `aria-label` đầy đủ. Không dùng gradient |
| `StatusChip` | 6 trạng thái (bảng §4) | Icon 14 px + chữ 13 px medium. Nền 8% màu status; viền đứt cho Insufficient |
| `FreshnessBadge` | Live/Current/Aging/Stale/Unknown | Chữ + icon (`Radio`, `Clock`, `Hourglass`, `AlertCircle`, `HelpCircle`). Stale dùng warn, các mức khác dùng muted |
| `TrendGlyph` | ↑ → ↓ | Mũi tên + chữ ẩn cho screen reader (“tăng 6 điểm từ 12/08”). Báo cáo đầu tiên thì ghi “Báo cáo đầu tiên” |
| `LensTriptych` | Why investigate / Stop the deal / Ask first | Mỗi cột ≤3 mục. Mục = tiêu đề ≤8 từ + dòng bằng chứng có footnote + ▸ mở tại chỗ. Viền trái 4 px bull/bear/warn (callout G27). Tiêu đề và bằng chứng **lấy từ cùng một object**, sửa lỗi ghép theo chỉ số (G30 D5) |
| `SignalDrawer` | Chi tiết một tín hiệu, mở tại chỗ | Sheet phải 480 px trên desktop, full-screen trên mobile. Nội dung: câu hỏi investor → verdict 1 câu → claims (bảng) → hỗ trợ/thiếu → câu hỏi sinh ra → ánh xạ SVI. Giữ vị trí cuộn; Esc đóng; focus trap |
| `ClaimRow` | Claim · giá trị · nguồn · ngày · bậc · tin cậy · freshness · trạng thái | Dạng thẻ nhỏ. Giá trị mono lớn. Nguồn là link (quyền đúng). Claim `self_declared` có chip outline “Founder stated” |
| `NarrativeGapCallout` | Score ≥70, confidence <40 | Callout warn: “Luận điểm mạnh, bằng chứng yếu — 82/100 nhưng 31% tin cậy. Cần: …” |
| `EvidenceLadder` | Mục 03 | Thang dọc 6 bậc. Mỗi bậc có số claim + thanh đếm. Bậc thấp nhất đặt dưới. Kèm dải freshness 5 ô |
| `MoatBreakdown` | 5 sub-signal moat | 5 hàng dạng mini-matrix (score + confidence riêng). Không dùng radar |
| `LiquidityRoutes` | Mục 09 | Tối đa 3 thẻ route, xếp theo khả thi: tên route · khả thi (chip) · lý do · buyer classes (chip) · comps có nguồn hoặc “chưa có”. Bên dưới là danh sách blockers (icon `Lock`). Banner cố định: “Không phải dự báo giá trị thoát vốn” |
| `CapTableBar` | Mục 10 | Thanh xếp chồng ngang 100%: Founders · ESOP · SAFE/Notes (chuyển đổi) · Investors · Khác. Hai hàng “Hiện tại” và “Sau vòng tới (giả định)”. Kèm bảng thay thế và danh sách giả định. Màu theo palette chart có sẵn trong `report-visuals/palette.ts` |
| `GovernanceChecklist` | Vesting · SHA · board · IP assignment · ESOP plan | Hàng checklist 3 trạng thái: ✓ có bằng chứng · ✗ thiếu · ? chưa rõ |
| `RiskMatrix` | Mục 12 | Lưới 3×3 severity × probability (đếm), thêm cột “Chưa xác định”. Bảng top 5 có cột Evidence riêng + mitigation + câu hỏi liên kết |
| `QuestionList` | Mục 13 | Thẻ đánh số 1–7: câu hỏi · “vì sao hỏi” · tín hiệu · nút “Yêu cầu bằng chứng” · trạng thái (evaluator: open/asked/answered) |
| `FounderGapsPanel` | Chỉ ở view founder | “3 bằng chứng làm tăng tin cậy investor nhiều nhất” + 1 hành động tác động lớn nhất, kèm CTA connector/upload. Không hứa điểm |

## 4. Hệ trạng thái

| Status | Icon | Màu (token) | Nền | Nghĩa |
|---|---|---|---|---|
| Strong | `CheckCircle2` | `text-bull` `#047857` | bull 8% | Được hỗ trợ và mạnh |
| Moderate | `CircleDot` | cyan `#0e7490` | cyan 8% | Chấp nhận được, còn điều kiện |
| Developing | `CircleDashed` | cyan outline | trong suốt | Đang hình thành, chưa là vấn đề |
| Watch | `AlertTriangle` | `text-warn` `#b45309` | warn 8% | Cần điều tra |
| Material issue | `OctagonAlert` | `text-bear` `#b91c1c` | bear 8% | Vấn đề trọng yếu |
| Insufficient evidence | `HelpCircle` | `text-ink-muted` | viền đứt | Chưa đủ bằng chứng; không phải điểm thấp |

Nhãn EN/VI: Strong/Mạnh · Moderate/Khá · Developing/Đang hình thành · Watch/Cần theo dõi · Material issue/Vấn đề trọng yếu · Insufficient evidence/Chưa đủ bằng chứng.

**Meeting labels:**

| Band | EN | VI |
|---|---|---|
| A | Strong case to investigate | Rất đáng tìm hiểu |
| B | Worth investigating | Đáng tìm hiểu |
| C | Major issues to resolve | Có vấn đề lớn cần giải quyết |
| D | Evidence incomplete | Chưa đủ bằng chứng |

## 5. Typography, khoảng cách, chuyển động

- **Font:** Space Grotesk cho tiêu đề, Inter 16/1.6 cho body, IBM Plex Mono `tabular-nums` cho mọi số, % và A$.
- **Chữ tối thiểu:** 12 px trên web; 9,5 pt trong PDF.
- **Khoảng cách:** thang 4 px. Khoảng giữa các zone 32 px (desktop) / 24 px (mobile). Padding thẻ 20–24 px. Bo góc theo template.
- **Chuyển động:** chỉ mở/đóng drawer và accordion (150–200 ms). Không animate số. Tôn trọng `prefers-reduced-motion`.
- **Trạng thái đang chạy:** skeleton đúng hình từng zone (masthead, 4 tile, 6 hàng, 3 cột). Hàng matrix điền dần, không nhảy layout. Timeline + ETA theo G30 C3.

## 6. Chart

- **Mục 02:** không dùng chart; matrix là bảng.
- **Mục 14:** bar ngang 8 dimension + dải p25–p75 (G27 §5). Radar chuyển xuống appendix phụ hoặc bỏ.
- **Mục 03:** thang evidence là “bar đếm” ngang.
- **Mục 10:** thanh xếp chồng 100% + bảng.
- **Mục 12:** lưới 3×3 (heatmap đếm) + bảng.
- **Mục 11:** range bar (low–base–high + marker ask) giữ như v3.
- **Quy tắc chung:** mọi chart có `<table>` thay thế; không vẽ benchmark khi n < 10; nhãn giá trị trực tiếp, không cần legend khi ≤2 series.

## 7. Print / PDF / DOCX

- **Bản Brief** (01, 02, 03, 12, 13) và **bản Full** (01–16) dựng từ cùng revision. A4, lề 18/16 mm, page number, footer có report ID, methodology, ngày snapshot, “General information, not financial advice”.
- **Trang 1:** masthead + metrics + meeting label + matrix. **Trang 2:** triptych + evidence ladder.
- **Tương tác không có trong bản in:** drawer in ra thành bảng claim ở mục tương ứng; link evidence là hyperlink thật; ẩn rail và nút.
- **DOCX:** 4 tile thành bảng 2×2; matrix thành bảng có header lặp; chip in bằng chữ + ký hiệu (✓ ◐ ◌ ▲ ■ ?) vì DOCX không có icon.

## 8. Microcopy chính (EN / VI)

| Key | EN | VI |
|---|---|---|
| matrix.title | Investor priorities | Ưu tiên của nhà đầu tư |
| triptych.why | Why investigate | Vì sao đáng tìm hiểu |
| triptych.stop | What could stop the deal | Điều có thể chặn thương vụ |
| triptych.ask | Ask before the meeting | Hỏi trước buổi gặp |
| gap.callout | Strong narrative, weak evidence | Luận điểm mạnh, bằng chứng yếu |
| liquidity.banner | Possible routes, not an exit forecast | Các con đường khả dĩ, không phải dự báo thoát vốn |
| captable.missing | No cap table on file — upload to assess | Chưa có cap table — tải lên để đánh giá |
| evidence.rule | Every score shows the evidence behind it | Mỗi điểm số đều kèm bằng chứng đứng sau |
| founder.gaps | What would most increase investor confidence | Điều gì sẽ tăng niềm tin của investor nhiều nhất |

## 9. Checklist nghiệm thu thiết kế

- [ ] Mặt trước đúng 4/6/3/3/3; không có thêm khối nào.
- [ ] Score và confidence dùng hai mã hoá khác nhau ở mọi nơi. Không có score tín hiệu nào đứng một mình.
- [ ] Mã FTV/TRE… không xuất hiện trước mục 14 (trừ tooltip ánh xạ).
- [ ] 375/768/1440: không cuộn ngang; mọi vùng chạm ≥44 px; tab cuộn được.
- [ ] Tương phản: body ≥4.5:1; nấc rỗng của thước confidence ≥3:1 với nền.
- [ ] Mọi trạng thái = icon + chữ + màu; Insufficient evidence có viền đứt, không phải đỏ.
- [ ] Drawer: Esc/đóng/focus trả về đúng hàng; giữ vị trí cuộn.
- [ ] Skeleton không gây layout shift (CLS ≈ 0 khi dữ liệu về).
- [ ] Print: ngắt trang theo zone; Brief 2–4 trang; không có chữ <9,5 pt.
- [ ] Light-template guard xanh; không có hex thô trong className; không thêm font.
- [ ] Không lộ nhãn nội bộ (`uncited`, `cro`, `Auditor: grounded`); không có mâu thuẫn trong cùng trang.
