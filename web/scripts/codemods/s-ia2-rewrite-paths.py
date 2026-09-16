#!/usr/bin/env python3
"""G13-W2-IA2 — rewrite literal legacy route strings to their hub-tab paths.

Boundary-aware: an entry matches only when the next character is not part
of a path (`[A-Za-z0-9_-]`) and — unless `sub` is set — not `/` either, so
`/workspace/equity` never touches `/workspace/equity-setup` and
`/dashboard/reports` never touches `/dashboard/reports/lp-quarterly`.
Longest sources are applied first. Run once from the repo root:

    python3 web/scripts/codemods/s-ia2-rewrite-paths.py [--dry-run]
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

# (old, new, sub) — sub=True rewrites nested paths too (`old/anything`).
MAP = [
    # Score
    ("/dashboard/svi", "/workspace/score", False),
    ("/dashboard/history", "/workspace/score/history", True),
    ("/workspace/analyses", "/workspace/score/history", False),
    ("/workspace/svi-trend", "/workspace/score/trend", False),
    ("/dashboard/benchmark", "/workspace/score/benchmark", False),
    ("/workspace/svi-benchmarks", "/workspace/score/benchmark", False),
    ("/workspace/listings/new", "/workspace/score/listing", False),
    # Evidence
    ("/workspace/svi-evidence", "/workspace/evidence/gaps", False),
    ("/workspace/integrations", "/workspace/evidence/connectors", True),
    ("/dashboard/integrations", "/workspace/evidence/connectors", True),
    ("/workspace/metrics", "/workspace/evidence/metrics", False),
    # Plan
    ("/workspace/roadmap-builder", "/workspace/strategy/roadmap", False),
    ("/workspace/roadmap", "/workspace/plan", False),
    ("/workspace/guide", "/workspace/plan/guide", True),
    ("/workspace/journal", "/workspace/plan/journal", False),
    # Reports
    ("/workspace/business-report", "/workspace/reports/business", True),
    ("/workspace/investor-pack", "/workspace/reports/investor-pack", True),
    ("/dashboard/reports/order", "/workspace/reports/order", False),
    ("/dashboard/reports", "/workspace/reports", False),
    ("/dashboard/c-level-reports", "/workspace/reports/c-level", True),
    # Investors
    ("/dashboard/investor-links", "/workspace/investors/access", True),
    ("/dashboard/data-room", "/workspace/investors/access", False),
    ("/dashboard/advisor", "/workspace/investors/access", False),
    ("/dashboard/mentor-invite", "/workspace/investors/access", False),
    ("/dashboard/settings/mentor-access", "/workspace/investors/access", False),
    # Valuation
    ("/dashboard/valuation", "/workspace/valuation", False),
    ("/dashboard/cfo", "/workspace/valuation/cfo", False),
    ("/workspace/financial-forecast", "/workspace/valuation/forecast", True),
    # Raise
    ("/dashboard/fundraise", "/workspace/raise", False),
    ("/workspace/fundraise", "/workspace/raise/round", True),
    ("/workspace/pitchdeck-analyze", "/workspace/raise/deck", False),
    ("/workspace/term-sheet", "/workspace/raise/term-sheet", False),
    # Accelerators
    ("/dashboard/accelerator-criteria", "/workspace/accelerators/criteria", False),
    ("/dashboard/accelerator", "/workspace/accelerators", False),
    # Finance
    ("/dashboard/finance", "/workspace/finance", False),
    ("/workspace/revenue", "/workspace/finance/revenue", False),
    ("/workspace/expenses", "/workspace/finance/expenses", False),
    ("/workspace/tax-invoice-checker", "/workspace/finance/invoices", False),
    ("/workspace/dividends", "/workspace/finance/dividends", False),
    # Equity
    ("/workspace/equity-setup", "/workspace/equity/setup", False),
    ("/workspace/cap-table", "/workspace/equity/cap-table", False),
    ("/workspace/shareholders", "/workspace/equity/shareholders", False),
    ("/workspace/secondary-offer", "/workspace/equity/secondary", False),
    ("/workspace/wallet", "/workspace/equity/on-chain", False),
    ("/workspace/equity-dashboard", "/workspace/equity/on-chain", False),
    # ESOP
    ("/workspace/vesting", "/workspace/esop/vesting", False),
    ("/workspace/equity-esop", "/workspace/esop/manage", False),
    ("/dashboard/esop", "/workspace/esop/manage", False),
    ("/workspace/equity-offer", "/workspace/esop/offers", True),
    # Team
    ("/dashboard/team", "/workspace/team/salaries", False),
    # Strategy
    ("/dashboard/market-size", "/workspace/strategy", False),
    ("/workspace/competitors", "/workspace/strategy/competitors", False),
    ("/workspace/competitive-positioning", "/workspace/strategy/competitors", False),
    ("/workspace/tech-analysis", "/workspace/strategy/tech", False),
    ("/dashboard/analyzer", "/workspace/strategy/tech", False),
    ("/workspace/gtm-strategy", "/workspace/strategy/gtm", False),
    ("/workspace/pricing-tiers", "/workspace/strategy/pricing", False),
    # Documents
    ("/workspace/data-room", "/workspace/documents/data-room", False),
    ("/dashboard/compliance", "/workspace/documents/compliance", False),
    ("/compliance/calendar", "/workspace/documents/compliance", False),
    ("/workspace/esic-assessment", "/workspace/documents/compliance", False),
    # Exit
    ("/workspace/exit-strategy", "/workspace/exit/strategy", True),
    ("/dashboard/exit-readiness", "/workspace/exit/benchmark", False),
    ("/workspace/listing-readiness", "/workspace/exit/listing", False),
    ("/workspace/clean-room", "/workspace/exit/clean-room", False),
    # Projects
    ("/dashboard/portfolio", "/workspace/projects/compare", False),
    # Settings
    ("/workspace/profile", "/workspace/settings/profile", False),
    ("/workspace/founder-profile", "/workspace/settings/founder", False),
    ("/workspace/notifications", "/workspace/settings/notifications", True),
    ("/workspace/referrals", "/workspace/settings/referrals", False),
    ("/workspace/feedback", "/workspace/settings/feedback", False),
    ("/workspace/branding", "/workspace/settings/enterprise", False),
    ("/workspace/api-keys", "/workspace/settings/enterprise", False),
    ("/workspace/sso", "/workspace/settings/enterprise", False),
    ("/workspace/white-label", "/workspace/settings/enterprise", False),
    ("/workspace/svi-api", "/workspace/settings/enterprise", False),
    ("/workspace/audit-log", "/workspace/settings/audit", False),
    # Evaluator
    ("/workspace/applications", "/workspace/accelerator/applications", False),
]

SCAN = [
    "web/src",
    "web/tests",
    "web/scripts",
    "web/content/insights",
    "web/content/product",
    "web/content/tours",
    "web/content/showcase",
    "scripts",
]
EXTS = {".ts", ".tsx", ".mts", ".mjs", ".js", ".json", ".md", ".sh", ".yml", ".yaml", ".html", ".txt", ".csv"}
SKIP_DIRS = {"node_modules", ".next", "dist", "build", "coverage"}
SKIP_FILES = {
    # The redirect table + this codemod keep the OLD strings on purpose.
    "web/src/lib/nav/legacy-redirects.ts",
    "web/src/lib/nav/legacy-redirects.test.ts",
    "web/scripts/codemods/s-ia2-rewrite-paths.py",
    "web/scripts/codemods/s-ia2-moves.sh",
    # OLD_HREFS fixture (pre-v4 catalogue snapshot) must stay verbatim.
    "web/src/components/workspace/nav-groups.test.ts",
}

MAP.sort(key=lambda m: -len(m[0]))
PATTERNS = []
for old, new, sub in MAP:
    tail = r"(?![A-Za-z0-9_\-" + ("" if sub else "/") + "])"
    # `/api/compliance/calendar` (the .ics route) must not become
    # `/api/workspace/documents/compliance`.
    PATTERNS.append((re.compile(r"(?<!/api)" + re.escape(old) + tail), new))


def rewrite(text: str) -> str:
    for pat, new in PATTERNS:
        text = pat.sub(new, text)
    return text


def main() -> None:
    dry = "--dry-run" in sys.argv
    changed = []
    for base in SCAN:
        top = os.path.join(ROOT, base)
        if not os.path.isdir(top):
            continue
        for dirpath, dirnames, filenames in os.walk(top):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if os.path.splitext(fn)[1] not in EXTS:
                    continue
                path = os.path.join(dirpath, fn)
                rel = os.path.relpath(path, ROOT)
                if rel in SKIP_FILES:
                    continue
                try:
                    with open(path, encoding="utf-8") as fh:
                        src = fh.read()
                except (UnicodeDecodeError, OSError):
                    continue
                out = rewrite(src)
                if out != src:
                    changed.append(rel)
                    if not dry:
                        with open(path, "w", encoding="utf-8") as fh:
                            fh.write(out)
    for rel in changed:
        print(rel)
    print(f"{'would change' if dry else 'changed'} {len(changed)} files", file=sys.stderr)


if __name__ == "__main__":
    main()
