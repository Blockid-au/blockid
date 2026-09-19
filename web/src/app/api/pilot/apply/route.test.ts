// Colocated vitest for POST /api/pilot/apply (G16-C): honeypot → 204 and
// nothing stored / sent; zod → 400 with issues; a valid application is
// appended to the jsonl (temp root via BLOCKID_WEB_DIR), pages ops and
// auto-replies to the applicant (never to anyone else); per-IP rate limit
// → 429 + Retry-After; bad JSON → 400.

import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), sendTelegram: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => mocks.sendEmail(...a),
  SENDER_IDENTITY_HTML: "Auschain PTY LTD",
  SENDER_IDENTITY_LINE: "Auschain PTY LTD",
}));
vi.mock("@/lib/telegram", () => ({ sendTelegram: (...a: unknown[]) => mocks.sendTelegram(...a) }));

import { POST } from "./route";
import { APPLICATIONS_FILE, HONEYPOT_FIELD } from "@/lib/pilots/applications";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/offer";

const VALID = { program_name: "Demo Accelerator", contact_name: "Pat Lee", email: "Pat@Program.ORG", cohort_size: "40", intake_month: "2026-11", message: "Cohort 7, Sydney." };

let root: string;
let ipSeq = 0;

function post(body: unknown, ip = `10.0.0.${++ipSeq}`) {
  return POST(new Request("http://localhost/api/pilot/apply", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "pilot-apply-"));
  process.env.BLOCKID_WEB_DIR = root;
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true });
  mocks.sendTelegram.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  delete process.env.BLOCKID_WEB_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe("POST /api/pilot/apply", () => {
  it("honeypot filled → 204, nothing stored, nothing sent", async () => {
    const res = await post({ ...VALID, [HONEYPOT_FIELD]: "http://spam.example" });
    expect(res.status).toBe(204);
    expect(existsSync(path.join(root, APPLICATIONS_FILE))).toBe(false);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
  });

  it("400 on bad JSON and on zod failures (missing name, bad month, cohort 0, bad e-mail) — nothing stored", async () => {
    expect((await post("nope")).status).toBe(400);
    const res = await post({ ...VALID, contact_name: "", intake_month: "Nov 2026", cohort_size: 0, email: "nope" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
    const paths = body.issues.map((i: { path: (string | number)[] }) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["contact_name", "intake_month", "cohort_size", "email"]));
    expect(existsSync(path.join(root, APPLICATIONS_FILE))).toBe(false);
  });

  it("valid → 200 { id }, appended to the jsonl with a hashed IP, ops paged with a masked e-mail, auto-reply to the applicant with the data sentence", async () => {
    const res = await post(VALID, "203.0.113.7");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const lines = readFileSync(path.join(root, APPLICATIONS_FILE), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row).toMatchObject({ id: body.id, program_name: "Demo Accelerator", contact_name: "Pat Lee", email: "pat@program.org", cohort_size: 40, intake_month: "2026-11", message: "Cohort 7, Sydney." });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
    expect(row).not.toHaveProperty(HONEYPOT_FIELD);

    // Fire-and-forget sends resolve on the microtask queue.
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendTelegram).toHaveBeenCalledTimes(1);
    const alert = mocks.sendTelegram.mock.calls[0][0] as string;
    expect(alert).toContain("Pilot application");
    expect(alert).toContain("p***@program.org");
    expect(alert).not.toContain("pat@program.org");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string; text: string };
    expect(mail.to).toBe("pat@program.org");
    expect(mail.subject).toContain("Demo Accelerator");
    expect(mail.html).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(mail.text).toContain(DATA_PRINCIPLE_SENTENCE);
  });

  it("rate limit: the 6th application from one IP inside the window → 429 with Retry-After", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i += 1) expect((await post({ ...VALID, email: `p${i}@program.org` }, ip)).status).toBe(200);
    const res = await post({ ...VALID, email: "p6@program.org" }, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(readFileSync(path.join(root, APPLICATIONS_FILE), "utf8").trim().split("\n")).toHaveLength(5);
  });
});
