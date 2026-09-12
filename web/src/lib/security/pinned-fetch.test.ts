// S20-B review P2-3 — the pinned transport really goes through undici's
// connector: a lookup that rebinds to a private address is refused BEFORE
// any socket is opened (no network in these tests — the refusal happens in
// the lookup callback, the success path is covered by makePinnedLookup's
// unit tests in outbound-url.test.ts).
import { describe, expect, it } from "vitest";
import { pinnedDispatcher, pinnedFetch } from "./pinned-fetch";

describe("pinnedFetch", () => {
  it("refuses a rebinding lookup (public at check time, private at connect time) with the refusal as the cause", async () => {
    const answers = [["169.254.169.254"]];
    const resolve = async () => answers.shift() ?? ["169.254.169.254"];
    // Unpinned (empty list) → the connector re-resolves and sees the private answer.
    const err = await pinnedFetch("https://evil.example.com/hook", { method: "POST", body: "{}", redirect: "manual" }, [], { resolve }).then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error },
    );
    expect(err).toBeInstanceOf(Error);
    expect(String(err?.cause?.message ?? err?.message)).toContain("outbound_lookup_refused:private_ip:169.254.169.254");
  });

  it("refuses a pinned list that contains a private address, and never consults DNS when pinned", async () => {
    let resolves = 0;
    const resolve = async () => {
      resolves++;
      return ["93.184.216.34"];
    };
    const err = await pinnedFetch("https://hooks.example.com/x", { method: "POST", body: "{}" }, ["10.0.0.9"], { resolve }).then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error },
    );
    expect(String(err?.cause?.message ?? err?.message)).toContain("outbound_lookup_refused:private_ip:10.0.0.9");
    expect(resolves).toBe(0);
  });

  it("pinnedDispatcher builds a closable undici Agent", async () => {
    const d = pinnedDispatcher(["93.184.216.34"]);
    expect(typeof d.dispatch).toBe("function");
    await expect(d.close()).resolves.not.toThrow();
  });
});
