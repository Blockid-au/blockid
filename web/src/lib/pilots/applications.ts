// G16-C — /pilot applications: zod schema, the gitignored JSONL store
// (`content/reports/pilot-applications.jsonl`), the ops alert and the
// auto-reply. No account is created; nothing beyond the form's fields is
// stored (plus a timestamp, an id and a hashed IP for the rate-limit
// evidence). Erasure = the documented step in docs/ops/pilots.md.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { buildPilotApplyAutoReply } from "./emails";
import { maskEmail } from "./ledger";

export const APPLICATIONS_FILE = path.join("content", "reports", "pilot-applications.jsonl");
/** Same honeypot name as /api/lead — bots that fill every field trip it. */
export const HONEYPOT_FIELD = "company_website";
export const APPLY_RATE_LIMIT = { max: 5, windowMs: 10 * 60_000 } as const;

export const INTAKE_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const PilotApplySchema = z
  .object({
    program_name: z.string().trim().min(2).max(120),
    contact_name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(320),
    cohort_size: z.coerce.number().int().min(1).max(5_000),
    /** `YYYY-MM` (the `<input type="month">` value). */
    intake_month: z.string().trim().regex(INTAKE_MONTH_RE, "intake_month must be YYYY-MM"),
    message: z.string().trim().max(2_000).optional().default(""),
  })
  .strip();

export type PilotApplyInput = z.infer<typeof PilotApplySchema>;

export interface PilotApplication extends PilotApplyInput {
  id: string;
  received_at: string;
  ip_hash: string | null;
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function newApplication(input: PilotApplyInput, ip: string | null, now: Date = new Date(), id: string = randomUUID()): PilotApplication {
  return { id, received_at: now.toISOString(), ip_hash: hashIp(ip), ...input };
}

export async function appendApplication(root: string, row: PilotApplication): Promise<void> {
  const file = path.join(root, APPLICATIONS_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(row) + "\n", "utf8");
}

/** Last `limit` applications, newest first. Missing file → []. */
export async function readApplications(root: string, limit = 20): Promise<PilotApplication[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root, APPLICATIONS_FILE), "utf8");
  } catch {
    return [];
  }
  const rows: PilotApplication[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as PilotApplication;
      if (r && typeof r.email === "string" && typeof r.program_name === "string") rows.push(r);
    } catch {
      // half-written tail — skip
    }
  }
  return rows.slice(-limit).reverse();
}

export function applicationAlertText(a: PilotApplication): string {
  return [
    `🧪 *Pilot application* — ${a.program_name}`,
    `${a.contact_name} <${maskEmail(a.email)}> · cohort ${a.cohort_size} · intake ${a.intake_month}`,
    a.message ? `"${a.message.slice(0, 400)}"` : null,
    "",
    "Start it from /admin/pilots once the evaluator has an account.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function applicationAutoReply(a: PilotApplication) {
  return buildPilotApplyAutoReply({ contactName: a.contact_name, programName: a.program_name });
}
