// route_map — the 12 growth phases as a horizontal route with the current
// phase highlighted (executive summary mini map, phase-gates chapter).

import { BAND_COLOUR, INK } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, num, text, truncate } from "./svg";
import type { RouteMapData } from "./types";

export function renderRouteMap(data: RouteMapData, opts: RenderOpts): string {
  const width = Math.max(240, Math.round(fin(opts.width, 420)));
  const phases = (Array.isArray(data.phases) ? data.phases : []).slice(0, 16);
  const height = 84;
  const padL = 18;
  const padR = 18;
  const y = 40;
  const plotW = width - padL - padR;
  let body = "";
  if (phases.length === 0) {
    body = text(width / 2, 40, "No phases", { size: 10, anchor: "middle", fill: INK.muted });
    return frame({ id: opts.id, title: opts.title, description: opts.description, width, height: 60, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
  }
  const step = phases.length > 1 ? plotW / (phases.length - 1) : 0;
  const currentIdx = Math.max(0, phases.findIndex((p) => p.status === "current"));
  body += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="${INK.grid}" stroke-width="3"/>`;
  if (currentIdx > 0) body += `<line x1="${padL}" y1="${y}" x2="${num(padL + step * currentIdx, 2)}" y2="${y}" stroke="${BAND_COLOUR.strong}" stroke-width="3"/>`;
  phases.forEach((p, i) => {
    const x = padL + step * i;
    const isCurrent = p.status === "current";
    const fill = p.status === "done" ? BAND_COLOUR.strong : isCurrent ? BAND_COLOUR.developing : INK.surface;
    const stroke = p.status === "upcoming" ? INK.faint : fill;
    body += `<circle cx="${num(x, 2)}" cy="${y}" r="${isCurrent ? 8 : 5}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    body += text(x, y + (i % 2 === 0 ? 20 : 32), truncate(p.label, 12), { size: 8, anchor: "middle", fill: isCurrent ? INK.text : INK.muted, weight: isCurrent ? 700 : undefined });
    if (isCurrent) body += text(x, y - 14, "you are here", { size: 8, anchor: "middle", fill: BAND_COLOUR.developing, weight: 600 });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
