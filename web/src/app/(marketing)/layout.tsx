/**
 * (marketing) route-group layout — Master Upgrade Plan §16.5.
 *
 * Route groups are folders wrapped in parentheses; they group routes
 * logically without adding a URL segment. Every page under
 * `web/src/app/(marketing)/*` is public marketing content (landing,
 * pricing, solutions, blog, legal, business-id, insights, team,
 * changelog, roadmap …). The URL each page serves is unchanged.
 *
 * This layout is intentionally a passthrough — the marketing shell
 * (header, footer, GA, providers) lives in the root `app/layout.tsx`.
 * Keeping this file thin means marketing pages continue to render
 * exactly as they did before the reorg; the layout exists so App
 * Router treats `(marketing)` as a real group and so a future
 * marketing-specific concern (e.g. cookie banner, campaign banner)
 * has a well-defined mount point.
 */

import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
