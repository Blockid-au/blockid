import { describe, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail: vi.fn(async () => ({ messageId: "m-1" })) })) } }));

import { ERASED_RECIPIENT_DOMAIN, isErasedRecipient, sendEmail } from "./email";
import { TOMBSTONE_DOMAIN } from "./privacy/erasure-map";

describe("erased recipients are never mailed (G33-T11)", () => {
  it("uses the same domain as the erasure tombstone", () => {
    expect(ERASED_RECIPIENT_DOMAIN).toBe(TOMBSTONE_DOMAIN);
  });

  it("recognises tombstones in any case/format and leaves normal addresses alone", () => {
    expect(isErasedRecipient("deleted+f411c125ad3b45b1273a7763@erased.blockid.au")).toBe(true);
    expect(isErasedRecipient(" Deleted+X@Erased.BlockID.au ")).toBe(true);
    expect(isErasedRecipient("founder@blockid.au")).toBe(false);
    expect(isErasedRecipient("someone@notErased.blockid.au.evil.com")).toBe(false);
    expect(isErasedRecipient("no-at-sign")).toBe(false);
  });

  it("sendEmail refuses a tombstone before any transport is used", async () => {
    process.env.SMTP_HOST = "smtp.invalid";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const nodemailer = (await import("nodemailer")).default as unknown as { createTransport: ReturnType<typeof vi.fn> };
    nodemailer.createTransport.mockClear();
    const r = await sendEmail({ to: "deleted+abc@erased.blockid.au", subject: "s", html: "<p>x</p>" });
    expect(r).toEqual({ ok: false, reason: "erased_recipient" });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});
