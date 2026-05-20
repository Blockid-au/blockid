---
name: analytics
description: "Check BlockID analytics — GA4 events, growth metrics, funnel data, user behavior. Use when user says 'analytics', 'metrics', 'traffic', 'conversions', or 'funnel'."
---

# Analytics Dashboard — BlockID.au

## Quick Commands

### Live Growth Metrics
```bash
CRON_SECRET=$(grep 'CRON_SECRET=' web/.env | head -1 | cut -d= -f2)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/growth-insights | python3 -m json.tool
```

### Check GA4/GTM Status
```bash
curl -s https://blockid.au/ | grep -o "googletagmanager.com[^\"]*" | head -3
```

### Test All Endpoints
Use `/qa` skill for full endpoint testing.

## What to Analyze

1. **Funnel**: Visitors → SVI → Signup → Evidence → Paid
2. **Drop-offs**: Where users leave (biggest_drop_off metric)
3. **Conversion rates**: signup_rate, payment_rate
4. **Content**: Which insights articles drive traffic
5. **Email**: Open rates from svi_notifications table
6. **AI recommendations**: Check growth_insights.recommendations

## Actions Based on Data

- High drop-off at SVI → Signup: Improve signup CTA, add social proof
- Low evidence uploads: Add prompts, simplify upload flow
- Low email opens: Test subject lines, improve content
- Low tool usage: Feature discovery emails, in-app prompts