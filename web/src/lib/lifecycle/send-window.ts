// G34-BT4 — quiet hours for commercial (C-class) lifecycle mail.
//
// Plan §9.2 "Giờ gửi": C-class mail goes out 08:00–19:00 on weekdays in the
// recipient's time zone (default Australia/Sydney); T-class is exempt. We do
// not store a per-recipient zone, so every C-class slot is computed in
// Australia/Sydney.
//
// Two uses:
//   * enqueue time — `nextCommercialSendSlot()` snaps a row's `scheduled_for`
//     into the next open window, and `spacedSlot()` keeps consecutive steps of
//     one flow ≥ the per-flow cap apart AFTER snapping (a Saturday step moved
//     to Monday must push the next step too, or the 72 h per-flow cap drops
//     it);
//   * send time — the email-drip worker leaves a C-class row pending while
//     `isInCommercialSendWindow(now)` is false (the hourly tick picks it up
//     at the next open hour).
//
// Pure: Intl only, no I/O. Sydney's offset is always a whole hour (+10/+11),
// so stepping whole UTC hours lands on whole Sydney hours.

export const SEND_WINDOW = Object.freeze({
  timeZone: "Australia/Sydney",
  /** First local hour a C-class mail may go (inclusive). */
  startHour: 8,
  /** Local hour the window closes (exclusive): 19 → the last send hour is 18:xx. */
  endHour: 19,
});

const HOUR_MS = 3_600_000;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let formatter: Intl.DateTimeFormat | null = null;
function fmt(): Intl.DateTimeFormat {
  formatter ??= new Intl.DateTimeFormat("en-AU", {
    timeZone: SEND_WINDOW.timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  return formatter;
}

/** Local weekday (0 = Sunday) and hour (0–23) in Australia/Sydney. */
export function sydneyWeekdayHour(at: Date): { weekday: number; hour: number } {
  const parts = fmt().formatToParts(at);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hr = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday: WEEKDAY_INDEX[wd] ?? 1, hour: hr === 24 ? 0 : hr };
}

/** True Monday–Friday, 08:00 ≤ local time < 19:00 Australia/Sydney. */
export function isInCommercialSendWindow(at: Date): boolean {
  const { weekday, hour } = sydneyWeekdayHour(at);
  return weekday >= 1 && weekday <= 5 && hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour;
}

/**
 * `at` itself when it is inside the window, otherwise the start (hh:00) of
 * the next open window hour. Bounded to one week of hourly steps.
 */
export function nextCommercialSendSlot(at: Date): Date {
  if (isInCommercialSendWindow(at)) return new Date(at.getTime());
  let t = Math.ceil(at.getTime() / HOUR_MS) * HOUR_MS;
  for (let i = 0; i < 24 * 8; i++, t += HOUR_MS) {
    if (isInCommercialSendWindow(new Date(t))) return new Date(t);
  }
  return new Date(at.getTime());
}

/**
 * The per-flow cap is "≤ 1 per flow per 72 h" measured on send timestamps.
 * Sends happen on the hourly :25 tick and a batch takes seconds, so two
 * steps scheduled exactly 72 h apart can be logged 71 h 59 m apart. Two
 * extra hours of spacing absorb tick jitter.
 */
export const FLOW_STEP_GAP_MS = 74 * HOUR_MS;

/**
 * The slot for the next step of one flow: no earlier than `nominal`, no
 * earlier than `previous + minGapMs`, then snapped into the send window
 * (snapping only moves later, so the gap still holds).
 */
export function spacedSlot(nominal: Date, previous: Date | null, minGapMs: number = FLOW_STEP_GAP_MS): Date {
  const floor = previous ? Math.max(nominal.getTime(), previous.getTime() + minGapMs) : nominal.getTime();
  return nextCommercialSendSlot(new Date(floor));
}
