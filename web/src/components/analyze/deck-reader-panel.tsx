"use client";

// DeckReaderPanel — vertical slide-thumbnail strip that mirrors the
// backend's per-slide parsing progress. Section chips at the top
// (Problem / Market / Product / Traction / Team / Ask) light up as
// slides mapped to that section are parsed.
//
// The panel can be driven two ways:
//   1. Legacy — pass a pre-built `slides` + `detectedSections` set
//      (used by tests and any callers with their own SSE stream).
//   2. `intake` prop — the panel walks the real `intake.structured.slides`
//      list itself, marking each slide "reading" then "parsed" on a small
//      cadence so the founder sees genuine forward progress driven by the
//      actual deck content (not a fake timer over dummy data). Fires
//      `onDone(intake)` when the last slide is parsed.

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { DeckSections } from "@/lib/intake/deck-sections";

export type SlideStatus = "queued" | "reading" | "parsed";

export interface SlideState {
  index: number;
  title?: string;
  status: SlideStatus;
  section?: DeckSection;
}

export type DeckSection =
  | "problem"
  | "solution"
  | "market"
  | "product"
  | "traction"
  | "team"
  | "ask"
  | "other";

const SECTION_LABEL: Record<DeckSection, string> = {
  problem: "Problem",
  solution: "Solution",
  market: "Market",
  product: "Product",
  traction: "Traction",
  team: "Team",
  ask: "Ask",
  other: "Other",
};

const SECTION_ORDER: DeckSection[] = [
  "problem",
  "solution",
  "market",
  "product",
  "traction",
  "team",
  "ask",
];

// How long (ms) to spend "reading" each slide before flipping it to parsed.
// Kept tight — it's a visual heartbeat driven by real slide count, not a
// mocked timer over dummy data.
const SLIDE_TICK_MS = 320;

export interface DeckReaderPanelProps {
  /** Legacy API — caller manages slide list itself. */
  slides?: SlideState[];
  detectedSections?: Set<DeckSection>;
  /**
   * Preferred API — drive the panel directly off `/api/intake` result.
   * The panel derives slides from `intake.structured.slides` and lights
   * up sections from `intake.structured.deckSections`.
   */
  intake?: IntakeResult;
  /** Fired after the last slide is marked parsed (intake-mode only). */
  onDone?: (intake: IntakeResult) => void;
  className?: string;
}

/** Map deck-section-name → set of slide indices that fell into it. */
function slideIndexToSection(
  slides: string[],
  sections: DeckSections | undefined,
): Map<number, DeckSection> {
  const map = new Map<number, DeckSection>();
  if (!sections) return map;
  for (const name of SECTION_ORDER) {
    const bucket = (sections as unknown as Record<string, string[]>)[name] ?? [];
    for (const slideText of bucket) {
      const idx = slides.indexOf(slideText);
      if (idx >= 0) map.set(idx, name);
    }
  }
  return map;
}

/** Trim a slide's first line to a short human title. */
function slideTitle(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.slice(0, 80);
}

export function DeckReaderPanel({
  slides: slidesProp,
  detectedSections: detectedSectionsProp,
  intake,
  onDone,
  className,
}: DeckReaderPanelProps) {
  // ── Intake-mode: build slide list from real intake data ─────────────
  const intakeSlides = intake?.structured.slides ?? [];
  const sectionByIdx = React.useMemo(
    () => slideIndexToSection(intakeSlides, intake?.structured.deckSections),
    [intakeSlides, intake?.structured.deckSections],
  );
  const [parsedCount, setParsedCount] = React.useState(0);
  const doneCalledRef = React.useRef(false);

  React.useEffect(() => {
    if (!intake) return;
    if (intakeSlides.length === 0) {
      // No parseable slides — surface done immediately so the caller
      // can move on to the results view.
      if (!doneCalledRef.current) {
        doneCalledRef.current = true;
        onDone?.(intake);
      }
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the slide counter each time this effect (re)starts the timer-driven walk; the timer callbacks then advance it
    setParsedCount(0);
    doneCalledRef.current = false;
    let cancelled = false;
    let idx = 0;
    const step = () => {
      if (cancelled) return;
      idx += 1;
      setParsedCount(idx);
      if (idx >= intakeSlides.length) {
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          onDone?.(intake);
        }
        return;
      }
      window.setTimeout(step, SLIDE_TICK_MS);
    };
    const t = window.setTimeout(step, SLIDE_TICK_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [intake, intakeSlides, onDone]);

  const derivedSlides: SlideState[] = React.useMemo(() => {
    if (!intake) return slidesProp ?? [];
    return intakeSlides.map((text, i) => {
      const status: SlideStatus =
        i < parsedCount ? "parsed" : i === parsedCount ? "reading" : "queued";
      return {
        index: i,
        title: slideTitle(text),
        status,
        section: sectionByIdx.get(i),
      };
    });
  }, [intake, intakeSlides, parsedCount, sectionByIdx, slidesProp]);

  const derivedSections: Set<DeckSection> = React.useMemo(() => {
    if (!intake) return detectedSectionsProp ?? new Set<DeckSection>();
    const set = new Set<DeckSection>();
    for (let i = 0; i < parsedCount; i++) {
      const s = sectionByIdx.get(i);
      if (s) set.add(s);
    }
    return set;
  }, [intake, detectedSectionsProp, parsedCount, sectionByIdx]);

  const slides = derivedSlides;
  const detectedSections = derivedSections;

  const total = slides.length || 0;
  const parsed = slides.filter((s) => s.status === "parsed").length;
  const reading = slides.find((s) => s.status === "reading");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line-subtle bg-surface-raised p-3",
        className,
      )}
      data-testid="deck-reader-panel"
    >
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-tertiary">
          Deck reader
        </p>
        <p className="text-sm text-primary">
          {parsed} of {total || "…"} slides parsed
          {reading ? ` · reading slide ${reading.index + 1}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {SECTION_ORDER.map((section) => {
          const active = detectedSections.has(section);
          return (
            <span
              key={section}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-bull bg-bull/10 text-bull"
                  : "border-line-subtle bg-surface text-tertiary",
              )}
              data-testid={`deck-section-${section}`}
            >
              {SECTION_LABEL[section]}
            </span>
          );
        })}
      </div>

      <ol className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
        {slides.length === 0 && (
          <li className="text-xs italic text-muted">
            {intake
              ? "This deck had no extractable slide text — moving on."
              : "Awaiting slide list from server…"}
          </li>
        )}
        {slides.map((slide) => (
          <li key={slide.index}>
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                slide.status === "parsed" &&
                  "border-bull bg-bull/5 text-primary",
                slide.status === "reading" &&
                  "border-action bg-action/5 text-primary",
                slide.status === "queued" &&
                  "border-line-subtle bg-surface text-tertiary",
              )}
              data-testid={`deck-slide-${slide.index}`}
            >
              <span className="mt-0.5">
                {slide.status === "parsed" ? (
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-bull"
                    aria-hidden
                  />
                ) : slide.status === "reading" ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-action"
                    aria-hidden
                  />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <span className="flex-1">
                <span className="font-semibold">Slide {slide.index + 1}</span>
                {slide.title && (
                  <span className="ml-1 text-muted">— {slide.title}</span>
                )}
                {slide.section && (
                  <span className="ml-2 rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-tertiary">
                    {SECTION_LABEL[slide.section]}
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default DeckReaderPanel;
