// Dashboard widget allow-list (G4 #4 — server-synced dashboard layout).
//
// Every `data-widget-id` rendered inside <WidgetGrid> in
// components/dashboard/score-widget-grid.tsx (mounted on /workspace/score
// since G13-W3-IA3; the founder landing is five fixed blocks) must be
// listed here. The layout
// route (PUT /api/dashboard/layout) drops any id that is not in this list
// before it touches app_users.dashboard_layout, so a tampered payload can
// never persist arbitrary strings, and the grid itself self-heals when a
// widget is retired (sanitizeStoredIds in lib/dashboard/widget-layout.ts).
//
// widget-ids.test.ts reads the page source and fails when the two drift —
// add the id here in the same commit as the new widget.

// Retired in G13-W3-IA3 (saved layouts self-heal): guide-next, growth-roadmap,
// growth-progress → /workspace/plan; reports-actions → landing block 5.
export const DASHBOARD_WIDGET_IDS = [
  "health-score",
  "metrics",
  "svi-radar",
  "github-evidence",
  "revenue-90d",
  "status-cards",
  "data-room",
  "ai-eval-summary",
  "svi-trend",
  "cohort-benchmark",
  "cap-activity",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

const KNOWN = new Set<string>(DASHBOARD_WIDGET_IDS);

export function isDashboardWidgetId(id: unknown): id is DashboardWidgetId {
  return typeof id === "string" && KNOWN.has(id);
}
