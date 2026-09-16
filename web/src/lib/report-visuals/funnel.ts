// funnel — AARRR (TRE secondary) and TAM/SAM/SOM (MPC primary).
// Stages shrink proportionally to value; widths are clamped so a zero stage
// still draws a labelled sliver (no text-only chapter, spec §A.3 rule).

import { INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { FunnelData } from "./types";

export function renderFunnel(data: FunnelData, opts: RenderOpts): string {
  const width = Math.max(200, Math.round(fin(opts.width, 320)));
  const stages = (Array.isArray(data.stages) ? data.stages : []).slice(0, 8);
  const rowH = 30;
  const gap = 6;
  const top = 18;
  const height = top + stages.length * (rowH + gap) + 6;
  const maxVal = Math.max(1, ...stages.map((s) => Math.abs(fin(s.value))));
  const labelW = 96;
  const barMaxW = width - labelW - 70;
  let body = "";
  if (stages.length === 0) {
    body = text(width / 2, 40, "No funnel stages supplied", { size: 10, anchor: "middle", fill: INK.muted });
    return frame({ id: opts.id, title: opts.title, description: opts.description, width, height: 60, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
  }
  stages.forEach((s, i) => {
    const y = top + i * (rowH + gap);
    const v = Math.abs(fin(s.value));
    const w = Math.max(6, (v / maxVal) * barMaxW);
    const x = labelW + (barMaxW - w) / 2;
    const colour = SERIES[i % SERIES.length];
    body += `<rect x="${num(x, 2)}" y="${y}" width="${num(w, 2)}" height="${rowH}" rx="4" fill="${colour}" fill-opacity="${0.9 - i * 0.08}"/>`;
    body += text(labelW - 8, y + rowH / 2 + 4, truncate(s.label, 16), { size: 10, anchor: "end", fill: INK.text, weight: 600 });
    const display = s.display ?? `${num(v, v >= 100 ? 0 : 1)}${data.unit ? ` ${data.unit}` : ""}`;
    body += text(labelW + barMaxW + 8, y + rowH / 2 + 4, truncate(display, 12), { size: 10, fill: INK.muted });
    if (i > 0) {
      const prev = Math.abs(fin(stages[i - 1].value));
      const conv = prev > 0 ? (v / prev) * 100 : 0;
      body += text(labelW + barMaxW / 2, y - 1, `${num(conv, 0)}%`, { size: 8, anchor: "middle", fill: INK.faint });
    }
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
