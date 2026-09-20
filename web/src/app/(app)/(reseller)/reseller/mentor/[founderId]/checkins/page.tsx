// /reseller/mentor/[founderId]/checkins — HIDDEN (G20-F1, 2026-09-20). See ../hidden-tab.tsx.
import { HiddenMentorTab } from "../hidden-tab";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ founderId: string }> }) {
  const { founderId } = await params;
  return <HiddenMentorTab founderId={founderId} tab="checkins" title="Check-ins" />;
}
