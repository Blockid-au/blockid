"use client";

// Per-row "View" button that opens the CustomerDrawer inline.

import { useState } from "react";

import { useLocale, type Locale } from "@/lib/use-locale";
import { CustomerDrawer } from "./customer-drawer";

interface Props {
  customerId: string;
  displayName: string | null;
}

const VIEW_LABEL: Record<Locale, string> = {
  en: "View",
  vi: "Xem",
};

export function DrawerOpener({ customerId, displayName }: Props) {
  const [locale] = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-700 underline hover:text-brand-900"
      >
        {VIEW_LABEL[locale]}
      </button>
      {open && (
        <CustomerDrawer
          customerId={customerId}
          displayName={displayName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
