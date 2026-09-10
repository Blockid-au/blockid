/**
 * MoneyRadarTile — the money metric above the fold on /dashboard (G11 plan
 * §4i D-2, T0248; SOT G9 #5 "first view shows a live founder-relevant
 * metric"). Also mounted compactly at the top of /workspace/funding.
 *
 * Five states from `getMoneyRadarTileData()`:
 *   no_profile      counts for {industry} in {state}       → Match me
 *   free_previewed  top-3 names, amounts/deadlines locked  → Unlock A$3 · Start trial
 *   buyer           top-3 with A$ + deadline chips         → Start 7-day Radar trial
 *   subscriber      next 3 deadlines, new matches, step    → Open Money Radar · Draft application
 *   nothing_due     next public event                      → Add to calendar (ICS)
 *
 * Deadline chips reuse the RDStatus ladder (`DEADLINE_TONE`, D-4) with the
 * D-2 thresholds applied by `tileRung()` in tile-data. Never blank: every
 * state prints the live counts and, when there is one, the next public event.
 *
 * Server component — plain links, no client state. Semantic tokens only.
 */

import Link from "next/link";
import { ArrowRight, CalendarPlus, FileText, Lock, Radar } from "lucide-react";
import { DEADLINE_LABELS, DEADLINE_TONE } from "@/lib/funding/deadline-status";
import { formatAudCompact } from "@/lib/funding/directory";
import { fundingCopy, nextDeadlineLine } from "@/lib/funding/copy";
import { founderRadarSignupHref } from "@/lib/funding/radar-upsell";
import { tileHeadline, type MoneyRadarTileData, type TileDeadline, type TileTopMatch } from "@/lib/funding/tile-data";

export const MONEY_RADAR_TILE_FROM = "tile";

export interface MoneyRadarTileProps {
  data: MoneyRadarTileData;
  /** Workspace variant: tighter padding, no counts footer (the page shows them). */
  compact?: boolean;
  /** VI catalogue when the page is localised; EN otherwise. */
  messages?: Readonly<Record<string, string>> | null;
  className?: string;
}

export const TILE_HREFS = {
  workspace: "/workspace/funding",
  trial: founderRadarSignupHref(MONEY_RADAR_TILE_FROM),
  draft: (ref: string) => `/workspace/funding?draft=${encodeURIComponent(ref)}`,
  report: (id: string) => `/funding/report/${id}`,
  events: "/workspace/funding?tab=events",
  alerts: "/workspace/funding?tab=alerts",
} as const;

