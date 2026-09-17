// G14-S38 — Slack incoming-webhook destination (Block Kit).
//
// The endpoint url IS the Slack incoming webhook (a hooks.slack.com url,
// which Slack treats as the credential), so it stays in
// webhook_endpoints.url exactly like a generic endpoint and the row's
// config carries nothing sensitive. The message is a header + a two-column
// field grid (startup, SVI, delta, ...) + a link button + a context line
// with the event / delivery id, and a plain-text `text` fallback for
// notifications. Unsigned: Slack ignores foreign headers and verifies
// nothing (the dispatcher still pins the host to SLACK_HOSTS).

import { z } from "zod";
import type { WebhookEnvelope } from "../registry";
import { fmtDelta, summariseEnvelope } from "./summary";
import type { Destination, DestinationPlan } from "./types";

export const slackConfigSchema = z.object({ api_version: z.literal(1) }).strict();
export type SlackConfig = z.infer<typeof slackConfigSchema>;

export const SLACK_HOSTS = ["hooks.slack.com"] as const;

/** Slack section.fields is capped at 10; each mrkdwn <= 2000 chars. */
const MAX_FIELDS = 10;

function mrkdwn(text: string) {
  return { type: "mrkdwn" as const, text: text.slice(0, 2000) };
}

export function buildSlackMessage(envelope: WebhookEnvelope): Record<string, unknown> {
  const s = summariseEnvelope(envelope);
  const skip = new Set(["Startup", "SVI", "Δ"]);
  const fields = [
    mrkdwn(`*Startup*\n${s.startup ?? "—"}`),
    mrkdwn(`*SVI*\n${s.svi === null ? "—" : Math.round(s.svi)}`),
    mrkdwn(`*Δ*\n${fmtDelta(s.delta === null ? null : Math.round(s.delta))}`),
    ...s.fields.filter((f) => !skip.has(f.label)).map((f) => mrkdwn(`*${f.label}*\n${f.value}`)),
  ].slice(0, MAX_FIELDS);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `BlockID · ${s.title}`.slice(0, 150), emoji: false } },
    { type: "section", fields },
  ];
  if (s.link) {
    const button = { type: "button", text: { type: "plain_text", text: "Open in BlockID", emoji: false }, url: s.link, action_id: "blockid_open" };
    blocks.push({ type: "actions", elements: [button] });
  }
  blocks.push({ type: "context", elements: [mrkdwn(`\`${envelope.event}\` · delivery ${envelope.id} · api ${envelope.api_version}`)] });
  const text = [`BlockID · ${s.title}`, s.startup ? `Startup: ${s.startup}` : null, s.svi === null ? null : `SVI ${Math.round(s.svi)}`, s.link].filter(Boolean).join(" — ");
  return { text, blocks };
}

export const slackDestination: Destination<SlackConfig> = {
  kind: "slack",
  label: "Slack (incoming webhook)",
  hostAllowList: SLACK_HOSTS,
  configSchema: slackConfigSchema,
  endpointUrl: (_config, userUrl) => userUrl,
  transform(envelope, _config, endpointUrl): DestinationPlan {
    return { url: endpointUrl, headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildSlackMessage(envelope)) };
  },
  publicConfig: () => ({ api_version: 1 }),
};
