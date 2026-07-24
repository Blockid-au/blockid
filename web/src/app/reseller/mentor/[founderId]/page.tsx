// Founder console entry — redirects to the default (overview) tab.
// The layout siblings render <MentorHeader/> + <MentorTabs/>; keeping the
// bare route as a redirect avoids duplicating the shell here.

import { redirect } from "next/navigation";

export default async function MentorFounderRoot({
  params,
}: {
  params: Promise<{ founderId: string }>;
}) {
  const { founderId } = await params;
  redirect(`/reseller/mentor/${founderId}/overview`);
}
