import { describe, expect, it } from "vitest";
import { getStatusRoot } from "./jsonl";

describe("getStatusRoot (review 2026-09-18 — read the live checkout, not the release copy)", () => {
  it("honours BLOCKID_WEB_DIR and otherwise returns an absolute directory", () => {
    const root = getStatusRoot();
    expect(typeof root).toBe("string");
    expect(root.startsWith("/")).toBe(true);
    // The live server's cwd is /data/releases/<id>; the readers must never
    // default to that copy when the checkout exists.
    if (root !== process.cwd()) expect(root).toBe(process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web");
  });
});
