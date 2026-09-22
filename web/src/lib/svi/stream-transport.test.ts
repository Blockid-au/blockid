import { expect, it, vi } from "vitest";
import { streamTransportCleanup } from "./stream-transport";
it("session cleanup aborts the current reader transport without signalling another session", () => {
  const current = new AbortController();
  const other = new AbortController();
  const aborted = vi.fn();
  current.signal.addEventListener("abort", aborted);
  const cleanup = streamTransportCleanup({ current });
  cleanup();
  cleanup();
  expect(aborted).toHaveBeenCalledTimes(1);
  expect(current.signal.aborted).toBe(true);
  expect(other.signal.aborted).toBe(false);
});
