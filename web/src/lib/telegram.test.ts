import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P9-telegram-lib-test — colocated vitest for the previously-untested
// `web/src/lib/telegram.ts`. The module is the single sendTelegram helper
// that /api/telegram-report, /api/cron/*, and every autonomous-loop tick
// funnel through when the platform pings admin@blockid.au on Telegram.
//
// A silent regression here breaks the ops-alerting last-mile — the operator
// simply stops receiving daily digests + deploy-fail pings + guardian
// alerts without any visible symptom in the app itself. So this suite pins:
//
//   • URL contract — POST to
//     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage
//     (the exact wire format the Bot API rejects on any deviation).
//   • Envelope contract — Content-Type: application/json, method POST,
//     body carries { chat_id, text, parse_mode, disable_web_page_preview }
//     with disable_web_page_preview:true always (chat pings would otherwise
//     unfurl BlockID/GitLab URLs and spam the ops channel with previews).
//   • parse_mode default — Markdown (the vast majority of callers rely on
//     backtick/underscore formatting; flipping default to HTML would render
//     `_bold_` literally in every message).
//   • parse_mode override — "HTML" is forwarded verbatim.
//   • Success return — data.ok === true → true; any other data.ok value
//     (false, undefined, "true" string) → false so the caller can retry.
//   • Error surfaces — non-ok Bot API responses log the .description
//     without throwing; a fetch rejection is caught and returns false
//     (ops alerting must NEVER break the caller). We assert console.error
//     is called on both branches.
//
// mdEscape:
//   • Escapes exactly the four Bot-API Markdown-v1 delimiters _ * ` [
//     — the ones that unmatched-pair Bot API rejects with 400. Other
//     specials (] ( ) # ~) are LEFT ALONE — pinning this prevents a well-
//     meaning "escape everything" change from breaking the many links
//     callers hand-craft with (…).
//   • Empty string → empty string.
//   • Idempotent across repeat calls on a plain string (no re-escape of the
//     backslash — mdEscape only escapes the 4 delimiters, not the backslash
//     itself, which is intentional for the Bot API Markdown v1 subset).
//   • Handles all four delimiters in a single call and preserves order +
//     surrounding characters.
//
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are read at module-load time. This
// suite used to "rely on the compiled-in defaults" — and the compiled-in
// default for the token was the real bot token, which is how it reached a
// public repo. There is no default any more: an unset token makes
// sendTelegram() return false before touching fetch. So the fake token is
// set here, hoisted above the import, and the URL assertion below checks
// for this exact fake — a real token can never satisfy it again.
// ---------------------------------------------------------------------------

const FAKE_TOKEN = vi.hoisted(() => {
  const t = "000000000:FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAK";
  process.env.TELEGRAM_BOT_TOKEN = t;
  return t;
});

import { mdEscape, sendTelegram } from "./telegram";

type FetchArgs = Parameters<typeof fetch>;

const ORIGINAL_FETCH = globalThis.fetch;
let fetchCalls: FetchArgs[] = [];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function stubFetch(impl: (...a: FetchArgs) => Promise<Response>): void {
  const fn = vi.fn(async (...args: FetchArgs) => {
    fetchCalls.push(args);
    return impl(...args);
  });
  globalThis.fetch = fn as typeof fetch;
}

beforeEach(() => {
  fetchCalls = [];
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  consoleErrorSpy.mockRestore();
  vi.restoreAllMocks();
});

// ─── mdEscape ──────────────────────────────────────────────────────────────

describe("mdEscape", () => {
  it("returns empty string unchanged", () => {
    expect(mdEscape("")).toBe("");
  });

  it("returns a plain string with no delimiters unchanged", () => {
    expect(mdEscape("hello world 123")).toBe("hello world 123");
  });

  it.each([
    ["_", "\\_"],
    ["*", "\\*"],
    ["`", "\\`"],
    ["[", "\\["],
  ])("escapes single delimiter %s → %s", (input, expected) => {
    expect(mdEscape(input)).toBe(expected);
  });

  it("escapes multiple occurrences of the same delimiter", () => {
    expect(mdEscape("__bold__")).toBe("\\_\\_bold\\_\\_");
  });

  it("escapes all four delimiters in a single call, preserving order", () => {
    expect(mdEscape("_a*b`c[d")).toBe("\\_a\\*b\\`c\\[d");
  });

  it("does NOT escape ] ( ) # ~ (Markdown-v1 subset only escapes the 4 unmatched-pair delimiters)", () => {
    expect(mdEscape("](#)~")).toBe("](#)~");
  });

  it("does NOT escape backslash itself (Bot API Markdown v1 leaves \\ literal)", () => {
    expect(mdEscape("a\\b")).toBe("a\\b");
  });

  it("preserves Unicode / non-ASCII characters", () => {
    expect(mdEscape("Tóm Tắt _test_ 🚀")).toBe("Tóm Tắt \\_test\\_ 🚀");
  });

  it("preserves whitespace, newlines, and tabs around delimiters", () => {
    expect(mdEscape("line1\n_x_\tend")).toBe("line1\n\\_x\\_\tend");
  });
});

