// sparkline — monthly revenue (TRE primary) and cover Δ. When no series is
// connected the chart still renders: cohort band p25–p75, the startup's
// score marker and a dashed ghost line with "Connect Stripe/Xero to plot".

import { BAND_COLOUR, INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { SparklineData } from "./types";

export function renderSparkline(data: SparklineData, opts: RenderOpts): string {
  const width = Math.max(200, Math.round(fin(opts.width, 360)));
  const height = 120;
  const padL = 40;
  const padR = 12;
  const padT = 18;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const pts = (Array.isArray(data.points) ? data.points : []).map((p) => fin(p?.value)).slice(0, 60);
  const ghost = data.ghost === true || pts.length < 2;
  const series = ghost && pts.length < 2 ? [0.4, 0.45, 0.42, 0.5, 0.55, 0.53, 0.6, 0.66, 0.64, 0.72, 0.78, 0.85] : pts;
  const bandLo = data.band ? fin(data.band.low) : null;
  const bandHi = data.band ? fin(data.band.high) : null;
  const marker = data.marker ? fin(data.marker.value) : null;
  const all = [...series, ...(bandLo !== null ? [bandLo] : []), ...(bandHi !== null ? [bandHi] : []), ...(marker !== null ? [marker] : [])];
  const min = ghost && pts.length < 2 ? 0 : Math.min(0, ...all);
  const max = Math.max(1e-9, ...all) === Math.min(...all) ? Math.max(1, ...all) + 1 : Math.max(...all);
  const range = max - min || 1;
  const sy = (v: number) => padT + plotH - ((fin(v) - min) / range) * plotH;
  const sx = (i: number) => padL + (series.length > 1 ? (i / (series.length - 1)) * plotW : plotW / 2);
  let body = "";
  // Cohort band.
  if (bandLo !== null && bandHi !== null) {
    const y1 = sy(Math.max(bandLo, bandHi));
    const y2 = sy(Math.min(bandLo, bandHi));
    body += `<rect x="${padL}" y="${num(y1, 2)}" width="${plotW}" height="${num(Math.max(1, y2 - y1), 2)}" fill="${BAND_COLOUR.pending}" fill-opacity="0.15"/>`;
    body += text(padL + 4, y1 - 3, truncate(data.band?.label ?? "cohort p25–p75", 30), { size: 8, fill: INK.faint });
  }
  // Baseline + axis labels.
  body += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${INK.grid}" stroke-width="1"/>`;
  body += text(padL - 4, padT + 4, num(max, max >= 100 ? 0 : 1), { size: 8, anchor: "end", fill: INK.faint });
  body += text(padL - 4, padT + plotH + 3, num(min, 0), { size: 8, anchor: "end", fill: INK.faint });
  const path = series.map((v, i) => `${i === 0 ? "M" : "L"} ${num(sx(i), 2)} ${num(sy(v), 2)}`).join(" ");
  if (ghost) {
    body += `<path d="${path}" fill="none" stroke="${BAND_COLOUR.pending}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    body += text(padL + plotW / 2, padT + plotH / 2 + 4, truncate(data.ghostLabel ?? "Connect Stripe / Xero to plot revenue", 48), { size: 9, anchor: "middle", fill: INK.muted });
  } else {
    body += `<path d="${path}" fill="none" stroke="${SERIES[0]}" stroke-width="2"/>`;
    const last = series[series.length - 1];
    body += `<circle cx="${num(sx(series.length - 1), 2)}" cy="${num(sy(last), 2)}" r="3" fill="${SERIES[0]}"/>`;
    body += text(padL + plotW, padT - 4, `${num(last, last >= 100 ? 0 : 1)}${data.unit ? ` ${data.unit}` : ""}`, { size: 9, anchor: "end", fill: INK.text, weight: 600 });
  }
  if (marker !== null) {
    const y = sy(marker);
    body += `<line x1="${padL}" y1="${num(y, 2)}" x2="${padL + plotW}" y2="${num(y, 2)}" stroke="${BAND_COLOUR.strong}" stroke-width="1.5"/>`;
    body += text(padL + plotW, y - 3, `${truncate(data.marker?.label ?? "you", 18)} ${num(marker, 0)}`, { size: 8, anchor: "end", fill: BAND_COLOUR.strong, weight: 600 });
  }
  const first = data.points?.[0]?.label;
  const lastLabel = data.points?.[data.points.length - 1]?.label;
  if (!ghost && first) body += text(padL, height - 6, truncate(first, 10), { size: 8, fill: INK.faint });
  if (!ghost && lastLabel) body += text(padL + plotW, height - 6, truncate(lastLabel, 10), { size: 8, anchor: "end", fill: INK.faint });
  // G19-S47: the top-right data-state badge collided with the last-value /
  // marker label at the plot's top edge ("benchmark only" over the 80 tick on
  // the TRE chart). The state lives in the caption row (VisualFigure) instead.
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: true }, body);
}
