/**
 * /id/[slug] — Public Verified Business Profile page (EN).
 *
 * Master Upgrade Plan §11.1 (Business ID as first-class object,
 * `Organization`+`EducationalOccupationalCredential` JSON-LD, public
 * URL under /id/{slug}) + §14bis user-locked decision D3
 * (public-by-default indexable; owner opt-out via
 * `share_settings.public_index=false` flips this page to noindex) +
 * §7.7 bilingual rules — VI mirror at /vi/id/[slug].
 *
 * Server component — no client state. Data comes from
 * `readPublicProfile(slug)` which enforces the PII whitelist. Nothing
 * on this page renders any private evidence, financial figures, or
 * owner contact data.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n/t";
import { readPublicProfile } from "@/lib/business-id/public-profile";
import {
  PublicProfileBody,
  buildProfileMetadata,
} from "./public-profile-shared";

// Force dynamic — every profile view hits the DB. Nightly re-verify
// jobs invalidate freshness; ISR would add stale-badge risk.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const [profile, m] = await Promise.all([
    readPublicProfile(slug),
    getMessages("en"),
  ]);
  return buildProfileMetadata({ profile, m, locale: "en" });
}

export default async function PublicBusinessIdPage({ params }: RouteParams) {
  const { slug } = await params;
  const [profile, m] = await Promise.all([
    readPublicProfile(slug),
    getMessages("en"),
  ]);
  if (!profile) notFound();
  return <PublicProfileBody profile={profile} m={m} locale="en" />;
}