// ─── sendTelegram — URL + envelope contract ────────────────────────────────

describe("sendTelegram — URL + envelope contract", () => {
  it("POSTs to https://api.telegram.org/bot<TOKEN>/sendMessage", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("hello");
    expect(fetchCalls).toHaveLength(1);
    const [url] = fetchCalls[0];
    // Exact fake, not [^/]+ — so this can only ever pass with the token the
    // test injected, never with a literal that crept back into the module.
    expect(String(url)).toBe(`https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`);
  });

  it("returns false without calling the API when no token is configured", async () => {
    // Pinned so the "no fallback" contract cannot be quietly reversed.
    vi.resetModules();
    const saved = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const fresh = await import("./telegram");
      stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
      expect(await fresh.sendTelegram("hello")).toBe(false);
      expect(fetchCalls).toHaveLength(0);
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = saved;
      vi.resetModules();
    }
  });

  it("sets method=POST and Content-Type: application/json", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("x");
    const [, init] = fetchCalls[0];
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["Content-Type"]).toBe("application/json");
  });

  it("body carries chat_id, text, parse_mode, disable_web_page_preview:true", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("hello world");
    const [, init] = fetchCalls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      chat_id: expect.any(String),
      text: "hello world",
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  });

  it("chat_id in body matches TELEGRAM_CHAT_ID (env or compiled-in default)", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("x");
    const [, init] = fetchCalls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.chat_id).toBe(process.env.TELEGRAM_CHAT_ID ?? "539796782");
  });

  it("disable_web_page_preview stays true across parse modes (prevents URL unfurl spam)", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("https://blockid.au", "HTML");
    const [, init] = fetchCalls[0];
    expect(JSON.parse(String(init?.body)).disable_web_page_preview).toBe(true);
  });
});

// ─── sendTelegram — parse_mode default + override ─────────────────────────

describe("sendTelegram — parse_mode", () => {
  it("defaults to Markdown when parseMode arg is omitted", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("*hi*");
    expect(JSON.parse(String(fetchCalls[0][1]?.body)).parse_mode).toBe("Markdown");
  });

  it("forwards HTML parse_mode verbatim", async () => {
    stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("<b>hi</b>", "HTML");
    expect(JSON.parse(String(fetchCalls[0][1]?.body)).parse_mode).toBe("HTML");
  });
});

// ─── sendTelegram — return value semantics ────────────────────────────────

describe("sendTelegram — return value", () => {
  it("returns true when Bot API replies with { ok: true }", async () => {
    stubFetch(async () => new Response('{"ok":true,"result":{}}', { status: 200 }));
    await expect(sendTelegram("x")).resolves.toBe(true);
  });

  it("returns false when Bot API replies with { ok: false, description }", async () => {
    stubFetch(async () => new Response('{"ok":false,"description":"chat not found"}', { status: 400 }));
    await expect(sendTelegram("x")).resolves.toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const msg = consoleErrorSpy.mock.calls[0]?.join(" ") ?? "";
    expect(msg).toContain("chat not found");
  });

  it("returns false when Bot API omits ok field entirely (undefined !== true)", async () => {
    stubFetch(async () => new Response("{}", { status: 200 }));
    await expect(sendTelegram("x")).resolves.toBe(false);
  });

  it("returns false when ok field is a truthy non-boolean (strict === true guard)", async () => {
    stubFetch(async () => new Response('{"ok":"true"}', { status: 200 }));
    await expect(sendTelegram("x")).resolves.toBe(false);
  });

  it("returns false and logs when fetch rejects (network error / DNS / timeout)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ENOTFOUND api.telegram.org");
    }) as typeof fetch;
    await expect(sendTelegram("x")).resolves.toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const combined = consoleErrorSpy.mock.calls.flat().map(String).join(" ");
    expect(combined).toContain("[telegram]");
  });
});
