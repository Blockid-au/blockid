// checklist — ASIC / ATO / OAIC / IP / Essential Eight (LCO primary) and any
// done / pending / unknown list. Status is encoded by glyph + label, never
// by colour alone.

import { BAND_COLOUR, INK } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, text, truncate } from "./svg";
import type { ChecklistData, ChecklistStatus } from "./types";

const GLYPH: Record<ChecklistStatus, { mark: string; colour: string; label: string }> = {
  done: { mark: "✓", colour: BAND_COLOUR.strong, label: "done" },
  pending: { mark: "•", colour: BAND_COLOUR.developing, label: "pending" },
  unknown: { mark: "?", colour: BAND_COLOUR.pending, label: "unknown" },
  na: { mark: "–", colour: INK.faint, label: "n/a" },
};

export function renderChecklist(data: ChecklistData, opts: RenderOpts): string {
  const width = Math.max(200, Math.round(fin(opts.width, 340)));
  const items = (Array.isArray(data.items) ? data.items : []).slice(0, 14);
  const rowH = 20;
  const top = 20;
  const height = top + Math.max(1, items.length) * rowH + 8;
  let body = "";
  if (items.length === 0) {
    body = text(width / 2, 30, "No checklist items", { size: 10, anchor: "middle", fill: INK.muted });
  }
  const done = items.filter((i) => i.status === "done").length;
  body += text(8, 12, `${done} of ${items.length} done`, { size: 9, fill: INK.muted });
  items.forEach((item, i) => {
    const y = top + i * rowH;
    const g = GLYPH[item.status] ?? GLYPH.unknown;
    body += `<circle cx="16" cy="${y + 8}" r="7" fill="${g.colour}" fill-opacity="0.18" stroke="${g.colour}" stroke-width="1"/>`;
    body += text(16, y + 11, g.mark, { size: 9, anchor: "middle", fill: g.colour, weight: 700 });
    body += text(30, y + 12, truncate(item.label, 34), { size: 10, fill: INK.text });
    body += text(width - 8, y + 12, item.detail ? truncate(item.detail, 18) : g.label, { size: 8, anchor: "end", fill: INK.muted });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}
