import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingIntake,
  pendingIntakeQuery,
  PENDING_INTAKE_TTL_MS,
  setPendingIntake,
  submissionFromQuery,
  takePendingIntake,
} from "./pending-intake";

describe("pending intake handoff", () => {
  beforeEach(() => clearPendingIntake());

  it("returns null when nothing is parked", () => {
    expect(takePendingIntake()).toBeNull();
  });

  it("hands back a parked submission exactly once", () => {
    setPendingIntake({ variant: "idea", text: "a marketplace for x" });
    expect(takePendingIntake()?.text).toBe("a marketplace for x");
    expect(takePendingIntake()).toBeNull();
  });

  it("preserves the File handle across the handoff", () => {
    const file = new File(["deck"], "deck.pdf", { type: "application/pdf" });
    setPendingIntake({ variant: "deck", file });
    const claimed = takePendingIntake();
    expect(claimed?.file).toBe(file);
  });

  it("expires a stale submission", () => {
    setPendingIntake({ variant: "idea", text: "old" }, 0);
    expect(takePendingIntake(PENDING_INTAKE_TTL_MS + 1)).toBeNull();
  });

  it("keeps a submission that is still inside the TTL", () => {
    setPendingIntake({ variant: "idea", text: "fresh" }, 0);
    expect(takePendingIntake(PENDING_INTAKE_TTL_MS - 1)?.text).toBe("fresh");
  });

  describe("pendingIntakeQuery", () => {
    it("carries text in q", () => {
      expect(pendingIntakeQuery({ variant: "idea", text: "an idea" })).toBe(
        "/analyze?q=an+idea&kind=idea",
      );
    });

    it("prefers the url field", () => {
      expect(
        pendingIntakeQuery({
          variant: "url",
          text: "https://a.io",
          url: "https://a.io",
        }),
      ).toContain("q=https%3A%2F%2Fa.io");
    });

    it("omits q for a file drop but records the kind", () => {
      const file = new File(["d"], "d.pdf", { type: "application/pdf" });
      expect(pendingIntakeQuery({ variant: "deck", file })).toBe(
        "/analyze?kind=deck",
      );
    });

    it("keeps the paid tier flag", () => {
      expect(
        pendingIntakeQuery({ variant: "idea", text: "x" }, "paid"),
      ).toContain("tier=paid");
    });

    it("falls back to a bare /analyze when there is nothing to carry", () => {
      expect(pendingIntakeQuery({ variant: "empty" })).toBe("/analyze");
    });
  });

  describe("submissionFromQuery", () => {
    it("rebuilds a URL submission", () => {
      const sub = submissionFromQuery({ q: "https://example.com" });
      expect(sub).toEqual({
        variant: "url",
        text: "https://example.com",
        url: "https://example.com",
      });
    });

    it("rebuilds an idea submission", () => {
      expect(submissionFromQuery({ q: "a marketplace" })?.variant).toBe("idea");
    });

    it("honours an explicit url kind", () => {
      expect(submissionFromQuery({ q: "example.com", kind: "url" })?.url).toBe(
        "example.com",
      );
    });

    it("returns null for an empty query", () => {
      expect(submissionFromQuery({})).toBeNull();
      expect(submissionFromQuery({ q: "   " })).toBeNull();
    });

    it("returns null for a deck whose bytes did not survive", () => {
      expect(submissionFromQuery({ kind: "deck" })).toBeNull();
    });
  });
});
