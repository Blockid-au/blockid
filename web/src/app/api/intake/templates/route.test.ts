// Route tests for /api/intake/templates and /api/intake/templates/[id]
// (G21 P2-A) against the in-memory template store: gate (401 / 402), create
// (201, 400 invalid, 503 not migrated), owner-scoped list / get / patch /
// delete (404 for another owner's id and for a malformed id).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryTemplateStore, type TemplateStore } from "@/lib/intake/templates";

const gateMock = vi.fn();
vi.mock("@/lib/intake/access", () => ({ gateIntakeRequest: () => gateMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const storeRef = vi.hoisted(() => ({ store: null as unknown }));
vi.mock("@/lib/intake/templates", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/intake/templates")>();
  return {
    ...mod,
    createTemplate: (o: string, i: unknown) => mod.createTemplate(o, i as never, { store: storeRef.store as TemplateStore | null }),
    listTemplates: (o: string) => mod.listTemplates(o, { store: storeRef.store as TemplateStore | null }),
    getTemplate: (o: string, id: string) => mod.getTemplate(o, id, { store: storeRef.store as TemplateStore | null }),
    updateTemplate: (o: string, id: string, i: unknown) => mod.updateTemplate(o, id, i as never, { store: storeRef.store as TemplateStore | null }),
    deleteTemplate: (o: string, id: string) => mod.deleteTemplate(o, id, { store: storeRef.store as TemplateStore | null }),
  };
});

import { GET as LIST, POST } from "./route";
import { DELETE, GET, PATCH } from "./[id]/route";

const USER = { id: "owner-1", email: "p@x.au", plan: "investor_vc_small" };
const json = (body: unknown, method = "POST") => new Request("http://localhost/api/intake/templates", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const UUID = "11111111-2222-4333-8444-555555555555";

let store: ReturnType<typeof memoryTemplateStore>;
beforeEach(() => {
  vi.clearAllMocks();
  store = memoryTemplateStore();
  storeRef.store = store;
  gateMock.mockResolvedValue({ user: USER, response: null });
});

describe("/api/intake/templates", () => {
  it("gate: 401 / 402 pass through from gateIntakeRequest", async () => {
    gateMock.mockResolvedValue({ user: null, response: new Response(null, { status: 402 }) });
    expect((await LIST()).status).toBe(402);
    expect((await POST(json({ name: "x" }))).status).toBe(402);
  });

  it("POST creates (201) and GET lists mine only", async () => {
    const res = await POST(json({ name: "Round 1", questions: [{ label: "Team size", type: "number", required: true }], rubric_weights: { ftv: 2, tre: 2 }, consent_text: "Round 1 reads your evidence." }));
    expect(res.status).toBe(201);
    const { template } = await res.json();
    expect(template).toMatchObject({ ownerUserId: "owner-1", name: "Round 1", consentText: "Round 1 reads your evidence." });
    expect(template.questions[0]).toMatchObject({ key: "team_size", type: "number", required: true });
    expect(template.rubricWeights).toMatchObject({ ftv: 50, tre: 50 });

    await store.insert("owner-2", { name: "Theirs", description: null, questions: [], rubricWeights: template.rubricWeights, consentText: null });
    const list = await (await LIST()).json();
    expect(list.templates.map((t: { name: string }) => t.name)).toEqual(["Round 1"]);
  });

  it("POST 400 on invalid input, 503 when 0422 is not applied", async () => {
    expect((await POST(json({ name: "" }))).status).toBe(400);
    expect((await POST(json({ name: "x", questions: [{ key: "founder_email", label: "E" }] }))).status).toBe(400);
    storeRef.store = memoryTemplateStore({ migrated: false });
    const res = await POST(json({ name: "x" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_migrated");
  });
});

describe("/api/intake/templates/[id]", () => {
  it("GET / PATCH / DELETE are owner-scoped; malformed ids 404", async () => {
    const created = await (await POST(json({ name: "Round 1" }))).json();
    const id = created.template.id as string;
    // memory ids are not uuids — the route 404s them; use a real uuid path via a seeded row.
    expect((await GET(new Request("http://x"), ctx("nope"))).status).toBe(404);
    expect((await GET(new Request("http://x"), ctx(id))).status).toBe(404);

    // Seed a uuid-keyed row for the owner and one for someone else.
    store.templates.push({ ...created.template, id: UUID });
    const other = "22222222-2222-4333-8444-555555555555";
    store.templates.push({ ...created.template, id: other, ownerUserId: "owner-2" });

    expect((await (await GET(new Request("http://x"), ctx(UUID))).json()).template.id).toBe(UUID);
    expect((await GET(new Request("http://x"), ctx(other))).status).toBe(404);

    const patched = await PATCH(json({ name: "Round 1b", consent_text: "ok" }, "PATCH"), ctx(UUID));
    expect(patched.status).toBe(200);
    expect((await patched.json()).template).toMatchObject({ name: "Round 1b", consentText: "ok" });
    expect((await PATCH(json({ name: "steal" }, "PATCH"), ctx(other))).status).toBe(404);
    expect((await PATCH(json({ name: "" }, "PATCH"), ctx(UUID))).status).toBe(400);

    expect((await DELETE(new Request("http://x", { method: "DELETE" }), ctx(other))).status).toBe(404);
    expect((await DELETE(new Request("http://x", { method: "DELETE" }), ctx(UUID))).status).toBe(200);
    expect(store.templates.some((t) => t.id === UUID)).toBe(false);
    expect(store.templates.some((t) => t.id === other)).toBe(true);
  });
});
