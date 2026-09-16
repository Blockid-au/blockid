// range_bars — valuation methods (low–mid–high per method) + consensus band
// + optional ask marker. Methods with `applicable:false` are drawn greyed and
// dashed so a pre-revenue report shows why revenue_multiple is empty.

import { BAND_COLOUR, INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { aud, fin, frame, num, text, truncate } from "./svg";
import type { RangeBarsData } from "./types";

export function renderRangeBars(data: RangeBarsData, opts: RenderOpts): string {
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 8);
  const width = Math.max(240, Math.round(fin(opts.width, 380)));
  const labelW = 120;
  const rowH = 24;
  const top = 22;
  const consensusH = data.consensus ? rowH + 6 : 0;
  const height = top + rows.length * rowH + consensusH + 26;
  const plotW = width - labelW - 16;
  const values = [
    ...rows.flatMap((r) => [fin(r.low), fin(r.high)]),
    ...(data.consensus ? [fin(data.consensus.low), fin(data.consensus.high)] : []),
    ...(data.marker ? [fin(data.marker.value)] : []),
  ].filter((v) => v > 0);
  const maxV = Math.max(1, ...values) * 1.08;
  const sx = (v: number) => labelW + (Math.max(0, fin(v)) / maxV) * plotW;
  let body = "";
  if (rows.length === 0 && !data.consensus) {
    body = text(width / 2, 30, "No valuation methods supplied", { size: 10, anchor: "middle", fill: INK.muted });
    return frame({ id: opts.id, title: opts.title, description: opts.description, width, height: 50, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
  }
  // Axis ticks.
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const x = labelW + plotW * t;
    body += `<line x1="${num(x, 2)}" y1="${top - 4}" x2="${num(x, 2)}" y2="${height - 18}" stroke="${INK.grid}" stroke-width="1"/>`;
    body += text(x, height - 6, aud(maxV * t), { size: 8, anchor: "middle", fill: INK.faint });
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const applicable = r.applicable !== false;
    const colour = applicable ? SERIES[i % SERIES.length] : BAND_COLOUR.pending;
    body += text(labelW - 8, y + rowH / 2 + 3, truncate(r.label, 20), { size: 9, anchor: "end", fill: applicable ? INK.text : INK.faint });
    const lo = Math.min(fin(r.low), fin(r.high));
    const hi = Math.max(fin(r.low), fin(r.high));
    const x1 = sx(lo);
    const x2 = Math.max(sx(hi), x1 + 3);
    body += `<rect x="${num(x1, 2)}" y="${y + 6}" width="${num(x2 - x1, 2)}" height="${rowH - 12}" rx="3" fill="${colour}" fill-opacity="${applicable ? 0.35 : 0.15}" stroke="${colour}" stroke-width="1"${applicable ? "" : ' stroke-dasharray="3 2"'}/>`;
    const mx = sx(fin(r.mid));
    body += `<line x1="${num(mx, 2)}" y1="${y + 4}" x2="${num(mx, 2)}" y2="${y + rowH - 4}" stroke="${colour}" stroke-width="2"/>`;
    body += text(Math.min(width - 4, x2 + 4), y + rowH / 2 + 3, applicable ? aud(r.mid) : "n/a", { size: 8, fill: INK.muted });
  });
  if (data.consensus) {
    const y = top + rows.length * rowH + 4;
    const c = data.consensus;
    const x1 = sx(Math.min(fin(c.low), fin(c.high)));
    const x2 = Math.max(sx(Math.max(fin(c.low), fin(c.high))), x1 + 3);
    body += text(labelW - 8, y + rowH / 2 + 3, truncate(c.label ?? "Consensus", 20), { size: 9, anchor: "end", fill: INK.text, weight: 700 });
    body += `<rect x="${num(x1, 2)}" y="${y + 4}" width="${num(x2 - x1, 2)}" height="${rowH - 8}" rx="3" fill="${BAND_COLOUR.strong}" fill-opacity="0.55"/>`;
    const mx = sx(fin(c.mid));
    body += `<line x1="${num(mx, 2)}" y1="${y + 2}" x2="${num(mx, 2)}" y2="${y + rowH - 2}" stroke="${INK.text}" stroke-width="2"/>`;
    body += text(Math.min(width - 4, x2 + 4), y + rowH / 2 + 3, `${aud(c.low)}–${aud(c.high)}`, { size: 8, fill: INK.text, weight: 600 });
  }
  if (data.marker) {
    const x = sx(fin(data.marker.value));
    body += `<line x1="${num(x, 2)}" y1="${top - 6}" x2="${num(x, 2)}" y2="${height - 18}" stroke="${BAND_COLOUR.early}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
    body += text(x, top - 8, `${truncate(data.marker.label, 14)} ${aud(data.marker.value)}`, { size: 8, anchor: "middle", fill: BAND_COLOUR.early });
  }
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
