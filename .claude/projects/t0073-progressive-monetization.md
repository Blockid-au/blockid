# T0073 — Progressive Monetization + Section Tier Locks

**Status:** Design → Implementation  
**Date:** 2026-06-13  
**Builder:** Autonomous Agent (from T0071-T0072 foundation)

---

## Objective

Implement progressive monetization gates so:
1. **Free report** = Hook + Validation summary (teaser to convert)
2. **Paid report** = unlock Value, Direction, Capital depth analysis
3. **Premium report** = unlimited sections + advanced features
4. UI shows clear "lock" icons + credit costs + upgrade CTAs

This converts SVI reports into a conversion funnel: free preview → trial → paid customer.

---

## Implementation Plan

### Phase 1: Report Generation Tier Logic

**File:** `web/src/lib/pdf/svi-report-pdf.tsx`

Current export signature:
```typescript
export function SVIReportPDF({
  analysis,
  startupName,
  email,
  tier = "standard",
  reportDate,
  sections,
  charts,
}: SVIReportPDFProps) { ... }
```

**Changes needed:**

1. **Tier definitions:**
   - `preview` (free): Hook + Validation summary only
   - `standard` (paid): Hook + Validation + Position + Value + Direction + Capital (full)
   - `premium` (premium): all sections + extended analysis
   - `deep_dive` (legacy): same as premium

2. **Section tier mapping** (add to REPORT_SECTIONS):
   ```typescript
   // Each section already has tier field: "free" | "included" | "paid" | "premium"
   // Progressive gates:
   // - tier="free": visible in all report tiers
   // - tier="included": visible in standard+ 
   // - tier="paid": visible only in paid/premium
   // - tier="premium": visible only in premium
   ```

3. **PDF section filtering:**
   ```typescript
   // In SVIReportPDF, filter pages by tier before rendering:
   const visibleSections = (tier === "premium" || tier === "deep_dive")
     ? sectionPages // all sections
     : tier === "standard"
       ? sectionPages.filter(s => getSectionTier(s.id) !== "premium")
       : sectionPages.filter(s => getSectionTier(s.id) === "free"); // preview only
   ```

4. **Add "Unlock" pages** (inserted after each locked section in preview):
   ```typescript
   // After Validation in preview report, insert unlock CTA:
   // "🔑 Unlock Full Analysis | Position, Value, Direction, Capital"
   // Cost: 5 credits or $29 | Link: blockid.au/workspace/upgrade
   ```

### Phase 2: Report Display UI Tier Locks

**Files:** 
- `web/src/components/svi/svi-results-panel.tsx`
- `web/src/app/workspace/reports/reports-client.tsx`
- `web/src/app/workspace/reports/[id]/saved-report-client.tsx`

**Changes:**

1. **Add tier indicator badges:**
   ```typescript
   // In report list:
   <Badge variant={tierBadgeVariant(report.tier)}>
     {report.tier === "preview" ? "Free Preview" : report.tier === "standard" ? "Standard" : "Premium"}
   </Badge>
   ```

2. **Lock indicators on sections:**
   ```typescript
   // In section display:
   {section.tier === "premium" && userTier !== "premium" && (
     <View style={{ ...lockIndicator, color: "amber" }}>
       🔑 Premium Only
     </View>
   )}
   ```

3. **Blurred content for locked sections:**
   ```typescript
   // Render locked sections with blur + CTA overlay:
   <View style={{
     filter: isLocked ? "blur(4px)" : "none",
     opacity: isLocked ? 0.5 : 1,
   }}>
     {section.content}
     {isLocked && <UnlockCTA section={section} />}
   </View>
   ```

### Phase 3: Upgrade Funnel CTAs

**Key CTAs to implement:**

| Trigger | Message | Link |
|---------|---------|------|
| View report summary | "Unlock full analysis" | `/workspace/reports/upgrade` |
| Scroll past Validation | "Continue reading (paid)" | `/workspace/reports/upgrade?section=position` |
| Try to download locked section | "Upgrade to PDF export" | `/workspace/upgrade` |
| End of free report | "Get unlimited reports" | `/workspace/subscription` |

