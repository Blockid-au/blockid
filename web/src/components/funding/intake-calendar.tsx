/**
 * IntakeCalendar — month-by-month intake calendar for one capital
 * (/funding/programs/[capital], T0241). Twelve months from now, each month
 * listing the programs whose applications close, whose cohort starts, or
 * whose usual intake falls in it. Grouping is `buildIntakeCalendar()` in
 * lib/funding/directory.ts; this component only renders. Server component.
 */

import Link from "next/link";
import { INTAKE_KIND_LABELS, capitalSlug, monthLong, type IntakeMonth } from "@/lib/funding/directory";

export interface IntakeCalendarProps {
  months: IntakeMonth[];
}

const KIND_TONE: Record<IntakeMonth["events"][number]["kind"], string> = {
  applications_close: "text-bear",
  cohort_start: "text-bull",
  usual_intake: "text-secondary",
};

export function IntakeCalendar({ months }: IntakeCalendarProps) {
  const total = months.reduce((n, m) => n + m.events.length, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-secondary">
        No dated intakes recorded for the next twelve months. Check each program&rsquo;s official page for its next round.
      </p>
    );
  }
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-intake-calendar>
      {months.map((m) => (
        <li
          key={m.key}
          data-month={m.key}
          className={`rounded-2xl border border-line-subtle p-4 ${m.events.length ? "bg-surface-raised" : "bg-surface-sunken"}`}
        >
          <h3 className="font-display text-base font-semibold text-primary">
            {m.label}
            <span className="ml-2 text-xs font-medium text-secondary">
              {m.events.length ? `${m.events.length} ${m.events.length === 1 ? "intake" : "intakes"}` : "quiet"}
            </span>
          </h3>
          {m.events.length ? (
            <ul className="mt-3 space-y-2">
              {m.events.map((ev) => (
                <li key={`${ev.programId}-${ev.kind}`} className="text-sm leading-snug">
                  <Link
                    href={`/funding/programs/${capitalSlug(ev.capital)}/${encodeURIComponent(ev.programId)}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {ev.programName}
                  </Link>
                  <span className={`block text-xs ${KIND_TONE[ev.kind]}`}>
                    {`${INTAKE_KIND_LABELS[ev.kind]}${ev.day ? ` · ${ev.day} ${monthLong(m.month)}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default IntakeCalendar;
