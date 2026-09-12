import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  sealToken,
  openToken,
  resealToken,
  classifyToken,
  isPlaintextEquivalent,
  isMigrationMode,
  deriveKey,
  OAuthSealKeyMissingError,
  _resetOpenWarnings,
} from "./oauth-token-seal";

// S23-A — pins the at-rest policy for OAuth connector tokens:
//   * round trip under a key; fresh IV per call; utf-8 preserved
//   * `obf:`/raw refused when a key is set and OAUTH_TOKEN_MIGRATION is off
//     (fail closed → connector "reconnect"), accepted with the flag, and
//     still accepted with no key at all (dev parity with the writer)
//   * previous-key fallback on open; reseal previous → current
//   * production without a key throws on seal (never persists plaintext)
//   * reseal is idempotent and never nulls an unreadable row

const HEX = "a".repeat(64);
const HEX2 = "b".repeat(64);

function env(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...over } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  _resetOpenWarnings();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyToken / isPlaintextEquivalent", () => {
  it("empty / gcm / obf / raw", () => {
    expect(classifyToken(null)).toBe("empty");
    expect(classifyToken("")).toBe("empty");
    expect(classifyToken("gcm:a:b:c")).toBe("gcm");
    expect(classifyToken("obf:aGk=")).toBe("obf");
    expect(classifyToken("ghp_plain")).toBe("raw");
    expect(isPlaintextEquivalent("obf:aGk=")).toBe(true);
    expect(isPlaintextEquivalent("ghp_plain")).toBe(true);
    expect(isPlaintextEquivalent("gcm:a:b:c")).toBe(false);
    expect(isPlaintextEquivalent(null)).toBe(false);
  });
});

describe("deriveKey / isMigrationMode", () => {
  it("64 hex → raw bytes; anything else sha256'd; 64 non-hex is a passphrase", () => {
    expect(deriveKey(HEX)!.equals(Buffer.from(HEX, "hex"))).toBe(true);
    expect(deriveKey("pass")!.equals(crypto.createHash("sha256").update("pass").digest())).toBe(true);
    expect(deriveKey("z".repeat(64))!.equals(crypto.createHash("sha256").update("z".repeat(64)).digest())).toBe(true);
    expect(deriveKey(undefined)).toBeNull();
    expect(deriveKey("")).toBeNull();
  });

  it("migration flag accepts 1/true/yes only", () => {
    expect(isMigrationMode(env({ OAUTH_TOKEN_MIGRATION: "1" }))).toBe(true);
    expect(isMigrationMode(env({ OAUTH_TOKEN_MIGRATION: "TRUE" }))).toBe(true);
    expect(isMigrationMode(env({ OAUTH_TOKEN_MIGRATION: "0" }))).toBe(false);
    expect(isMigrationMode(env({ OAUTH_TOKEN_MIGRATION: "" }))).toBe(false);
    expect(isMigrationMode(env())).toBe(false);
  });
});

describe("sealToken", () => {
  it("null for null / undefined / empty", () => {
    expect(sealToken(null, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))).toBeNull();
    expect(sealToken(undefined, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))).toBeNull();
    expect(sealToken("", env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))).toBeNull();
  });

  it("gcm:<iv12>:<tag16>:<ct> under a key, fresh IV each call", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX });
    const a = sealToken("tok", e)!;
    const b = sealToken("tok", e)!;
    expect(a.startsWith("gcm:")).toBe(true);
    expect(a).not.toBe(b);
    const [, iv, tag] = a.split(":");
    expect(Buffer.from(iv, "base64").length).toBe(12);
    expect(Buffer.from(tag, "base64").length).toBe(16);
  });

  it("dev without a key → obf: wrapper", () => {
    const out = sealToken("tok", env())!;
    expect(out).toBe(`obf:${Buffer.from("tok").toString("base64")}`);
  });

  it("PRODUCTION without a key → throws OAuthSealKeyMissingError (never persists plaintext)", () => {
    expect(() => sealToken("tok", env({ NODE_ENV: "production" }))).toThrow(OAuthSealKeyMissingError);
    try {
      sealToken("tok", env({ NODE_ENV: "production" }));
    } catch (e) {
      expect((e as OAuthSealKeyMissingError).code).toBe("oauth_seal_key_missing");
    }
  });

  it("production WITH a key seals normally", () => {
    expect(sealToken("tok", env({ NODE_ENV: "production", OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))!.startsWith("gcm:")).toBe(true);
  });
});

