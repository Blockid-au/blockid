/**
 * /vi/id/[slug] — Vietnamese mirror of the Public Verified Business Profile.
 *
 * Master Upgrade Plan §7.7 bilingual rule + §14bis D3 (public-by-default
 * indexable). Re-uses the shared body under
 * [../../id/[slug]/public-profile-shared](../../id/%5Bslug%5D/public-profile-shared.tsx)
 * with locale="vi" so:
 *   - All strings resolve against the vi.json catalog (EN fallback per t()).
 *   - JSON-LD `Organization` sets `inLanguage: "vi-VN"`.
 *   - `<html lang="vi">` (via inner div lang="vi").
 *   - Dates render with `vi-VN` toLocaleDateString.
 *   - Canonical points at /vi/id/{slug}; hreflang alternates link both
 *     `/id/{slug}` (EN) and `/vi/id/{slug}` (VI).
 *
 * Server component. No client state beyond `readPublicProfile`.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n/t";
import { readPublicProfile } from "@/lib/business-id/public-profile";
import {
  PublicProfileBody,
  buildProfileMetadata,
} from "../../../id/[slug]/public-profile-shared";

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
    getMessages("vi"),
  ]);
  return buildProfileMetadata({ profile, m, locale: "vi" });
}

export default async function ViPublicBusinessIdPage({ params }: RouteParams) {
  const { slug } = await params;
  const [profile, m] = await Promise.all([
    readPublicProfile(slug),
    getMessages("vi"),
  ]);
  if (!profile) notFound();
  return <PublicProfileBody profile={profile} m={m} locale="vi" />;
}
