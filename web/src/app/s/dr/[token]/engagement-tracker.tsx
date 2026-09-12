"use client";

// Posts what the investor read, and for how long, to /api/data-room/engage
// (S21-A). Renders nothing.
//
// Mechanics:
//   - one `open` event on mount (fetch, keepalive);
//   - an IntersectionObserver over every `[data-engage-section]` element on
//     the page — folders, the gap list, the headline figures — feeds the
//     `EngagementBuffer` (lib/dataroom/engagement-client.ts) with show/hide;
//   - the buffer is flushed on `visibilitychange` → hidden and on `pagehide`
//     with `navigator.sendBeacon` (fetch keepalive as the fallback), and on a
//     30 s timer while the tab is visible so a long read is not lost to a
//     closed laptop lid;
//   - per section, at most one report per 30 s window, carrying only the
//     dwell accrued since the last report.
//
// Nothing about the viewer travels beyond the share token: no email, no
// name, no identifiers. The server hashes the network address.

import * as React from "react";
import { ENGAGE_DEDUPE_WINDOW_MS } from "@/lib/dataroom/engagement";
import { EngagementBuffer, encodePayload, type EngagePayload } from "@/lib/dataroom/engagement-client";

const ENDPOINT = "/api/data-room/engage";

function send(payload: EngagePayload, unloading: boolean): void {
  const body = encodePayload(payload);
  if (unloading && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    if (ok) return;
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    /* telemetry never surfaces an error to the reader */
  });
}

export function EngagementTracker({ token }: { token: string }) {
  React.useEffect(() => {
    if (!token) return;
    const buffer = new EngagementBuffer(token);
    const visible = new Set<string>();

    send({ token, eventType: "open" }, false);

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              const now = Date.now();
              for (const entry of entries) {
                const section = (entry.target as HTMLElement).dataset.engageSection;
                if (!section) continue;
                if (entry.isIntersecting) {
                  visible.add(section);
                  if (document.visibilityState === "visible") buffer.show(section, now);
                } else {
                  visible.delete(section);
                  buffer.hide(section, now);
                }
              }
            },
            { threshold: 0.25 },
          )
        : null;

    for (const el of document.querySelectorAll<HTMLElement>("[data-engage-section]")) {
      observer?.observe(el);
    }

    const flush = (unloading: boolean) => {
      for (const p of buffer.flush(Date.now(), { force: unloading })) send(p, unloading);
    };

    const onVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        buffer.pause(now);
        flush(true);
      } else {
        buffer.resume(visible, now);
      }
    };
    const onPageHide = () => {
      buffer.pause(Date.now());
      flush(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const timer = window.setInterval(() => flush(false), ENGAGE_DEDUPE_WINDOW_MS);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      observer?.disconnect();
      buffer.pause(Date.now());
      flush(true);
    };
  }, [token]);

  return null;
}
