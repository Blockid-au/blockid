// G14-S38 — WebhooksSection: the Destination type select (Generic / Slack /
// Affinity / Airtable), per-kind hints and config fields, and the endpoint
// list's destination summary. Static render only (this workspace has no
// @testing-library/react — see sibling component tests for the same
// pattern) via a test-only `defaultShowForm` prop that seeds the "Add
// endpoint" form open, since `showForm` is otherwise internal client state
// with no way to reach it from a first-paint render.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicEndpoint } from "@/lib/webhooks/http";
import { DESTINATION_OPTIONS, WebhooksSection, type WebhookEventOption } from "./webhooks-section";

const EVENTS: WebhookEventOption[] = [{ event: "svi.rescored", label: "SVI rescored", description: "desc" }];
const ACCESS = { allowed: true, reason: "founder_growth" };

function endpoint(over: Partial<PublicEndpoint> = {}): PublicEndpoint {
  return {
    id: "ep-1",
    project_id: null,
    url: "https://h.example.com/x",
    description: null,
    events: ["svi.rescored"],
    active: true,
    failure_count: 0,
    disabled_reason: null,
    last_success_at: null,
    last_failure_at: null,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    kind: "generic",
    destination: null,
    ...over,
  };
}

function html(props: Partial<Parameters<typeof WebhooksSection>[0]> = {}): string {
  return renderToStaticMarkup(
    <WebhooksSection initialEndpoints={[]} events={EVENTS} access={ACCESS} projectId={null} defaultShowForm {...props} />,
  );
}

describe("DESTINATION_OPTIONS", () => {
  it("generic, slack, affinity, airtable — in that order, each with a non-empty label and hint", () => {
    expect(DESTINATION_OPTIONS.map((o) => o.kind)).toEqual(["generic", "slack", "affinity", "airtable"]);
    for (const o of DESTINATION_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.hint.length).toBeGreaterThan(0);
    }
  });

  it("the generic hint carries the Zapier Catch-Hook guidance", () => {
    const generic = DESTINATION_OPTIONS.find((o) => o.kind === "generic")!;
    expect(generic.hint).toMatch(/Zapier/);
    expect(generic.hint).toMatch(/Catch Hook/);
  });

  it("slack / affinity / airtable hints name their fixed allowed host", () => {
    expect(DESTINATION_OPTIONS.find((o) => o.kind === "slack")!.hint).toMatch(/hooks\.slack\.com/);
    expect(DESTINATION_OPTIONS.find((o) => o.kind === "affinity")!.hint).toMatch(/api\.affinity\.co/);
    expect(DESTINATION_OPTIONS.find((o) => o.kind === "airtable")!.hint).toMatch(/api\.airtable\.com/);
  });
});

describe("WebhooksSection — Add endpoint form (defaultShowForm)", () => {
  it("renders the Destination type select with all four kinds, defaulting to generic (its hint shown, url field visible)", () => {
    const out = html();
    expect(out).toContain("data-webhooks-kind");
    for (const o of DESTINATION_OPTIONS) expect(out).toContain(`>${o.label}<`);
    expect(out).toContain("Endpoint URL (https only)");
    expect(out).toContain("Zapier");
  });

  it("without defaultShowForm the form (and the select) is not in the initial render", () => {
    const out = html({ defaultShowForm: false });
    expect(out).not.toContain("data-webhooks-kind");
    expect(out).not.toContain("Destination type");
  });

  it("read-only / plan-gated viewers never see the add form even with defaultShowForm", () => {
    expect(html({ readOnly: true })).not.toContain("data-webhooks-kind");
    expect(html({ access: { allowed: false, reason: "founder_free" } })).not.toContain("data-webhooks-kind");
  });
});

describe("WebhooksSection — endpoint list destination summary", () => {
  it("a generic endpoint shows no destination-kind suffix", () => {
    const out = renderToStaticMarkup(
      <WebhooksSection initialEndpoints={[endpoint()]} events={EVENTS} access={ACCESS} projectId={null} />,
    );
    expect(out).not.toContain("Affinity");
    expect(out).not.toContain("Airtable");
  });

  it("a slack endpoint is labelled Slack with no extra summary", () => {
    const out = renderToStaticMarkup(
      <WebhooksSection
        initialEndpoints={[endpoint({ id: "ep-slack", kind: "slack", url: "https://hooks.slack.com/services/T0/B0/x", destination: { api_version: 1 } })]}
        events={EVENTS}
        access={ACCESS}
        projectId={null}
      />,
    );
    expect(out).toContain("Slack");
    expect(out).toContain("https://hooks.slack.com/services/T0/B0/x");
  });

  it("an airtable endpoint shows the base/table summary; an affinity endpoint shows org (and list when set)", () => {
    const out = renderToStaticMarkup(
      <WebhooksSection
        initialEndpoints={[
          endpoint({ id: "ep-air", kind: "airtable", url: "https://api.airtable.com/v0/appAAAAAAAAAAAAAA/Deals", destination: { api_version: 1, base_id: "appAAAAAAAAAAAAAA", table: "Deals" } }),
          endpoint({ id: "ep-aff", kind: "affinity", url: "https://api.affinity.co/notes", destination: { api_version: 1, organization_id: 42, list_id: 7 } }),
        ]}
        events={EVENTS}
        access={ACCESS}
        projectId={null}
      />,
    );
    expect(out).toContain("appAAAAAAAAAAAAAA / Deals");
    expect(out).toContain("org 42 · list 7");
  });

  it("never renders a secret-looking value from `destination` (the API only ever sends the redacted publicConfig summary)", () => {
    const out = renderToStaticMarkup(
      <WebhooksSection
        initialEndpoints={[endpoint({ kind: "airtable", destination: { api_version: 1, base_id: "appAAAAAAAAAAAAAA", table: "Deals" } })]}
        events={EVENTS}
        access={ACCESS}
        projectId={null}
      />,
    );
    expect(out).not.toMatch(/token|api_key|pat-/i);
  });
});
