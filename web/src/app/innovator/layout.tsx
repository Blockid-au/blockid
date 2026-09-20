// Corporate Innovator console layout — HIDDEN (G20-F1, 2026-09-20).
//
// The console's four routes answer the shared "not offered" card
// (./hidden-console.tsx, lib/features/hidden.ts key innovator_console), so
// the layout is the auth gate and a plain surface only — no section nav
// pointing at hidden routes.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  children: ReactNode;
}

export default async function InnovatorLayout({ children }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/innovator");
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-12">
      {children}
    </main>
  );
}