**Files to create/update:**
- `web/src/components/svi/section-lock-cta.tsx` (new)
- `web/src/app/workspace/reports/upgrade/page.tsx` (new or update)

### Phase 4: Report Tier Cost Calculation

**File:** `web/src/lib/report-sections.ts`

Add function:
```typescript
export function calculateReportCost(sections: ReportSectionDef[], tier: "preview" | "standard" | "premium"): {
  totalCredits: number;
  pricingUSD: number;
  sections: Array<{ id: string; creditCost: number }>;
} {
  // preview: free
  // standard: sum of all "included" + "paid" sections (estimate 5-8 credits)
  // premium: unlimited (annual/monthly subscription)
}
```

### Phase 5: Analytics + Conversion Tracking

**Add events:**
- `report_viewed_tier_preview`
- `report_unlock_cta_shown`
- `report_unlock_cta_clicked`
- `section_locked_content_blur_shown`
- `report_upgraded_to_paid`

**File:** `web/src/lib/analytics.ts`

---

## Section Visibility Matrix

| Section | Preview | Standard | Premium | Notes |
|---------|---------|----------|---------|-------|
| Hook | ✅ | ✅ | ✅ | Free teaser |
| Validation | ✅ Summary | ✅ Full | ✅ Full | Shows problem |
| **Unlock CTA** | 🔑 | — | — | "Get Position, Value, Direction, Capital" |
| Position | ❌ | ✅ | ✅ | Index + Stage + Top X% |
| Value | ❌ | ✅ | ✅ | Valuation + drivers |
| Direction | ❌ | ✅ | ✅ | Next 3 actions (Google Maps) |
| Capital | ❌ | ✅ | ✅ | Funding readiness |
| Risk | ❌ | ✅ | ✅ | Risk assessment |
| Sections 4-9 | ❌ | ✅ | ✅ | Supporting depth |
| Competitive | ❌ | ❌ | ✅ | Paid-only |
| Board Summary | ❌ | ❌ | ✅ | Premium-only |
| AU Market | ❌ | ❌ | ✅ | Premium-only |

---

## Success Criteria

✅ **Preview reports:**
- Show Hook + Validation (problem framing)
- Clear "Unlock" CTA with pricing
- PDF renders correctly (2 pages max)

✅ **Standard/Paid reports:**
- All 5 SCN layers visible (Validation → Position → Value → Direction → Capital)
- CTAs route to correct BlockID features
- No blur/lock indicators

✅ **Premium reports:**
- All sections including advanced analyses
- Extended insights on competitors, data strategy, security

✅ **Analytics:**
- Track unlock CTA impressions & clicks
- Measure preview → paid conversion rate
- Monitor which sections drive upgrades

✅ **UI/UX:**
- Lock indicators are clear + not annoying
- Upgrade paths are obvious (1-click from preview)
- Mobile-responsive unlock CTAs

---

## Files Checklist

- [ ] `web/src/lib/pdf/svi-report-pdf.tsx` — Add tier filtering
- [ ] `web/src/lib/report-sections.ts` — Add calculateReportCost()
- [ ] `web/src/components/svi/section-lock-cta.tsx` — New component
- [ ] `web/src/app/workspace/reports/reports-client.tsx` — Tier badges + unlock flow
- [ ] `web/src/app/workspace/reports/[id]/saved-report-client.tsx` — Lock indicators
- [ ] `web/src/lib/analytics.ts` — Add conversion events
- [ ] `web/src/app/workspace/reports/upgrade/page.tsx` — Upgrade funnel page

---

## Notes for Next Builder

1. **Start with Phase 1** — get PDF filtering working first
2. **Test with real report** — generate preview, standard, premium PDFs side-by-side
3. **Progressive disclosure** — don't show all 5 CTAs at once; one per section
4. **Mobile-first** — upgrade CTAs must work on small screens
5. **A/B test messaging** — "Unlock" vs "Upgrade" vs "Get" — measure which converts best

---

## Related Tasks

- T0071: SCN Report Redesign ✅
- T0072: PDF Hook Page + CTAs ✅
- **T0073: Progressive Monetization** ← you are here
- T0074: Dashboard Integration (future)
- T0075: Subscription + Credits System (future)

