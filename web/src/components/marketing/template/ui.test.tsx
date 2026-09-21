// G26 — the light-template UI primitives (PageHeader / Card / Table / Field /
// Button) render the light contract: semantic tokens only, navy primary via
// bg-action, 44 px hit areas, brand-navy focus ring, one h1 per header.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Card, Field, PageHeader, Table } from "./ui";
import { BUTTON_CLASS, FOCUS_RING } from "./primitives";

describe("BUTTON_CLASS — navy primary / outline secondary / ghost", () => {
  it("every skin is ≥ 44 px, carries the brand-navy focus ring and never a raw dark fill or text-white", () => {
    for (const [skin, cls] of Object.entries(BUTTON_CLASS)) {
      expect(cls, skin).toContain("min-h-11");
      expect(cls, skin).toContain(FOCUS_RING);
      expect(cls, skin).not.toMatch(/bg-brand-navy|text-white|#[0-9a-f]{3,6}\b/i);
    }
    expect(BUTTON_CLASS.primary).toContain("bg-action");
    expect(BUTTON_CLASS.primary).toContain("text-on-action");
    expect(BUTTON_CLASS.secondary).toContain("border-line");
    expect(BUTTON_CLASS.secondary).toContain("text-primary");
    expect(BUTTON_CLASS.ghost).toContain("text-primary");
    expect(BUTTON_CLASS.ghost).not.toContain("border-line");
  });
});

describe("<PageHeader />", () => {
  it("renders eyebrow · ONE h1 · lede on the white ground with dark ink, plus ≤ 2 actions and an aside", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        eyebrow="Workspace"
        title="Your evaluations"
        lede="Every startup you have scored."
        actions={[{ href: "/workspace/evaluations/new", label: "New evaluation" }, { href: "/docs", label: "Docs" }, { href: "/x", label: "Ignored" }]}
        aside={<span data-testid="aside">chip</span>}
      />,
    );
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<header[^>]*class="[^"]*bg-surface/);
    expect(html).toMatch(/<h1[^>]*class="[^"]*text-primary/);
    expect(html).toContain("Workspace");
    expect(html).toContain("Every startup you have scored.");
    expect((html.match(/<a\b/g) ?? []).length).toBe(2);
    expect(html).toContain('data-testid="aside"');
    expect(html).not.toMatch(/text-white|bg-brand-navy|data-theme/);
  });
});

describe("<Card />", () => {
  it("white raised surface, 1 px line, shadow-1; interactive adds shadow-2 on hover; title is an h3", () => {
    const html = renderToStaticMarkup(
      <Card title="Score" sub="Updated today" interactive>
        <p>body</p>
      </Card>,
    );
    expect(html).toMatch(/<section[^>]*class="[^"]*border-line-subtle[^"]*bg-surface-raised[^"]*shadow-1/);
    expect(html).toContain("hover:shadow-2");
    expect(html).toMatch(/<h3[^>]*>Score<\/h3>/);
    expect(html).toContain("<p>body</p>");
    expect(renderToStaticMarkup(<Card as="li" padding="none">x</Card>)).toMatch(/<li[^>]*class="[^"]*p-0/);
  });
});

describe("<Table />", () => {
  it("sticky sunken head, zebra rows, numeric columns right-aligned with tabular figures, empty state", () => {
    const columns = [
      { key: "name", header: "Startup" },
      { key: "svi", header: "SVI", align: "num" as const },
    ];
    const html = renderToStaticMarkup(<Table columns={columns} rows={[{ name: "Acme", svi: "612" }]} caption="One row" />);
    expect(html).toMatch(/<thead[^>]*class="[^"]*sticky[^"]*bg-surface-sunken/);
    expect(html).toMatch(/<th[^>]*scope="col"/);
    expect(html).toMatch(/<tr[^>]*class="[^"]*even:bg-surface-sunken/);
    expect(html).toMatch(/<td[^>]*class="[^"]*text-right[^"]*tabular-nums[^"]*"[^>]*>612/);
    expect(html).toContain("One row");
    expect(html).toMatch(/<div[^>]*class="[^"]*overflow-x-auto/);
    const empty = renderToStaticMarkup(<Table columns={columns} rows={[]} />);
    expect(empty).toContain("Nothing here yet.");
    expect(empty).toMatch(/colspan="2"/i);
  });
});

describe("<Field />", () => {
  it("visible label wired by htmlFor, 44 px control on white, hint + error wired by aria-describedby, aria-invalid on error", () => {
    const html = renderToStaticMarkup(
      <Field id="abn" label="ABN" hint="11 digits" error="ABN is required" required placeholder="12 345 678 901" />,
    );
    expect(html).toMatch(/<label[^>]*for="abn"/);
    expect(html).toMatch(/<input[^>]*id="abn"[^>]*aria-invalid="true"/);
    expect(html).toMatch(/aria-describedby="abn-hint abn-error"/);
    expect(html).toMatch(/<input[^>]*class="[^"]*min-h-11[^"]*bg-surface[^"]*text-primary/);
    expect(html).toMatch(/<p[^>]*id="abn-error"[^>]*role="alert"/);
    expect(html).toContain("11 digits");
    expect(html).not.toContain('label="ABN"');
    const select = renderToStaticMarkup(
      <Field id="s" label="Stage" as="select">
        <option value="seed">Seed</option>
      </Field>,
    );
    expect(select).toMatch(/<select[^>]*id="s"/);
    expect(select).toContain("<option");
    expect(renderToStaticMarkup(<Field id="t" label="Notes" as="textarea" />)).toMatch(/<textarea[^>]*rows="4"/);
  });
});

describe("<Button />", () => {
  it("native button, type=button by default, primary skin, loading → disabled + aria-busy", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="[^"]*bg-action/);
    const loading = renderToStaticMarkup(
      <Button variant="secondary" loading type="submit">
        Saving
      </Button>,
    );
    expect(loading).toMatch(/type="submit"/);
    expect(loading).toMatch(/disabled=""/);
    expect(loading).toMatch(/aria-busy="true"/);
    expect(loading).toContain("border-line");
  });
});
