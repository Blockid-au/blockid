// Canonical legal identity — the ONE place company identity lives (G21 P0-A).
//
// Advisor feedback 2026-09-20: trust is the product, and a site that names its
// operator differently on different pages loses it. Every page, PDF, e-mail,
// JSON-LD block and invoice line derives its entity strings from this object.
// Never hard-code "Auschain", "PPL Food", the ACN or the ABN anywhere else —
// `legal-entity.test.ts` fails on stray literals.
//
// The split below is the founder's standing decision (2026-09-10, see
// `docs/design/messaging.md` §8): marketing surfaces name the product company
// (`marketingOperator`), while billing / legal / invoices / JSON-LD name the
// seller of record (`operator`, which carries the ACN/ABN). Both roles are
// rendered explicitly so the two names never look like a contradiction.
// Flipping `marketingOperator` to the operator unifies the site in one edit.

export const LEGAL_ENTITY = {
  brand: "BlockID",
  /** Seller of record: invoices, GST, Stripe merchant, privacy + terms owner. */
  operator: "Auschain PTY LTD",
  acn: "659 615 111",
  abn: "79 659 615 111",
  /** Product company shown on marketing surfaces (footer, about, home). */
  marketingOperator: "PPL Food PTY LTD",
  jurisdiction: "Australia",
  city: "Sydney NSW",
  supportEmail: "admin@blockid.au",
  privacyEmail: "privacy@blockid.au",
  adminEmail: "admin@blockid.au",
  privacyOwner: "Auschain PTY LTD",
  termsOwner: "Auschain PTY LTD",
  invoiceEntity: "Auschain PTY LTD",
  stripeMerchant: "Auschain PTY LTD",
  copyrightHolder: "Auschain PTY LTD",
  domain: "blockid.au",
} as const;

export type LegalEntity = typeof LEGAL_ENTITY;

/** "ACN 659 615 111" */
export const LEGAL_ENTITY_ACN_LABEL = `ACN ${LEGAL_ENTITY.acn}`;
/** "ABN 79 659 615 111" */
export const LEGAL_ENTITY_ABN_LABEL = `ABN ${LEGAL_ENTITY.abn}`;

/** "Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)" — legal + PDF cover. */
export function legalLine(): string {
  return `${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ACN_LABEL}, ${LEGAL_ENTITY_ABN_LABEL})`;
}

/** "Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW" — invoices, e-mail footers, JSON-LD. */
export function sellerOfRecordLine(): string {
  return `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ABN_LABEL} · ${LEGAL_ENTITY.city}`;
}

/** Marketing footer line — names both roles so the split reads as intended. */
export function marketingLine(year: number = new Date().getFullYear()): string {
  const built =
    (LEGAL_ENTITY.marketingOperator as string) === (LEGAL_ENTITY.operator as string)
      ? `© ${year} ${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ABN_LABEL}`
      : `© ${year} ${LEGAL_ENTITY.brand} · built by ${LEGAL_ENTITY.marketingOperator}`;
  return `${built} · Billing, legal and invoices: ${LEGAL_ENTITY.operator} ${LEGAL_ENTITY_ABN_LABEL} · ${LEGAL_ENTITY.city}`;
}

/** Trust-section rows (home, product, solutions, pricing, methodology). */
export function trustRows(sviVersion: string): Array<{ label: string; value: string }> {
  return [
    { label: "Operating entity", value: `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY.jurisdiction}` },
    { label: "ACN / ABN", value: `${LEGAL_ENTITY_ACN_LABEL} · ${LEGAL_ENTITY_ABN_LABEL}` },
    { label: "Methodology version", value: `Startup Value Index v${sviVersion}` },
    { label: "Support", value: LEGAL_ENTITY.supportEmail },
  ];
}

// ---------------------------------------------------------------------------
// Derived lines (G21 P0-A sweep). Every string below is built from the
// object above — none of them may carry a literal.
// ---------------------------------------------------------------------------

/** "Auschain" — the short form legal prose uses after the first full mention ("Auschain", "we", "us"). */
export const LEGAL_ENTITY_SHORT_NAME: string = LEGAL_ENTITY.operator.replace(/\s+PTY\s+LTD$/i, "");

/** "BlockID.au" — the brand as a domain-styled product name. */
export const BRAND_SITE = `${LEGAL_ENTITY.brand}.au`;

/** "Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111" — e-mail + PDF footers that carry both numbers. */
export function acnAbnLine(): string {
  return `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ACN_LABEL} · ${LEGAL_ENTITY_ABN_LABEL}`;
}

/** "Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW" — the full statutory footer line. */
export function statutoryLine(): string {
  return `${acnAbnLine()} · ${LEGAL_ENTITY.city}`;
}

/** "BlockID.au (Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111)" — "produced by …" disclaimer openers. */
export function producedByLine(): string {
  return `${BRAND_SITE} (${LEGAL_ENTITY.operator}, ${LEGAL_ENTITY_ACN_LABEL}, ${LEGAL_ENTITY_ABN_LABEL})`;
}

/** "Auschain PTY LTD trading as BlockID.au" — tax-invoice supplier line. */
export function tradingAsLine(): string {
  return `${LEGAL_ENTITY.operator} trading as ${BRAND_SITE}`;
}

/**
 * Token → value map for copy that lives outside TypeScript (the i18n JSON
 * catalogues and `content/legal/*.mdx`). Both spellings resolve to the same
 * value so a JSON string can carry `{entityOperator}` (the `{token}` shape
 * the catalogue parity test already tracks) while an MDX body can carry the
 * self-documenting `{{LEGAL_ENTITY.operator}}`.
 */
export const ENTITY_TOKENS: Readonly<Record<string, string>> = {
  operator: LEGAL_ENTITY.operator,
  short: LEGAL_ENTITY_SHORT_NAME,
  marketingOperator: LEGAL_ENTITY.marketingOperator,
  brand: LEGAL_ENTITY.brand,
  site: BRAND_SITE,
  acn: LEGAL_ENTITY.acn,
  abn: LEGAL_ENTITY.abn,
  acnLabel: LEGAL_ENTITY_ACN_LABEL,
  abnLabel: LEGAL_ENTITY_ABN_LABEL,
  city: LEGAL_ENTITY.city,
  jurisdiction: LEGAL_ENTITY.jurisdiction,
  supportEmail: LEGAL_ENTITY.supportEmail,
  privacyEmail: LEGAL_ENTITY.privacyEmail,
  line: legalLine(),
  statutoryLine: statutoryLine(),
  acnAbnLine: acnAbnLine(),
  sellerLine: sellerOfRecordLine(),
};

const MDX_TOKEN = /\{\{\s*LEGAL_ENTITY\.([A-Za-z]+)\s*\}\}/g;
const I18N_TOKEN = /\{entity([A-Z][A-Za-z]*)\}/g;

/**
 * Substitute every entity token in `text`. Unknown tokens are left untouched
 * so a stray `{entityFoo}` renders visibly instead of vanishing (the same
 * rule `fillPrices` follows for price tokens).
 */
export function fillEntityTokens(text: string): string {
  if (!text.includes("{")) return text;
  return text
    .replace(MDX_TOKEN, (whole, key: string) => ENTITY_TOKENS[key] ?? whole)
    .replace(I18N_TOKEN, (whole, key: string) => {
      const lower = key.charAt(0).toLowerCase() + key.slice(1);
      return ENTITY_TOKENS[lower] ?? whole;
    });
}
