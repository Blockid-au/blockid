# Trusted Business Report — dashboard spec cho `/analyze`

**Trạng thái:** PLAN ONLY — chưa code · **Ngày:** 2026-09-23 · **Ưu tiên:** P1
**Thuộc:** [`g30-analyze-pitchbook-parity-2026-09-23.md`](../plans/g30-analyze-pitchbook-parity-2026-09-23.md) · merge trong `SOURCE-OF-TRUTH.md` §5/§10
**Design system:** [light template v2](unicorn-template.md) — **không thêm palette/font mới**.
Token dùng nguyên: `bg-surface` `#ffffff` · `bg-surface-sunken` `#f7f8fa` · `text-primary` · `text-ink-muted`
· action navy `#1b2a5e` · secondary cyan `#0e7490` · `text-bull` `#047857` / `text-warn` `#b45309` / `text-bear` `#b91c1c`.
Primitives có sẵn: `PageHeader`, `Card`, `Table/Th/Td`, `Field`, `Section` (`components/marketing/template/ui.tsx`).

---

## 1. Nguyên tắc thiết kế (quyết định trước khi vẽ)

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| P1 | **Quy tắc 3 giây.** Nhìn một lần phải trả lời được: *đáng giá bao nhiêu · tốt hay chưa · sai ở đâu · thiếu gì.* | 4 câu trả lời đó nằm **trên màn hình đầu tiên**, không cuộn. |
| P2 | **Giống research note, không giống landing page.** | Masthead có tên công ty · sector · stage · ngày · phiên bản methodology · report id; đánh số mục 1–8; in ra là tài liệu hợp lệ. |
| P3 | **Progressive disclosure.** Không đổ 22 trang vào mặt người đọc. | Dashboard = tóm tắt có thể mở rộng; mỗi mục bung tại chỗ ra lập luận đầy đủ, không nhảy trang. |
| P4 | **Không bao giờ chỉ dùng màu.** | Mọi trạng thái = icon (Lucide) + nhãn chữ + màu. Đỏ/xanh không phải kênh thông tin duy nhất (WCAG). |
| P5 | **Pending ≠ 0.** | Chiều chưa đánh giá in `—/100` kèm lý do, không in 0, không nội suy. |
| P6 | **Thành thật là tính năng, không phải lỗi.** | Evidence confidence, claim chưa kiểm chứng, n của benchmark nằm **cạnh** con số, không giấu ở phụ lục. |
| P7 | **Số liệu dùng tabular numerals.** | `font-mono tabular-nums` cho mọi giá trị; cột số căn phải; không nhảy layout khi số đổi. |
| P8 | **Web = PDF = DOCX.** | Ranh giới zone = ranh giới ngắt trang; không có thành phần chỉ có trên web. |

---

## 2. Bố cục (desktop 1440 → mobile 375)

```
┌─ Zone 0 · MASTHEAD ────────────────────────────────────────────────┐
│ Sample SME Compliance SaaS    [ABN verified L2] [Free report 1/2]  │
│ SaaS · Seed · 23/09/2026 · Methodology 2.2.0 · RPT-8F2A            │
│                                   [Tải PDF] [Chia sẻ] [Phân tích lại]│
└────────────────────────────────────────────────────────────────────┘
┌─ Zone 1 · VERDICT BAR — câu trả lời 3 giây ────────────────────────┐
│  ĐỊNH GIÁ (pre-money)   │  SVI            │  KẾT LUẬN              │
│  A$6.0M – A$9.8M        │  74 /100        │  B · Đầu tư có điều kiện│
│  đồng thuận A$7.6M      │  Mạnh  ▲+3      │  conviction: trung bình │
│  tin cậy 85% · 5 pp     │  p50 ngành 65   │  1 điều kiện ↓          │
│                         │  (n=42)         │                        │
├────────────────────────────────────────────────────────────────────┤
│ “Doanh thu định kỳ tốt cho giai đoạn; định giá phụ thuộc 2 claim   │
│  chưa kiểm chứng.”                          — luận điểm một câu     │
└────────────────────────────────────────────────────────────────────┘
┌─ Zone 2 · SIGNAL STRIP (4 ô) ──────────────────────────────────────┐
│ Evidence 59% │ Verified L2 │ Claim chưa KC: 2 │ Dữ liệu: 13 ngày   │
└────────────────────────────────────────────────────────────────────┘
┌─ Zone 3 · TRIPTYCH — nhìn là thấy mạnh/yếu/cần lưu ý ──────────────┐
│ ✓ ĐIỂM MẠNH (3)   │ ▲ RỦI RO (3)        │ ? CẦN LÀM RÕ (2)        │
│ xanh bull          │ đỏ bear             │ hổ phách warn           │
└────────────────────────────────────────────────────────────────────┘
┌─ Zone 4 · 8 CHIỀU: thanh + dải p25–p75 + n  (có bảng thay thế)     │
┌─ Zone 5 · ĐỊNH GIÁ CHI TIẾT: phương pháp · trọng số · kịch bản     │
┌─ Zone 6 · 16 CÂU HỎI INVESTOR (accordion, 4 nhóm)                  │
┌─ Zone 7 · KẾ HOẠCH 90 NGÀY (lift ÷ effort)                         │
┌─ Zone 8 · PHỤ LỤC + EVIDENCE (mặc định đóng)                       │
```

