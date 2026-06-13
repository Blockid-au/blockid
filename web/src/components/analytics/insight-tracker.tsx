"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

interface InsightTrackerProps {
  slug: string;
  category: string;
  keywords: string[];
  readingTime: number;
  title: string;
}

/**
 * Fires rich GTM/GA4 dataLayer events for insight articles:
 *   1. article_viewed — on mount, with full keyword metadata
 *   2. article_scroll_depth — at 25/50/75/100% scroll
 *   3. article_read_complete — when time on page ≥ estimated reading time
 *
 * Also pushes keyword + content metadata to dataLayer for GTM variable capture.
 */
export function InsightTracker({ slug, category, keywords, readingTime, title }: InsightTrackerProps) {
  const scrollFired = useRef<Set<number>>(new Set());
  const readFired = useRef(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const primaryKeyword = keywords[0] ?? "";

    // ── 1. Article viewed — push to GA4 + dataLayer immediately ──
    trackEvent("insight_article_viewed", {
      slug,
      category,
      primary_keyword: primaryKeyword,
      keyword_count: keywords.length,
      reading_time: readingTime,
    });

    // Push full keyword set + content metadata to GTM dataLayer
    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "article_metadata",
        article_slug: slug,
        article_title: title,
        article_category: category,
        article_keywords: keywords.join(","),
        article_primary_keyword: primaryKeyword,
        article_reading_time: readingTime,
        content_type: "insight",
      });

      // GA4 custom dimensions (set on the page session)
      window.gtag?.("set", {
        content_type: "insight",
        article_category: category,
        article_primary_keyword: primaryKeyword,
      });
    }

    // ── 2. Scroll depth tracking ──
    const THRESHOLDS = [25, 50, 75, 100] as const;

    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.round((scrollTop / docHeight) * 100);

      for (const threshold of THRESHOLDS) {
        if (pct >= threshold && !scrollFired.current.has(threshold)) {
          scrollFired.current.add(threshold);
          trackEvent("insight_scroll_depth", { slug, depth: threshold, category });
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    // ── 3. Read completion — time on page ≥ reading time ──
    const readTimeMs = readingTime * 60 * 1000;
    const readTimer = setTimeout(() => {
      if (!readFired.current) {
        readFired.current = true;
        trackEvent("insight_read_complete", { slug, category, primary_keyword: primaryKeyword });
      }
    }, readTimeMs);

    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(readTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return null;
}
