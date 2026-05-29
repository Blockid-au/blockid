# Goal: Feedback-for-Credits System

## Vision
Users earn credits by giving useful feedback. AI Agent R&D evaluates feedback quality and auto-rewards credits. This creates a virtuous cycle: users get free analysis, platform gets actionable improvements, retention increases.

## Flow
1. User runs out of credits → CTA appears: "Earn free credits by sharing feedback"
2. User submits feedback (min 10 chars, max 2000)
3. AI R&D Agent evaluates: specificity (0-10), actionability (0-10), value (0-10)
4. If score >= 15/30: award 0.25-1.00 credits instantly
5. Feedback saved to user_feedback table for R&D review
6. R&D agent daily routine reads new feedback → proposes improvements
7. If feedback leads to a feature → user gets bonus notification

## CTA Placement
- Credit gate modal: "Out of credits? Share feedback to earn more!"
- Dashboard sidebar: "💬 Feedback (earn credits)" link
- After analysis results: "Help us improve — earn credits"
- Pricing page: "Earn credits by sharing your thoughts"

## Agent Integration
- RnD daily routine: read new feedback, flag high-value items
- CEO weekly: count feedback submissions, reward rate, implementation rate
- CPO: track which feedback categories are most common (feature > bug > UX)

## Success Metrics
- 20% of users submit at least 1 feedback
- Average 0.50 credits rewarded per feedback
- 30% of implemented features originate from user feedback