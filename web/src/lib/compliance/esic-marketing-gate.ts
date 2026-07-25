// ESIC round marketing detector.
//
// The P6 `esic-funding-gate` blocks a fundraise round only when the
// caller passes `wholesaleOnly: true`. That conflates two different
// signals:
//   (a) the investor eligibility category (s708(8)/(11) wholesale-only),
//   (b) whether the pitch itself markets the 20% ESIC tax offset.
//
// A retail round that pitches the ESIC offset in its cover deck is the
// higher-risk of the two — the s1041H (misleading conduct) exposure
// fires the moment the founder tells any prospective investor that the
// company qualifies for Div 360 concessions without a fresh eligible
// self-assessment on file.
//
// This helper reads the round configuration + free-text pitch fields
// the founder supplied and returns a machine-readable signal the
// fundraise route can feed into `assertESICEligibleOrWarn` as its
// `requireEligible` argument — flipping warn-only into 412-blocking
// whenever any marketing signal fires, regardless of the wholesale
// category.
//
// Legal refs:
//   - ITAA 1997 Div 360 (ss 360-10 to 360-100) — ESIC concessions.
//   - Corporations Act 2001 (Cth) s1041H — misleading or deceptive
//     conduct in relation to a financial product; s769C — statements
//     about future matters without reasonable grounds are misleading.
//   - Corporations Act 2001 (Cth) s911A — AFSL requirement (BlockID.au
//     does NOT issue or validate ESIC status; s923B boundary).
//   - ATO PS LA 2020/1 — reliance on private binding rulings.
//
// Pure module — no I/O, no side effects. All classification lives here
// so the branch matrix is fully vitest-covered.

export interface EsicMarketingInput {
  /**
   * Explicit founder acknowledgement — the pitch materials mention the
   * ESIC 20% investor tax offset or the 10-year CGT exemption. Set by
   * a checkbox on the fundraise-round wizard.
   */
  marketedAsEsic?: boolean;
  /**
   * Explicit alt — the pitch deck footnotes the ESIC concessions.
   */
  pitchClaimsEsic?: boolean;
  /** Round name — heuristic scan for "ESIC" or "early-stage innovation". */
  roundName?: string | null;
  /** Pitch summary / cover-deck synopsis — heuristic scan. */
  pitchDescription?: string | null;
  /**
   * Free-text tag list attached to the round (e.g. cap-table tags the
   * founder ticked while configuring the round). Any tag matching the
   * heuristic pattern fires the marketing signal.
   */
  tags?: readonly string[];
}

export interface EsicMarketingResult {
  /**
   * True when at least one marketing signal fires. Callers should
   * flip `requireEligible=true` on `assertESICEligibleOrWarn`.
   */
  marketed: boolean;
  /** Machine-readable list of signals that fired. Empty when marketed=false. */
  signals: EsicMarketingSignal[];
  /** Fixed disclaimer — attach to every UI surface that renders this. */
  disclaimer: string;
}

export type EsicMarketingSignal =
  | "explicit_marketed_flag"
  | "explicit_pitch_flag"
  | "round_name_mentions_esic"
  | "pitch_description_mentions_esic"
  | "round_name_mentions_offset"
  | "pitch_description_mentions_offset"
  | "tag_mentions_esic";

export const ESIC_MARKETING_DISCLAIMER =
  "Marketing a round as ESIC-qualifying without a fresh eligible self-assessment on file exposes the company to s1041H misleading-conduct claims under the Corporations Act 2001 (Cth). BlockID.au does not certify ESIC status (s923B AFSL boundary) — confirm with a TPB-registered tax agent before publishing pitch materials.";

// Case-insensitive scan. Anchored to word-adjacent boundaries so we
// don't false-fire on a company name that contains "esic" as a substring
// (unlikely but cheap to guard).
const ESIC_TOKEN_RE = /\b(esic|early[-\s]?stage innovation company|div(?:ision)?\s?360)\b/i;
// The offset / CGT wording that founders reach for in deck copy.
// Kept narrow — matches "20% offset", "20 % offset", "20-per-cent offset",
// "10-year CGT" (with hyphen or space), and "CGT exemption" as a signal.
const ESIC_OFFSET_RE = /(20\s?%\s*(tax\s+)?offset|20[-\s]?per[-\s]?cent\s+offset|10[-\s]?year\s+cgt|cgt\s+exemption)/i;

function scanForEsicToken(text: string | null | undefined): boolean {
  if (!text) return false;
  return ESIC_TOKEN_RE.test(text);
}

function scanForOffsetToken(text: string | null | undefined): boolean {
  if (!text) return false;
  return ESIC_OFFSET_RE.test(text);
}

/**
 * Pure classifier — inspect the round metadata and return whether any
 * marketing signal fires. Non-throwing; defensive against undefined /
 * null / non-string inputs (route may forward JSON from a mistyped
 * client).
 */
export function detectEsicMarketing(input: EsicMarketingInput): EsicMarketingResult {
  const signals: EsicMarketingSignal[] = [];

  if (input.marketedAsEsic === true) {
    signals.push("explicit_marketed_flag");
  }
  if (input.pitchClaimsEsic === true) {
    signals.push("explicit_pitch_flag");
  }
  if (scanForEsicToken(input.roundName)) {
    signals.push("round_name_mentions_esic");
  }
  if (scanForEsicToken(input.pitchDescription)) {
    signals.push("pitch_description_mentions_esic");
  }
  if (scanForOffsetToken(input.roundName)) {
    signals.push("round_name_mentions_offset");
  }
  if (scanForOffsetToken(input.pitchDescription)) {
    signals.push("pitch_description_mentions_offset");
  }
  if (Array.isArray(input.tags)) {
    for (const tag of input.tags) {
      if (typeof tag === "string" && (scanForEsicToken(tag) || scanForOffsetToken(tag))) {
        signals.push("tag_mentions_esic");
        break;
      }
    }
  }

  return {
    marketed: signals.length > 0,
    signals,
    disclaimer: ESIC_MARKETING_DISCLAIMER,
  };
}
