// Startup Index movers — the ONE pure rule behind "Top winners" / "Biggest
// drops" on /startup-index and the Δ 7d / 1d cells on the listings pages
// (G29 lane D, 2026-09-22).
//
// Why this exists: the aggregator used to build `losers` by sorting the same
// movers[] ascending, so with a single +100 mover that company was printed
// under "Biggest drops"; and a day with no close was back-filled with the
// index median, so the hero printed "−99.0 1d" against a placeholder
// baseline. The rule is now:
//
//   • a company with no prior close is "new" — it carries no % change and is
//     never a −99 / −100 / +100 artefact;
//   • gainers  = strictly positive changes, largest first;
//   • drops    = strictly NEGATIVE changes only, most negative first — a
//                positive mover can never be a drop;
//   • ties (|Δ| below the noise floor) and NaN / non-finite inputs are
//     excluded from both lists.
//
// `deltaOrNull` is the same rule for the hero index (1d / 7d): null when
// either close is missing, never a delta against a filler.
//
// Pure and dependency-free so the aggregator, the listings module, the API
// routes and the unit pins (startup-index-movers.test.ts) share one truth.

export interface MoverInput {
  ticker: string;
  slug: string;
  sector: string;
  /** Latest close (uncapped SVI). */
  svi: number;
  /** Prior close, or null / undefined when there is none ("new"). */
  priorSvi: number | null | undefined;
}

export interface Mover {
  ticker: string;
  slug: string;
  sector: string;
  svi: number;
  deltaWeek: number;
}

export interface NewListing {
  ticker: string;
  slug: string;
  sector: string;
  svi: number;
}

export interface MoversResult {
  /** Strictly positive Δ, descending, at most `limit`. */
  winners: Mover[];
  /** Strictly negative Δ, ascending (most negative first), at most `limit`. */
  losers: Mover[];
  /** Companies with a close but no prior close — no Δ is ever printed for them. */
  newListings: NewListing[];
}

export interface MoversOptions {
  /** Rows per list (default 5). */
  limit?: number;
  /** |Δ| below this is a tie and drops out of both lists (default 1 index point). */
  noiseFloor?: number;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Δ between two closes, or null when either is missing / non-finite.
 * Never subtracts against a filler: "no prior close" is `null`, not 0.
 */
export function deltaOrNull(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(prior)) return null;
  const d = current - prior;
  return Number.isFinite(d) ? d : null;
}

/** The movers rule (see file header). Input order does not matter; output is deterministic (ties on Δ break by ticker). */
export function moversFor(rows: readonly MoverInput[], opts: MoversOptions = {}): MoversResult {
  const limit = Math.max(0, Math.floor(opts.limit ?? 5));
  const noiseFloor = isFiniteNumber(opts.noiseFloor) ? Math.max(0, opts.noiseFloor) : 1;

  const movers: Mover[] = [];
  const newListings: NewListing[] = [];

  for (const r of rows) {
    if (!r || !isFiniteNumber(r.svi)) continue; // no close at all — not listed
    const base = { ticker: r.ticker, slug: r.slug, sector: r.sector, svi: r.svi };
    const delta = deltaOrNull(r.svi, r.priorSvi);
    if (delta === null) {
      newListings.push(base);
      continue;
    }
    if (Math.abs(delta) < noiseFloor) continue; // tie / noise
    movers.push({ ...base, deltaWeek: delta });
  }

  const byTicker = (a: Mover, b: Mover) => a.ticker.localeCompare(b.ticker);
  const winners = movers
    .filter((m) => m.deltaWeek > 0)
    .sort((a, b) => b.deltaWeek - a.deltaWeek || byTicker(a, b))
    .slice(0, limit);
  const losers = movers
    .filter((m) => m.deltaWeek < 0)
    .sort((a, b) => a.deltaWeek - b.deltaWeek || byTicker(a, b))
    .slice(0, limit);

  return { winners, losers, newListings };
}

/**
 * Display text for a Δ cell: "+8.0", "−6.5", "0.0", or the `newLabel`
 * ("new") when there is no prior close. Uses a true minus sign.
 */
export function formatDelta(delta: number | null | undefined, opts: { digits?: number; newLabel?: string } = {}): string {
  const digits = opts.digits ?? 1;
  if (!isFiniteNumber(delta)) return opts.newLabel ?? "new";
  if (delta > 0) return `+${delta.toFixed(digits)}`;
  if (delta < 0) return `−${Math.abs(delta).toFixed(digits)}`;
  return (0).toFixed(digits);
}
