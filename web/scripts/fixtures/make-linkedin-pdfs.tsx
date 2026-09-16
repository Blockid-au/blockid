// scripts/fixtures/make-linkedin-pdfs.tsx — regenerate the synthetic
// LinkedIn "Save to PDF" fixtures under test-fixtures/linkedin/*.pdf from
// their .txt twins (S-R5). Run with `npx tsx scripts/fixtures/make-linkedin-pdfs.tsx`.
// The PDFs are committed; this only needs re-running when a .txt changes.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";

const DIR = path.join(process.cwd(), "test-fixtures", "linkedin");

function Doc({ lines }: { lines: string[] }) {
  return (
    <Document>
      <Page size="A4" style={{ padding: 36, fontFamily: "Helvetica", fontSize: 10 }}>
        <View>
          {lines.map((l, i) => (
            <Text key={i} style={{ minHeight: 12 }}>
              {l || " "}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}

async function main() {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".txt"))) {
    const lines = readFileSync(path.join(DIR, f), "utf8").split("\n");
    const buf = await renderToBuffer(<Doc lines={lines} />);
    const out = path.join(DIR, f.replace(/\.txt$/, ".pdf"));
    writeFileSync(out, buf);
    console.log(`${out} ${buf.length} bytes`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
