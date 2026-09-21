// dim_bars — G27 dashboard chart: the 8 dimensions as horizontal bars against
// the stage median band (spec docs/design/tbr-v3-investor-report-spec.md § 5).
//
//   one series ("your score") in navy · the p25–p75 band as a sunken strip
//   behind each bar · a 2 px p50 tick in muted ink · a direct value label on
//   every bar (8 values — a small dataset) · x ticks 0 / 50 / 100 only, no
//   gridlines · a pending dimension draws no bar, text only · the band is
//   omitted when the cohort is below the publication floor (the caption says
//   so — the caller decides, this renderer only draws what it is given).
//
// Series colour never changes with the number of rows (colour follows the
// entity). Same strict SVG subset as every other renderer, so the react-pdf
// twin and the PNG rasteriser draw the identical geometry.

import { INK } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { DimBarsData } from "./types";

/** Navy — `--color-brand-navy` in the light template. */
export const DIM_BAR_NAVY = "#1B2A5E";
/** Sunken surface for the p25–p75 band. */
export const DIM_BAR_BAND = "#E5E7EB";

export function renderDimBars(data: DimBarsData, opts: RenderOpts): string {
  const width = Math.max(260, Math.round(fin(opts.width, 560)));
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 8);
  const compact = width < 420;
  const labelW = compact ? 0 : 150;
  const valueW = 40;
  const rowH = compact ? 34 : 26;
  const top = 16;
  const axisH = 16;
  const height = top + Math.max(1, rows.length) * rowH + axisH + 6;
  const plotX = labelW + 4;
  const plotW = width - plotX - valueW - 8;
  const x = (v: number) => plotX + (Math.max(0, Math.min(100, fin(v))) / 100) * plotW;
  let body = "";
  if (rows.length === 0) body += text(plotX + plotW / 2, top + 14, "No dimensions supplied", { size: 10, anchor: "middle", fill: INK.muted });
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const barY = compact ? y + 16 : y + 6;
    const barH = compact ? 12 : 14;
    const pending = r.pending === true || !Number.isFinite(r.value);
    const label = truncate(r.label, compact ? 26 : 22);
    if (compact) body += text(plotX, y + 11, label, { size: 9, fill: INK.text });
    else body += text(labelW - 4, barY + barH / 2 + 3.5, label, { size: 9.5, anchor: "end", fill: INK.text });
    if (pending) {
      body += text(plotX, barY + barH / 2 + 3.5, r.pendingLabel ?? "— / 100 · pending", { size: 9, fill: INK.muted });
      return;
    }
    const band = data.showBand !== false && typeof r.p25 === "number" && typeof r.p75 === "number" && Number.isFinite(r.p25) && Number.isFinite(r.p75);
    if (band) {
      const bx = x(r.p25 as number);
      const bw = Math.max(1, x(r.p75 as number) - bx);
      body += `<rect x="${num(bx, 2)}" y="${barY - 3}" width="${num(bw, 2)}" height="${barH + 6}" rx="2" fill="${DIM_BAR_BAND}"/>`;
    }
    const w = Math.max(2, x(r.value) - plotX);
    body += `<rect x="${plotX}" y="${barY}" width="${num(w, 2)}" height="${barH}" rx="3" fill="${DIM_BAR_NAVY}"/>`;
    if (band && typeof r.p50 === "number" && Number.isFinite(r.p50)) {
      const mx = x(r.p50);
      body += `<line x1="${num(mx, 2)}" y1="${barY - 4}" x2="${num(mx, 2)}" y2="${barY + barH + 4}" stroke="${INK.muted}" stroke-width="2"/>`;
    }
    body += text(plotX + plotW + 6, barY + barH / 2 + 3.5, `${Math.round(fin(r.value))}`, { size: 10, fill: INK.text, weight: 700 });
  });
  // Axis: 0 / 50 / 100 only.
  const ay = top + Math.max(1, rows.length) * rowH + 10;
  for (const tick of [0, 50, 100]) {
    body += `<line x1="${num(x(tick), 2)}" y1="${ay - 6}" x2="${num(x(tick), 2)}" y2="${ay - 2}" stroke="${INK.grid}" stroke-width="1"/>`;
    body += text(x(tick), ay + 7, String(tick), { size: 8, anchor: tick === 0 ? "start" : tick === 100 ? "end" : "middle", fill: INK.faint });
  }
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge ?? true }, body);
}
