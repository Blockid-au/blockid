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
 *
 * G21 P0-B additions (docs/plans/g21-fi-upgrade-2026-09-20.md § P0-B):
 *   ProblemFlow    linked problem steps with inline SVG arrows (+ FlowArrow)
 *   SequenceFlow   the product as one horizontal flow, whole block linked
 *   WhyNotChatGPT  the two-column comparison + the one institutional line
 *   BuiltFor       text chips naming the organisations a page is for
 *   TrustBand      (lane P0-A) the legal-identity / methodology band
 *
 * G26 light-template primitives (docs/design/unicorn-template.md v2 § 3):
 *   PageHeader  eyebrow · h1 · lede for in-app pages (workspace / admin)
 *   Card        white, 1 px line, shadow-1 (interactive → shadow-2)
 *   Table       sticky sunken head, zebra rows, 44 px rows (+ TableWrap/Th/Td)
 *   Field       label + 44 px control + hint / error
 *   Button      native <button> with the primary / secondary / ghost skins
 */

export { PageHero, type PageHeroProps } from "./page-hero";
export { Section, type SectionProps } from "./section";
export { FeatureGrid, type FeatureGridProps, type FeatureItem } from "./feature-grid";
export { StatStrip, type StatStripProps, type Stat } from "./stat-strip";
export { ProofBand, type ProofBandProps, type ProofItem } from "./proof-band";
export { CtaBand, type CtaBandProps } from "./cta-band";
export { TrustBand, TRUST_BAND_ID, TRUST_BAND_COPY, DATA_PRINCIPLE_SENTENCE_VI, scoreDisclaimerText, trustBullets, type TrustBandLocale, type TrustBandProps, type TrustBullet } from "./TrustBand";
export { Prose, type ProseProps } from "./prose";
export { Faq, type FaqProps, type FaqItem } from "./faq";
export { CtaLink, CtaRow, type CtaLinkProps } from "./cta-link";
export { ProblemFlow, FlowArrow, type ProblemFlowProps, type ProblemStep } from "./ProblemFlow";
export { SequenceFlow, type SequenceFlowProps, type SequenceStep } from "./SequenceFlow";
export { WhyNotChatGPT, type WhyNotChatGPTProps, type ComparisonColumn } from "./WhyNotChatGPT";
export { BuiltFor, type BuiltForProps, type BuiltForItem } from "./BuiltFor";
export {
  PageHeader,
  Card,
  Table,
  TableWrap,
  Th,
  Td,
  Field,
  Button,
  type PageHeaderProps,
  type CardProps,
  type TableProps,
  type TableColumn,
  type ButtonProps,
} from "./ui";
export {
  BUTTON_CLASS,
  CARD_CLASS,
  CARD_INTERACTIVE_CLASS,
  CONTAINER,
  CTA_CLASS,
  EYEBROW,
  FIELD_ERROR_CLASS,
  FIELD_HINT_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  FOCUS_RING,
  MOTION,
  RHYTHM,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_TD_CLASS,
  TABLE_TH_CLASS,
  TONE_CLASS,
  headingId,
  resolveTone,
  type ButtonVariant,
  type Cta,
  type CtaVariant,
  type Rhythm,
  type Tone,
} from "./primitives";
