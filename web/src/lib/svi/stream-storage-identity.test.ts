import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readStreamState, streamStorageIdentity, resolveStreamStorageIdentity } from "./stream-storage-identity";
const digest = (bytes: Uint8Array) => webcrypto.subtle.digest("SHA-256", bytes);
const scope = { userId: "user-a", projectId: "project-a", deckText: "Confidential business deck", tier: "free", locale: "en" };
describe("input-specific stream restore identity", () => {
  it("binds the whole received deck, including differences beyond 8k and whitespace", async () => {
    const prefix = "x".repeat(9000);
    const keys = await Promise.all([prefix + "A", prefix + "B", prefix + "A "].map(deckText => streamStorageIdentity({ ...scope, deckText }, digest)));
    expect(new Set(keys).size).toBe(3);
    expect(keys.every(key => /^svi-stream:v2:[a-f0-9]{64}$/.test(key!))).toBe(true);
    expect(await streamStorageIdentity(scope, digest)).toBe(await streamStorageIdentity(scope, digest));
    expect(await streamStorageIdentity(scope, digest)).not.toContain(scope.deckText);
  });
  it("separates project, report tier, locale, and no-deck from an explicit empty deck", async () => {
    const cases = [scope, { ...scope, userId: "user-b" }, { ...scope, projectId: "project-b" }, { ...scope, tier: "premium" }, { ...scope, locale: "vi" }, { ...scope, deckText: undefined }, { ...scope, deckText: "" }];
    expect(new Set(await Promise.all(cases.map(s => streamStorageIdentity(s, digest)))).size).toBe(cases.length);
  });
  it("disables persistence when scope or hashing is unavailable without changing intake", async () => {
    const unchanged = { ...scope };
    expect(await streamStorageIdentity({ ...scope, projectId: undefined }, digest)).toBeNull();
    expect(await streamStorageIdentity({ ...scope, userId: undefined }, digest)).toBeNull();
    expect(await streamStorageIdentity(scope, async () => { throw new Error("crypto unavailable"); })).toBeNull();
    expect(scope).toEqual(unchanged);
  });
  it("restores only an exact matching input and leaves legacy/other input entries intact", async () => {
    const oldKey = await streamStorageIdentity(scope, digest);
    const nextKey = await streamStorageIdentity({ ...scope, deckText: "New business deck" }, digest);
    const values = new Map([[oldKey!, JSON.stringify({ savedAt: 100, done: true, finalProjection: { reportId: "old" } })], ["svi-stream:project-a", "legacy input remains"]]);
    const getItem = vi.fn((key: string) => values.get(key) ?? null);
    expect(readStreamState({ getItem }, oldKey, 200, 1000)).toMatchObject({ done: true });
    expect(readStreamState({ getItem }, nextKey, 200, 1000)).toBeNull();
    const otherUserKey = await streamStorageIdentity({ ...scope, userId: "user-b" }, digest);
    expect(readStreamState({ getItem }, otherUserKey, 200, 1000)).toBeNull();
    expect(readStreamState({ getItem }, null, 200, 1000)).toBeNull();
    expect(values.size).toBe(2);
    expect(getItem).not.toHaveBeenCalledWith("svi-stream:project-a");
  });
  it.each(["bad json", "null", JSON.stringify({ savedAt: 9999 }), JSON.stringify({ savedAt: -9999 }), JSON.stringify({ savedAt: "100" })])("rejects malformed, future or expired state without deleting it: %s", raw => {
    expect(readStreamState({ getItem: () => raw }, "key", 200, 1000)).toBeNull();
  });
});

it("late identity resolution cannot restore an earlier intake after a new deck arrives", async () => {
  let finishOld!: (key: string) => void;
  let finishNew!: (key: string) => void;
  const seen = vi.fn();
  const cancelOld = resolveStreamStorageIdentity(scope, seen, () => new Promise(resolve => { finishOld = resolve; }));
  cancelOld();
  resolveStreamStorageIdentity({ ...scope, deckText: "new" }, seen, () => new Promise(resolve => { finishNew = resolve; }));
  finishNew("new-key");
  await Promise.resolve();
  finishOld("old-key");
  await Promise.resolve();
  expect(seen.mock.calls).toEqual([["new-key"]]);
});
