/**
 * Legal template registry (round 5.6).
 *
 * Ships three AU-flavoured legal templates that the goal doc flagged as raise
 * blockers:
 *   1. Default AU Pty Ltd Constitution — investors expect a written
 *      constitution rather than the s135 replaceable rules.
 *   2. ESOP Scheme Rules — the source-of-truth doc that div83a-checker.ts
 *      validates against.
 *   3. AU-flavoured SAFE — swap Delaware GCL for NSW law + Corps Act refs
 *      so founders don't have to leave the platform.
 *
 * Templates live in `web/content/templates/legal/*.md`. This module reads them
 * lazily (server-only) via node:fs and substitutes `{{placeholder}}` tokens
 * on request. Public — no auth required.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type LegalTemplateCategory = "corporate" | "employment" | "fundraising";

export interface LegalTemplateSource {
  label: string;
  url: string;
}

export interface LegalTemplate {
  slug: string;
  title: string;
  category: LegalTemplateCategory;
  /** Aligns with PHASE_LABELS in web/src/lib/showcase/gallery.ts. */
  phase_slug: string;
  /** One-line summary shown on the listing card. */
  summary: string;
  /** Path relative to the repo root — 'web/content/templates/legal/…md'. */
  file_path: string;
  version: string;
  revision_date: string;
  /** Prominent short-form disclaimer surfaced on preview pages. */
  disclaimer: string;
  /** `{{token}}` names the template contains, in the order most humans expect. */
  placeholders: string[];
  sources: LegalTemplateSource[];
}

const DISCLAIMER_SHORT =
  "TEMPLATE ONLY — NOT LEGAL ADVICE. Have this reviewed by an Australian-qualified lawyer before adoption. BlockID does not hold an AFSL and cannot provide personal legal, financial, or tax advice.";

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  {
    slug: "au-pty-ltd-constitution",
    title: "AU Pty Ltd Constitution",
    category: "corporate",
    phase_slug: "phase-1",
    summary:
      "Modern AU proprietary company constitution — displaces s135 replaceable rules and covers share classes, pre-emptive, drag/tag, dividends, meetings, and dispute resolution.",
    file_path: "web/content/templates/legal/au-pty-ltd-constitution.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "adoption_date",
      "share_classes",
      "first_directors",
      "first_director_signature_name",
      "drag_along_threshold",
      "reserved_matter_threshold",
      "debt_ceiling",
      "casting_vote_yes",
      "casting_vote_no",
      "revision_date",
    ],
    sources: [
      {
        label: "Corporations Act 2001 (Cth) — ss136, 140, 249H, 249X",
        url: "https://www.legislation.gov.au/Details/C2024C00278",
      },
      {
        label: "LawPath — AU Pty Ltd Constitution template",
        url: "https://lawpath.com.au/legal-documents/company-constitution",
      },
      {
        label: "Maddocks — Corporate Advisory (drag/tag drafting)",
        url: "https://www.maddocks.com.au/",
      },
    ],
  },
  {
    slug: "au-esop-scheme-rules",
    title: "AU ESOP Scheme Rules",
    category: "employment",
    phase_slug: "phase-8",
    summary:
      "Employee Share Option Plan rules calibrated to the Div 83A ITAA97 start-up concession — 4-year vest / 1-year cliff, single vs double trigger acceleration, Good/Bad leaver splits.",
    file_path: "web/content/templates/legal/au-esop-scheme-rules.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "scheme_name",
      "company_name",
      "acn",
      "adoption_date",
      "reserve_pool_pct",
      "default_cliff_months",
      "default_vest_months",
      "revision_date",
    ],
    sources: [
      {
        label: "ITAA97 — Division 83A (employee share schemes)",
        url: "https://www.legislation.gov.au/Details/C2024C00263",
      },
      {
        label: "ATO — ESS start-up concession (QC 45684)",
        url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/employee-share-schemes/concessions/start-up-concession",
      },
      {
        label: "ASIC Instrument 2022/1021 — employee incentive scheme relief",
        url: "https://asic.gov.au/regulatory-resources/find-a-document/legislative-instruments/",
      },
    ],
  },
  {
    slug: "au-safe",
    title: "AU-flavoured SAFE (Simple Agreement for Future Equity)",
    category: "fundraising",
    phase_slug: "phase-9",
    summary:
      "Post-money SAFE adapted for Australia — NSW governing law, Corporations Act references (not Delaware GCL), sophisticated-investor reps, cap-only / discount-only / cap+discount variants.",
    file_path: "web/content/templates/legal/au-safe.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "investor_name",
      "investor_address",
      "investor_abn",
      "purchase_amount_aud",
      "valuation_cap_aud",
      "discount_rate",
      "issue_date",
      "governing_state",
      "variant_cap_only",
      "variant_discount_only",
      "variant_cap_and_discount",
      "revision_date",
    ],
    sources: [
      {
        label: "Y Combinator Post-Money SAFE v1.2 (US reference)",
        url: "https://www.ycombinator.com/documents",
      },
      {
        label: "LawPath — AU SAFE template",
        url: "https://lawpath.com.au/legal-documents/safe-note-simple-agreement-for-future-equity",
      },
      {
        label: "Corporations Act 2001 (Cth) — ss708(8), 708(11), 254T, 127",
        url: "https://www.legislation.gov.au/Details/C2024C00278",
      },
    ],
  },
];

