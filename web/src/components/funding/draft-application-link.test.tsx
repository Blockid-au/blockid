// S16-A: the "Draft application (credits)" link on the static grant /
// program detail pages is signed-in only and resolved client-side
// (useAuthUser) so the pages stay ISR. Pins: nothing for a guest or while
// resolving; the workspace draft URL with the right kind for a signed-in
// founder; the HowToApply section only mounts it when `draft` is passed.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => authMock() }));

import { DraftApplicationLink, draftHref } from "./draft-application-link";
import { HowToApply } from "./enrichment-sections";

const APPLY = { intro: null, steps: ["Apply on the official page."], evidence: [], prompts: ["Why you?"], officialUrl: "https://example.org/apply" };

describe("DraftApplicationLink", () => {
  it("renders nothing for a guest or while auth is resolving", () => {
    authMock.mockReturnValueOnce(null);
    expect(renderToStaticMarkup(<DraftApplicationLink refId="syd-startmate-accelerator" kind="program" />)).toBe("");
    authMock.mockReturnValueOnce(undefined);
    expect(renderToStaticMarkup(<DraftApplicationLink refId="syd-startmate-accelerator" kind="program" />)).toBe("");
  });

  it("signed in → the workspace draft door with the kind, same copy as the report cards", () => {
    authMock.mockReturnValue({ id: "u1", email: "f@acme.io" });
    const program = renderToStaticMarkup(<DraftApplicationLink refId="syd-startmate-accelerator" kind="program" />);
    expect(program).toContain('href="/workspace/funding?draft=syd-startmate-accelerator&amp;kind=program"');
    expect(program).toContain('data-draft="syd-startmate-accelerator"');
    expect(program).toContain('data-draft-kind="program"');
    expect(program).toContain("Draft application (credits)");
    const grant = renderToStaticMarkup(<DraftApplicationLink refId="rdti" kind="grant" />);
    expect(grant).toContain('href="/workspace/funding?draft=rdti&amp;kind=grant"');
    expect(draftHref("a b", "grant")).toBe("/workspace/funding?draft=a%20b&kind=grant");
  });

  it("HowToApply mounts the link beside the official button only when `draft` is given", () => {
    authMock.mockReturnValue({ id: "u1", email: "f@acme.io" });
    const withDraft = renderToStaticMarkup(<HowToApply data={APPLY} officialLabel="Apply on the official page" draft={{ refId: "p1", kind: "program" }} />);
    expect(withDraft).toContain("data-apply-actions");
    expect(withDraft).toContain('href="https://example.org/apply"');
    expect(withDraft).toContain('data-draft="p1"');
    expect(withDraft.indexOf("https://example.org/apply")).toBeLessThan(withDraft.indexOf('data-draft="p1"'));
    const without = renderToStaticMarkup(<HowToApply data={APPLY} />);
    expect(without).not.toContain("data-draft=");
  });
});