export function MoneyRadarTile({ data, compact = false, messages = null, className = "" }: MoneyRadarTileProps) {
  const c = (group: Parameters<typeof fundingCopy>[0], key: string, tokens: Record<string, string | number> = {}) =>
    fundingCopy(group, key, tokens, messages);
  const headline = tileHeadline(data, messages);
  const nextDeadline = data.next_deadlines[0] ?? null;
  const pad = compact ? "p-4 sm:p-5" : "p-5 sm:p-6";

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-line-subtle bg-surface-raised ${pad} ${className}`.trim()}
      aria-labelledby="money-radar-tile-heading"
      data-money-radar-tile
      data-state={data.state}
      data-compact={compact ? "1" : "0"}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-action/10 text-action">
            <Radar className="h-4 w-4" aria-hidden />
          </span>
          <h2 id="money-radar-tile-heading" className="text-sm font-semibold uppercase tracking-wide text-action">
            {c("tile", "title")}
          </h2>
        </div>
        {data.state === "subscriber" || data.state === "nothing_due" ? (
          <span className="rounded-full border border-bull/30 bg-bull/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-bull">
            Founder Radar
          </span>
        ) : null}
      </header>

      <p className="mt-3 text-base font-semibold leading-snug text-primary" data-tile-headline>
        <Headline text={headline} />
      </p>

      {data.state === "free_previewed" || data.state === "buyer" ? (
        <TopMatches items={data.top3} locked={data.state === "free_previewed"} messages={messages} />
      ) : null}

      {data.state === "subscriber" ? <DeadlineList items={data.next_deadlines} /> : null}

      {(data.state === "free_previewed" || data.state === "buyer") && nextDeadline ? (
        <p className="mt-3 text-sm text-secondary" data-tile-next-deadline>
          <Headline text={nextDeadlineLine(nextDeadline.days_until, messages)} />
          {data.state === "buyer" ? <span className="text-tertiary"> · {nextDeadline.name}</span> : null}
        </p>
      ) : null}

      {data.state === "subscriber" ? (
        <p className="mt-3 text-sm text-secondary" data-tile-next-step>
          {c("tile", "nextStep", { action: data.next_step })}
        </p>
      ) : null}

      {data.state === "nothing_due" && data.new_matches_week > 0 ? (
        <p className="mt-2 text-sm text-secondary" data-tile-new-matches>
          {c("tile", "newMatches", { n: data.new_matches_week })}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2" data-tile-ctas>
        <Ctas data={data} c={c} />
      </div>

      <footer className={`mt-auto ${compact ? "pt-3" : "pt-4"} text-xs text-tertiary`} data-tile-footer>
        <span data-tile-counts>
          {c("tile", "countsLine", { grants: data.counts.grants, programs: data.counts.programs, capital: data.counts.capital })}
        </span>
        {data.next_public_event && data.state !== "nothing_due" ? (
          <span data-tile-next-event>
            {" · "}
            Next up:{" "}
            {data.next_public_event.url ? (
              <a href={data.next_public_event.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                {data.next_public_event.name}
              </a>
            ) : (
              data.next_public_event.name
            )}{" "}
            {data.next_public_event.date_label}
          </span>
        ) : null}
      </footer>
    </section>
  );
}

/** Bold the "number + noun" pairs of a D-2 line ("**14 grants**", "**12 days**") without dangerouslySetInnerHTML; bare numbers and dates stay plain. */
function Headline({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*\s(?:new\s)?(?:grants?|programs?|days?|matches|questions?))/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\d/.test(part) ? (
          <strong key={i} className="text-primary">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function TopMatches({ items, locked, messages }: { items: TileTopMatch[]; locked: boolean; messages: Readonly<Record<string, string>> | null }) {
  if (items.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5" data-tile-top3 data-locked={locked ? "1" : "0"}>
      {items.map((m, i) => (
        <li key={`${m.ref_kind}:${m.ref_id}`} className="flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium text-primary">
              {i + 1}. {m.name}
            </span>
            <span className="block truncate text-xs text-tertiary">{m.why}</span>
          </span>
          <span className="shrink-0 text-right text-xs text-secondary">
            {locked ? (
              <span className="inline-flex items-center gap-1 text-tertiary" title={fundingCopy("tile", "lockedAmount", {}, messages)}>
                <Lock className="h-3 w-3" aria-hidden />
                <span className="sr-only">{fundingCopy("tile", "lockedAmount", {}, messages)}</span>
                <span aria-hidden>A$ ···</span>
              </span>
            ) : (
              <>
                <span className="block font-semibold text-primary">{m.amount_max_aud ? `up to ${formatAudCompact(m.amount_max_aud)}` : "Amount varies"}</span>
                {m.deadline ? (
                  <span
                    className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${DEADLINE_TONE[m.deadline.status]}`}
                    data-deadline-chip
                    data-deadline-status={m.deadline.status}
                    title={`${DEADLINE_LABELS[m.deadline.status]} · ${m.deadline.date_label}`}
                  >
                    T-{m.deadline.days_until}
                  </span>
                ) : (
                  <span className="block">rolling</span>
                )}
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DeadlineList({ items }: { items: TileDeadline[] }) {
  return (
    <ul className="mt-3 space-y-1.5" data-tile-deadlines>
      {items.map((d) => (
        <li key={`${d.ref_kind}:${d.ref_id}`} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-medium text-primary">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                {d.name}
              </a>
            ) : (
              d.name
            )}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${DEADLINE_TONE[d.status]}`}
            data-deadline-chip
            data-deadline-status={d.status}
            title={`${DEADLINE_LABELS[d.status]} · ${d.date_label}`}
          >
            T-{d.days_until}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Ctas({ data, c }: { data: MoneyRadarTileData; c: (group: Parameters<typeof fundingCopy>[0], key: string, tokens?: Record<string, string | number>) => string }) {
  switch (data.state) {
    case "no_profile":
      return <Primary href={TILE_HREFS.workspace} cta="match_me" label={c("cta", "matchMe")} />;
    case "free_previewed":
      return (
        <>
          <Primary href={TILE_HREFS.workspace} cta="unlock_report" label={c("cta", "unlockReport")} />
          <Secondary href={TILE_HREFS.trial} cta="start_trial" label={c("cta", "startTrial")} />
        </>
      );
    case "buyer":
      return (
        <>
          <Primary href={TILE_HREFS.trial} cta="start_trial" label={c("cta", "startTrial7")} />
          {data.report_id ? <Secondary href={TILE_HREFS.report(data.report_id)} cta="open_report" label={c("cta", "openReport")} icon={FileText} /> : null}
        </>
      );
    case "subscriber": {
      const ref = data.next_deadlines[0]?.ref_id ?? data.top3[0]?.ref_id ?? "";
      return (
        <>
          <Primary href={TILE_HREFS.workspace} cta="open_radar" label={c("cta", "openRadar")} />
          <Secondary href={ref ? TILE_HREFS.draft(ref) : TILE_HREFS.workspace} cta="draft_application" label={c("cta", "draftApplication")} />
        </>
      );
    }
    case "nothing_due":
      return (
        <>
          <Primary href={data.calendar_href ?? TILE_HREFS.alerts} cta="add_to_calendar" label={c("cta", "addToCalendar")} icon={CalendarPlus} external={Boolean(data.calendar_href)} />
          <Secondary href={TILE_HREFS.workspace} cta="open_radar" label={c("cta", "openRadar")} />
        </>
      );
  }
}

function Primary({ href, label, cta, icon: Icon = ArrowRight, external = false }: { href: string; label: string; cta: string; icon?: typeof ArrowRight; external?: boolean }) {
  const cls = "inline-flex items-center gap-1.5 rounded-lg bg-action px-3.5 py-2 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover";
  if (external) {
    return (
      <a href={href} className={cls} data-tile-cta={cta}>
        {label} <Icon className="h-4 w-4" aria-hidden />
      </a>
    );
  }
  return (
    <Link href={href} className={cls} data-tile-cta={cta}>
      {label} <Icon className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function Secondary({ href, label, cta, icon: Icon }: { href: string; label: string; cta: string; icon?: typeof ArrowRight }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:border-action hover:text-action"
      data-tile-cta={cta}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {label}
    </Link>
  );
}

export default MoneyRadarTile;
