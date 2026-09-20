// The one body every /innovator/* route renders — HIDDEN (G20-F1,
// 2026-09-20). Key: innovator_console.
//
// The console was four shells (overview tiles, an Industry Map whose "Pin"
// buttons were dead, an empty Watchlist, an empty Deal Pipeline) with no
// innovator_* tables behind them. The routes stay (persona bookmarks,
// NEVER_REDIRECT) and answer the shared card; the sector leaderboard the
// Industry Map wrapped is the public /dataset page.

import { Compass } from "lucide-react";
import { NotOfferedCard } from "@/components/workspace/not-offered-card";
import { assertHidden } from "@/components/workspace/hidden-feature-page";

export function HiddenInnovatorConsole({ path }: { path: string }) {
  assertHidden("innovator_console", path);
  return (
    <NotOfferedCard
      feature="innovator_console"
      title="Innovator Console"
      icon={Compass}
      reason="A corporate scouting console — thesis, industry map, watchlist and POC pipeline — is not offered yet. The scored index and the sector leaderboard are open to every signed-in evaluator."
      alternatives={[
        { href: "/startup-index", label: "Startup Value Index — every scored startup" },
        { href: "/dataset", label: "Sector and stage leaderboard" },
        { href: "/pricing?segment=evaluator", label: "Evaluator plans — deal flow, watchlist, batch scoring" },
      ]}
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    />
  );
}
