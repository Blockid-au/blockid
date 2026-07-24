import { describe, expect, it } from "vitest";
import {
  NOTE_MAX_LEN,
  diffAudit,
  draftKey,
  summarize,
  validateBody,
} from "./notes";

describe("draftKey", () => {
  it("is namespaced and stable for the same subject id", () => {
    const a = draftKey("00000000-0000-4000-8000-000000000001");
    const b = draftKey("00000000-0000-4000-8000-000000000001");
    expect(a).toBe(b);
    expect(a.startsWith("blockid:mentor-note-draft:")).toBe(true);
  });

  it("differs across subjects", () => {
    expect(draftKey("alpha")).not.toBe(draftKey("beta"));
  });

  it("falls back to :unknown on garbage input", () => {
    expect(draftKey("")).toBe("blockid:mentor-note-draft:unknown");
    expect(draftKey("   ")).toBe("blockid:mentor-note-draft:unknown");
    // @ts-expect-error - runtime bad input
    expect(draftKey(null)).toBe("blockid:mentor-note-draft:unknown");
  });
});

describe("validateBody", () => {
  it("accepts a normal markdown body and returns the trimmed body", () => {
    const r = validateBody("Hello **world**\n\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body).toBe("Hello **world**");
  });

  it("rejects the empty string", () => {
    expect(validateBody("")).toEqual({ ok: false, reason: "empty" });
    expect(validateBody("   \n\t")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects at boundary NOTE_MAX_LEN + 1", () => {
    const tooLong = "x".repeat(NOTE_MAX_LEN + 1);
    expect(validateBody(tooLong)).toEqual({ ok: false, reason: "too_long" });
  });

  it("accepts at boundary NOTE_MAX_LEN", () => {
    const justRight = "x".repeat(NOTE_MAX_LEN);
    const r = validateBody(justRight);
    expect(r.ok).toBe(true);
  });

  it("accepts markdown-only content (headings, lists)", () => {
    const r = validateBody("# Title\n- item\n- item");
    expect(r.ok).toBe(true);
  });

  it("rejects non-string types", () => {
    expect(validateBody(null)).toEqual({ ok: false, reason: "invalid_type" });
    expect(validateBody(123)).toEqual({ ok: false, reason: "invalid_type" });
    expect(validateBody({})).toEqual({ ok: false, reason: "invalid_type" });
  });
});

describe("summarize", () => {
  it("returns first non-empty line stripped of markdown noise", () => {
    expect(summarize("# Headline\nrest")).toBe("Headline");
    expect(summarize("- bullet one\n- bullet two")).toBe("bullet one");
    expect(summarize("**bold** and _italic_")).toBe("bold and italic");
  });

  it("collapses whitespace in the first line", () => {
    expect(summarize("foo    bar\tbaz")).toBe("foo bar baz");
  });

  it("truncates with an ellipsis past max", () => {
    const long = "abcdefghij".repeat(20); // 200 chars
    const s = summarize(long, 50);
    expect(s.length).toBe(50);
    expect(s.endsWith("…")).toBe(true);
  });

  it("returns empty string on empty or non-string input", () => {
    expect(summarize("")).toBe("");
    expect(summarize("\n\n")).toBe("");
    // @ts-expect-error runtime bad input
    expect(summarize(null)).toBe("");
  });
});

describe("diffAudit", () => {
  it("captures visibility changes and never echoes body content", () => {
    const d = diffAudit(
      "update",
      { body: "secret", visibility: "private" },
      { body: "secret v2", visibility: "shared_with_founder" },
    );
    expect(d.action).toBe("update");
    expect(d.fields.sort()).toEqual(["body", "visibility"]);
    expect(d.before?.visibility).toBe("private");
    expect(d.after?.visibility).toBe("shared_with_founder");
    // Body must not appear in the audit payload.
    expect(JSON.stringify(d)).not.toContain("secret");
  });

  it("round-trips through create + delete without loss", () => {
    const c = diffAudit("create", null, { body: "x", visibility: "private" });
    expect(c.before).toBeUndefined();
    expect(c.after?.visibility).toBe("private");
    const d = diffAudit("delete", { body: "x", visibility: "private" }, null);
    expect(d.after).toBeUndefined();
    expect(d.before?.visibility).toBe("private");
  });

  it("returns an empty fields list when nothing changed", () => {
    const d = diffAudit(
      "update",
      { body: "same", visibility: "private" },
      { body: "same", visibility: "private" },
    );
    expect(d.fields).toEqual([]);
  });
});
