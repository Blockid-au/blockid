"use client";

/**
 * HowItWorksConnector — vertical gold line that grows from the numbered
 * badge to the next step when it scrolls into view. Isolated as a tiny
 * client boundary so the parent step card stays server-rendered.
 *
 * Falls back to a fully-drawn line when IntersectionObserver is not
 * supported OR the user prefers reduced motion — this keeps the visual
 * hierarchy intact without any JS-driven animation.
 */

import { useEffect, useRef, useState } from "react";

export function HowItWorksConnector() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) {
      setReduced(true);
      setDrawn(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setDrawn(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDrawn(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-drawn={drawn ? "true" : "false"}
      className={[
        "mt-2 block w-px flex-1 overflow-hidden",
        "bg-transparent",
      ].join(" ")}
      style={{ minHeight: "56px" }}
    >
      <span
        className={[
          "block w-px origin-top bg-[var(--color-brand-gold)]/40",
          reduced ? "" : "transition-transform duration-700 ease-out",
        ].join(" ")}
        style={{
          height: "100%",
          transform: drawn ? "scaleY(1)" : "scaleY(0)",
        }}
      />
    </span>
  );
}

export default HowItWorksConnector;
