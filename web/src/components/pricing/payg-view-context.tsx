"use client";

// PaygViewProvider — carries the server-read PaygView (payg-view.server.ts)
// to deep client components without a client fetch (G35 P5). Prefer a plain
// prop; use this only where threading a prop through a shared tree would
// touch files another lane owns. Default = the flag-OFF view, so a component
// rendered outside a provider shows today's site.

import { createContext, useContext, type ReactNode } from "react";
import { PAYG_OFF_VIEW, type PaygView } from "@/lib/pricing/payg-copy";

const PaygViewContext = createContext<PaygView>(PAYG_OFF_VIEW);

export function PaygViewProvider({ value, children }: { value: PaygView; children: ReactNode }) {
  return <PaygViewContext.Provider value={value}>{children}</PaygViewContext.Provider>;
}

export function usePaygView(): PaygView {
  return useContext(PaygViewContext);
}
