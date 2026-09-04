// Wave 28A — Founder Weekly Digest email renderer.
//
// Pure. Takes a DigestPayload (from lib/digest/weekly.ts) and emits an
// inline-CSS HTML + text mirror. Visual language mirrors
// lib/email/founder-digest.ts (rounded card, teal accents, uppercase kicker).

import type { DigestPayload } from "@/lib/digest/weekly";

export interface RenderedFounderDigest {
  subject: string;
  html: string;
  text: string;
}

const AFSL_DISCLAIMER =
  "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). BlockID does not hold an Australian Financial Services Licence.";

const INTEREST_LABEL: Record<string, string> = {
  exploring: "Exploring",
  warm: "Warm",
  ready_to_talk: "Ready to talk",
};

const INTEREST_COLOUR: Record<string, string> = {
  exploring: "#64748b",
  warm: "#b45309",
  ready_to_talk: "#047857",
};

export function renderFounderDigestEmail(payload: DigestPayload): RenderedFounderDigest {
  const subject = `📊 Your BlockID week — ${payload.views.count} view${
    payload.views.count === 1 ? "" : "s"
  }, ${payload.leads.count} new lead${payload.leads.count === 1 ? "" : "s"}`;

  const html = renderHtml(payload);
  const text = renderText(payload);
  return { subject, html, text };
}

