# CRO Sub-Goal: Vesting & Share Structure — Conversion & Monetization

## Parent Goal
`goals/vesting-share-structure.md`

## Mission
Maximize adoption of the vesting system and AI equity features through optimized conversion funnels, strategic CTAs, and data-driven pricing experiments.

---

## Conversion Funnel Design

### Primary Funnel: Free Tool → Vesting Setup → AI Upsell
```
Entry Points:
  → /tools/equity-split (free tool, SEO traffic)
  → /workspace/shareholders (existing cap table users)
  → /workspace/equity (existing team equity users)
  → SVI report CGH gap: "Set up vesting to improve your score"
        ↓
Step 1: Start Equity Setup Wizard (free)
  Metric: wizard_started
        ↓
Step 2: Complete Wizard Step 2 (add stakeholders)
  Metric: stakeholders_added
        ↓
Step 3: Hit AI Suggest CTA
  Metric: ai_suggest_clicked
        ↓
Step 4: Purchase/Spend Credits on AI
  Metric: ai_equity_credits_spent
        ↓
Step 5: Accept AI Recommendation
  Metric: ai_recommendation_accepted
        ↓
Step 6: Complete Full Setup
  Metric: vesting_setup_completed
```

### Expected Conversion Rates (targets)
| Step | Target Rate | Industry Benchmark |
|------|------------|-------------------|
| Entry → Wizard Start | 40% | 30-50% for free tools |
| Wizard Start → Step 2 | 80% | 70-85% for wizards |
| Step 2 → AI Click | 35% | 20-40% for upsell CTAs |
| AI Click → Credit Spend | 60% | 50-70% with credit balance |
| Credit Spend → Accept | 70% | 60-80% for AI suggestions |
| Accept → Complete Setup | 90% | 85-95% after commitment |

### Overall: Entry → Complete Setup
- Without AI: 40% × 80% × 90% = **29%**
- With AI path: 40% × 80% × 35% × 60% × 70% × 90% = **4.2%** (but higher value)

---

## CTA Optimization

### "AI Suggest" Button Variants (A/B test)
| Variant | Copy | Design |
|---------|------|--------|
| A (control) | "Let AI suggest" | Text button, subtle |
| B (value-first) | "AI suggests optimal split (1 credit)" | Button with sparkle icon |
| C (social proof) | "AI Suggest — used by 200+ AU founders" | Button with counter |
| D (urgency) | "Get AI split analysis before your next meeting" | Contextual |

### CGH Score Improvement CTA
In SVI report, when CGH is low:
```
"Your Cap Table & Governance score is 45/100.
 Quick win: Set up vesting schedules → +15 points instantly.
 [Set Up Vesting Now →]"
```

### Post-Setup Upsell
After free setup completes:
```
"Your vesting is configured. Want to validate it's optimal?
 [AI Comprehensive Review — 1.50 credits] →"
```

---

## Pricing Experiments

### Experiment 1: Entry Price Point
- **Hypothesis**: Lower ai_equity_split price increases adoption without hurting revenue
- **Variants**: 0.75 / 1.00 / 1.25 credits
- **Success metric**: Revenue per user (not just conversion rate)
- **Duration**: 2 weeks per variant, 100 users minimum

### Experiment 2: Bundle Discount
- **Hypothesis**: "Full Equity Pack" bundle increases total spend per user
- **Offer**: All 5 AI features for 3.00 credits (vs 4.25 à la carte)
- **Display**: After first AI feature purchased, offer bundle for remaining
- **Success metric**: Average credits spent on equity features per user

### Experiment 3: First-Free Hook
- **Hypothesis**: Free first AI equity call converts more users to paid
- **Offer**: First ai_equity_split free (no credit cost) for new accounts
- **Success metric**: % who return for second paid AI call within 7 days
- **Risk**: Attracts low-intent users → monitor quality of second conversion

### Experiment 4: Credit Threshold Prompt
- **Hypothesis**: Prompting credit purchase at the moment of need converts better
- **Trigger**: User clicks "AI Suggest" with 0 balance
- **Show**: "Get 5 credits for A$5 — includes this AI suggestion + 4 more"
- **Success metric**: Credit purchase conversion at point-of-need vs pre-purchase

---

## Analytics Events to Implement

### New Events (add to existing analytics system)
```typescript
// Wizard funnel
track("equity_wizard_started", { source })
track("equity_wizard_step_completed", { step, stakeholders_count })
track("equity_wizard_completed", { mode, ai_used, total_members })
track("equity_wizard_abandoned", { step, time_spent_seconds })

// AI features
track("ai_equity_suggest_clicked", { feature, has_credits })
track("ai_equity_suggest_completed", { feature, credits_spent, accepted })
track("ai_equity_suggest_dismissed", { feature, reason })

// Vesting engagement
track("vesting_schedule_created", { role, months, cliff, ai_suggested })
track("vesting_dashboard_viewed", { schedules_count })
track("vesting_accelerated", { trigger_type })

// Revenue
track("vesting_credits_spent", { feature, amount, cumulative_total })
```

---

## Retention Strategy

### Re-engagement Triggers
| Trigger | Action | Channel |
|---------|--------|---------|
| Vesting setup started but not completed (>24h) | "Finish your equity setup" nudge | In-app + email |
| SVI improved by >10 points | "Your valuation changed — review share price" | In-app |
| New team member added | "Set up vesting for {name}?" | In-app |
| Cliff date approaching (7 days) | "Cliff release in 7 days for {name}" | Email |
| Monthly vest occurred | "Monthly vesting update" | Email digest |
| 30 days since last AI call | "Your equity structure may need updating" | Email |

### Monthly Vesting Digest Email
```
Subject: "May Vesting Update: 52,083 shares vested this month"

Body:
- Shares vested this month (per holder)
- Current share price (based on SVI)
- Total vested value (AUD)
- CTA: "Review your cap table" or "Get AI review (1.50 credits)"
```

---

## Partnership Revenue Opportunity

### Accountant/Lawyer Referral Program
- When AI suggests "Get a shareholders agreement drafted":
  - Partner referral to AU startup lawyers (e.g., LegalVision, Sprintlaw)
  - Revenue: A$50-100 referral fee per engagement
  - Track: `partner_referral_clicked`, `partner_referral_converted`

### Accelerator Integration
- Accelerator programs require cap table + vesting as part of due diligence
- Partner with AU accelerators to offer BlockID as recommended platform
- Revenue: Volume credits deal (e.g., 1000 credits for the cohort at bulk rate)

---

## Skills Used
- `/cro` — Conversion optimization, funnel design
- `/analytics` — Event tracking, metric dashboards
- `/cmo` — Email campaigns, re-engagement

## Success Metrics
- [ ] Entry → wizard start conversion >40%
- [ ] AI suggest click-through >35% of wizard users
- [ ] AI recommendation acceptance >60%
- [ ] Average credits spent on vesting features >A$2.75 per active startup
- [ ] Monthly vesting digest email open rate >35%
- [ ] Bundle pricing increases avg revenue per user by >20%
- [ ] Re-engagement emails bring back >15% of inactive users