import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Shield } from "lucide-react";
import { ArchitectureClient } from "./architecture-client";

export const metadata: Metadata = {
  title: "System Architecture — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ArchitecturePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/architecture");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">
            Access Denied
          </h1>
          <Link
            href="/"
            className="text-brand-600 hover:text-brand-700 text-sm"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ArchitectureClient
      user={{
        email: user.email,
        displayName: user.displayName ?? null,
      }}
    />
  );
}
