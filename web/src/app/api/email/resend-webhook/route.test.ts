// G34-BT2 EM04 — /api/email/resend-webhook refuses unsigned or unconfigured
// calls and applies a verified bounce.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const handleMock = vi.fn(async () => ({ suppressed: 1, reason: "hard_bounce" }));
vi.mock("@/lib/email-webhook", async (orig) => ({
  ...(await orig<typeof import("@/lib/email-webhook")>()),
  handleResendEvent: (e: unknown) => handleMock(e),
}));
vi.mock("@/lib/email-sends", () => ({ suppressRecipient: vi.fn(), markSendStatusByProviderId: vi.fn() }));

import { POST } from "./route";

const KEY = Buffer.from("route-test-key");
const body = JSON.stringify({ type: "email.bounced", data: { email_id: "e1", to: ["a@b.co"] } });

function req(headers: Record<string, string>) {
  return new Request("https://blockid.au/api/email/resend-webhook", { method: "POST", body, headers });
}
function signed() {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", KEY).update(`msg_1.${ts}.${body}`).digest("base64");
  return { "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${KEY.toString("base64")}`;
});

describe("POST /api/email/resend-webhook", () => {
  it("503 when the signing secret is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(req(signed()));
    expect(res.status).toBe(503);
    expect(handleMock).not.toHaveBeenCalled();
  });

  it("401 on a missing or bad signature", async () => {
    expect((await POST(req({}))).status).toBe(401);
    expect((await POST(req({ ...signed(), "svix-signature": "v1,AAAA" }))).status).toBe(401);
    expect(handleMock).not.toHaveBeenCalled();
  });

  it("applies a verified event", async () => {
    const res = await POST(req(signed()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, type: "email.bounced", suppressed: 1 });
    expect(handleMock).toHaveBeenCalledWith(JSON.parse(body));
  });
});
