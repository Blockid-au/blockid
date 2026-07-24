// InvestorWeeklyDigest — pure email helpers.
//
// Consumed by the /api/cron/investor-weekly-digest endpoint (P7,
// docs/plans/atlassian-standard-mapping-goal.md §P7_weekly_digest_integration).
// Kept side-effect-free so the digest can be unit tested + used from a
// dry-run harness.

export interface InvestorDigestTickerRow {
  /** Anonymous ticker (SVI Markets identifier — always safe to expose). */
  ticker: string;
  /** Latest analysis slug — deep-links to /listings/{ticker}. */
  slug: string | null;
  /** Latest SVI score. */
  svi: number;
  /** SVI delta since the last digest snapshot (positive == improved). */
  deltaSinceLastDigest: number | null;
  /** Latest phase / stage marker (e.g. "Revenue / Business Model"). */
  latestPhaseLabel: string | null;
  /** Sector label used in the row header. */
  sectorLabel?: string;
}

export interface BuildInvestorDigestInput {
  name: string;
  /** Top 5 rows only. Callers must pre-slice + pre-sort. */
  tickers: InvestorDigestTickerRow[];
  /** When true render the empty-state instead of a table. */
  isEmpty: boolean;
  /** Public URL of the browse-listings landing page. */
  browseUrl: string;
  /** Public URL of the investor's watchlist. */
  watchlistUrl: string;
  /** Unsubscribe URL honoured by the sendEmail wrapper. */
  unsubscribeUrl?: string;
}

export interface InvestorDigestEmail {
  subject: string;
  html: string;
  text: string;
}

const AFSL_DISCLAIMER =
  "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). BlockID does not hold an Australian Financial Services Licence.";

function fmtDelta(d: number | null): { arrow: string; label: string; colour: string } {
  if (d === null) {
    return { arrow: "•", label: "new", colour: "#0369a1" };
  }
  if (d > 0) return { arrow: "▲", label: `+${d.toFixed(1)}`, colour: "#047857" };
  if (d < 0) return { arrow: "▼", label: d.toFixed(1), colour: "#be123c" };
  return { arrow: "—", label: "0.0", colour: "#475569" };
}

/**
 * Build the subject + HTML + plain-text bodies for the investor weekly
 * digest. Pure — no I/O; the calling cron composes the row array + URLs
 * and then hands the result to sendEmail().
 */
export function buildInvestorDigest(
  input: BuildInvestorDigestInput,
): InvestorDigestEmail {
  const name = input.name || "there";
  const subject = input.isEmpty
    ? "Your BlockID investor digest — start tracking startups"
    : `Your weekly investor digest — ${input.tickers.length} tracked startup${input.tickers.length === 1 ? "" : "s"} moved`;

  const html = input.isEmpty
    ? renderEmptyHtml(name, input.browseUrl, input.unsubscribeUrl)
    : renderRowsHtml(name, input.tickers, input.watchlistUrl, input.unsubscribeUrl);

  const text = input.isEmpty
    ? renderEmptyText(name, input.browseUrl)
    : renderRowsText(name, input.tickers, input.watchlistUrl);

  return { subject, html, text };
}

function renderEmptyHtml(name: string, browseUrl: string, unsub?: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="padding:24px;border-bottom:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Investor · Weekly digest</p>
      <h1 style="margin:8px 0 0;font-size:22px">Hi ${escapeHtml(name)},</h1>
      <p style="margin:8px 0 0;color:#475569;font-size:14px">You haven't tracked any startups yet — add a ticker to your watchlist and this digest will show its SVI movement each week.</p>
    </div>
    <div style="padding:20px 24px">
      <a href="${browseUrl}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Browse the catalog</a>
    </div>
    <div style="padding:16px 24px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b">
      ${escapeHtml(AFSL_DISCLAIMER)}
      ${unsub ? `<br/><a href="${unsub}" style="color:#64748b">Unsubscribe</a>` : ""}
    </div>
  </div>
</body></html>`;
}

function renderEmptyText(name: string, browseUrl: string): string {
  return `Hi ${name},

You haven't tracked any startups yet — no startups tracked yet. Browse the catalog to add tickers to your watchlist:

  ${browseUrl}

${AFSL_DISCLAIMER}`;
}

function renderRowsHtml(
  name: string,
  rows: InvestorDigestTickerRow[],
  watchlistUrl: string,
  unsub?: string,
): string {
  const tableRows = rows
    .map((r) => {
      const d = fmtDelta(r.deltaSinceLastDigest);
      const phase = r.latestPhaseLabel
        ? `<div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(r.latestPhaseLabel)}</div>`
        : "";
      const sector = r.sectorLabel
        ? `<span style="font-size:11px;color:#64748b;margin-left:6px">${escapeHtml(r.sectorLabel)}</span>`
        : "";
      const href = r.slug
        ? `https://blockid.au/listings/${encodeURIComponent(r.ticker)}`
        : `https://blockid.au/dashboard/watchlist`;
      return `
      <tr>
        <td style="padding:10px 12px;font-family:monospace;font-weight:600;vertical-align:top">
          ${escapeHtml(r.ticker)}${sector}
          ${phase}
        </td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;vertical-align:top">${r.svi.toFixed(1)}</td>
        <td style="padding:10px 12px;text-align:right;color:${d.colour};vertical-align:top">${d.arrow} ${escapeHtml(d.label)}</td>
        <td style="padding:10px 12px;text-align:right;vertical-align:top">
          <a href="${href}" style="color:#0f766e;font-weight:600;text-decoration:none">Open</a>
        </td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="padding:24px;border-bottom:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Investor · Weekly digest</p>
      <h1 style="margin:8px 0 0;font-size:22px">Hi ${escapeHtml(name)},</h1>
      <p style="margin:8px 0 0;color:#475569;font-size:14px">Top ${rows.length} tracked startup${rows.length === 1 ? "" : "s"} on your watchlist — SVI change since last digest + latest phase moment.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.08em">
          <th align="left" style="padding:10px 12px">Ticker · phase</th>
          <th align="right" style="padding:10px 12px">SVI</th>
          <th align="right" style="padding:10px 12px">Δ since last</th>
          <th align="right" style="padding:10px 12px"></th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
      <a href="${watchlistUrl}" style="color:#0f766e;font-weight:600;text-decoration:none">Manage your watchlist →</a>
    </div>
    <div style="padding:16px 24px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b">
      ${escapeHtml(AFSL_DISCLAIMER)}
      ${unsub ? `<br/><a href="${unsub}" style="color:#64748b">Unsubscribe</a>` : ""}
    </div>
  </div>
</body></html>`;
}

function renderRowsText(
  name: string,
  rows: InvestorDigestTickerRow[],
  watchlistUrl: string,
): string {
  const lines = rows.map((r) => {
    const d = fmtDelta(r.deltaSinceLastDigest);
    const phase = r.latestPhaseLabel ? ` · ${r.latestPhaseLabel}` : "";
    return `  ${r.ticker}${phase}\n    SVI ${r.svi.toFixed(1)} (${d.arrow} ${d.label})`;
  });
  return `Hi ${name},

Top ${rows.length} startup${rows.length === 1 ? "" : "s"} on your watchlist:

${lines.join("\n\n")}

Manage your watchlist: ${watchlistUrl}

${AFSL_DISCLAIMER}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
