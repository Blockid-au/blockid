// G34-BT2 EM07 — one transport. Every e-mail leaves through
// lib/email-core.ts sendEmail (erased-recipient guard + `email_sends` log +
// C-class gate); nothing else may open a nodemailer transport or call the
// Resend API directly. Also pins that email-core stays free of the app
// imports (lib/auth → next/headers) that lib/ops-alert-email.ts must avoid.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");
const CORE = path.join(SRC, "lib", "email-core.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(abs);
  }
  return out;
}

describe("EM07 — a single e-mail transport", () => {
  it("no module but lib/email-core.ts imports nodemailer, opens a transport or calls the Resend API", () => {
    const offenders = walk(SRC)
      .filter((f) => f !== CORE)
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return /from\s+["']nodemailer["']|require\(\s*["']nodemailer["']\s*\)|\bcreateTransport\s*\(|api\.resend\.com\/emails/.test(src);
      })
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("cofounder-match and ops-alert-email send through sendEmail", () => {
    for (const rel of ["app/api/cofounder-match/route.ts", "lib/ops-alert-email.ts"]) {
      const src = readFileSync(path.join(SRC, rel), "utf8");
      expect(src, rel).toMatch(/\bsendEmail\(/);
      expect(src, rel).not.toMatch(/sendMail\(/);
    }
  });

  it("email-core has no app imports beyond email-sends / email-preferences (no lib/auth, no next/headers)", () => {
    const src = readFileSync(CORE, "utf8");
    const specs = [...src.matchAll(/^import\s+(?:type\s+)?[^'"]*?from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);
    expect(specs.sort()).toEqual(["./email-preferences", "./email-sends", "nodemailer", "server-only"].sort());
  });
});

// ── ops-alert-email through the core ─────────────────────────────────────────

const sendEmailMock = vi.fn();
vi.mock("./email-core", async (orig) => ({
  ...(await orig<typeof import("./email-core")>()),
  sendEmail: (a: unknown) => sendEmailMock(a),
}));

describe("sendOpsAlertEmail", () => {
  beforeEach(() => sendEmailMock.mockReset());

  it("sends a T-class ops-alert through sendEmail with the text escaped into the HTML part", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, id: "m1" });
    const { sendOpsAlertEmail } = await import("./ops-alert-email");
    expect(await sendOpsAlertEmail({ to: "ops@blockid.au", subject: "x".repeat(200), text: "<b>down</b>" })).toBe(true);
    const args = sendEmailMock.mock.calls[0][0];
    expect(args).toMatchObject({ to: "ops@blockid.au", flow: "ops-alert", text: "<b>down</b>" });
    expect(args.emailClass).toBeUndefined(); // transactional default
    expect(args.subject).toHaveLength(180);
    expect(args.html).toContain("&lt;b&gt;down&lt;/b&gt;");
  });

  it("returns false when the transport refuses (e.g. erased recipient)", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, reason: "erased_recipient" });
    const { sendOpsAlertEmail } = await import("./ops-alert-email");
    expect(await sendOpsAlertEmail({ to: "deleted+x@erased.blockid.au", subject: "s", text: "t" })).toBe(false);
  });
});
