// Render test for /s/dr/[token] — the NDA click-wrap and the download links (S21-A).
//
// `load.ts` decides the gate (its own suite pins that); this pins what the
// page does with the decision:
//   - pending  → the NDA gate renders BEFORE anything else, and no headline
//                figure, gap list, folder or document reaches the markup;
//   - accepted → the accepted line shows, the documents render, every
//                written document gets a PDF link through the share route,
//                labelled "watermarked for you" when the room stamps;
//   - not_required (Free room) → exactly the pre-S21-A page: no gate, no
//                accepted line, clean download links;
//   - the engagement tracker is mounted with the token and every folder is
//                tagged `data-engage-section` for it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test/founder-page-harness";
import type { SharedRoom } from "./load";

const mocks = vi.hoisted(() => ({
  room: null as unknown,
  recordShareView: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 Chrome/120" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true }));
vi.mock("./load", async () => {
  const real = await vi.importActual<typeof import("./load")>("./load");
  return {
    ...real,
    loadSharedDataRoom: async () => mocks.room,
    recordShareView: (...a: unknown[]) => mocks.recordShareView(...(a as [])),
  };
});
vi.mock("./engagement-tracker", () => ({
  EngagementTracker: ({ token, gateStatus }: { token: string; gateStatus: string }) => (
    <span data-tracker={token} data-gate={gateStatus} />
  ),
}));

const TOKEN = "r".repeat(32);

const DOC = {
  id: "11111111-2222-4333-8444-555555555555",
  section: "corporate",
  folder: "1. Corporate & Legal",
  documentName: "Company Summary",
  documentType: "auto",
  status: "complete" as const,
  priority: "P0" as const,
  content: "# Company Summary\n\nReal prose about the company.",
  hasFile: false,
  notes: null,
};

function room(over: Partial<SharedRoom>): SharedRoom {
  return {
    token: TOKEN,
    shareId: "share-1",
    dataRoomId: "room-1",
    name: "Acme Investor Data Room",
    startupName: "Acme",
    stage: 4,
    investorLabel: "Jane Chen",
    lastGeneratedAt: "2026-09-08T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    expiresAt: null,
    accessCount: 0,
    state: "active",
    folders: [{ folder: "1. Corporate & Legal", documents: [DOC] }],
    headlines: [{ label: "SVI score", value: "640" }],
    counts: { total: 1, complete: 1, pending: 0, missing: 0 },
    completeness: 100,
    nda: { status: "not_required", version: 1, text: "", reason: null },
    watermarked: false,
    ...over,
  };
}

async function render(r: SharedRoom): Promise<string> {
  mocks.room = r;
  const { default: Page } = await import("./page");
  return renderPage(Page({ params: Promise.resolve({ token: TOKEN }) }));
}

beforeEach(() => {
  mocks.recordShareView.mockClear();
});

describe("/s/dr/[token] — NDA gate", () => {
  it("pending: shows the clause + agree step and NOTHING confidential", async () => {
    const html = await render(
      room({
        folders: [],
        headlines: [],
        counts: { total: 0, complete: 0, pending: 0, missing: 0 },
        nda: { status: "pending", version: 2, text: "Mutual confidentiality.\n\nKeep it secret.", reason: "never" },
        watermarked: true,
      }),
    );
    expect(html).toContain('data-testid="nda-gate"');
    expect(html).toContain("Confidentiality terms before you continue");
    expect(html).toContain("Keep it secret.");
    expect(html).toContain("Version 2");
    expect(html).toContain("does not constitute legal advice");
    expect(html).toContain('data-testid="nda-agree-button"');
    expect(html).toMatch(/id="nda-agree-button"|data-testid="nda-agree-button"[^>]*disabled=""/);
    // Nothing from behind the gate.
    expect(html).not.toContain("Headline figures");
    expect(html).not.toContain("outstanding");
    expect(html).not.toContain("Company Summary");
    expect(html).not.toContain("/api/data-room/share/");
    expect(html).not.toContain("Confidentiality terms accepted");
    // The gate still names the startup so the investor knows whose terms these are.
    expect(html).toContain("Acme asks everyone who opens this room");
  });

  it("pending after a version bump: says the terms changed", async () => {
    const html = await render(
      room({ folders: [], nda: { status: "pending", version: 3, text: "New text.", reason: "stale_version" } }),
    );
    expect(html).toContain("has updated these terms since you last agreed");
  });

  it("accepted: the accepted line, the documents, and watermarked PDF links", async () => {
    const html = await render(
      room({ nda: { status: "accepted", version: 2, text: "x", reason: null }, watermarked: true }),
    );
    expect(html).not.toContain('data-testid="nda-gate"');
    expect(html).toContain("Confidentiality terms accepted (v2)");
    expect(html).toContain("Company Summary");
    expect(html).toContain("Real prose about the company.");
    expect(html).toContain(`href="/api/data-room/share/${TOKEN}/pdf?doc=${DOC.id}"`);
    expect(html).toContain("Download as PDF");
    expect(html).toContain("watermarked for you");
  });

  it("Free room (not_required): the pre-S21-A page — no gate, no accepted line, clean links", async () => {
    const html = await render(room({}));
    expect(html).not.toContain('data-testid="nda-gate"');
    expect(html).not.toContain("Confidentiality terms accepted");
    expect(html).toContain("Company Summary");
    expect(html).toContain(`href="/api/data-room/share/${TOKEN}/pdf?doc=${DOC.id}"`);
    expect(html).not.toContain("watermarked for you");
  });

  it("no PDF link for an item without written content", async () => {
    const html = await render(
      room({ folders: [{ folder: "1. Corporate & Legal", documents: [{ ...DOC, content: null, status: "missing" }] }] }),
    );
    expect(html).not.toContain("/api/data-room/share/");
    expect(html).toContain("Not supplied yet");
  });
});

describe("/s/dr/[token] — engagement", () => {
  it("mounts the tracker with the token and tags every folder for it", async () => {
    const html = await render(room({}));
    expect(html).toContain(`data-tracker="${TOKEN}"`);
    expect(html).toContain('data-engage-section="1. Corporate &amp; Legal"');
    expect(html).toContain('data-engage-section="Headline figures"');
    expect(html).toContain('data-engage-section="Outstanding items"');
  });

  it("mounts the tracker even while the gate is pending, but tags nothing behind it", async () => {
    const html = await render(room({ folders: [], nda: { status: "pending", version: 1, text: "t", reason: "never" } }));
    expect(html).toContain(`data-tracker="${TOKEN}"`);
    expect(html).not.toContain("data-engage-section=");
  });

  it("keys the tracker on the gate status so the observer re-runs after acceptance (P2-2)", async () => {
    const pending = await render(room({ folders: [], nda: { status: "pending", version: 1, text: "t", reason: "never" } }));
    expect(pending).toContain('data-gate="pending"');
    const accepted = await render(room({ nda: { status: "accepted", version: 1, text: "t", reason: null } }));
    expect(accepted).toContain('data-gate="accepted"');
    expect(await render(room({}))).toContain('data-gate="not_required"');
  });
});
