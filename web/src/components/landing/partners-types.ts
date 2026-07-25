// Shared types + loader for the curator-controlled sponsor/accelerator strip.
//
// One schema is read by three surfaces:
//   - LogoCloud (landing hero + about/pricing bands)
//   - TrustStrip (lux hero eyebrow rows)
//   - PartnerFooterRow (both footers, monochrome)
//
// Rendering rule — every consumer honours this: if the config file is missing,
// unreadable, or the resolved group has no entries, the component renders
// NOTHING. The user has explicitly asked that unverified partner logos never
// appear on the site — this component library must not fabricate affiliations.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Curator group taxonomy. Extend cautiously — each new group must be added to
 * `groups` in `web/config/marketing-partners.json` AND documented in
 * `docs/plans/uiux-sync-2026-07-24/01-sponsor-curator.md` first.
 */
export type PartnerGroupKey = "accepted" | "integrated" | "backed";

/** A single partner entry. String form is preserved for backward compatibility
 *  with the pre-widened schema (label-only rendering). */
export type PartnerEntry =
  | string
  | {
      name: string;
      src?: string;
      href?: string;
      alt?: string;
      /** Optional per-entry override — usually the group's label is used. */
      label?: string;
    };

/** Normalised in-memory shape used by every renderer. */
export interface NormalisedPartner {
  name: string;
  src: string | null;
  href: string | null;
  alt: string;
}

export interface PartnerGroup {
  /** Eyebrow copy — "Accepted into", "Integrated with", "Backed by". */
  label?: string;
  entries: PartnerEntry[];
}

export interface PartnersConfig {
  /** Legacy top-level headline for LogoCloud (still respected when no group is passed). */
  headline?: string;
  /** Legacy top-level headline for TrustStrip (still respected when no group is passed). */
  investors_headline?: string;
  /** Legacy flat arrays — kept for backward compatibility. */
  partners?: PartnerEntry[];
  investors?: PartnerEntry[];
  /** New grouped surface — preferred going forward. */
  groups?: Partial<Record<PartnerGroupKey, PartnerGroup>>;
}

/** Reads and parses the config file. Returns null on any failure. */
export function loadPartnersConfig(): PartnersConfig | null {
  try {
    const path = join(process.cwd(), "config", "marketing-partners.json");
    const raw = readFileSync(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PartnersConfig;
  } catch {
    return null;
  }
}

/** Convert a raw `PartnerEntry` into the shape renderers use. Returns null for
 *  unusable input (empty string, no name). */
export function normaliseEntry(entry: PartnerEntry): NormalisedPartner | null {
  if (typeof entry === "string") {
    const name = entry.trim();
    if (!name) return null;
    return { name, src: null, href: null, alt: name };
  }
  if (!entry || typeof entry !== "object") return null;
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!name) return null;
  const src =
    typeof entry.src === "string" && entry.src.trim().length > 0
      ? entry.src.trim()
      : null;
  const href =
    typeof entry.href === "string" && entry.href.trim().length > 0
      ? entry.href.trim()
      : null;
  const alt =
    typeof entry.alt === "string" && entry.alt.trim().length > 0
      ? entry.alt.trim()
      : name;
  return { name, src, href, alt };
}

export interface ResolvedGroup {
  label: string | null;
  entries: NormalisedPartner[];
}

/**
 * Resolve the entries + label for a caller. Falls back to legacy top-level
 * arrays when `group` is omitted so old callers keep working. Returns null
 * when nothing is available to render.
 */
export function resolveGroup(
  config: PartnersConfig | null,
  group: PartnerGroupKey | undefined,
  legacy: "partners" | "investors",
  fallbackLabel: string,
): ResolvedGroup | null {
  if (!config) return null;

  if (group) {
    const g = config.groups?.[group];
    if (!g || !Array.isArray(g.entries)) return null;
    const entries = g.entries
      .map(normaliseEntry)
      .filter((e): e is NormalisedPartner => e !== null);
    if (entries.length === 0) return null;
    return { label: g.label ?? fallbackLabel, entries };
  }

  const raw = config[legacy];
  if (!Array.isArray(raw)) return null;
  const entries = raw
    .map(normaliseEntry)
    .filter((e): e is NormalisedPartner => e !== null);
  if (entries.length === 0) return null;
  const label =
    (legacy === "partners" ? config.headline : config.investors_headline) ??
    fallbackLabel;
  return { label, entries };
}
