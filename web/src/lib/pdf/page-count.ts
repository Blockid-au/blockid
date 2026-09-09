// How many pages did that PDF actually come out as?
//
// The free tier promises "a 5-page summary". @react-pdf lays a `<Page>` out
// and, unless told otherwise, will spill overlong content onto a second
// physical page — so the number of `<Page>` elements in the source is a
// statement of intent, not a fact about the file. The only honest check is to
// read the page count back out of the rendered bytes, which is what this does
// and what the colocated PDF suites assert against.
//
// It is a byte-level reader on purpose. `pdf-parse` is an optional, lazily
// imported dependency whose major version has already changed shape under us
// once (v2 exports a `PDFParse` class where v1 exported a function), and a
// promise on the marketing site should not be verified by a dependency that
// can silently stop working. A PDF's cross-reference structure may be
// compressed, but the page-tree root's `/Count` and the per-page `/Type /Page`
// dictionaries that @react-pdf emits are plain ASCII in the body.

/** Nothing sane renders more pages than this; a bigger number means we mis-parsed. */
const SANITY_CEILING = 5000;

/**
 * Count `/Type /Page` object dictionaries, excluding the `/Type /Pages` tree
 * nodes. `\/Page(?![s])` is the whole trick: `/Pages` is the container.
 */
function countPageObjects(text: string): number {
  const matches = text.match(/\/Type\s*\/Page(?![s\w])/g);
  return matches ? matches.length : 0;
}

/**
 * Read the page-tree root's `/Count`. Several `/Count` keys can appear (an
 * outline tree has one too), so take the largest — the page tree is the only
 * structure that can legitimately be the biggest count in a report PDF.
 */
function countFromPageTree(text: string): number {
  const matches = text.match(/\/Count\s+(\d+)/g);
  if (!matches) return 0;
  let best = 0;
  for (const m of matches) {
    const n = Number.parseInt(m.replace(/\/Count\s+/, ""), 10);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

/**
 * The number of pages in a rendered PDF buffer.
 *
 * Reads the count two independent ways and prefers the page-object count,
 * falling back to the page tree when the objects are unreadable. Returns 0
 * when the buffer is not a PDF at all — callers assert on an exact number, so
 * 0 fails loudly rather than passing quietly.
 */
export function pdfPageCount(buffer: Uint8Array | Buffer): number {
  const text = Buffer.from(buffer).toString("latin1");
  if (!text.startsWith("%PDF")) return 0;
  const byObject = countPageObjects(text);
  if (byObject > 0 && byObject <= SANITY_CEILING) return byObject;
  const byTree = countFromPageTree(text);
  return byTree > 0 && byTree <= SANITY_CEILING ? byTree : 0;
}

/**
 * True when both readings agree — used by the suites to prove the count is a
 * real property of the file rather than an artefact of one regex.
 */
export function pdfPageCountsAgree(buffer: Uint8Array | Buffer): boolean {
  const text = Buffer.from(buffer).toString("latin1");
  if (!text.startsWith("%PDF")) return false;
  return countPageObjects(text) === countFromPageTree(text);
}
