// Render test for MoneyRadarTile (T0248, plan §4i D-2): one case per state
// pinning the D-2 copy, the CTA hrefs and the deadline-chip classes (RDStatus
// ladder tones), plus the never-blank footer (counts + next public event),
// the compact variant and the VI catalogue path.

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import vi from "@/lib/i18n/messages/vi.json";
import { DEADLINE_TONE } from "@/lib/funding/deadline-status";
import type { MoneyRadarTileData } from "@/lib/funding/tile-data";
import { MoneyRadarTile, TILE_HREFS } from "./money-radar-tile";

async function html(data: MoneyRadarTileData, props: Partial<Parameters<typeof MoneyRadarTile>[0]> = {}): Promise<string> {
  const stream = await renderToReadableStream(<MoneyRadarTile data={data} {...props} />);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "").replace(/<span>|<\/span>/g, "");
}

function base(over: Partial<MoneyRadarTileData> = {}): MoneyRadarTileData {
  return {
    state: "no_profile",
    counts: { grants: 14, programs: 6, capital: 9 },
    top3: [],
    next_deadlines: [],
    new_matches_week: 0,
    next_public_event: { ref_id: "e1", name: "Startmate apps", city: "Sydney", date: "2026-09-15", date_label: "15 Sep 2026", url: "https://startmate.com/apply" },
    next_step: "Answer 3 questions to match grants and programs",
    industry_label: "Agtech / food",
    state_label: "NSW",
    user_state: "NSW",
    report_id: null,
    calendar_href: null,
    today: "2026-09-10",
    ...over,
  };
}

