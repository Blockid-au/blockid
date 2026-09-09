// The published company profile, as a page body.
//
// No "use client" and no hooks on purpose: this renders inside the server
// component at /listings/[slug] AND inside the founder's client-side publish
// preview. "Show them exactly what will be public before they confirm" is
// only true if the preview is the page, so there is exactly one of these.
//
// Nothing here reads anything but a PublicProfile — which is built from the
// founder's own published fields plus the derived score summary. There is no
// code path from a raw upload, an input URL, a filename or an email address
// to this markup.

import Link from "next/link";
import {
  formatAud,
  formatAuDate,
  type ProfileDimension,
  type PublicProfile,
} from "@/lib/publish/profile";

const BAND_DOT: Record<ProfileDimension["band"], string> = {
  strong: "bg-bull",
  developing: "bg-warn",
  early: "bg-bear",
};

function DimensionRow({ dimension }: { dimension: ProfileDimension }) {
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-primary">{dimension.label}</span>
        <span className="shrink-0 font-mono text-sm tabular-nums text-primary">
          {dimension.value}
          <span className="text-tertiary">/100</span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${dimension.label}: ${dimension.value} out of 100 — ${dimension.bandLabel}`}
      >
        <div
          className={`h-full rounded-full ${BAND_DOT[dimension.band]}`}
          style={{ width: `${Math.max(2, dimension.value)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-secondary">{dimension.bandLabel}</p>
    </li>
  );
}

