"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

export function CheckoutTracker({ plan }: { plan: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      trackEvent("checkout_completed", { plan });
      fired.current = true;
    }
  }, [plan]);

  return null;
}
