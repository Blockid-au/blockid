// Dashboard widget allow-list (G4 #4 — server-synced dashboard layout).
//
// Every `data-widget-id` rendered inside <WidgetGrid> on
// app/(app)/(founder)/dashboard/page.tsx must be listed here. The layout
// route (PUT /api/dashboard/layout) drops any id that is not in this list
// before it touches app_users.dashboard_layout, so a tampered payload can
// never persist arbitrary strings, and the grid itself self-heals when a
// widget is retired (sanitizeStoredIds in lib/dashboard/widget-layout.ts).
//
// widget-ids.test.ts reads the page source and fails when the two drift —
// add the id here in the same commit as the new widget.

export const DASHBOARD_WIDGET_IDS = [
  "health-score",
  "metrics",
  "svi-radar",
  "github-evidence",
  "guide-next",
  "reports-actions",
  "revenue-90d",
  "status-cards",
  "data-room",
  "ai-eval-summary",
  "svi-trend",
  "cohort-benchmark",
  "cap-activity",
  "growth-roadmap",
  "growth-progress",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

const KNOWN = new Set<string>(DASHBOARD_WIDGET_IDS);

export function isDashboardWidgetId(id: unknown): id is DashboardWidgetId {
  return typeof id === "string" && KNOWN.has(id);
}
