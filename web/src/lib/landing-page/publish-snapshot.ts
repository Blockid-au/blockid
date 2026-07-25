// Landing-page publish snapshot — Phase 4 P1 gap next leg
// (docs/plans/atlassian-standard-mapping-goal.md §1 phase 4: "landing-page
// one-click publisher — Chapter 4 CTA references it but no
// `/api/landing-page/publish` route"). Spun off as P4a-publish-snapshot.
//
// This module ships the *content-addressed durable artefact* half of the
// publish flow. `buildPublishSnapshot(input, opts)` runs the existing
// `preview.ts` validator + HTML renderer, computes a canonical slug + a
// SHA-256 of the emitted HTML, and returns a `PublishSnapshot` a follow-up
// storage route can persist idempotently keyed on `content_sha256`.
//
// Refusal is deliberate: a founder who tries to publish a draft with
// `validateLandingPageInput().valid === false` gets `{status: "refused"}`
// with the reasons list. We do not publish a placeholder page carrying the
// "(headline missing)" text — that is a Chapter 4 CTA failure mode the
// preview surface already exposes.
//
// Follow-ups:
//   * P4a-publish-route — `/api/landing-page/publish` that gates on auth
//     and writes the snapshot into a new `dataroom_files` row.
//   * P4a-publish-storage — the actual subdomain routing so a published
//     snapshot renders at `<slug>.landing.blockid.au`.
//
// Boundary: no financial-product output → no AFSL disclaimer. The stamped
// warning about e-sign / hosting responsibility is a fair-use note, not
// financial advice.

import { createHash } from "node:crypto";
import {
  renderLandingPageHtml,
  validateLandingPageInput,
  type LandingPageInput,
  type LandingPageValidation,
} from "@/lib/landing-page/preview";

export const PUBLISH_SNAPSHOT_MIN_SLUG_LENGTH = 3 as const;
export const PUBLISH_SNAPSHOT_MAX_SLUG_LENGTH = 60 as const;
export const PUBLISH_SNAPSHOT_HOSTNAME = "landing.blockid.au" as const;

export const PUBLISH_SNAPSHOT_DISCLAIMER =
  "The founder is responsible for the hosting decision. BlockID.au generates the static HTML snapshot; publishing to a public URL, wiring analytics consent, and honouring APP 1 / APP 5 notice obligations remain the founder's call.";

export type PublishSnapshotRefusal =
  | "invalid_landing_page_input"
  | "slug_empty"
  | "slug_too_short"
  | "slug_too_long"
  | "slug_invalid_charset";

export interface PublishSnapshotInput {
  slug: string;
  publishedAt?: Date;
  hostname?: string;
}

export interface PublishSnapshot {
  slug: string; // caller's raw slug (trimmed)
  canonical_slug: string; // kebab-cased, ASCII, deduped dashes
  content_sha256: string; // hex sha256 of the rendered HTML
  size_bytes: number; // HTML byte length (utf8)
  published_at: string; // ISO 8601 UTC
  canonical_url: string; // https://<canonical_slug>.<hostname>/
  html: string; // the rendered HTML — caller decides where to persist
  validation: LandingPageValidation;
  disclaimer: string;
}

export type PublishSnapshotResult =
  | { status: "published"; snapshot: PublishSnapshot }
  | { status: "refused"; reasons: PublishSnapshotRefusal[]; validation?: LandingPageValidation };

/**
 * Normalise a founder-supplied slug into a DNS-safe, kebab-cased canonical
 * form. Lowercases, replaces any non `[a-z0-9-]` run with a single dash,
 * strips leading/trailing dashes, and collapses consecutive dashes.
 * Returns "" when the cleaned slug is empty.
 */
export function canonicaliseSlug(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function assessSlug(slug: string, canonical: string): PublishSnapshotRefusal[] {
  const reasons: PublishSnapshotRefusal[] = [];
  if (!slug.trim()) {
    reasons.push("slug_empty");
    return reasons;
  }
  if (!canonical) {
    reasons.push("slug_invalid_charset");
    return reasons;
  }
  if (canonical.length < PUBLISH_SNAPSHOT_MIN_SLUG_LENGTH) reasons.push("slug_too_short");
  if (canonical.length > PUBLISH_SNAPSHOT_MAX_SLUG_LENGTH) reasons.push("slug_too_long");
  return reasons;
}

/**
 * Build a content-addressed publish snapshot. Pure — no I/O.
 *
 * The caller (a POST route handler) is responsible for persistence + auth;
 * this function only refuses when the *content* is unsafe to publish.
 */
export function buildPublishSnapshot(
  input: LandingPageInput,
  opts: PublishSnapshotInput,
): PublishSnapshotResult {
  const validation = validateLandingPageInput(input);
  const rawSlug = (opts.slug ?? "").trim();
  const canonical = canonicaliseSlug(rawSlug);
  const slugReasons = assessSlug(rawSlug, canonical);

  const refusalReasons: PublishSnapshotRefusal[] = [...slugReasons];
  if (!validation.valid) refusalReasons.push("invalid_landing_page_input");

  if (refusalReasons.length > 0) {
    return { status: "refused", reasons: refusalReasons, validation };
  }

  const html = renderLandingPageHtml(input);
  const hash = createHash("sha256").update(html, "utf8").digest("hex");
  const sizeBytes = Buffer.byteLength(html, "utf8");
  const publishedAt = (opts.publishedAt ?? new Date()).toISOString();
  const hostname = (opts.hostname ?? PUBLISH_SNAPSHOT_HOSTNAME).trim();

  const snapshot: PublishSnapshot = {
    slug: rawSlug,
    canonical_slug: canonical,
    content_sha256: hash,
    size_bytes: sizeBytes,
    published_at: publishedAt,
    canonical_url: `https://${canonical}.${hostname}/`,
    html,
    validation,
    disclaimer: PUBLISH_SNAPSHOT_DISCLAIMER,
  };

  return { status: "published", snapshot };
}
