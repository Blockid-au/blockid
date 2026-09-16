// svg-ast — the renderer subset parses losslessly (S-R4 twin bridge).

import { describe, expect, it } from "vitest";
import { ALL_VISUAL_KINDS, renderVisual } from "./index";
import { specForKind } from "./kind-fixtures";
import { countShapes, parseVisualSvg, unescapeXml, viewBoxOf } from "./svg-ast";

describe("parseVisualSvg", () => {
  it("parses the frame: root attrs, title/desc, self-closing shapes and text content", () => {
    const svg = renderVisual(specForKind("score_ring"));
    const root = parseVisualSvg(svg);
    expect(root.tag).toBe("svg");
    expect(root.attrs.role).toBe("img");
    expect(viewBoxOf(root.attrs)[2]).toBeGreaterThan(0);
    const title = root.children.find((c) => c.tag === "title");
    expect(title?.text).toBe("score_ring title");
    expect(root.children.some((c) => c.tag === "circle" || c.tag === "path")).toBe(true);
    const texts = root.children.filter((c) => c.tag === "text");
    expect(texts.some((t) => t.text === "61")).toBe(true);
  });

  it("unescapes entities in text and attributes", () => {
    expect(unescapeXml("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#8594;")).toBe("a & b <c> \"d\" 'e' →");
    const svg = renderVisual(specForKind("bar", { bars: [{ label: "R&D <x>", value: 3 }] }));
    const root = parseVisualSvg(svg);
    expect(root.children.some((c) => c.tag === "text" && c.text.includes("R&D <x>"))).toBe(true);
  });

  it("keeps nested groups and the element order the renderer emitted", () => {
    const root = parseVisualSvg('<svg viewBox="0 0 10 10"><g fill="red"><rect x="1" y="2" width="3" height="4"/><text x="1" y="2">hi</text></g><line x1="0" y1="0" x2="1" y2="1"/></svg>');
    expect(root.children.map((c) => c.tag)).toEqual(["g", "line"]);
    expect(root.children[0].children.map((c) => c.tag)).toEqual(["rect", "text"]);
    expect(root.children[0].children[1].text).toBe("hi");
    expect(countShapes(root)).toBe(4);
  });

  it("tolerates junk without throwing", () => {
    expect(parseVisualSvg("").children).toEqual([]);
    expect(parseVisualSvg("<svg></svg>").children).toEqual([]);
    expect(parseVisualSvg("not svg at all").children).toEqual([]);
    expect(viewBoxOf({})).toEqual([0, 0, 320, 160]);
  });

  it("every kind yields at least one drawable shape and a viewBox", () => {
    for (const kind of ALL_VISUAL_KINDS) {
      const root = parseVisualSvg(renderVisual(specForKind(kind)));
      expect(countShapes(root), kind).toBeGreaterThan(0);
      expect(viewBoxOf(root.attrs)[3], kind).toBeGreaterThan(0);
    }
  });
});