**Grid:** `max-w-6xl`. Zone 1 = 3 cột `lg:grid-cols-3` (mobile xếp dọc, **định giá lên đầu**).
Zone 2 = 4 cột `sm:grid-cols-2 lg:grid-cols-4`. Zone 3 = 3 cột `lg:grid-cols-3`, mobile 1 cột
theo thứ tự **Rủi ro → Điểm mạnh → Cần làm rõ** (trên điện thoại người đọc cần thấy rủi ro trước).
Rail điều hướng dính bên trái từ `xl`; dưới `xl` là tab strip ngang cuộn được (`min-w-0`, `overflow-x-auto`
— lỗi tràn 375 px của hub tabs đã sửa ở v3.28.2, áp dụng đúng khuôn đó).

---

## 3. Chi tiết từng zone

### Zone 1 — Verdict bar
- **Định giá là con số lớn nhất trang** (`text-4xl font-bold tabular-nums`), khoảng giá trước, đồng thuận sau.
  Nếu chưa đủ điều kiện định giá: in **"Chưa đủ bằng chứng để định giá"** + đúng 2 việc cần làm, **không in khoảng giá mờ**.
- SVI kèm **band chữ** (Mạnh/Khá/Đang phát triển/Sớm) — không chỉ số.
- Verdict A–D: chip nền nhạt + chữ đậm + icon; kèm **luật đã kích hoạt** ở tooltip (`B:unverified`) — đây là
  điểm khác biệt chỉ ta có, nên cho nhìn thấy.
- Một câu luận điểm bên dưới, tối đa 2 dòng, không marketing.

### Zone 2 — Signal strip
4 ô, mỗi ô: icon + nhãn + giá trị + một dòng giải thích ngắn. Ô **Claim chưa kiểm chứng** bấm được →
cuộn tới danh sách; đây là CTA thêm bằng chứng chính.

### Zone 3 — Triptych (trái tim của yêu cầu "nhìn là thấy")
Mỗi thẻ tối đa **3 mục**, mỗi mục cấu trúc cố định:

```
[icon] Tiêu đề ngắn (≤ 8 từ)                    [chip: chiều · điểm]
       Một câu bằng chứng, có [ev:id] → nguồn
       ▸ mở rộng: lập luận đầy đủ · bằng chứng thuận/nghịch · điều gì làm đổi kết luận
```

- **Điểm mạnh** `text-bull` + `ArrowUpRight`.
- **Rủi ro** `text-bear` + `AlertTriangle`, kèm chip *khả năng × tác động*.
- **Cần làm rõ** `text-warn` + `HelpCircle`, mỗi mục có nút **"Thêm bằng chứng"** (44 px) trỏ đúng nơi.
- **Sửa lỗi đang có trên bản demo:** tiêu đề đậm và câu bằng chứng phải **cùng một nguồn dữ liệu**
  (hiện ghép theo chỉ số nên ra "Key-person risk on the CEO — Connect GitHub to audit the repository").
  Không hiển thị lift giống hệt nhau cho mọi rủi ro.