describe("openToken", () => {
  it("round-trips gcm under the same key; utf-8 preserved", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: "passphrase" });
    const tok = "héllo-🌏-utf8";
    expect(openToken(sealToken(tok, e), e)).toBe(tok);
  });

  it("null for empty payloads, tampered ciphertext, and gcm with no key", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX });
    expect(openToken(null, e)).toBeNull();
    expect(openToken("", e)).toBeNull();
    const sealed = sealToken("tok", e)!;
    const parts = sealed.split(":");
    parts[3] = Buffer.from("xx" + Buffer.from(parts[3], "base64").toString("binary").slice(2), "binary").toString("base64");
    expect(openToken(parts.join(":"), e)).toBeNull();
    expect(openToken("gcm:only", e)).toBeNull();
    expect(openToken(sealed, env())).toBeNull();
  });

  it("wrong key → null (no throw)", () => {
    const sealed = sealToken("tok", env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))!;
    expect(openToken(sealed, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX2 }))).toBeNull();
  });

  it("no key at all → obf: and raw still open (dev parity)", () => {
    expect(openToken(`obf:${Buffer.from("tok").toString("base64")}`, env())).toBe("tok");
    expect(openToken("legacy-plain", env())).toBe("legacy-plain");
  });

  it("key set + migration flag OFF → obf: and raw REFUSED, logged once per form", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX });
    const obf = `obf:${Buffer.from("ghp_SECRETBYTES").toString("base64")}`;
    expect(openToken(obf, e)).toBeNull();
    expect(openToken(obf, e)).toBeNull();
    expect(openToken("li_SECRETPLAIN", e)).toBeNull();
    expect(err).toHaveBeenCalledTimes(2); // once for obf, once for raw
    const joined = err.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("refusing obf");
    expect(joined).toContain("refusing raw");
    expect(joined).not.toContain("SECRET"); // never the bytes
    expect(joined).not.toContain(obf.slice(4));
  });

  it("key set + OAUTH_TOKEN_MIGRATION=1 → obf: and raw accepted (transitional)", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX, OAUTH_TOKEN_MIGRATION: "1" });
    expect(openToken(`obf:${Buffer.from("tok").toString("base64")}`, e)).toBe("tok");
    expect(openToken("legacy-plain", e)).toBe("legacy-plain");
  });

  it("OAUTH_TOKEN_MIGRATION=0 is the same as unset (refused)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(openToken("legacy-plain", env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX, OAUTH_TOKEN_MIGRATION: "0" }))).toBeNull();
  });

  it("only a PREVIOUS key configured still counts as 'key set' for the obf: refusal", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(openToken("legacy-plain", env({ OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS: HEX }))).toBeNull();
  });

  it("previous-key fallback: sealed under the old key opens after rotation", () => {
    const sealedOld = sealToken("tok", env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))!;
    const rotated = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX2, OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS: HEX });
    expect(openToken(sealedOld, rotated)).toBe("tok");
    // and without the previous key it is unreadable
    expect(openToken(sealedOld, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX2 }))).toBeNull();
  });
});

describe("resealToken", () => {
  it("throws without a current key (nothing to seal with)", () => {
    expect(() => resealToken("legacy-plain", env())).toThrow(OAuthSealKeyMissingError);
    expect(() => resealToken("legacy-plain", env({ OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS: HEX }))).toThrow(OAuthSealKeyMissingError);
  });

  it("obf: → resealed gcm under the current key, regardless of the migration flag", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX });
    const r = resealToken(`obf:${Buffer.from("tok").toString("base64")}`, e);
    expect(r.action).toBe("resealed");
    expect(r.from).toBe("obf");
    expect(r.sealed!.startsWith("gcm:")).toBe(true);
    expect(openToken(r.sealed, e)).toBe("tok");
  });

  it("raw → resealed", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX });
    const r = resealToken("ghp_legacy", e);
    expect(r.action).toBe("resealed");
    expect(r.from).toBe("raw");
    expect(openToken(r.sealed, e)).toBe("ghp_legacy");
  });

  it("gcm under the current key → unchanged (idempotent — same payload back)", () => {
    const e = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX });
    const sealed = sealToken("tok", e)!;
    const r = resealToken(sealed, e);
    expect(r).toEqual({ action: "unchanged", from: "gcm_current", sealed });
  });

  it("gcm under the PREVIOUS key → resealed under current (rotation)", () => {
    const sealedOld = sealToken("tok", env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))!;
    const rotated = env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX2, OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS: HEX });
    const r = resealToken(sealedOld, rotated);
    expect(r.action).toBe("resealed");
    expect(r.from).toBe("gcm_previous");
    expect(r.sealed).not.toBe(sealedOld);
    expect(openToken(r.sealed, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX2 }))).toBe("tok");
    // second pass is a no-op
    expect(resealToken(r.sealed, rotated).action).toBe("unchanged");
  });

  it("gcm no configured key opens → unreadable, sealed null (caller must not write)", () => {
    const sealedOld = sealToken("tok", env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))!;
    const r = resealToken(sealedOld, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX2 }));
    expect(r).toEqual({ action: "unreadable", from: "gcm_unknown", sealed: null });
  });

  it("empty → skip_empty", () => {
    expect(resealToken(null, env({ OAUTH_TOKEN_ENCRYPTION_KEY: HEX }))).toEqual({ action: "skip_empty", from: "empty", sealed: null });
  });
});
