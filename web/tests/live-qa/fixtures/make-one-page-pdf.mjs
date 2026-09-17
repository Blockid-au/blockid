#!/usr/bin/env node
// Generates tests/live-qa/fixtures/one-page.pdf — a minimal, valid, one-page
// PDF (Helvetica, ~60 words) with enough real text for pdf-parse to extract
// (the intake classifier needs ≥ 40 chars). Deterministic: re-running
// writes the same bytes. Used by 29-intake.spec.ts as the founder's deck.
//
//   node tests/live-qa/fixtures/make-one-page-pdf.mjs

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "one-page.pdf");

const LINES = [
  "QA Live Startup - one page pitch deck",
  "Team: two founders, ex-Atlassian and ex-CBA, ten years in fintech.",
  "Problem: Australian SMEs wait 45 days to get paid.",
  "Product: invoice financing API live with 3 lenders.",
  "Traction: A$40k MRR, 120 customers, 8% monthly growth.",
  "Market: A$2B addressable in AU, A$20B APAC.",
  "Cap table: founders 80%, ESOP 10%, angels 10%; ABN registered.",
  "Ask: raising A$500k pre-seed on a SAFE at A$3M cap.",
];

const content = ["BT", "/F1 12 Tf", "50 760 Td", "14 TL", ...LINES.map((l, i) => `${i ? "T* " : ""}(${l.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj`), "ET"].join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
];

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

writeFileSync(OUT, Buffer.from(pdf, "latin1"));
console.log(`wrote ${OUT} (${Buffer.byteLength(pdf, "latin1")} bytes)`);
