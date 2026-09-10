// Colocated vitest for the nav NotificationBell (T0245 repoint).
// Pins: `loadBell` reads the founder feed first (badge + list from
// /api/founder-notifications) and only falls back to the legacy
// /api/notifications when the founder feed is unavailable; radar rows are
// normalised with the shared copy; the component SSR-renders.

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NotificationBell, loadBell, normaliseFounderRows, normaliseLegacyRows } from "./notification-bell";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("loadBell", () => {
  it("uses the founder feed (list + unread_count in one call) when it answers", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith("/api/founder-notifications")) {
        return res(200, {
          ok: true,
          unread_count: 2,
          notifications: [
            { id: 11, project_id: null, kind: "grant_deadline", payload: { event: "deadline_t14", name: "MVP Ventures", closes_at: "2026-09-27", days_left: 14, url: "https://mvp" }, read_at: null, created_at: "2026-09-13T05:00:00Z" },
            { id: 10, project_id: null, kind: "new_matches", payload: { count: 3, grant_count: 2, program_count: 1, startup: "Acme", report_id: "r1" }, read_at: "2026-09-13T06:00:00Z", created_at: "2026-09-13T05:00:00Z" },
          ],
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const s = await loadBell(fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/founder-notifications?limit=20");
    expect(s.source).toBe("founder");
    expect(s.unreadCount).toBe(2);
    expect(s.items).toEqual([
      { id: "11", source: "founder", type: "grant_deadline", title: "Grant deadline", body: "14 days left: MVP Ventures", href: "https://mvp", read: false, created_at: "2026-09-13T05:00:00Z" },
      { id: "10", source: "founder", type: "new_matches", title: "New matches", body: "3 new matches for Acme this week", href: "/funding/report/r1", read: true, created_at: "2026-09-13T05:00:00Z" },
    ]);
  });

  it("falls back to the legacy endpoint on 404 / network failure, and to empty on 401", async () => {
    const legacy = { notifications: [{ id: "a", type: "info", title: "Welcome", body: null, read: false, created_at: "2026-09-01T00:00:00Z" }], unreadCount: 1 };
    const on404 = vi.fn(async (url: string) => (url.startsWith("/api/founder-notifications") ? res(404, {}) : res(200, legacy)));
    const s = await loadBell(on404 as unknown as typeof fetch);
    expect(s.source).toBe("legacy");
    expect(s.unreadCount).toBe(1);
    expect(s.items[0]).toMatchObject({ id: "a", source: "legacy", title: "Welcome", href: null });

    const onThrow = vi.fn(async (url: string) => {
      if (url.startsWith("/api/founder-notifications")) throw new Error("network");
      return res(200, legacy);
    });
    expect((await loadBell(onThrow as unknown as typeof fetch)).source).toBe("legacy");

    const on401 = vi.fn(async () => res(401, { ok: false }));
    const signedOut = await loadBell(on401 as unknown as typeof fetch);
    expect(signedOut).toEqual({ items: [], unreadCount: 0, source: "none" });
    expect(on401).toHaveBeenCalledTimes(1);

    const bothDown = vi.fn(async () => res(500, {}));
    expect((await loadBell(bothDown as unknown as typeof fetch)).source).toBe("none");
  });

  it("normalisers keep unknown kinds readable", () => {
    expect(normaliseFounderRows([{ id: 1, project_id: null, kind: "mystery", payload: null, read_at: null, created_at: "x" }])[0]).toMatchObject({ title: "mystery", body: "mystery", href: null });
    expect(normaliseLegacyRows([{ id: "1", type: "t", title: "T", body: "B", read: true, created_at: "x" }])[0]).toMatchObject({ source: "legacy", read: true, body: "B" });
  });
});

describe("<NotificationBell />", () => {
  it("SSR-renders the closed bell without a badge", async () => {
    const out = await html(<NotificationBell />);
    expect(out).toContain('aria-label="Notifications"');
    expect(out).not.toContain("No notifications yet");
  });
});
