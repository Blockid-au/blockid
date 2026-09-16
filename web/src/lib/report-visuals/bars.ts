// bar — repo health (PTD primary), founder-fit factors (FTV secondary),
// money-on-the-table by A$ (grants). Horizontal bars with an optional
// reference tick per bar (e.g. stage p50) drawn as a dashed line.
// line — dilution path (CGH secondary) and any multi-series trend.

import { BAND_COLOUR, INK, SERIES, bandFor } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { BarData, LineData } from "./types";

export function renderBars(data: BarData, opts: RenderOpts): string {
  const width = Math.max(220, Math.round(fin(opts.width, 340)));
  const bars = (Array.isArray(data.bars) ? data.bars : []).slice(0, 12);
  const labelW = 110;
  const rowH = 22;
  const top = 18;
  const height = top + Math.max(1, bars.length) * rowH + (data.referenceLabel ? 18 : 8);
  const plotW = width - labelW - 60;
  const max = fin(data.max, 0) > 0 ? fin(data.max) : Math.max(1, ...bars.flatMap((b) => [fin(b?.value), fin(b?.reference, 0)]));
  let body = "";
  if (bars.length === 0) body += text(labelW + plotW / 2, top + 12, "No bars supplied", { size: 10, anchor: "middle", fill: INK.muted });
  bars.forEach((b, i) => {
    const y = top + i * rowH;
    const v = Math.max(0, fin(b.value));
    const w = Math.max(2, (Math.min(v, max) / max) * plotW);
    const colour = data.max === 100 || max === 100 ? BAND_COLOUR[bandFor(v)] : SERIES[i % SERIES.length];
    body += text(labelW - 8, y + rowH / 2 + 3, truncate(b.label, 20), { size: 9, anchor: "end", fill: INK.text });
    body += `<rect x="${labelW}" y="${y + 4}" width="${plotW}" height="${rowH - 8}" rx="3" fill="${INK.grid}" fill-opacity="0.6"/>`;
    body += `<rect x="${labelW}" y="${y + 4}" width="${num(w, 2)}" height="${rowH - 8}" rx="3" fill="${colour}"/>`;
    if (typeof b.reference === "number" && Number.isFinite(b.reference)) {
      const rx = labelW + (Math.min(Math.max(0, b.reference), max) / max) * plotW;
      body += `<line x1="${num(rx, 2)}" y1="${y + 1}" x2="${num(rx, 2)}" y2="${y + rowH - 1}" stroke="${INK.text}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
    }
    body += text(labelW + plotW + 6, y + rowH / 2 + 3, `${num(v, v >= 100 ? 0 : 1)}${data.unit ? ` ${data.unit}` : ""}`, { size: 9, fill: INK.muted });
  });
  if (data.referenceLabel) {
    const y = height - 5;
    body += `<line x1="${labelW}" y1="${y - 3}" x2="${labelW + 12}" y2="${y - 3}" stroke="${INK.text}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
    body += text(labelW + 16, y, truncate(data.referenceLabel, 40), { size: 8, fill: INK.faint });
  }
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}

export function renderLine(data: LineData, opts: RenderOpts): string {
  const width = Math.max(220, Math.round(fin(opts.width, 340)));
  const height = 150;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const series = (Array.isArray(data.series) ? data.series : []).slice(0, 6).map((s) => ({ label: String(s?.label ?? ""), points: (Array.isArray(s?.points) ? s.points : []).map((p) => fin(p)).slice(0, 60) }));
  const all = series.flatMap((s) => s.points);
  const n = Math.max(2, ...series.map((s) => s.points.length));
  const min = Math.min(0, ...all);
  const maxRaw = Math.max(...all, min + 1);
  const range = maxRaw - min || 1;
  const sx = (i: number) => padL + (i / (n - 1)) * plotW;
  const sy = (v: number) => padT + plotH - ((v - min) / range) * plotH;
  let body = `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${INK.grid}" stroke-width="1"/>`;
  body += text(padL - 4, padT + 4, `${num(maxRaw, maxRaw >= 100 ? 0 : 1)}${data.unit ?? ""}`, { size: 8, anchor: "end", fill: INK.faint });
  body += text(padL - 4, padT + plotH + 3, `${num(min, 0)}${data.unit ?? ""}`, { size: 8, anchor: "end", fill: INK.faint });
  if (all.length === 0) body += text(padL + plotW / 2, padT + plotH / 2, "No series", { size: 10, anchor: "middle", fill: INK.muted });
  series.forEach((s, si) => {
    if (s.points.length === 0) return;
    const d = s.points.map((v, i) => `${i === 0 ? "M" : "L"} ${num(sx(i), 2)} ${num(sy(v), 2)}`).join(" ");
    body += `<path d="${d}" fill="none" stroke="${SERIES[si % SERIES.length]}" stroke-width="2"${opts.dataState === "real" ? "" : ' stroke-dasharray="4 3"'}/>`;
    s.points.forEach((v, i) => {
      body += `<circle cx="${num(sx(i), 2)}" cy="${num(sy(v), 2)}" r="2.5" fill="${SERIES[si % SERIES.length]}"/>`;
    });
    const lx = padL + si * 90;
    body += `<rect x="${lx}" y="${height - 12}" width="10" height="3" fill="${SERIES[si % SERIES.length]}"/>` + text(lx + 14, height - 8, truncate(s.label, 14), { size: 8, fill: INK.muted });
  });
  (data.xLabels ?? []).slice(0, n).forEach((l, i) => {
    body += text(sx(i), padT + plotH + 12, truncate(l, 8), { size: 8, anchor: "middle", fill: INK.faint });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
