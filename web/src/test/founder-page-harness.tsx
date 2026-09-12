// S18-B — shared bits for `(founder)` server-page render tests.
//
// A page test mocks `@/lib/projects` with `projectsMock(scopeState)` (see
// project-scope-mock.ts), `@/lib/auth` with `founderUser(scopeState)`, and
// renders the page element with `renderPage()`. Three facts are pinned per
// page:
//   owner   → the page reads the caller's own record (unchanged behaviour)
//   member  → the page reads the OWNER's record and never calls
//             `findOrCreateSVIAccount` (no split svi_accounts row)
//   viewer  → the mutating client component receives `readOnly` /
//             `disabled` and the "view only" note renders
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import type { ScopeState } from "./project-scope-mock";

/** `AppUser`-shaped fixture for the caller described by the scope state. */
export function founderUser(state: ScopeState) {
  return {
    id: state.callerId,
    email: state.callerEmail,
    displayName: "Caller",
    role: "user",
    plan: "founder_free",
    createdAt: "",
    lastLoginAt: null,
    googleId: null,
    avatarUrl: null,
    discountPct: null,
    startupName: null,
    startupStage: null,
    industry: null,
    onboardingCompleted: true,
    startupGoals: null,
  };
}

export async function renderPage(el: ReactElement | Promise<ReactElement>): Promise<string> {
  const stream = await renderToReadableStream(await el);
  await stream.allReady;
  // Strip React SSR text-boundary markers so assertions read like the DOM.
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

/** Attribute value of the first `<tag ... data-<name>="…">` in `html`. */
export function dataAttr(html: string, name: string): string | null {
  const m = html.match(new RegExp(`data-${name}="([^"]*)"`));
  return m ? m[1] : null;
}
