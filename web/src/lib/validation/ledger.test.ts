// G22-D — ledger file round-trip on a temp root: missing file → empty,
// create / patch / delete write atomically (no .tmp left behind), corrupt
// rows dropped on read, not-found + ledger-full surfaced as results. G23-C:
// overlapping writes serialise (no lost update) and PATCH honours If-Match.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VALIDATION_LEDGER_FILE, createEntry, deleteEntry, patchEntry, readValidationLedger, writeValidationLedger } from "./ledger";
import { LEDGER_MAX_ENTRIES, newEntry, type ValidationEntryInput } from "./model";

const NOW = new Date("2026-09-21T10:00:00.000Z");
const INPUT: ValidationEntryInput = { organisation: "Demo Accelerator", contact_role: "Program manager", date: "2026-09-20", level: 1, outcome: "done", objection: "No budget until July", objection_answered: false, next_step: "Send proposal", note: "" };

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "validation-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("validation ledger IO", () => {
  it("missing file → empty ledger; the file lives under content/reports/", async () => {
    expect(VALIDATION_LEDGER_FILE).toBe(path.join("content", "reports", "validation-tracker.json"));
    const l = await readValidationLedger(root);
    expect(l).toEqual({ version: 1, updated_at: null, entries: [] });
  });

  it("create → patch → delete round-trip; the file is pretty JSON with version + updated_at and no temp file remains", async () => {
    const created = await createEntry(root, INPUT, NOW, "e-1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({ id: "e-1", organisation: "Demo Accelerator", created_at: NOW.toISOString() });

    const file = path.join(root, VALIDATION_LEDGER_FILE);
    expect(existsSync(file)).toBe(true);
    const raw = JSON.parse(readFileSync(file, "utf8")) as { version: number; updated_at: string; entries: unknown[] };
    expect(raw.version).toBe(1);
    expect(raw.updated_at).toBe(NOW.toISOString());
    expect(raw.entries).toHaveLength(1);
    expect(readdirSync(path.dirname(file)).filter((n) => n.endsWith(".tmp"))).toEqual([]);

    const later = new Date("2026-09-22T00:00:00.000Z");
    const patched = await patchEntry(root, "e-1", { outcome: "declined", objection_answered: true }, later);
    expect(patched.ok).toBe(true);
    if (patched.ok) {
      expect(patched.value.outcome).toBe("declined");
      expect(patched.value.objection_answered).toBe(true);
      expect(patched.value.updated_at).toBe(later.toISOString());
      expect(patched.value.created_at).toBe(NOW.toISOString());
    }
    expect((await readValidationLedger(root)).entries[0]?.outcome).toBe("declined");

    const missing = await patchEntry(root, "nope", { note: "x" });
    expect(missing).toMatchObject({ ok: false, error: "not_found" });

    const deleted = await deleteEntry(root, "e-1", later);
    expect(deleted.ok).toBe(true);
    expect((await readValidationLedger(root)).entries).toEqual([]);
    expect(await deleteEntry(root, "e-1")).toMatchObject({ ok: false, error: "not_found" });
  });

  it("a corrupt row in the file is dropped on read; a corrupt file reads as empty", async () => {
    const file = path.join(root, VALIDATION_LEDGER_FILE);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 1, updated_at: null, entries: [newEntry(INPUT, "ok", NOW), { id: "bad" }] }));
    expect((await readValidationLedger(root)).entries.map((e) => e.id)).toEqual(["ok"]);
    writeFileSync(file, "{{{");
    expect((await readValidationLedger(root)).entries).toEqual([]);
  });

  it("refuses to grow past LEDGER_MAX_ENTRIES", async () => {
    const entries = Array.from({ length: LEDGER_MAX_ENTRIES }, (_, i) => newEntry(INPUT, `e-${i}`, NOW));
    await writeValidationLedger(root, { version: 1, updated_at: null, entries }, NOW);
    const r = await createEntry(root, INPUT, NOW, "one-more");
    expect(r).toMatchObject({ ok: false, error: "ledger_full" });
  });
});

// G23-C — write serialisation + If-Match.
describe("validation ledger — serialised writes + If-Match (G23-C)", () => {
  it("N overlapping creates all land (no lost update): the promise chain serialises read-modify-write", async () => {
    const N = 12;
    const results = await Promise.all(Array.from({ length: N }, (_, i) => createEntry(root, { ...INPUT, organisation: `Org ${i}` }, NOW, `e-${i}`)));
    expect(results.every((r) => r.ok)).toBe(true);
    const l = await readValidationLedger(root);
    expect(l.entries.map((e) => e.id).sort()).toEqual(Array.from({ length: N }, (_, i) => `e-${i}`).sort());
    expect(readdirSync(path.dirname(path.join(root, VALIDATION_LEDGER_FILE))).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("overlapping patch + delete on different rows both apply; a rejected step does not poison the chain", async () => {
    await createEntry(root, INPUT, NOW, "a");
    await createEntry(root, INPUT, NOW, "b");
    const later = new Date("2026-09-22T00:00:00.000Z");
    const [p, d, missing] = await Promise.all([patchEntry(root, "a", { note: "edited" }, later), deleteEntry(root, "b", later), patchEntry(root, "zzz", { note: "x" }, later)]);
    expect(p.ok).toBe(true);
    expect(d.ok).toBe(true);
    expect(missing).toMatchObject({ ok: false, error: "not_found" });
    const l = await readValidationLedger(root);
    expect(l.entries.map((e) => [e.id, e.note])).toEqual([["a", "edited"]]);
    // The chain keeps working after the not_found step.
    expect((await createEntry(root, INPUT, later, "c")).ok).toBe(true);
  });

  it("ifMatch: matching updated_at applies; a stale one is refused with the current row and writes nothing; omitted = unconditional", async () => {
    const created = await createEntry(root, INPUT, NOW, "e-1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const t1 = new Date("2026-09-22T00:00:00.000Z");
    const first = await patchEntry(root, "e-1", { note: "first" }, t1, created.value.updated_at);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.updated_at).toBe(t1.toISOString());

    // A second tab still holding the ORIGINAL updated_at must not overwrite the first edit.
    const t2 = new Date("2026-09-23T00:00:00.000Z");
    const stale = await patchEntry(root, "e-1", { note: "second" }, t2, created.value.updated_at);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error).toBe("stale");
    expect(stale.current).toMatchObject({ id: "e-1", note: "first", updated_at: t1.toISOString() });
    expect(stale.message).toMatch(/changed since you opened it/);
    expect((await readValidationLedger(root)).entries[0]).toMatchObject({ note: "first", updated_at: t1.toISOString() });

    // Re-read → retry with the fresh updated_at succeeds; no ifMatch = unconditional.
    const retry = await patchEntry(root, "e-1", { note: "second" }, t2, stale.current.updated_at);
    expect(retry.ok).toBe(true);
    const unconditional = await patchEntry(root, "e-1", { note: "third" }, new Date("2026-09-24T00:00:00.000Z"));
    expect(unconditional.ok).toBe(true);
    expect((await readValidationLedger(root)).entries[0]?.note).toBe("third");
  });
});
