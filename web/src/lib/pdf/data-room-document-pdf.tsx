/**
 * A data-room document as a PDF — what an investor downloads from
 * /s/dr/[token] (S21-A).
 *
 * Draws the document's Markdown body with the same palette, header bar and
 * footer as the SVI report so the room reads as one product, and carries the
 * per-recipient `<WatermarkLayer>` on every page when the founder has
 * `watermark_enabled` on the room and the plan includes it. The Markdown
 * dialect is the one `s/dr/[token]/markdown.tsx` renders on screen:
 * `#`/`##`/`###` headings, `-` bullets, GFM pipe tables, `---` rules,
 * paragraphs. Inline `**bold**` / `` `code` `` markers are stripped rather
 * than styled — a PDF body in one weight is easier to read than a body full
 * of inline runs, and the on-screen view keeps the emphasis.
 *
 * `wrap` is left ON: a document is as long as it is, and the watermark
 * layer is `fixed`, so every physical page carries it whatever the count.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, HeaderBar } from "./svi-report-pdf";
import { WatermarkLayer } from "./watermark";

export interface DataRoomDocumentPdfProps {
  startupName: string;
  roomName: string;
  folder: string;
  documentName: string;
  /** Markdown body as stored in data_room_documents.template_content. */
  body: string;
  /** From `watermarkLabel()`; null → clean pages. */
  watermark: string | null;
  /** en-AU long date shown under the title; defaults to today. */
  generatedOn?: string;
}

const st = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 60,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink800,
    backgroundColor: C.white,
  },
  eyebrow: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: C.ink500,
    marginBottom: 6,
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 4 },
  meta: { fontSize: 8.5, color: C.ink500, marginBottom: 18 },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 14, marginBottom: 6 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 12, marginBottom: 5 },
  h3: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.ink800, marginTop: 10, marginBottom: 4 },
  p: { marginBottom: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
  bulletDot: { width: 10, color: C.ink500 },
  bulletText: { flex: 1 },
  rule: { height: 1, backgroundColor: C.surface200, marginVertical: 10 },
  table: { marginVertical: 8 },
  tr: { flexDirection: "row" },
  th: {
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    backgroundColor: C.brand50,
    borderBottomWidth: 1,
    borderBottomColor: C.surface200,
  },
  td: { padding: 4, fontSize: 8.5, borderBottomWidth: 1, borderBottomColor: C.surface200 },
  disclaimer: { marginTop: 22, fontSize: 7.5, color: C.ink500, lineHeight: 1.4 },
});

function stripInline(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "rule" }
  | { kind: "table"; header: string[]; rows: string[][] };

/** Same block grammar as markdown.tsx, kept tiny on purpose. Exported for the suite. */
export function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let table: string[] = [];
  const flushPara = () => {
    if (para.length) out.push({ kind: "p", text: stripInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push({ kind: "ul", items: list.map(stripInline) });
    list = [];
  };
  const flushTable = () => {
    if (table.length) {
      const cells = (l: string) =>
        l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => stripInline(c.trim()));
      const [head, ...rest] = table;
      const rows = rest.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)).map(cells);
      out.push({ kind: "table", header: cells(head), rows });
    }
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      flushTable();
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushPara();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      out.push({ kind: "h", level: h[1].length as 1 | 2 | 3, text: stripInline(h[2].trim()) });
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push({ kind: "rule" });
      continue;
    }
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    if (b) {
      flushPara();
      list.push(b[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  flushTable();
  return out;
}

function Block({ block, i }: { block: Block; i: number }) {
  switch (block.kind) {
    case "h":
      return <Text style={block.level === 1 ? st.h1 : block.level === 2 ? st.h2 : st.h3}>{block.text}</Text>;
    case "p":
      return <Text style={st.p}>{block.text}</Text>;
    case "rule":
      return <View style={st.rule} />;
    case "ul":
      return (
        <View style={{ marginBottom: 6 }}>
          {block.items.map((item, j) => (
            <View key={`${i}-${j}`} style={st.bulletRow}>
              <Text style={st.bulletDot}>•</Text>
              <Text style={st.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      {
        const width = `${100 / Math.max(1, block.header.length)}%`;
        return (
          <View style={st.table}>
            <View style={st.tr} wrap={false}>
              {block.header.map((c, j) => (
                <View key={`${i}-h${j}`} style={[st.th, { width }]}>
                  <Text>{c}</Text>
                </View>
              ))}
            </View>
            {block.rows.map((row, r) => (
              <View key={`${i}-r${r}`} style={st.tr} wrap={false}>
                {block.header.map((_, j) => (
                  <View key={`${i}-r${r}-${j}`} style={[st.td, { width }]}>
                    <Text>{row[j] ?? ""}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      }
  }
}

export function DataRoomDocumentPDF(props: DataRoomDocumentPdfProps) {
  const blocks = parseBlocks(props.body);
  const generatedOn =
    props.generatedOn ??
    new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return (
    <Document
      title={`${props.documentName} — ${props.startupName}`}
      author="BlockID.au"
      subject={props.roomName}
      creator="BlockID.au"
    >
      <Page size="A4" style={st.page}>
        <HeaderBar />
        <WatermarkLayer label={props.watermark} />
        <Text style={st.eyebrow}>
          {props.startupName} · {props.folder}
        </Text>
        <Text style={st.title}>{props.documentName}</Text>
        <Text style={st.meta}>
          From the {props.roomName}. Generated {generatedOn}. Read-only; shared through a BlockID investor link.
        </Text>
        {blocks.length === 0 ? (
          <Text style={st.p}>This document has no written content yet.</Text>
        ) : (
          blocks.map((b, i) => <Block key={i} block={b} i={i} />)
        )}
        <Text style={st.disclaimer}>
          Prepared from the founder&apos;s own workspace data by BlockID.au (Auschain PTY LTD, ACN 659 615
          111). Indicative only — not a valuation opinion, not financial product advice under the Corporations
          Act 2001 (Cth), and not legal advice. BlockID does not hold an AFSL. Seek independent professional
          advice before relying on it.
        </Text>
        <Footer />
      </Page>
    </Document>
  );
}

/** Render to bytes — what the share PDF route serves. */
export async function renderDataRoomDocumentPdf(
  props: DataRoomDocumentPdfProps,
): Promise<Buffer> {
  return renderToBuffer(<DataRoomDocumentPDF {...props} />);
}
