"use client";

import { useEffect, useRef, useCallback } from "react";

interface ViewTrackerProps {
  slug: string;
  /** CSS selectors for sections to observe for visibility tracking */
  sectionIds?: string[];
}

function detectDeviceType(): "desktop" | "mobile" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|tablet/i.test(ua)) return "tablet";
  if (/iPhone|Android.*Mobile|mobile/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Client-side engagement tracker for investor share pages.
 *
 * Tracks:
 * - Time spent on page (timer starts on mount)
 * - Scroll depth (max percentage of page scrolled)
 * - Which sections are viewed (via IntersectionObserver)
 *
 * Sends data to /api/track/view:
 * - Every 30 seconds while active
 * - On page unload (beforeunload)
 * - When tab becomes hidden (visibilitychange)
 */
export function ViewTracker({ slug, sectionIds = [] }: ViewTrackerProps) {
  const startTime = useRef(Date.now());
  const maxScrollDepth = useRef(0);
  const sectionsViewed = useRef<Set<string>>(new Set());
  const lastSentAt = useRef(0);
  const hasSent = useRef(false);

  const getPayload = useCallback(() => {
    const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
    return {
      slug,
      timeSpent,
      sectionsViewed: Array.from(sectionsViewed.current),
      scrollDepth: maxScrollDepth.current,
      deviceType: detectDeviceType(),
    };
  }, [slug]);

  const sendData = useCallback(
    (useBeacon = false) => {
      // Debounce: don't send more often than every 10 seconds
      const now = Date.now();
      if (now - lastSentAt.current < 10_000) return;
      lastSentAt.current = now;

      const payload = getPayload();

      // Skip if less than 2 seconds of engagement
      if (payload.timeSpent < 2) return;

      if (useBeacon && typeof navigator.sendBeacon === "function") {
        // Use sendBeacon for unload events — it survives page close
        navigator.sendBeacon(
          "/api/track/view",
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        );
      } else {
        fetch("/api/track/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {
          // Tracking must never throw
        });
      }

      hasSent.current = true;
    },
    [getPayload],
  );

  useEffect(() => {
    // ── Scroll depth tracking ──
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const pct = Math.round((scrollTop / docHeight) * 100);
        if (pct > maxScrollDepth.current) {
          maxScrollDepth.current = Math.min(100, pct);
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // ── Section visibility tracking via IntersectionObserver ──
    let observer: IntersectionObserver | null = null;
    if (sectionIds.length > 0 && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.target.id) {
              sectionsViewed.current.add(entry.target.id);
            }
          }
        },
        { threshold: 0.3 },
      );

      // Observe after a short delay to allow DOM to settle
      const timer = setTimeout(() => {
        for (const id of sectionIds) {
          const el = document.getElementById(id);
          if (el) observer!.observe(el);
        }
      }, 500);

      // Also observe any data-section elements
      const sectionEls = document.querySelectorAll("[data-section]");
      sectionEls.forEach((el) => {
        if (el.id) observer!.observe(el);
      });

      return () => {
        clearTimeout(timer);
      };
    }

    // ── Periodic send (every 30s) ──
    const interval = setInterval(() => {
      sendData(false);
    }, 30_000);

    // ── Page unload ──
    const handleBeforeUnload = () => {
      sendData(true);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // ── Tab visibility change ──
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendData(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
      if (observer) (observer as IntersectionObserver).disconnect();
      // Final send on unmount
      if (!hasSent.current || Date.now() - lastSentAt.current > 10_000) {
        sendData(true);
      }
    };
  }, [sendData, sectionIds]);

  // Render nothing — this is a tracking-only component
  return null;
}