### Zone 4 — 8 chiều
Thanh ngang + dải p25–p75 + `n`; điểm của công ty là chấm đậm có nhãn số. Không có cohort đủ `n` →
**ẩn dải, ghi "chưa đủ công ty so sánh (n = 7)"** — không vẽ dải rỗng, không mâu thuẫn header như bản demo.
Kèm `<table>` thay thế (a11y, `aria-sort`), bấm dòng → mở chương tương ứng.

### Zone 5 — Định giá chi tiết
Bảng phương pháp: tên · áp dụng? · trọng số · thấp/đồng thuận/cao · **cách tính**. Phương pháp không áp dụng
vẫn hiển thị kèm lý do + CTA ("Cần doanh thu: kết nối Stripe/Xero"). Ba kịch bản bear/base/bull dạng thanh.
**Đổi nhãn theo plan AI routing:** `dcf_proxy` → "Bội số kỳ vọng điều chỉnh tăng trưởng",
`risk_factor_summation` → "Bội số điều chỉnh ưu đãi thuế"; bỏ chữ "đồng thuận N phương pháp" → "N phương pháp có trọng số".

### Zone 6 — 16 câu hỏi investor
Accordion 4 nhóm: **Doanh nghiệp** (Q01–Q03) · **Thị trường & cạnh tranh** (Q04–Q06) ·
**Tài chính & định giá** (Q07–Q08, Q11–Q12) · **Rủi ro & bước tiếp theo** (Q09–Q10, Q13–Q16).
Mỗi câu có chip trạng thái: `Đã trả lời` (bull) · `Một phần` (warn) · `Thiếu dữ liệu` (tertiary) ·
`Mâu thuẫn` (bear). Mở mặc định các câu `Mâu thuẫn`.

### Zone 7–8
Kế hoạch 90 ngày xếp theo lift ÷ effort (giữ nguyên logic hiện có). Phụ lục + evidence register đóng sẵn.

---

## 4. Trạng thái (states) — phần quyết định "cảm giác chất lượng"

| Trạng thái | Thiết kế |
|---|---|
| **Đang chạy** | Skeleton đúng hình dạng zone (không spinner giữa trang), **timeline theo stage + ETA thật**; các zone điền dần khi có dữ liệu, không nhảy layout (`content-jumping`). |
| **Preview trước báo cáo cuối** | Nhãn `Sơ bộ` rõ ràng trên Zone 1, kèm câu "đây là ước tính nhanh, báo cáo đầy đủ đang chạy". Không để người đọc nhầm preview với kết quả cuối. |
| **Degraded** | Nói thẳng phần nào không dựng được và vì sao; **không in báo cáo rỗng**. |
| **Thiếu bằng chứng** | Mỗi chỗ trống là một CTA cụ thể, không phải gạch ngang câm. |
| **Reduced motion** | Tôn trọng `prefers-reduced-motion`; số liệu đọc được ngay, không chờ animation. |

---

## 5. Checklist nghiệm thu thiết kế

- [ ] 375 px: không cuộn ngang ở mọi zone; tab strip cuộn được; mọi nút ≥ 44 px.
- [ ] Tương phản: body ≥ 4.5:1, tiêu đề ≥ 7:1, đường/viền ≥ 3:1; kiểm cả chip màu trạng thái.
- [ ] Mọi trạng thái có **icon + chữ**, không chỉ màu.
- [ ] Không nhãn nội bộ lọt ra ngoài (`uncited`, `cro`, `Auditor: grounded`).
- [ ] Không mâu thuẫn trong cùng trang (ví dụ "không có connector doanh thu" trong khi evidence ghi Stripe evidenced).
- [ ] Số dùng tabular numerals; cột số căn phải; không layout shift khi cập nhật.
- [ ] Bản in/PDF: ngắt trang đúng ranh giới zone, ẩn rail/nút hành động, giữ nguyên thứ tự.
- [ ] Chiều chưa đánh giá in `—`, kèm lý do; benchmark không đủ `n` thì không vẽ dải.
- [ ] Guard light-template không phát hiện lớp tối mới; không thêm palette/font ngoài token hiện có.
