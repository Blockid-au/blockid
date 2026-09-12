// Who a served data-room PDF is "Prepared for" (S21-A review P2-3).
//
// Pure and dependency-free so the token page (`watermarked` badge), the PDF
// route (the label itself) and the colocated suites all answer with ONE
// rule. Before this, `watermarkLabel()` returned null for a link with no
// name / firm / email while the page still said "watermarked for you" —
// an anonymous link's PDF could leak with nothing on it to trace.
//
// Precedence, first non-blank wins:
//   1. `data_room_access_tokens.watermark` — the founder's explicit line
//      (mirror of share_packages.watermark, migration 0339);
//   2. investor_name, 3. investor_firm, 4. investor_email — founder-set;
//   5. the email the viewer typed on the NDA ledger
//      (`data_room_nda_acceptances.viewer_email`, read by the caller) —
//      NOT the token row, which P1-1 keeps founder-only;
//   6. `link <first 8 chars of the link id>` — always present, so every
//      served PDF traces back to the disclosure it came from.

export interface WatermarkLinkFields {
  id: string;
  watermark?: string | null;
  investor_name?: string | null;
  investor_firm?: string | null;
  investor_email?: string | null;
}

/** How many characters of the link id the fallback shows — enough to find the row, not the token. */
export const WATERMARK_LINK_ID_CHARS = 8;

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** `link 1a2b3c4d` — the last-resort recipient; empty only for an empty id. */
export function linkFallbackRecipient(linkId: string | null | undefined): string | null {
  const id = clean(linkId);
  return id ? `link ${id.slice(0, WATERMARK_LINK_ID_CHARS)}` : null;
}

/**
 * The recipient line for a link. Never blank for a link with an id.
 * `ledgerEmail` is the NDA-acceptance email the caller looked up (or null).
 */
export function watermarkRecipient(
  link: WatermarkLinkFields,
  ledgerEmail: string | null | undefined = null,
): string | null {
  return (
    clean(link.watermark) ||
    clean(link.investor_name) ||
    clean(link.investor_firm) ||
    clean(link.investor_email) ||
    clean(ledgerEmail) ||
    linkFallbackRecipient(link.id)
  );
}

/**
 * Will a PDF served through this link carry a mark? True exactly when the
 * room stamps AND a recipient can be named — which, with the link-id
 * fallback, is every link with an id. The page badge and the route's
 * `X-BlockID-Watermark` header both derive from this.
 */
export function willWatermark(watermarkEnabled: boolean, link: Pick<WatermarkLinkFields, "id">): boolean {
  return watermarkEnabled && linkFallbackRecipient(link.id) !== null;
}
