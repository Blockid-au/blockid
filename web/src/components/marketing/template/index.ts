/**
 * Unicorn marketing template (G17 D5) — one import for every page under
 * `(marketing)`. See docs/design/unicorn-template.md for the contract.
 *
 *   PageHero    the page's one H1 + sub + ≤ 2 CTAs + visual slot
 *   Section     eyebrow + H2 + lede band on base / sunken / dark
 *   FeatureGrid 2–4 icon cards (optionally numbered steps)
 *   StatStrip   2–6 figures with labels and provenance
 *   ProofBand   a quiet row of names / facts
 *   CtaBand     the closing call to action
 *   TrustBand   entity rows + four trust bullets above the close (G21 P0-A)
 *   Prose       long-form measure
 *   Faq         native <details> disclosures (+ optional FAQPage JSON-LD)
 *   CtaLink / CtaRow — the button skins
 */

export { PageHero, type PageHeroProps } from "./page-hero";
export { Section, type SectionProps } from "./section";
export { FeatureGrid, type FeatureGridProps, type FeatureItem } from "./feature-grid";
export { StatStrip, type StatStripProps, type Stat } from "./stat-strip";
export { ProofBand, type ProofBandProps, type ProofItem } from "./proof-band";
export { CtaBand, type CtaBandProps } from "./cta-band";
export { TrustBand, TRUST_BAND_ID, scoreDisclaimerText, trustBullets, type TrustBandProps, type TrustBullet } from "./TrustBand";
export { Prose, type ProseProps } from "./prose";
export { Faq, type FaqProps, type FaqItem } from "./faq";
export { CtaLink, CtaRow, type CtaLinkProps } from "./cta-link";
export {
  CONTAINER,
  CTA_CLASS,
  EYEBROW,
  FOCUS_RING,
  MOTION,
  RHYTHM,
  TONE_CLASS,
  headingId,
  type Cta,
  type CtaVariant,
  type Rhythm,
  type Tone,
} from "./primitives";