const TOP3: MoneyRadarTileData["top3"] = [
  { ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", why: "Fits MVP stage in NSW.", amount_max_aud: 75000, closes_at: "2026-09-22", deadline: { days_until: 12, status: "closing_soon", date_label: "22 Sep 2026 (AEST)" }, url: "https://x.gov.au" },
  { ref_kind: "grant", ref_id: "g2", name: "Ignite Ideas", why: "QLD scale-up grant.", amount_max_aud: 200000, closes_at: "2026-11-30", deadline: { days_until: 81, status: "open", date_label: "30 Nov 2026 (AEST)" }, url: null },
  { ref_kind: "program", ref_id: "p1", name: "Plus Eight", why: "Takes MVP founders in Perth.", amount_max_aud: null, closes_at: null, deadline: null, url: null },
];

const DEADLINES: MoneyRadarTileData["next_deadlines"] = [
  { ref_kind: "grant", ref_id: "g2", name: "Ignite Ideas", closes_at: "2026-09-12", days_until: 2, status: "last_call", date_label: "12 Sep 2026 (AEST)", url: "https://qld.gov.au/ignite" },
  { ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", closes_at: "2026-09-22", days_until: 12, status: "closing_soon", date_label: "22 Sep 2026 (AEST)", url: null },
  { ref_kind: "program", ref_id: "p1", name: "Plus Eight", closes_at: "2026-11-30", days_until: 81, status: "open", date_label: "30 Nov 2026 (AEST)", url: null },
];

describe("MoneyRadarTile — five states (D-2)", () => {
  it("no_profile: counts sentence with bold numbers, Match me → /workspace/funding, footer counts + next event", async () => {
    const out = await html(base());
    expect(out).toContain('data-state="no_profile"');
    expect(out).toContain("<strong class=\"text-primary\">14 grants</strong>");
    expect(out).toContain("<strong class=\"text-primary\">6 programs</strong>");
    expect(out).toContain("for Agtech / food startups in NSW");
    expect(out).toContain("Answer <strong class=\"text-primary\">3 questions</strong> to see yours.");
    expect(out).toContain(`href="${TILE_HREFS.workspace}"`);
    expect(out).toContain('data-tile-cta="match_me"');
    expect(out).toContain("14 grants · 6 programs · 9 capital sources");
    expect(out).toContain("Next up:");
    expect(out).toContain("Startmate apps");
    expect(out).toContain("15 Sep 2026");
    expect(out).not.toContain("data-tile-top3");
  });

  it("free_previewed: top-3 names with lock glyphs, next deadline in N days, Unlock A$3 + Start trial", async () => {
    const out = await html(base({ state: "free_previewed", top3: TOP3, next_deadlines: DEADLINES.slice(1) }));
    expect(out).toContain('data-state="free_previewed"');
    expect(out).toContain('data-locked="1"');
    expect(out).toContain("1. MVP Ventures");
    expect(out).toContain("3. Plus Eight");
    expect(out).not.toContain("A$75,000");
    expect(out).toContain("Amount in full report");
    expect(out).toContain("Next deadline in <strong class=\"text-primary\">12 days</strong>");
    expect(out).toContain("Unlock full report A$3");
    expect(out).toContain('data-tile-cta="unlock_report"');
    expect(out).toContain(`href="${TILE_HREFS.workspace}"`);
    expect(out).toContain("Start Founder Radar trial");
    expect(out).toContain('href="/signup?plan=founder_starter&amp;trial=1&amp;from=tile"');
  });

  it("buyer: A$ + deadline chips on the top-3, 'Deadlines move — get alerts', 7-day trial + report link", async () => {
    const out = await html(base({ state: "buyer", top3: TOP3, next_deadlines: DEADLINES.slice(1), report_id: "rep-1" }));
    expect(out).toContain('data-state="buyer"');
    expect(out).toContain("Deadlines move — get alerts");
    expect(out).toContain("up to A$75,000");
    expect(out).toContain("up to A$200,000");
    expect(out).toContain("Amount varies");
    expect(out).toContain('data-deadline-status="closing_soon"');
    expect(out).toContain(DEADLINE_TONE.closing_soon);
    expect(out).toContain('data-deadline-status="open"');
    expect(out).toContain(DEADLINE_TONE.open);
    expect(out).toContain(">T-12<");
    expect(out).toContain("Start 7-day Radar trial");
    expect(out).toContain('href="/signup?plan=founder_starter&amp;trial=1&amp;from=tile"');
    expect(out).toContain('href="/funding/report/rep-1"');
    expect(out).toContain("MVP Ventures");
  });

  it("subscriber: T-N chips green/amber/red per the ladder, new matches, next step, Open Money Radar + Draft application", async () => {
    const out = await html(base({ state: "subscriber", top3: TOP3, next_deadlines: DEADLINES, new_matches_week: 3, next_step: "Upload your cap table", calendar_href: "/api/funding/calendar.ics?token=tok" }));
    expect(out).toContain('data-state="subscriber"');
    expect(out).toContain("<strong class=\"text-primary\">3 new matches</strong> this week");
    expect(out).toContain("Founder Radar");
    expect(out).toContain('data-deadline-status="last_call"');
    expect(out).toContain(DEADLINE_TONE.last_call);
    expect(out).toContain(">T-2<");
    expect(out).toContain('data-deadline-status="closing_soon"');
    expect(out).toContain(">T-12<");
    expect(out).toContain('data-deadline-status="open"');
    expect(out).toContain(">T-81<");
    expect(out).toContain('title="Last call · 12 Sep 2026 (AEST)"');
    expect(out).toContain("Next step: Upload your cap table");
    expect(out).toContain("Open Money Radar");
    expect(out).toContain(`href="${TILE_HREFS.workspace}"`);
    expect(out).toContain("Draft application (credits)");
    expect(out).toContain('href="/workspace/funding?draft=g2"');
    expect(out).toContain('href="https://qld.gov.au/ignite"');
  });

  it("nothing_due: 'No deadlines in the next 30 days. Next up: …', Add to calendar → ICS", async () => {
    const out = await html(base({ state: "nothing_due", calendar_href: "/api/funding/calendar.ics?token=tok_abc", new_matches_week: 1 }));
    expect(out).toContain('data-state="nothing_due"');
    expect(out).toContain("No deadlines in the next <strong class=\"text-primary\">30 days</strong>. Next up: Startmate apps opens 15 Sep 2026.");
    expect(out).toContain("Add to calendar");
    expect(out).toContain('href="/api/funding/calendar.ics?token=tok_abc"');
    expect(out).toContain('data-tile-cta="add_to_calendar"');
    expect(out).toContain("1 new matches this week");
    // The footer does not repeat the event that the headline already names.
    expect(out).not.toContain("data-tile-next-event");
  });

  it("nothing_due without a calendar token falls back to the Alerts tab; without an event it names the Sunday re-match", async () => {
    const out = await html(base({ state: "nothing_due", calendar_href: null, next_public_event: null }));
    expect(out).toContain(`href="${TILE_HREFS.alerts}"`);
    expect(out).toContain("Your next re-match runs on Sunday.");
  });

  it("compact variant keeps every state's copy and marks itself; VI catalogue swaps the strings", async () => {
    const compact = await html(base({ state: "buyer", top3: TOP3, next_deadlines: DEADLINES.slice(1), report_id: "rep-1" }), { compact: true });
    expect(compact).toContain('data-compact="1"');
    expect(compact).toContain("Deadlines move — get alerts");
    const viOut = await html(base(), { messages: vi as Record<string, string> });
    expect(viOut).toContain("Ghép cho tôi");
    expect(viOut).toContain("Trả lời");
    expect(viOut).not.toContain("Answer 3 questions");
  });

  it("never renders A$5.50, A$99 or PhD", async () => {
    for (const state of ["no_profile", "free_previewed", "buyer", "subscriber", "nothing_due"] as const) {
      const out = await html(base({ state, top3: TOP3, next_deadlines: DEADLINES }));
      expect(out).not.toMatch(/A\$5\.50|A\$99|PhD/);
    }
  });
});
