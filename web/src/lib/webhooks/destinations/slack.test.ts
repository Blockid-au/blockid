// G14-S38 — Slack destination: Block Kit shape, field cap, fallback text,
// host allow-list.
import { describe, expect, it } from "vitest";
import { buildEnvelope, WEBHOOK_API_VERSION } from "../registry";
import { hostOf } from "./types";
import { buildSlackMessage, SLACK_HOSTS, slackConfigSchema, slackDestination } from "./slack";

const ENVELOPE = buildEnvelope(
  "svi.rescored",
  { project_id: "p-1", account_id: "a-1", svi_total: 68, previous_svi: 60, delta: 8, stage: 3, source: "rescore", snapshot_date: "2026-09-17" },
  { id: "d-1", now: new Date("2026-09-17T00:00:00.000Z") },
);

describe("slackDestination", () => {
  it("kind / label / hostAllowList", () => {
    expect(slackDestination.kind).toBe("slack");
    expect(slackDestination.hostAllowList).toEqual(["hooks.slack.com"]);
    expect(SLACK_HOSTS).toEqual(["hooks.slack.com"]);
  });

  it("configSchema: only api_version:1, nothing else accepted (.strict())", () => {
    expect(slackConfigSchema.safeParse({ api_version: 1 }).success).toBe(true);
    expect(slackConfigSchema.safeParse({ api_version: 1, extra: "x" }).success).toBe(false);
    expect(slackConfigSchema.safeParse({ api_version: 2 }).success).toBe(false);
  });

  it("endpointUrl passes the user-supplied incoming-webhook url through unchanged", () => {
    expect(slackDestination.endpointUrl({ api_version: 1 }, "https://hooks.slack.com/services/T0/B0/x")).toBe("https://hooks.slack.com/services/T0/B0/x");
    expect(slackDestination.endpointUrl({ api_version: 1 }, null)).toBeNull();
  });

  it("publicConfig redacts to {api_version:1} — there is nothing else to redact", () => {
    expect(slackDestination.publicConfig({ api_version: 1 })).toEqual({ api_version: 1 });
  });

  it("buildSlackMessage: header names the event title, fields carry Startup/SVI/Δ, an Open-in-BlockID button, and a context line with event/delivery/api_version", () => {
    const msg = buildSlackMessage(ENVELOPE);
    expect(msg.text).toContain("SVI rescored");
    const blocks = msg.blocks as Array<Record<string, unknown>>;
    const header = blocks.find((b) => b.type === "header") as { text: { text: string } };
    expect(header.text.text).toBe("BlockID · SVI rescored");
    const section = blocks.find((b) => b.type === "section") as { fields: Array<{ text: string }> };
    const fieldTexts = section.fields.map((f) => f.text);
    expect(fieldTexts.some((t) => t.includes("*SVI*") && t.includes("68"))).toBe(true);
    expect(fieldTexts.some((t) => t.includes("*Δ*") && t.includes("+8"))).toBe(true);
    const actions = blocks.find((b) => b.type === "actions") as { elements: Array<{ url: string }> } | undefined;
    expect(actions?.elements[0].url).toBe("https://blockid.au/workspace/svi");
    const context = blocks.find((b) => b.type === "context") as { elements: Array<{ text: string }> };
    expect(context.elements[0].text).toBe(`\`svi.rescored\` · delivery d-1 · api ${WEBHOOK_API_VERSION}`);
  });

  it("section.fields never exceeds Slack's 10-field cap", () => {
    const msg = buildSlackMessage(ENVELOPE);
    const blocks = msg.blocks as Array<Record<string, unknown>>;
    const section = blocks.find((b) => b.type === "section") as { fields: unknown[] };
    expect(section.fields.length).toBeLessThanOrEqual(10);
  });

  it("transform(): POSTs the Block Kit JSON to the given endpoint url with Content-Type application/json", () => {
    const plan = slackDestination.transform(ENVELOPE, { api_version: 1 }, "https://hooks.slack.com/services/T0/B0/x");
    expect(plan.url).toBe("https://hooks.slack.com/services/T0/B0/x");
    expect(plan.headers).toEqual({ "Content-Type": "application/json" });
    expect(plan.followUps).toBeUndefined();
    const parsed = JSON.parse(plan.body);
    expect(parsed.blocks).toBeInstanceOf(Array);
    // Never HMAC-signed — no X-BlockID-Signature at this layer (the dispatcher adds transport headers only).
    expect(Object.keys(plan.headers)).not.toContain("X-BlockID-Signature");
  });

  it("hostOf a non-slack url is rejected by the allow-list contract (dispatcher-side check lives in ./index.ts)", () => {
    expect(hostOf("https://hooks.slack.com/services/T0/B0/x")).toBe("hooks.slack.com");
    expect(SLACK_HOSTS.includes(hostOf("https://evil.example.com/x") as never)).toBe(false);
  });
});
