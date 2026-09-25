// Colocated vitest for /api/cron/onboarding-sequence — RETIRED (G34-BT2 EM01).
//
// The pre-analysis D+1/D+3/D+7 sequence was never scheduled and is superseded
// by `email_drips` + lib/email-drip.ts, the one commercial-mail engine. The
// route keeps its auth gate and answers `{ retired: true }` without touching
// Supabase or the mail transport. The legacy step-selection suite was removed
// with the behaviour it pinned.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: vi.fn(),
  ensureEmailPreferences: vi.fn(),
  getUnsubscribeUrl: vi.fn(),
  getPreferencesUrl: vi.fn(),
}));

import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-onboarding-sequence";

function req(method: "GET" | "POST" = "GET", headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/onboarding-sequence", { method, headers });
}

beforeEach(() => {
  sendEmailMock.mockReset();
  getSupabaseAdminMock.mockReset();
  process.env.CRON_SECRET = SECRET;
});

describe("/api/cron/onboarding-sequence — retired", () => {
  it("keeps the module shape (force-dynamic, POST aliases GET)", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
    expect(POST).toBe(GET);
  });

  it("still rejects an unauthorised caller with 401", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("answers retired and never reads Supabase or sends", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, retired: true, sent: 0, engine: "email-drip" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
