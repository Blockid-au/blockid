// S30-B live QA (P2) — the data-room trust settings and engagement heatmap
// used to render only in the browser session that pressed Generate: the
// room id lived in DataRoomClient state and a reload lost it. The client now
// resolves the scope existing room on mount (`fetchExistingDataRoomId` →
// GET /api/data-room/generate) and seeds the same state.
//
// The render tests here use react-dom/server (no DOM, effects never run), so
// the mount path is pinned in two halves: the loader against a fake fetch,
// and the component with the loader result seeded — which must show the
// NDA / watermark controls and the heatmap without any Generate click.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DataRoomClient, fetchExistingDataRoomId } from "./data-room-client";

const ITEMS = [
  { id: "pitch", category: "Company", label: "Pitch deck", description: "d", dimension: "FTV" },
];
const FOLDERS = [
  {
    name: "01 Corporate",
    section: "corporate",
    stage: "idea" as const,
    priority: "P0" as const,
    description: "Formation documents",
    investorImpact: "critical" as const,
    documents: [{ name: "Constitution", type: "template" as const, description: "d", priority: "P0" as const }],
  },
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(res: Response | Error) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("fetchExistingDataRoomId (S30-B mount path)", () => {
  it("asks GET /api/data-room/generate with credentials and returns the existing room id", async () => {
    const f = fakeFetch(jsonResponse(200, { ok: true, dataRoomId: "room-1", name: "Acme", role: "owner" }));
    await expect(fetchExistingDataRoomId(f)).resolves.toBe("room-1");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/data-room/generate");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
  });

  it("no room yet → null (the Generate CTA stays; nothing is charged)", async () => {
    await expect(
      fetchExistingDataRoomId(fakeFetch(jsonResponse(200, { ok: true, dataRoomId: null, name: null, role: "owner" }))),
    ).resolves.toBeNull();
  });

  it("non-2xx, ok:false, a malformed id or a network error all resolve to null — never throws into the effect", async () => {
    await expect(fetchExistingDataRoomId(fakeFetch(jsonResponse(401, { ok: false })))).resolves.toBeNull();
    await expect(fetchExistingDataRoomId(fakeFetch(jsonResponse(200, { ok: false })))).resolves.toBeNull();
    await expect(fetchExistingDataRoomId(fakeFetch(jsonResponse(200, { ok: true, dataRoomId: 42 })))).resolves.toBeNull();
    await expect(fetchExistingDataRoomId(fakeFetch(new Error("offline")))).resolves.toBeNull();
  });
});

describe("DataRoomClient seeded with the existing room (S30-B)", () => {
  function render(initialDataRoomId: string | null) {
    return renderToStaticMarkup(
      <DataRoomClient
        items={ITEMS}
        categories={["Company"]}
        initialStates={[]}
        templateStructure={FOLDERS}
        readOnly={false}
        initialDataRoomId={initialDataRoomId}
      />,
    );
  }

  it("with the room id resolved: trust settings (NDA / watermark) and the engagement heatmap render without a Generate click", () => {
    const out = render("room-1");
    expect(out).toContain("data-testid=\"room-trust-settings\"");
    expect(out).toContain("Confidentiality and watermark");
    expect(out).toContain("data-testid=\"engagement-heatmap\"");
    expect(out).toContain("What each investor read");
    // The generator card is still offered — a founder can recompile.
    expect(out).toContain("data-testid=\"dataroom-generate\"");
  });

  it("without a room: the trust settings and heatmap stay hidden (nothing to configure yet)", () => {
    const out = render(null);
    expect(out).not.toContain("data-testid=\"room-trust-settings\"");
    expect(out).not.toContain("data-testid=\"engagement-heatmap\"");
    expect(out).toContain("data-testid=\"dataroom-generate\"");
  });
});
