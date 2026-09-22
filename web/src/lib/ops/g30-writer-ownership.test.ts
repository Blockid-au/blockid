import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { g30WriterDeferred, parseG30Ownership } from "./g30-writer-ownership";
const control = { version: 1, owner: "g30", status: "active", source_of_truth: "docs/plans/SOURCE-OF-TRUTH.md" };
afterEach(() => vi.unstubAllEnvs());
describe("G30 API writer admission", () => {
  it.each(["invalid-json", "null", "[]", "{}", JSON.stringify({ ...control, version: true }), JSON.stringify({ ...control, owner: "legacy" }), JSON.stringify({ ...control, status: "paused" })])("refuses invalid control %s", (raw) => expect(parseG30Ownership(raw)).toBe("invalid"));
  it("requires an explicit released handoff, including missing-file failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "g30-api-owner-"));
    try {
      vi.stubEnv("BLOCKID_WEB_DIR", join(root, "web"));
      expect(g30WriterDeferred()?.status).toBe(503);
      mkdirSync(join(root, "docs/plans"), { recursive: true });
      const file = join(root, "docs/plans/g30-execution-control.json");
      writeFileSync(file, JSON.stringify(control));
      expect(await g30WriterDeferred()!.json()).toMatchObject({ ok: false, deferred: true, ownership: "active" });
      writeFileSync(file, JSON.stringify({ ...control, status: "released" }));
      expect(g30WriterDeferred()).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
