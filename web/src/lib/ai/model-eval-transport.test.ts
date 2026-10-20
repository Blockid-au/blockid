import { describe, expect, it, vi } from "vitest";
import { EVAL_ENDPOINTS, buildChatBody, createEvalTransport, evalProviderConfigured, parseChatResponse } from "./model-eval-transport";
import type { ModelCallRequest } from "./model-eval";

const req = (over: Partial<ModelCallRequest> = {}): ModelCallRequest => ({ provider: "deepinfra", model: "deepseek-ai/DeepSeek-V3.2", system: "sys", user: "hi", maxTokens: 100, timeoutMs: 5_000, ...over });
const env = { DEEPINFRA_API_KEY: "di-secret", GROQ_API_KEY: "gq-secret", OPENROUTER_API_KEY: "or-secret", GOOGLE_GEMINI_API_KEY: "gm-secret" } as unknown as NodeJS.ProcessEnv;
const reply = (content: string) => JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 7 } });

describe("eval transport", () => {
  it("refuses every paid provider but DeepInfra before any I/O", async () => {
    const fetchText = vi.fn(async () => reply("x"));
    const t = createEvalTransport({ env, fetchText });
    for (const r of [req({ provider: "gemini", model: "gemini-2.5-flash" }), req({ provider: "openrouter", model: "openai/gpt-5-mini" }), req({ provider: "claude-apikey", model: "claude-opus-5" })]) {
      const out = await t(r);
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/refused/);
    }
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("dials the provider endpoint with its env key; returns content + usage", async () => {
    const fetchText = vi.fn(async () => reply('{"a":1}'));
    let t0 = 1_000;
    const t = createEvalTransport({ env, fetchText, now: () => (t0 += 250), thinkingOff: new Set(["deepseek-ai/DeepSeek-V3.2"]) });
    const out = await t(req());
    expect(out).toMatchObject({ ok: true, text: '{"a":1}', inputTokens: 12, outputTokens: 7, latencyMs: 250 });
    const [url, headers, body, timeout] = fetchText.mock.calls[0] as unknown as [string, Record<string, string>, string, number];
    expect(url).toBe(EVAL_ENDPOINTS.deepinfra);
    expect(headers.Authorization).toBe("Bearer di-secret");
    expect(JSON.parse(body)).toMatchObject({ model: "deepseek-ai/DeepSeek-V3.2", max_tokens: 100, temperature: 0, chat_template_kwargs: { thinking: false } });
    expect(timeout).toBe(5_000);
    const free = await t(req({ provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free" }));
    expect(free.ok).toBe(true);
    expect(fetchText.mock.calls[1]![0]).toBe(EVAL_ENDPOINTS.openrouter);
  });

  it("unconfigured provider / empty content / errors never leak the key", async () => {
    const t = createEvalTransport({ env: {} as NodeJS.ProcessEnv, fetchText: vi.fn() });
    expect((await t(req())).error).toMatch(/not configured/);
    const empty = createEvalTransport({ env, fetchText: vi.fn(async () => reply("")) });
    expect(await empty(req())).toMatchObject({ ok: false, error: "empty content" });
    const boom = createEvalTransport({ env, fetchText: vi.fn(async () => { throw new Error("HTTP 401: bad key di-secret"); }) });
    const out = await boom(req());
    expect(out.ok).toBe(false);
    expect(out.error).not.toContain("di-secret");
  });

  it("vision requests carry the PNG as a data URL; thinking flag only for listed DeepInfra models", () => {
    const b = buildChatBody(req({ provider: "deepinfra", model: "Qwen/Qwen3-VL-235B-A22B-Instruct", imageBase64: "AAAA" }), new Set(["deepseek-ai/DeepSeek-V3.2"]));
    const user = (b.messages as Array<{ content: unknown }>)[1]!.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(user[1]!.image_url!.url).toBe("data:image/png;base64,AAAA");
    expect(b.chat_template_kwargs).toBeUndefined();
  });

  it("parseChatResponse + evalProviderConfigured", () => {
    expect(parseChatResponse(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }] })).text).toBe("ab");
    expect(evalProviderConfigured("groq", env)).toBe(true);
    expect(evalProviderConfigured("gemini", env)).toBe(false); // never an eval provider, key or not
    expect(evalProviderConfigured("cerebras", env)).toBe(false);
  });
});
