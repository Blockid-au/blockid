"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyButton({ userId, verified }: { userId: string; verified: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/admin/investor-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, verified: !verified }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
        verified
          ? "bg-white border border-rose-300 text-rose-700 hover:bg-rose-50"
          : "bg-bull text-white hover:bg-emerald-800"
      } ${busy ? "opacity-60 cursor-wait" : ""}`}
    >
      {verified ? "Unverify" : "Verify"}
    </button>
  );
}
