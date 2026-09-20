// The body of the hidden mentor tabs (Notes, Check-ins, Goals) — G20-F1,
// 2026-09-20, key mentor_founder_tools.
//
// Each was a read-only list whose write path (composer, scheduler, form and
// the /api/reseller/mentor/[id]/* routes they named) was never built, so the
// empty states rendered "TODO:" copy to mentors. The parent layout keeps the
// auth + scope checks and the founder header; the tab bar no longer links
// here (components/mentor/mentor-tabs.tsx filters hidden routes).

import { NotebookPen } from "lucide-react";
import { NotOfferedCard } from "@/components/workspace/not-offered-card";
import { assertHidden } from "@/components/workspace/hidden-feature-page";

export function HiddenMentorTab({ founderId, tab, title }: { founderId: string; tab: "notes" | "checkins" | "goals"; title: string }) {
  assertHidden("mentor_founder_tools", `/reseller/mentor/${founderId}/${tab}`);
  return (
    <NotOfferedCard
      feature="mentor_founder_tools"
      title={title}
      icon={NotebookPen}
      reason="Per-founder notes, check-in scheduling and goal tracking are not offered in the mentor console yet. The overview and SVI tabs carry the founder's score, phase and activity heat."
      alternatives={[
        { href: `/reseller/mentor/${founderId}/overview`, label: "Founder overview" },
        { href: `/reseller/mentor/${founderId}/reports`, label: "SVI and reports" },
        { href: "/reseller/mentor/cohort", label: "Cohort roll-up" },
      ]}
      backHref="/reseller/mentor"
      backLabel="Back to Roster"
      headingLevel="h2"
    />
  );
}
