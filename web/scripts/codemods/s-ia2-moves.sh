#!/usr/bin/env bash
# G13-W2-IA2 — one-shot `git mv` of founder pages into their hub tab paths
# (spec docs/plans/investor-clarity-2026-09-15/11-pm-ia-post-login.md §A.1).
# Idempotency is not attempted: run once from the repo root of the worktree.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/web/src/app/(app)/(founder)"
mv_dir() { mkdir -p "$(dirname "$2")"; git mv "$1" "$2"; echo "moved $1 -> $2"; }
mv_files() { # src_dir dest_dir : move every top-level file
  mkdir -p "$2"; for f in "$1"/*; do [ -f "$f" ] && git mv "$f" "$2/$(basename "$f")"; done; rmdir "$1" 2>/dev/null || true; echo "moved files $1 -> $2"; }

# Score
mv_files dashboard/svi workspace/score
mv_dir dashboard/history workspace/score/history
mv_dir workspace/svi-trend workspace/score/trend
mv_dir dashboard/benchmark workspace/score/benchmark
mv_dir workspace/listings/new workspace/score/listing
rmdir workspace/listings 2>/dev/null || true
# Evidence
mv_dir workspace/svi-evidence workspace/evidence/gaps
mv_dir workspace/integrations workspace/evidence/connectors
mv_dir workspace/metrics workspace/evidence/metrics
# Plan
mv_dir workspace/roadmap workspace/plan
mv_dir workspace/guide workspace/plan/guide
mv_dir workspace/journal workspace/plan/journal
# Reports
mkdir -p workspace/reports/weekly
git mv workspace/reports/page.tsx workspace/reports/weekly/page.tsx
git mv workspace/reports/reports-client.tsx workspace/reports/weekly/reports-client.tsx
mv_dir workspace/business-report workspace/reports/business
mv_dir workspace/investor-pack workspace/reports/investor-pack
mv_dir dashboard/c-level-reports workspace/reports/c-level
mv_dir dashboard/reports/order workspace/reports/order
git rm -q dashboard/reports/page.tsx
# Investors
mkdir -p workspace/investors/pipeline
for f in page.tsx page.test.tsx investors-client.tsx investors-client.test.tsx; do git mv "workspace/investors/$f" "workspace/investors/pipeline/$f"; done
mv_dir dashboard/investor-links workspace/investors/access
# Valuation
mv_dir dashboard/valuation workspace/valuation
mv_dir dashboard/cfo workspace/valuation/cfo
mv_dir workspace/financial-forecast workspace/valuation/forecast
# Raise
mv_dir dashboard/fundraise workspace/raise
mv_dir workspace/fundraise workspace/raise/round
mv_dir workspace/pitchdeck-analyze workspace/raise/deck
mv_dir workspace/term-sheet workspace/raise/term-sheet
# Accelerators
mv_dir dashboard/accelerator workspace/accelerators
mv_dir dashboard/accelerator-criteria workspace/accelerators/criteria
# Finance
mv_dir dashboard/finance workspace/finance
mv_dir workspace/revenue workspace/finance/revenue
mv_dir workspace/expenses workspace/finance/expenses
mv_dir workspace/tax-invoice-checker workspace/finance/invoices
mv_dir workspace/dividends workspace/finance/dividends
# Equity
mv_dir workspace/equity-setup workspace/equity/setup
mv_dir workspace/cap-table workspace/equity/cap-table
mv_dir workspace/shareholders workspace/equity/shareholders
mv_dir workspace/secondary-offer workspace/equity/secondary
mv_dir workspace/wallet workspace/equity/on-chain
# ESOP
mv_dir workspace/vesting workspace/esop/vesting
mv_dir workspace/equity-esop workspace/esop/manage
mv_dir workspace/equity-offer workspace/esop/offers
# Team
mv_dir dashboard/team workspace/team/salaries
# Strategy
mv_dir dashboard/market-size workspace/strategy
mv_dir workspace/competitors workspace/strategy/competitors
mv_dir workspace/tech-analysis workspace/strategy/tech
mv_dir workspace/gtm-strategy workspace/strategy/gtm
mv_dir workspace/pricing-tiers workspace/strategy/pricing
mv_dir workspace/roadmap-builder workspace/strategy/roadmap
# Documents
mv_dir workspace/data-room workspace/documents/data-room
mv_dir dashboard/compliance workspace/documents/compliance
# Exit
mv_dir workspace/exit-strategy workspace/exit/strategy
mv_dir dashboard/exit-readiness workspace/exit/benchmark
mv_dir workspace/listing-readiness workspace/exit/listing
mv_dir workspace/clean-room workspace/exit/clean-room
# Projects
mv_dir dashboard/portfolio workspace/projects/compare
# Settings
mv_dir workspace/profile workspace/settings/profile
mv_dir workspace/founder-profile workspace/settings/founder
mv_dir workspace/notifications workspace/settings/notifications
mv_dir workspace/referrals workspace/settings/referrals
mv_dir workspace/feedback workspace/settings/feedback
mv_dir workspace/branding workspace/settings/enterprise
mv_dir workspace/audit-log workspace/settings/audit
# Evaluator
mv_dir workspace/applications workspace/accelerator/applications
echo ALL DONE
