import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingIntake,
  clearSignupIntake,
  parkIntakeForSignup,
  signupReturnPath,
  SIGNUP_INTAKE_KEY,
  SIGNUP_INTAKE_TTL_MS,
  SIGNUP_QUERY_MAX_CHARS,
  takeSignupIntake,
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

// ── Surviving a signup ────────────────────────────────────────────────────
//
// The whole point of the signup gate's prompt is that nothing gets retyped.
// If this handoff regresses, a visitor who has just been asked to make an
// account comes back to an empty box — which is a worse experience than the
// wall they were shown, and reliably loses them.

// No jsdom in this suite (vitest runs on node), so stand up the smallest
// sessionStorage that behaves like the real one. The module itself only ever
// touches `window.sessionStorage` inside try/catch, so a browser that blocks
// storage degrades to the `?q=` fallback rather than throwing.
function installSessionStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: storage,
  };
  return storage;
}

describe("signup handoff", () => {
  let storage: ReturnType<typeof installSessionStorage>;
  beforeEach(() => {
    storage = installSessionStorage();
  });

  it("returns null when nothing was parked", () => {
    expect(takeSignupIntake()).toBeNull();
  });

  it("carries a typed idea across a full page load", () => {
    parkIntakeForSignup({ variant: "idea", text: "a marketplace for x" });
    expect(takeSignupIntake()?.text).toBe("a marketplace for x");
  });

  it("carries a URL and its variant", () => {
    parkIntakeForSignup({
      variant: "url",
      text: "https://example.com",
      url: "https://example.com",
    });
    const claimed = takeSignupIntake();
    expect(claimed?.url).toBe("https://example.com");
    expect(claimed?.variant).toBe("url");
  });

  it("hands the submission back exactly once", () => {
    parkIntakeForSignup({ variant: "idea", text: "once" });
    expect(takeSignupIntake()?.text).toBe("once");
    expect(takeSignupIntake()).toBeNull();
  });

  it("does not write down a deck it cannot serialise", () => {
    const file = new File(["deck"], "deck.pdf", { type: "application/pdf" });
    parkIntakeForSignup({ variant: "deck", file });
    expect(storage.getItem(SIGNUP_INTAKE_KEY)).toBeNull();
  });

  it("expires a submission left over from a much earlier visit", () => {
    parkIntakeForSignup({ variant: "idea", text: "stale" }, 0);
    expect(takeSignupIntake(SIGNUP_INTAKE_TTL_MS + 1)).toBeNull();
  });

  it("keeps a submission inside the TTL", () => {
    parkIntakeForSignup({ variant: "idea", text: "fresh" }, 0);
    expect(takeSignupIntake(SIGNUP_INTAKE_TTL_MS - 1)?.text).toBe("fresh");
  });

  it("survives junk in storage without throwing", () => {
    storage.setItem(SIGNUP_INTAKE_KEY, "{not json");
    expect(takeSignupIntake()).toBeNull();
  });

  it("clears on request", () => {
    parkIntakeForSignup({ variant: "idea", text: "drop me" });
    clearSignupIntake();
    expect(takeSignupIntake()).toBeNull();
  });
});

describe("signupReturnPath", () => {
  it("returns to /analyze and marks the run as already promised", () => {
    const path = signupReturnPath({ variant: "idea", text: "an idea" });
    expect(path.startsWith("/analyze?")).toBe(true);
    expect(path).toContain("resume=signup");
    expect(path).toContain("q=an+idea");
    expect(path).toContain("kind=idea");
  });

  it("keeps long input out of the URL — sessionStorage carries it", () => {
    const long = "x".repeat(SIGNUP_QUERY_MAX_CHARS + 1);
    const path = signupReturnPath({ variant: "idea", text: long });
    expect(path).not.toContain("q=");
    expect(path).toContain("resume=signup");
  });

  it("records a deck's kind even though the bytes cannot travel", () => {
    const file = new File(["deck"], "deck.pdf", { type: "application/pdf" });
    const path = signupReturnPath({ variant: "deck", file });
    expect(path).toContain("kind=deck");
    expect(path).not.toContain("q=");
  });
});
