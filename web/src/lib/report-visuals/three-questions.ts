// three_questions_strip — Where / Worth / Next on the cover (CEO answers).
// Three cards with wrapped text; the words are the CEO's, the strip is ours.

import { INK, SERIES } from "./palette";
import type { RenderOpts } from "./render-opts";
import { fin, frame, text, truncate } from "./svg";
import type { ThreeQuestionsData } from "./types";

function wrap(s: string, maxChars: number, maxLines: number): string[] {
  const words = String(s ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], maxChars - 1);
  }
  return lines;
}

export function renderThreeQuestions(data: ThreeQuestionsData, opts: RenderOpts): string {
  const width = Math.max(300, Math.round(fin(opts.width, 480)));
  const height = 96;
  const gap = 8;
  const cardW = (width - gap * 4) / 3;
  const cards: Array<[string, string, string]> = [
    ["Where are we?", data.where ?? "", SERIES[0]],
    ["What are we worth?", data.worth ?? "", SERIES[2]],
    ["What next?", data.next ?? "", SERIES[1]],
  ];
  let body = "";
  cards.forEach(([q, a, colour], i) => {
    const x = gap + i * (cardW + gap);
    body += `<rect x="${x}" y="8" width="${cardW}" height="${height - 16}" rx="8" fill="${INK.surfaceAlt}" stroke="${INK.grid}" stroke-width="1"/>`;
    body += `<rect x="${x}" y="8" width="4" height="${height - 16}" rx="2" fill="${colour}"/>`;
    body += text(x + 12, 24, q, { size: 9, fill: colour, weight: 700 });
    const maxChars = Math.max(12, Math.floor(cardW / 4.6));
    wrap(a, maxChars, 4).forEach((line, li) => {
      body += text(x + 12, 40 + li * 13, line, { size: 9, fill: INK.text });
    });
  });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height, dataState: opts.dataState, hideBadge: opts.hideBadge ?? true }, body);
}
