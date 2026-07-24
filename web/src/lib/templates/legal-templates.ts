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
import { existsSync } from "node:fs";
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
    slug: "au-employment-contract",
    title: "AU Employment Contract (Fair Work-compliant)",
    category: "employment",
    phase_slug: "phase-8",
    summary:
      "Full-time / part-time / casual employment agreement drafted against the Fair Work Act 2009 NES — Modern Award slot, annualised set-off clause, Div-8 IP assignment, NSW / Vic restraint clause, s117 notice, s119 redundancy.",
    file_path: "web/content/templates/legal/au-employment-contract.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "employee_name",
      "employee_address",
      "position_title",
      "reporting_manager",
      "employment_type",
      "modern_award_name",
      "modern_award_code",
      "award_classification",
      "work_location",
      "start_date",
      "probation_period_months",
      "ordinary_hours_per_week",
      "base_salary_aud",
      "pay_frequency",
      "restraint_period",
      "restraint_geography",
      "restraint_scope",
      "post_probation_notice_weeks",
      "governing_state",
      "signing_date",
      "authorised_signatory_name",
      "authorised_signatory_title",
      "revision_date",
    ],
    sources: [
      {
        label: "Fair Work Act 2009 (Cth) — NES, ss61-131 (leave, notice, redundancy)",
        url: "https://www.legislation.gov.au/C2009A00028/latest/text",
      },
      {
        label: "Fair Work Ombudsman — Modern Awards list (121 awards)",
        url: "https://www.fairwork.gov.au/employment-conditions/awards/list-of-awards",
      },
      {
        label: "Superannuation Guarantee (Administration) Act 1992 (Cth)",
        url: "https://www.legislation.gov.au/C2004A04435/latest/text",
      },
      {
        label: "Restraints of Trade Act 1976 (NSW)",
        url: "https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1976-067",
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
 * The Next.js server runs from three shapes depending on how it was booted:
 *   - dev:                  cwd = `web/`             → `<cwd>/content/templates/…`
 *   - `npm start` at repo:  cwd = repo root          → `<cwd>/web/content/templates/…`
 *   - standalone (prod):    cwd = `.next/standalone` → `<cwd>/content/templates/…`
 * Round 5.5 QA fix: previously only the first two were handled; the standalone
 * runtime saw `<cwd>/web/content/…` which does not exist under the standalone
 * output (it copies `content/` at the root, not under a `web/` prefix). Now we
 * try both, in order.
 */
function resolveTemplatePath(filePath: string): string {
  const cwd = process.cwd();
  const stripped = filePath.startsWith("web/")
    ? filePath.slice("web/".length)
    : filePath;
  // Dev and standalone both work when the `web/` prefix is dropped and
  // resolved relative to cwd (the standalone output already flattens `web/`).
  const dropWebPrefix = path.join(cwd, stripped);
  if (existsSync(dropWebPrefix)) return dropWebPrefix;
  // Fall back to preserving the full repo-relative path (repo-root cwd).
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