export function getTemplate(slug: string): LegalTemplate | undefined {
  return LEGAL_TEMPLATES.find((t) => t.slug === slug);
}

export function listTemplates(): LegalTemplate[] {
  return LEGAL_TEMPLATES.slice();
}

/**
 * Resolves a template file path against the current working directory.
 * The Next.js server runs from `web/` in dev and prod, so we accept both
 * repo-root-relative (`web/content/…`) and `web/`-relative paths.
 */
function resolveTemplatePath(filePath: string): string {
  const cwd = process.cwd();
  // If cwd already ends with 'web', strip the leading 'web/' from filePath.
  if (path.basename(cwd) === "web" && filePath.startsWith("web/")) {
    return path.join(cwd, filePath.slice("web/".length));
  }
  return path.join(cwd, filePath);
}

export async function readTemplateRaw(slug: string): Promise<string | null> {
  const tpl = getTemplate(slug);
  if (!tpl) return null;
  try {
    const abs = resolveTemplatePath(tpl.file_path);
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Substitutes `{{token}}` placeholders in the template body.
 *
 * Values are inserted verbatim — callers should sanitise / validate before
 * passing. Unknown tokens are left untouched so the founder can see what
 * still needs filling in when the rendered doc is downloaded.
 *
 * Section blocks like `{{#variant_cap_only}}…{{/variant_cap_only}}` are
 * treated as truthy toggles — passing `variant_cap_only: "true"` keeps the
 * inner text; anything else (or omission) strips the block.
 */
export async function renderTemplate(
  slug: string,
  values: Record<string, string>,
): Promise<string | null> {
  const raw = await readTemplateRaw(slug);
  if (raw == null) return null;
  return applySubstitutions(raw, values);
}

export function applySubstitutions(
  body: string,
  values: Record<string, string>,
): string {
  // 1) Handle section toggles {{#name}}…{{/name}} first — greedy per pair.
  const sectionRe = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let out = body.replace(sectionRe, (_full, name: string, inner: string) => {
    const val = values[name];
    const truthy =
      val === "true" || val === "1" || val === "yes" || val === "on";
    return truthy ? inner : "";
  });

  // 2) Substitute simple {{token}} placeholders.
  const tokenRe = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  out = out.replace(tokenRe, (_full, name: string) => {
    const val = values[name];
    return typeof val === "string" ? val : `{{${name}}}`;
  });

  return out;
}
