// Client-side engagement buffer (S21-A) — the pure logic behind the
// `<EngagementTracker>` on /s/dr/[token].
//
// The tracker feeds it visibility changes per section (IntersectionObserver)
// and asks it to flush on `visibilitychange` → hidden / `pagehide`, when the
// browser hands the payload to `navigator.sendBeacon`. This file owns the
// rules so they can be unit-tested without a DOM:
//
//   - dwell accrues only while a section is visible;
//   - at most ONE report per section per 30 s window
//     (ENGAGE_DEDUPE_WINDOW_MS, same constant the server dedupes on);
//   - a report carries the dwell accrued since the last report, never the
//     whole session again;
//   - nothing about the viewer travels beyond the share token.
//
// Browser-safe: no node built-ins, no React.

import { ENGAGE_DEDUPE_WINDOW_MS, type EngageEventType } from "./engagement";

export interface EngagePayload {
  token: string;
  eventType: EngageEventType;
  section?: string;
  documentName?: string;
  durationMs?: number;
}

interface SectionState {
  visibleSince: number | null;
  pendingMs: number;
  lastReportedAt: number;
}

/** Ignore dwell shorter than this — a scroll-past is not a read. */
export const MIN_REPORTABLE_DWELL_MS = 1_000;

export class EngagementBuffer {
  private readonly sections = new Map<string, SectionState>();

  constructor(
    private readonly token: string,
    private readonly windowMs: number = ENGAGE_DEDUPE_WINDOW_MS,
  ) {}

  private state(section: string): SectionState {
    let s = this.sections.get(section);
    if (!s) {
      s = { visibleSince: null, pendingMs: 0, lastReportedAt: -Infinity };
      this.sections.set(section, s);
    }
    return s;
  }

  /** A section entered the viewport. */
  show(section: string, now: number): void {
    const s = this.state(section);
    if (s.visibleSince === null) s.visibleSince = now;
  }

  /** A section left the viewport — bank its dwell. */
  hide(section: string, now: number): void {
    const s = this.state(section);
    if (s.visibleSince !== null) {
      s.pendingMs += Math.max(0, now - s.visibleSince);
      s.visibleSince = null;
    }
  }

  /** Bank every visible section without hiding it (tab went to background). */
  pause(now: number): void {
    for (const section of this.sections.keys()) this.hide(section, now);
  }

  /** Tab came back — every section that was on screen starts accruing again. */
  resume(visibleSections: Iterable<string>, now: number): void {
    for (const section of visibleSections) this.show(section, now);
  }

  /**
   * Everything reportable right now, honouring the per-section window.
   * Sections still inside their window keep their pending dwell for the next
   * flush; `force` (page is unloading) sends them anyway, once, because there
   * will be no next flush.
   */
  flush(now: number, opts: { force?: boolean } = {}): EngagePayload[] {
    const out: EngagePayload[] = [];
    for (const [section, s] of this.sections) {
      let pending = s.pendingMs;
      if (s.visibleSince !== null) {
        pending += Math.max(0, now - s.visibleSince);
        s.visibleSince = now;
      }
      if (pending < MIN_REPORTABLE_DWELL_MS) {
        s.pendingMs = pending;
        continue;
      }
      const inWindow = now - s.lastReportedAt < this.windowMs;
      if (inWindow && !opts.force) {
        s.pendingMs = pending;
        continue;
      }
      out.push({ token: this.token, eventType: "section_view", section, durationMs: Math.round(pending) });
      s.pendingMs = 0;
      s.lastReportedAt = now;
    }
    return out;
  }

  /** For tests / debugging. */
  pending(section: string): number {
    return this.sections.get(section)?.pendingMs ?? 0;
  }
}

/** Serialise for sendBeacon / fetch keepalive. Server reads one event per request. */
export function encodePayload(p: EngagePayload): string {
  return JSON.stringify(p);
}
