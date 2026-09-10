// Colocated vitest for the /workspace/notifications feed client (T0245).
// Pins: KIND_META covers every registered NotificationKind (a radar row
// never renders with the generic bell + raw kind), the "Money" chip is
// present, and the loading shell SSR-renders.

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_KINDS, MONEY_KINDS } from "@/lib/notification-kinds";

import { KIND_META, NotificationFeedClient } from "./feed-client";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("feed-client KIND_META", () => {
  it("has an icon, colour and label for every registered kind (incl. the six Money Radar kinds)", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const meta = KIND_META[kind];
      expect(meta, kind).toBeDefined();
      expect(meta.icon).toBeTruthy(); // lucide forwardRef exotic component
      expect(meta.color).toMatch(/^text-/);
      expect(meta.label.length).toBeGreaterThan(0);
    }
    for (const kind of MONEY_KINDS) expect(KIND_META[kind]).toBeDefined();
  });
});

describe("<NotificationFeedClient />", () => {
  it("SSR-renders the filter chips including Money, and the loading state", async () => {
    const out = await html(<NotificationFeedClient />);
    for (const label of ["All", "Unread", "Money", "Leads", "Views", "Questions", "Shared", "Analyses"]) {
      expect(out).toContain(`>${label}</button>`);
    }
    expect(out).toContain("Loading");
  });
});