function Panel({
  title,
  children,
  id,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="rounded-2xl border border-line-subtle bg-surface-raised p-5 sm:p-6"
    >
      <h2
        id={headingId}
        className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export interface PublicProfileBodyProps {
  profile: PublicProfile;
  /** Rendered inside the founder's publish preview rather than at its URL. */
  preview?: boolean;
}

export function PublicProfileBody({ profile, preview = false }: PublicProfileBodyProps) {
  const p = profile;
  const analysed = formatAuDate(p.analysedAt);
  const updated = formatAuDate(p.updatedAt);

  return (
    <article className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6">
      {/* ── Identity ─────────────────────────────────────────────── */}
      <header className="pt-8 sm:pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">
          {p.sectorLabel} · {p.stageLabel} stage · Australia
        </p>
        <h1 className="mt-2 break-words font-display text-3xl font-semibold text-strong sm:text-4xl">
          {p.companyName}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-secondary">
          {p.oneLiner}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          {analysed && <span>Analysed {analysed}</span>}
          {updated && updated !== analysed && <span>Profile updated {updated}</span>}
          {p.websiteUrl && (
            <a
              href={p.websiteUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              {p.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-4 sm:gap-5">
        {/* ── Index ──────────────────────────────────────────────── */}
        <Panel id="index-score" title="Startup Value Index">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <p className="font-display text-5xl font-semibold leading-none text-strong tabular-nums">
              {p.sviTotal}
            </p>
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary">{p.standing}</p>
              <p className="mt-0.5 text-xs text-secondary">
                Measured at {p.stageLabel} stage
              </p>
            </div>
          </div>

          {p.benchmark && (
            <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-line-subtle bg-surface-sunken p-3 text-center">
              {[
                { label: "Bottom 10%", value: p.benchmark.p10 },
                { label: "Median", value: p.benchmark.p50 },
                { label: "Top 10%", value: p.benchmark.p90 },
              ].map((mark) => (
                <div key={mark.label}>
                  <dt className="text-[11px] uppercase tracking-wider text-tertiary">
                    {mark.label}
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm tabular-nums text-primary">
                    {mark.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-xs leading-relaxed text-secondary">
            Australian startups at {p.stageLabel} stage typically land between{" "}
            {p.benchmark ? p.benchmark.p10 : "—"} and{" "}
            {p.benchmark ? p.benchmark.p90 : "—"} on this index.{" "}
            <Link
              href="/svi"
              className="rounded text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              How the index is built
            </Link>
          </p>
        </Panel>

        {/* ── Eight dimensions ───────────────────────────────────── */}
        <Panel id="dimensions" title="The eight dimensions">
          <ul className="divide-y divide-line-subtle">
            {p.dimensions.map((d) => (
              <DimensionRow key={d.key} dimension={d} />
            ))}
          </ul>
          {p.strongest && p.weakest && p.strongest.key !== p.weakest.key && (
            <p className="mt-4 border-t border-line-subtle pt-4 text-sm leading-relaxed text-secondary">
              Strongest today: <strong className="font-semibold text-primary">{p.strongest.label}</strong>{" "}
              at {p.strongest.value}. Furthest behind:{" "}
              <strong className="font-semibold text-primary">{p.weakest.label}</strong> at{" "}
              {p.weakest.value} — a {p.strongest.value - p.weakest.value} point spread.
            </p>
          )}
        </Panel>

        {/* ── Valuation ──────────────────────────────────────────── */}
        {p.valuation && (
          <Panel id="valuation" title="Indicative valuation">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="font-display text-3xl font-semibold text-strong sm:text-4xl">
                {formatAud(p.valuation.low)} – {formatAud(p.valuation.high)}
              </p>
              <p className="text-sm text-secondary">
                midpoint {formatAud(p.valuation.mid)}
              </p>
            </div>
            {p.valuation.methods.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider text-tertiary">
                  Methods used
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {p.valuation.methods.map((m) => (
                    <li
                      key={m}
                      className="rounded-full border border-line px-3 py-1 text-xs font-medium text-primary"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-xs leading-relaxed text-secondary">
              Evidence confidence {p.valuation.confidencePct}%. This is a
              modelled range for orientation, not a price, an offer, or
              financial advice. A real round is priced by what an investor will
              pay on the day.
            </p>
          </Panel>
        )}

        {/* ── Next steps ─────────────────────────────────────────── */}
        {p.nextActions.length > 0 && (
          <Panel id="next-steps" title={`What ${p.stageLabel} stage looks like next`}>
            <ol className="space-y-4">
              {p.nextActions.map((a, i) => (
                <li key={`${a.title}-${i}`} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-mono text-xs text-primary"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">{a.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-secondary">
                      {a.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        )}

        {/* ── Run your own ───────────────────────────────────────── */}
        <section
          aria-labelledby="run-your-own-heading"
          className="rounded-2xl border border-line bg-surface-sunken p-5 sm:p-6"
        >
          <h2
            id="run-your-own-heading"
            className="font-display text-lg font-semibold text-strong"
          >
            Score your {p.sectorLabel} startup the same way
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Same eight dimensions, same valuation methods, same stage
            benchmarks you are reading above. Describe what you are building
            and you will get your own index number, valuation range and next
            steps.
          </p>
          <form
            action="/analyze"
            method="get"
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="kind" value="idea" />
            <label htmlFor="run-your-own-q" className="sr-only">
              Describe your startup
            </label>
            <input
              id="run-your-own-q"
              name="q"
              type="text"
              required
              minLength={12}
              placeholder={`We are building a ${p.sectorLabel} company that…`}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Score it free
            </button>
          </form>
          <p className="mt-3 text-xs text-secondary">
            Or{" "}
            <Link
              href="/analyze"
              className="rounded text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              upload a pitch deck or paste a website
            </Link>{" "}
            instead — those score higher-confidence than typed text.
          </p>
        </section>

        {/* ── Provenance ─────────────────────────────────────────── */}
        <footer className="rounded-2xl border border-line-subtle bg-surface p-5 text-xs leading-relaxed text-secondary">
          <p>
            {p.companyName} chose to publish this profile. The figures come
            from a single Startup Value Index analysis run on{" "}
            {analysed || "the date shown"} and are not verified financial
            statements. Nothing here is financial product advice, and it does
            not take your objectives or circumstances into account.
          </p>
          {!preview && (
            <p className="mt-3">
              <Link
                href="/listings"
                className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Browse every published Australian startup profile
              </Link>
            </p>
          )}
        </footer>
      </div>
    </article>
  );
}

export default PublicProfileBody;
