import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// G8-P6: Admin pages are authenticated server-rendered surfaces served by the
// platform admins; they do not need the full marketing footer. A bottom-padding
// wrapper ensures the last card never bleeds into the viewport edge while
// keeping the chrome minimal.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{children}</div>
      <div className="pb-12" aria-hidden />
    </div>
  );
}
