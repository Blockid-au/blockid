"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [busy, setBusy] = React.useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  };
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-10"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing out…
        </>
      ) : (
        "Sign out"
      )}
    </Button>
  );
}