function renderHtml(p: DigestPayload): string {
  const viewsBlock = renderViewsBlock(p);
  const leadsBlock = renderLeadsBlock(p);
  const sviBlock = renderSviBlock(p);
  const actionBlock = renderActionBlock(p);
  const shareBlock = p.shareUrl
    ? `<div style="padding:16px 24px;border-top:1px solid #e2e8f0"><p style="margin:0;font-size:13px;color:#475569">Your current share link:</p><p style="margin:6px 0 0"><a href="${escapeAttr(p.shareUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none;word-break:break-all">${escapeHtml(p.shareUrl)}</a></p></div>`
    : "";

  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="padding:24px;border-bottom:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Founder · Weekly digest</p>
      <h1 style="margin:8px 0 0;font-size:22px">Hi ${escapeHtml(p.founderName)},</h1>
      <p style="margin:8px 0 0;color:#475569;font-size:14px">Here's what happened on your BlockID report between ${escapeHtml(formatDate(p.periodStart))} and ${escapeHtml(formatDate(p.periodEnd))}.</p>
    </div>
    ${viewsBlock}
    ${leadsBlock}
    ${sviBlock}
    ${actionBlock}
    ${shareBlock}
    <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
      <a href="${escapeAttr(p.notificationsUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none">Open your notifications inbox →</a>
    </div>
    <div style="padding:16px 24px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b">
      ${escapeHtml(AFSL_DISCLAIMER)}
    </div>
  </div>
</body></html>`;
}

function renderViewsBlock(p: DigestPayload): string {
  if (p.views.count === 0) {
    return `<div style="padding:16px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Report views</p>
      <p style="margin:0;font-size:14px;color:#475569">No investor views this week — share your link to get eyes on your report.</p>
    </div>`;
  }
  return `<div style="padding:16px 24px;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Report views</p>
    <p style="margin:0;font-size:28px;font-weight:700;color:#0f172a">${p.views.count}<span style="font-size:14px;color:#64748b;font-weight:400"> view${p.views.count === 1 ? "" : "s"}</span></p>
    <p style="margin:4px 0 0;color:#475569;font-size:13px">${p.views.uniqueCountries} countr${p.views.uniqueCountries === 1 ? "y" : "ies"}${p.views.topCountry ? ` · Top country: <strong>${escapeHtml(p.views.topCountry)}</strong>` : ""}</p>
  </div>`;
}

function renderLeadsBlock(p: DigestPayload): string {
  if (p.leads.count === 0) {
    return `<div style="padding:16px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">New investor leads</p>
      <p style="margin:0;font-size:14px;color:#475569">No new leads this week.</p>
    </div>`;
  }
  const rows = p.leads.items
    .map((l) => {
      const label = INTEREST_LABEL[l.interestLevel] ?? l.interestLevel;
      const colour = INTEREST_COLOUR[l.interestLevel] ?? "#64748b";
      return `<li style="margin:6px 0;font-size:13px;color:#0f172a">
        <strong>${escapeHtml(l.firm || "Anonymous")}</strong>
        <span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#f1f5f9;color:${colour};border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(label)}</span>
        ${l.country ? `<span style="color:#64748b;margin-left:6px;font-size:11px">${escapeHtml(l.country)}</span>` : ""}
      </li>`;
    })
    .join("");
  return `<div style="padding:16px 24px;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">New investor leads</p>
    <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#0f172a">${p.leads.count}<span style="font-size:14px;color:#64748b;font-weight:400"> new lead${p.leads.count === 1 ? "" : "s"}</span></p>
    <ul style="margin:0;padding-left:20px">${rows}</ul>
  </div>`;
}

function renderSviBlock(p: DigestPayload): string {
  if (!p.svi) return "";
  const { current, previous, delta, newSnapshot } = p.svi;
  let summary: string;
  let colour = "#64748b";
  let arrow = "—";
  if (delta === null) {
    summary = newSnapshot ? "First snapshot on record" : "No prior snapshot to compare";
  } else if (delta > 0) {
    summary = `+${delta} pts vs the start of the week`;
    colour = "#047857";
    arrow = "▲";
  } else if (delta < 0) {
    summary = `${delta} pts vs the start of the week`;
    colour = "#be123c";
    arrow = "▼";
  } else {
    summary = "No change this week";
  }
  return `<div style="padding:16px 24px;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Startup Value Index</p>
    <p style="margin:0;font-size:28px;font-weight:700;color:${colour}">${current}<span style="font-size:14px;color:#64748b;font-weight:400"> /100</span></p>
    <p style="margin:4px 0 0;color:${colour};font-size:13px;font-weight:600">${arrow} ${escapeHtml(summary)}${previous !== null ? ` (was ${previous})` : ""}</p>
  </div>`;
}

function renderActionBlock(p: DigestPayload): string {
  if (!p.topAction) return "";
  const a = p.topAction;
  return `<div style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f0fdfa">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:0.16em">How to improve your SVI</p>
    <p style="margin:0 0 4px;font-size:12px;color:#475569">Weakest dimension this week: <strong>${escapeHtml(a.label)}</strong> (${a.score}/100)</p>
    <h2 style="margin:6px 0 4px;font-size:16px;color:#0f172a">${escapeHtml(a.headline)}</h2>
    <p style="margin:0 0 12px;color:#475569;font-size:13px">${escapeHtml(a.reason)}</p>
    <a href="${escapeAttr(a.ctaUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Improve this dimension →</a>
  </div>`;
}

function renderText(p: DigestPayload): string {
  const lines: string[] = [];
  lines.push(`Hi ${p.founderName},`, "");
  lines.push(
    `Here's what happened on your BlockID report between ${formatDate(p.periodStart)} and ${formatDate(p.periodEnd)}.`,
    "",
  );
  lines.push("REPORT VIEWS");
  if (p.views.count === 0) {
    lines.push("  No investor views this week.");
  } else {
    lines.push(
      `  ${p.views.count} view${p.views.count === 1 ? "" : "s"} across ${p.views.uniqueCountries} countr${p.views.uniqueCountries === 1 ? "y" : "ies"}`,
    );
    if (p.views.topCountry) lines.push(`  Top country: ${p.views.topCountry}`);
  }
  lines.push("");
  lines.push("NEW INVESTOR LEADS");
  if (p.leads.count === 0) {
    lines.push("  No new leads this week.");
  } else {
    lines.push(`  ${p.leads.count} new lead${p.leads.count === 1 ? "" : "s"}:`);
    for (const l of p.leads.items) {
      const label = INTEREST_LABEL[l.interestLevel] ?? l.interestLevel;
      lines.push(
        `    - ${l.firm || "Anonymous"} [${label}]${l.country ? ` — ${l.country}` : ""}`,
      );
    }
  }
  lines.push("");
  if (p.svi) {
    lines.push("STARTUP VALUE INDEX");
    lines.push(`  Current: ${p.svi.current}/100`);
    if (p.svi.delta !== null) {
      const sign = p.svi.delta > 0 ? "+" : "";
      lines.push(`  Change:  ${sign}${p.svi.delta} pts (was ${p.svi.previous})`);
    } else if (p.svi.newSnapshot) {
      lines.push("  First snapshot on record.");
    }
    lines.push("");
  }
  if (p.topAction) {
    lines.push("HOW TO IMPROVE YOUR SVI");
    lines.push(
      `  Weakest dimension: ${p.topAction.label} (${p.topAction.score}/100)`,
    );
    lines.push(`  → ${p.topAction.headline}`);
    lines.push(`    ${p.topAction.reason}`);
    lines.push(`    ${p.topAction.ctaUrl}`);
    lines.push("");
  }
  if (p.shareUrl) {
    lines.push(`Your share link: ${p.shareUrl}`);
  }
  lines.push(`Notifications inbox: ${p.notificationsUrl}`, "");
  lines.push(AFSL_DISCLAIMER);
  return lines.join("\n");
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
