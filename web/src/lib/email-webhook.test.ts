// G34-BT2 EM04 — Svix signature check + bounce/complaint mapping.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));
const suppressMock = vi.fn(async (_e: string, _r: string) => true);
const markMock = vi.fn(async (_id: string, _s: string) => {});
vi.mock("./email-sends", () => ({
  suppressRecipient: (e: string, r: string) => suppressMock(e, r),
  markSendStatusByProviderId: (id: string, s: string) => markMock(id, s),
}));

import { handleResendEvent, suppressionForEvent, verifySvixSignature, WEBHOOK_TOLERANCE_SECONDS } from "./email-webhook";

const KEY = Buffer.from("super-secret-signing-key");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = 1_790_000_000;

function sign(id: string, ts: number, body: string, key = KEY): string {
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

beforeEach(() => vi.clearAllMocks());

describe("verifySvixSignature", () => {
  const body = JSON.stringify({ type: "email.bounced" });

  it("accepts a valid v1 signature (also among several)", () => {
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sign("msg_1", NOW, body) }, body, NOW)).toBe(true);
    const multi = `v1,AAAA ${sign("msg_1", NOW, body)}`;
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: multi }, body, NOW)).toBe(true);
  });

  it("rejects a tampered body, a wrong key, missing headers or an empty secret", () => {
    const sig = sign("msg_1", NOW, body);
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sig }, body + " ", NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sign("msg_1", NOW, body, Buffer.from("other")) }, body, NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: null, timestamp: String(NOW), signature: sig }, body, NOW)).toBe(false);
    expect(verifySvixSignature("", { id: "msg_1", timestamp: String(NOW), signature: sig }, body, NOW)).toBe(false);
  });

  it("rejects a replay outside the tolerance window", () => {
    const old = NOW - WEBHOOK_TOLERANCE_SECONDS - 1;
    expect(verifySvixSignature(SECRET, { id: "m", timestamp: String(old), signature: sign("m", old, body) }, body, NOW)).toBe(false);
  });
});

describe("suppressionForEvent", () => {
  it("a permanent (or untyped) bounce is a hard bounce", () => {
    expect(suppressionForEvent({ type: "email.bounced", data: { email_id: "e1", to: ["A@B.co"], bounce: { type: "Permanent" } } })).toEqual({
      reason: "hard_bounce",
      recipients: ["a@b.co"],
      providerMessageId: "e1",
    });
    expect(suppressionForEvent({ type: "email.bounced", data: { to: "x@y.io" } })?.reason).toBe("hard_bounce");
  });

  it("a transient bounce suppresses nothing", () => {
    expect(suppressionForEvent({ type: "email.bounced", data: { to: ["a@b.co"], bounce: { type: "Transient" } } })).toBeNull();
  });

  it("a complaint suppresses as complaint; other events are ignored", () => {
    expect(suppressionForEvent({ type: "email.complained", data: { to: ["a@b.co"] } })?.reason).toBe("complaint");
    expect(suppressionForEvent({ type: "email.delivered", data: { to: ["a@b.co"] } })).toBeNull();
    expect(suppressionForEvent({ type: "email.complained", data: {} })).toBeNull();
  });
});

describe("handleResendEvent", () => {
  it("suppresses every recipient and stamps the logged send", async () => {
    const r = await handleResendEvent({ type: "email.complained", data: { email_id: "e9", to: ["a@b.co", "c@d.io"] } });
    expect(r).toEqual({ suppressed: 2, reason: "complaint" });
    expect(suppressMock).toHaveBeenCalledWith("a@b.co", "complaint");
    expect(markMock).toHaveBeenCalledWith("e9", "complained");
  });

  it("does nothing for an ignored event", async () => {
    expect(await handleResendEvent({ type: "email.opened", data: { to: ["a@b.co"] } })).toEqual({ suppressed: 0, reason: null });
    expect(suppressMock).not.toHaveBeenCalled();
  });
});
