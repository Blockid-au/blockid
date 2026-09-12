// S18-B review P2-3 — the "view only" hint names who can actually help:
// a viewer asks the owner for editor rights; an editor on an admin surface
// can ask an admin OR the owner; only an admin (on an owner-only surface)
// is told the owner alone can do it.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewOnlyNote } from "./view-only-note";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("ViewOnlyNote copy", () => {
  it("viewer: ask the owner for editor rights", () => {
    const out = renderToStaticMarkup(<ViewOnlyNote role="viewer" action="add competitors" />);
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).toContain("Shared · Viewer");
    expect(text(out)).toContain("ask the owner for editor rights to add competitors.");
  });

  it("editor on an admin surface: ask an admin or the project owner (not owner-only)", () => {
    const out = renderToStaticMarkup(<ViewOnlyNote role="editor" action="invite or remove members" />);
    expect(text(out)).toContain("ask an admin or the project owner to invite or remove members.");
    expect(text(out)).not.toContain("only the project owner");
  });

  it("admin on an owner-only surface: only the project owner can", () => {
    const out = renderToStaticMarkup(<ViewOnlyNote role="admin" action="transfer the project" />);
    expect(text(out)).toContain("only the project owner can transfer the project.");
  });

  it("defaults: viewer copy with the generic action", () => {
    expect(text(renderToStaticMarkup(<ViewOnlyNote />))).toContain("ask the owner for editor rights to make changes.");
  });
});
