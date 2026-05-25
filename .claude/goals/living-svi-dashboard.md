# Living SVI Dashboard — Giữ Khách Bằng Chất Lượng

## Vision
Biến "My SVI Score" từ trang tĩnh → **living dashboard** nơi user:
1. Thấy TOÀN BỘ lịch sử phân tích (mọi lần analyze, unlock, email)
2. Nhận THÔNG TIN MỚI liên quan 80% đến idea của họ (đối thủ, tin tức, trends)
3. Được KHUYẾN KHÍCH bổ sung chiến lược để tăng SVI
4. Có ACTION ITEMS rõ ràng (upload evidence, connect data, update strategy)
5. Link trực tiếp đến documents đã share, reports đã generate

## Retention Loop
```
User login → My SVI Score (living dashboard)
   │
   ├── 📊 Current SVI + trend chart (lịch sử mọi lần phân tích)
   │
   ├── 📋 Analysis History (mọi lần phân tích chi tiết)
   │   ├── Lần 1: SVI 35 — Idea phase (24 May)
   │   ├── Lần 2: SVI 42 — Added evidence (25 May) [+7]
   │   └── Lần 3: SVI 58 — Updated strategy (26 May) [+16]
   │
   ├── 📄 Saved Reports (sections đã unlock)
   │   ├── Executive Summary ✓ (441 words)
   │   ├── Market Analysis ✓ (1,200 words)
   │   └── Competitive Intel 🔒 [Unlock 0.75cr]
   │
   ├── 🔔 Smart Notifications (news liên quan startup)
   │   ├── "Competitor X raised $5M — see how you compare"
   │   ├── "New AU grant for AI startups — check eligibility"
   │   └── "Your SVI hasn't updated in 7 days — add evidence"
   │
   ├── 📈 Improvement Suggestions (AI-powered)
   │   ├── "Upload pitch deck to add +8 SVI points"
   │   ├── "Connect GitHub repo for tech score boost"
   │   └── "Add customer testimonials for traction evidence"
   │
   ├── 📧 Email History (emails sent from system)
   │   ├── Welcome email (24 May)
   │   ├── SVI Report sent (25 May)
   │   └── Weekly insight (next Monday)
   │
   └── 🔗 Shared Links & Documents
       ├── Share link: /s/zprZHoUCJx2o (12 views)
       ├── Investor link: sent to VC@fund.com (opened 3x)
       └── PDF report: downloaded 2x
```

---

## Sub-Goals (Implementation Order)

### Goal 1: Analysis Timeline (P0)
Show ALL past analyses chronologically with SVI delta.
- Query `svi_analyses` by user email, ordered by date
- Show each: SVI score, date, delta from previous, input snippet
- Click → expand to see full results OR link to /workspace/reports/[id]
- **File**: Modify `/dashboard/svi/page.tsx` + new `AnalysisTimeline` component

### Goal 2: Saved Report Sections Inline (P0)
Show unlocked report sections directly in dashboard (not just link).
- Query `report_sections` for latest analysis
- Render summaries inline with "Read full" CTA
- Show locked sections with unlock buttons
- **File**: Add to `/dashboard/svi/page.tsx`

### Goal 3: Smart Notifications (P1)
AI-generated insights based on user's startup data.
- Competitor alerts (based on industry + stage)
- Australian grants/programs relevant to their sector
- SVI improvement tips based on current gaps
- "Your SVI hasn't been updated in X days" nudges
- **File**: New `SmartNotifications` component + `/api/svi/notifications`

### Goal 4: Improvement Action Cards (P1)
Specific actions to increase SVI score.
- Based on `evidenceGaps` from analysis_json
- Each card: title, expected impact (+X SVI), CTA (upload/connect/update)
- Progress tracking: done/pending
- **File**: New `ImprovementActions` component, uses existing `svi-actions.ts`

### Goal 5: Email/Activity History (P2)
Show all system interactions (emails sent, reports generated, shares).
- Query `svi_notifications`, `credit_transactions`, `score_views`
- Timeline format: "25 May — SVI Report emailed to you"
- **File**: New `ActivityFeed` component

### Goal 6: Shared Links Dashboard (P2)
Show all share links + investor links + view counts.
- Query `scores`, `investor_links`, `score_views`
- Show: URL, created date, view count, last viewed
- **File**: New `SharedLinks` component

---

## UI/UX Design

### Layout: Tabbed Dashboard

```
┌──────────────────────────────────────────────────────────┐
│ My SVI Score                                     [72/200] │
│ ▼ +7 from last analysis · Updated 2h ago                  │
│                                                           │
│ [Overview] [Reports] [Actions] [History] [Notifications]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ TAB: Overview                                             │
│ ┌─────────────────┐ ┌─────────────────┐                  │
│ │ SVI Trend Chart │ │ Stage Progress  │                  │
│ │ (30-day line)   │ │ Idea → MVP → .. │                  │
│ └─────────────────┘ └─────────────────┘                  │
│                                                           │
│ 🔔 2 New Insights                                        │
│ ├── "Competitor FreshBooks raised $10M in AU market"     │
│ └── "Upload your pitch deck to gain +12 SVI points"     │
│                                                           │
│ 📊 Quick Stats                                           │
│ ├── 3 analyses run · 2 reports unlocked                  │
│ ├── 1 share link (5 views) · 1 investor link             │
│ └── Credits: 1,145.2 remaining                           │
│                                                           │
│ TAB: Reports                                              │
│ ├── Analysis #3 (SVI 58) — 26 May 2026                  │
│ │   ├── Executive Summary ✓                              │
│ │   ├── Market Analysis ✓                                │
│ │   ├── Competitive Intel 🔒 [Unlock 0.75cr]            │
│ │   └── [View Full Report →]                             │
│ ├── Analysis #2 (SVI 42) — 25 May 2026                  │
│ └── Analysis #1 (SVI 35) — 24 May 2026                  │
│                                                           │
│ TAB: Actions                                              │
│ ├── ⬆️ Upload Pitch Deck (+8-15 SVI) [Upload]           │
│ ├── 🔗 Connect GitHub Repo (+5-10 SVI) [Connect]        │
│ ├── 📝 Add Customer Testimonials (+3-8 SVI) [Add]       │
│ └── 📊 Update Financial Metrics (+5-12 SVI) [Update]    │
│                                                           │
│ [Run New Analysis →] [Upgrade to Growth →]                │
└──────────────────────────────────────────────────────────┘
```