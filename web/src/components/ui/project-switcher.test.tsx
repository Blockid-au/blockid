// Colocated tests for the ProjectSwitcher (S17-A shared-project chip).
//
// renderToStaticMarkup — this workspace does not install
// @testing-library/react (see components/analyze/stage-banner.test.tsx).
// Effects never run under static rendering, so the switcher itself only
// shows its loading state; the chip is exported and rendered directly,
// and the switcher's list markup is exercised through the same component
// the projects page reuses.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { ProjectSwitcher, SharedRoleChip } from "./project-switcher";

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("SharedRoleChip", () => {
  it("renders 'Shared · <Role>' for each member role", () => {
    expect(html(<SharedRoleChip role="viewer" />)).toContain("Shared · Viewer");
    expect(html(<SharedRoleChip role="editor" />)).toContain("Shared · Editor");
    expect(html(<SharedRoleChip role="admin" />)).toContain("Shared · Admin");
  });

  it("defaults to viewer when the role is missing and carries a data-testid for e2e", () => {
    const out = html(<SharedRoleChip />);
    expect(out).toContain("Shared · Viewer");
    expect(out).toContain('data-testid="shared-role-chip"');
    expect(out).toContain('title="Shared with you as viewer"');
  });
});

describe("ProjectSwitcher (static)", () => {
  it("renders the loading placeholder before the /api/projects fetch resolves (no crash without data)", () => {
    const out = html(<ProjectSwitcher />);
    expect(out).toContain("animate-spin");
    expect(out).not.toContain("Shared ·");
  });
});
