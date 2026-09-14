import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { AddNoteForm, humaniseNoteError } from "./add-note-form";

// S31-B (2026-09-13): the page's native <form method="post"> posted
// form-encoded data to a JSON-only route — every save was a 400 page.

describe("AddNoteForm", () => {
  it("renders a JSON-submitting client form (no action / method attributes)", () => {
    const html = renderToStaticMarkup(<AddNoteForm clientId="c-1" />);
    expect(html).toContain("<form");
    expect(html).not.toContain('action="/api/advisor/notes"');
    expect(html).not.toContain('method="post"');
    expect(html).toContain("Save note");
  });

  it("the page uses it instead of the native form", () => {
    const src = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(src).toContain("<AddNoteForm");
    expect(src).not.toContain('action="/api/advisor/notes"');
  });

  it("humanises the route's error slugs", () => {
    expect(humaniseNoteError("body_required", 400)).toBe("Write something before saving.");
    expect(humaniseNoteError("something_else", 500)).toMatch(/Try again in a moment/);
    expect(humaniseNoteError(undefined, 400)).toBe("Could not save the note.");
  });
});
