/**
 * Pure resolver for showcase-surface GA4/dataLayer events.
 *
 * Track B advisory §23 rec #2 (CMO/CPO joint) — the four showcase surfaces
 * (/showcase/blockid, /guide/reports, /guide/[chapter],
 * /workspace/guide/[chapter]) each mount <PageTracker /> but the runtime
 * dispatcher never emitted anything for them, so the "GA4 event catalogue
 * for showcase" was invisible in reports. This resolver turns a (page,
 * context) pair into the right AnalyticsEventMap entry so PageTracker can
 * forward it via trackEvent(). Kept pure + browser-free so vitest can
 * cover the mapping without a jsdom environment.
 *
 * Docs mirror: docs/analytics/showcase-events.md.
 */

import type { AnalyticsEventMap } from "@/lib/analytics";

export type ShowcaseTrackerContext = {
  chapter?: number;
  locale?: "en" | "vi";
  source?: "onboarding" | "marketing";
  referrer?: string;
  totalReports?: number;
};

type Resolved =
  | { name: "showcase_public_viewed"; params: AnalyticsEventMap["showcase_public_viewed"] }
  | { name: "showcase_guide_viewed"; params: AnalyticsEventMap["showcase_guide_viewed"] }
  | { name: "showcase_reports_viewed"; params: AnalyticsEventMap["showcase_reports_viewed"] };

/**
 * Return the event to fire for a given PageTracker page + context, or null
 * if this page has no showcase-scoped event (in which case the caller
 * falls through to any legacy per-page handler).
 */
export function resolveShowcasePageEvent(
  page: string,
  ctx: ShowcaseTrackerContext = {},
): Resolved | null {
  switch (page) {
    case "showcase-blockid":
      return {
        name: "showcase_public_viewed",
        params: { referrer: normaliseReferrer(ctx.referrer) },
      };
    case "guide-reports":
      return {
        name: "showcase_reports_viewed",
        params: {
          total_reports: Number.isFinite(ctx.totalReports) ? (ctx.totalReports as number) : 0,
          source: "marketing",
        },
      };
    case "guide-chapter":
    case "workspace-guide-chapter": {
      const chapter = ctx.chapter;
      const locale = ctx.locale;
      if (!Number.isFinite(chapter) || chapter === undefined || chapter < 1 || chapter > 12) {
        return null;
      }
      if (locale !== "en" && locale !== "vi") return null;
      const source =
        ctx.source === "onboarding" || ctx.source === "marketing"
          ? ctx.source
          : page === "workspace-guide-chapter"
            ? "onboarding"
            : "marketing";
      return {
        name: "showcase_guide_viewed",
        params: { chapter, locale, source },
      };
    }
    default:
      return null;
  }
}

function normaliseReferrer(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  try {
    const url = new URL(trimmed);
    return url.origin + url.pathname;
  } catch {
    return trimmed.slice(0, 256);
  }
}

export const _internal = { normaliseReferrer };
