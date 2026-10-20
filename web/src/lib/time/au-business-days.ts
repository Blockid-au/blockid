/**
 * Sydney (NSW) business days — the clock for the Verified report SLA
 * (Pricing v5, D29: "within N business days", Australia/Sydney).
 *
 * A business day is Mon–Fri that is not an NSW public holiday. Holidays are
 * derived from the rules of the Public Holidays Act 2010 (NSW) rather than a
 * hand-kept list, so the helper never silently expires:
 *   - New Year's Day, Australia Day: moved to Monday when on a weekend;
 *   - Good Friday, Easter Monday (Easter by the anonymous Gregorian algorithm);
 *   - Anzac Day: no additional day when on a weekend;
 *   - King's Birthday: second Monday in June;
 *   - Labour Day: first Monday in October;
 *   - Christmas / Boxing Day: additional weekday(s) when on a weekend.
 * The NSW Bank Holiday (first Monday in August) is banks-only and excluded.
 * One-off proclamations can be added through `extraHolidays` (YYYY-MM-DD).
 */

const TZ = "Australia/Sydney";
const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of an instant as seen in Sydney. */
export function sydneyDateKey(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Day of week (0 = Sunday) of a calendar date, timezone-free. */
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const addDays = (y: number, m: number, d: number, n: number) => {
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
  const first = dow(y, m, 1);
  return key(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
};

function easterSunday(y: number): [number, number] {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const cache = new Map<number, ReadonlySet<string>>();

/** NSW public holidays (general, not bank-only) for a calendar year. */
export function nswPublicHolidays(year: number): ReadonlySet<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const out = new Set<string>();
  const mondayIfWeekend = (m: number, d: number) => {
    const w = dow(year, m, d);
    out.add(w === 6 ? addDays(year, m, d, 2) : w === 0 ? addDays(year, m, d, 1) : key(year, m, d));
  };
  mondayIfWeekend(1, 1);
  mondayIfWeekend(1, 26);
  const [em, ed] = easterSunday(year);
  out.add(addDays(year, em, ed, -2));
  out.add(addDays(year, em, ed, 1));
  out.add(key(year, 4, 25));
  out.add(nthWeekday(year, 6, 1, 2));
  out.add(nthWeekday(year, 10, 1, 1));
  out.add(key(year, 12, 25));
  out.add(key(year, 12, 26));
  const xmas = dow(year, 12, 25);
  if (xmas === 6) { out.add(key(year, 12, 27)); out.add(key(year, 12, 28)); } // Sat/Sun → Mon 27 + Tue 28 (Boxing on Sun)
  else if (xmas === 0) out.add(key(year, 12, 27)); // Sun → Tue 27 (Boxing Mon 26)
  else if (xmas === 5) out.add(key(year, 12, 28)); // Boxing Sat → Mon 28
  cache.set(year, out);
  return out;
}

export function isSydneyBusinessDay(dateKey: string, extraHolidays: readonly string[] = []): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  const w = dow(y, m, d);
  if (w === 0 || w === 6) return false;
  return !nswPublicHolidays(y).has(dateKey) && !extraHolidays.includes(dateKey);
}

/**
 * SLA due instant: end of the Nth Sydney business day after `start`
 * (the start day itself never counts). Returned as the UTC instant of
 * 23:59:59 Sydney local time on that day.
 */
export function addSydneyBusinessDays(start: Date, businessDays: number, extraHolidays: readonly string[] = []): Date {
  if (!Number.isInteger(businessDays) || businessDays < 0) throw new RangeError("businessDays must be a non-negative integer");
  let [y, m, d] = sydneyDateKey(start).split("-").map(Number);
  let left = businessDays;
  let k = key(y, m, d);
  while (left > 0) {
    k = addDays(y, m, d, 1);
    [y, m, d] = k.split("-").map(Number);
    if (isSydneyBusinessDay(k, extraHolidays)) left--;
  }
  return endOfSydneyDay(k);
}

/** UTC instant of 23:59:59 Sydney time on a `YYYY-MM-DD` date (DST-aware). */
export function endOfSydneyDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Sydney is UTC+10 or +11; try both offsets and keep the one that maps back to the same local date/time.
  for (const offset of [11, 10]) {
    const guess = new Date(Date.UTC(y, m - 1, d, 23 - offset, 59, 59));
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(guess);
    if (sydneyDateKey(guess) === dateKey && local === "23:59:59") return guess;
  }
  return new Date(Date.UTC(y, m - 1, d, 13, 59, 59));
}

/** Verified-report SLA due time for an order entering review at `at`. */
export function verifiedSlaDueAt(at: Date, businessDays = 2, extraHolidays: readonly string[] = []): Date {
  return addSydneyBusinessDays(at, businessDays, extraHolidays);
}
