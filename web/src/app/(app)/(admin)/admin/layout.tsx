import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// G8-P6: Admin pages are authenticated server-rendered surfaces served by the
// platform admins; they do not need the full marketing footer. A bottom-padding
// wrapper ensures the last card never bleeds into the viewport edge while
// keeping the chrome minimal.
// Design system rev.2: admin shell is always the light chassis regardless of
// the viewer's OS preference. `data-theme="light"` scopes globals.css light
// tokens (--ds-*) inside this subtree even when a dark OS preference or an
// ancestor dark theme would otherwise inherit.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen flex flex-col bg-white text-[color:var(--ds-ink)]">
      <div className="flex-1">{children}</div>
      <div className="pb-12" aria-hidden />
    </div>
  );
}
