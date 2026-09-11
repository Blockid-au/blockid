// DirectoryGroup (S10-A): H2 → group page, note line, see-all link, and the
// native <details> tail of name-only links (crawlable + keyboard reachable
// with no JS; <summary> is focusable by default).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectoryGroup } from "./directory-group";

const tail = [
  { href: "/funding/programs/sydney/a", name: "Alpha" },
  { href: "/funding/programs/sydney/b", name: "Beta" },
];

describe("DirectoryGroup", () => {
  it("expanded: H2 links the group page, renders children, the see-all link and a <details> with one link per tail row", () => {
    const html = renderToStaticMarkup(
      <DirectoryGroup
        dataAttrs={{ "data-capital-group": "Sydney" }}
        headingId="capital-sydney"
        heading="Sydney"
        href="/funding/programs/sydney"
        note="8 programs · 3 open · also covers Wollongong"
        seeAllLabel="See all 8 programs in Sydney"
        tail={tail}
        tailSummary="All 8 programs in Sydney"
        tailLead="Continuing from the rows above:"
      >
        <ul>
          <li data-program-id="visible">Visible row</li>
        </ul>
      </DirectoryGroup>,
    );
    expect(html).toContain('<section data-capital-group="Sydney" aria-labelledby="capital-sydney"');
    expect(html).toContain('<h2 id="capital-sydney"');
    expect(html).toContain('href="/funding/programs/sydney">Sydney</a></h2>');
    expect(html).toContain("8 programs · 3 open · also covers Wollongong");
    expect(html).toContain('data-program-id="visible"');
    expect(html).toContain("See all 8 programs in Sydney");
    expect(html).toContain('<details class="group mt-2 rounded-xl border border-line-subtle bg-surface-sunken" data-tail-count="2">');
    expect(html).toContain("<summary");
    expect(html).toContain("All 8 programs in Sydney</summary>");
    expect(html).toContain("Continuing from the rows above:");
    expect(html).toContain('<li><a href="/funding/programs/sydney/a">Alpha</a></li><li><a href="/funding/programs/sydney/b">Beta</a></li>');
    // No JS hooks, no inline SVG.
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<svg");
  });

  it("collapsed: children are not rendered; the whole list is the <details>; no see-all when null; no <details> when the tail is empty", () => {
    const collapsed = renderToStaticMarkup(
      <DirectoryGroup
        dataAttrs={{ "data-state-group": "NSW" }}
        headingId="state-NSW"
        heading="New South Wales grants"
        href="/funding/grants?state=NSW"
        note="2 grants · 1 open"
        seeAllLabel={null}
        collapsed
        tail={tail}
        tailSummary="All 2 New South Wales grants"
      >
        <ul>
          <li data-grant-id="hidden">Hidden row</li>
        </ul>
      </DirectoryGroup>,
    );
    expect(collapsed).not.toContain('data-grant-id="hidden"');
    expect(collapsed).not.toContain("See all");
    expect(collapsed).toContain("<details");
    expect(collapsed).toContain("Alpha");

    const noTail = renderToStaticMarkup(
      <DirectoryGroup
        dataAttrs={{ "data-capital-group": "Perth" }}
        headingId="capital-perth"
        heading="Perth"
        href="/funding/programs/perth"
        note="1 program · 1 open"
        seeAllLabel="See the Perth intake calendar"
        tail={[]}
        tailSummary="All 1 programs in Perth"
      >
        <ul>
          <li>Row</li>
        </ul>
      </DirectoryGroup>,
    );
    expect(noTail).not.toContain("<details");
    expect(noTail).toContain("See the Perth intake calendar");
  });
});
