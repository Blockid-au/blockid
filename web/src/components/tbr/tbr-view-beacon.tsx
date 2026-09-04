"use client";

// Wave 26A — anonymous open-tracking beacon mounted by /tbr/[token]/page.tsx.
//
// - On mount: POST /view-start → capture `viewId`.
// - On tab hide (`visibilitychange`) and `beforeunload`: POST /view-end with
//   accumulated read_ms (paused when the tab is hidden).
//
// Renders nothing. Fails silently — never blocks the reader.

import { useEffect } from "react";

interface Props {
  token: string;
}

export function TbrViewBeacon({ token }: Props) {
  useEffect(() => {
    if (!token) return;

    let viewId: number | null = null;
    let readMs = 0;
    let lastActive = Date.now();
    let visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
    let ended = false;

    const accumulate = () => {
      if (!visible) return;
      const now = Date.now();
      readMs += now - lastActive;
      lastActive = now;
    };

    // Fire view-start (best-effort).
    const controller = new AbortController();
    fetch(`/api/tbr/${encodeURIComponent(token)}/view-start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
      }),
      signal: controller.signal,
      keepalive: true,
    })
      .then((r) => r.json())
      .then((body: { ok?: boolean; viewId?: number | null }) => {
        if (body && body.ok && typeof body.viewId === "number") {
          viewId = body.viewId;
        }
      })
      .catch(() => {
        /* silent — analytics never blocks the reader */
      });

    const sendEnd = () => {
      if (ended || viewId === null) return;
      accumulate();
      ended = true;
      const payload = JSON.stringify({ viewId, readMs });
      // sendBeacon has the best chance of surviving pagehide/unload.
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(`/api/tbr/${encodeURIComponent(token)}/view-end`, blob);
          return;
        }
      } catch {
        /* fallthrough to fetch */
      }
      fetch(`/api/tbr/${encodeURIComponent(token)}/view-end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    const onVisibility = () => {
      const nowVisible = document.visibilityState === "visible";
      if (nowVisible && !visible) {
        // Resuming — start the clock again.
        lastActive = Date.now();
        visible = true;
      } else if (!nowVisible && visible) {
        accumulate();
        visible = false;
        // Flush partial read time so short skims still register a duration.
        sendEnd();
        ended = false; // allow another end fire on true unload
      }
    };
    const onPageHide = () => sendEnd();
    const onBeforeUnload = () => sendEnd();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      sendEnd();
    };
  }, [token]);

  return null;
}
