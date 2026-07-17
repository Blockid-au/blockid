---
title: "LinkedIn adaptations — 2026-07 launch"
date: 2026-07-17
version: v2.0.0-beta.5
notes: "Three variants. No emoji. One CTA each."
---

## Post 1 — Founder

We shipped the BlockID v2.0 beta today. If you are an Australian founder and you have been putting off the "is my company actually investor-ready" conversation, this is the version to try.

The 7-day trial now sits behind a segment-aware pricing surface — you pick founder, and you get the tools that a founder actually uses: a valuation walk-through, an investor-ready score, a cap table you can show a lawyer without apologising, and a data room that stamps every export with the disclaimer wording the reader actually saw. No credit card gymnastics, no five-week onboarding call.

We rebuilt the pricing surface after a run of investor conversations kept surfacing the same three asks — let me try before I pay, one price does not fit four buyer types, prove the audit trail before you talk about digital shares. v2 answers all three. Terms and Privacy v2 shipped in the same release with ACL non-excludable guarantees, APPs 1–13, and NSW jurisdiction spelled out plainly.

Seven days. No card required to look around.

**Try the 7-day trial:** blockid.au/pricing

---

## Post 2 — Investor

BlockID.au shipped v2.0 beta today. The reason this release matters to investors — angels, syndicates, and early-stage funds looking at Australian pipeline — is that the investor workspace is now its own product surface, not a re-skin of the founder view.

You get a filterable dealflow table, a watchlist with notes, and a weekly digest timeline. All three are scoped to the investor SKU, so the metrics you see are the metrics you asked for, not the ones a founder wants to show you. On the operating side, we shipped a CFO admin dashboard that reports net revenue over the last 30 days, GST accrual, active and trialing subscriptions, trial-to-paid conversion, and churn events pulled from the save-offer flow. In v2.0.0-beta.5 we dropped a runway tile that was returning a nonsense number — we would rather show four honest tiles than five confident ones.

If you want to see the funnel and admin telemetry that sits under the SKU, we are running walk-throughs this fortnight.

**Book a funnel dashboard demo:** blockid.au/investor-demo

---

## Post 3 — Builder

For anyone building on a regulated Australian product surface — a note on how we shipped Phase 3 and Phase 4 of BlockID.au in the wall-clock time of a working day.

Two things that carried the load. First, a `disclaimer_registry` migration that seeds 10 canonical disclaimers × AU/GLOBAL, each with a sha256 hash of its body. Downstream PDF and DOCX exports stamp that hash into the footer, so consent chain becomes a record instead of a promise. Migration `0080` shipped with `ON CONFLICT DO NOTHING` after we caught that `DO UPDATE` would silently mutate stored hashes on a repeat run — worth flagging if you are building anything consent-adjacent.

Second, parallel-agent orchestration on strictly disjoint file-write domains. Four workstreams — legal, investor, advisor + accelerator, QA + Stripe — ran concurrently because their write scopes did not overlap. Every agent's output was committed and pushed before the next was dispatched, which survived our autonomous git-reset loop cleanly.

We wrote up the audit-chain runbook that goes with the disclaimer registry — happy to share with anyone shipping ACL-adjacent products.

**Read the audit-trail post:** blockid.au/insights/audit-chain-runbook
