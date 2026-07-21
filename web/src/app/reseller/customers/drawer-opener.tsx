"use client";

// Per-row "View" button that opens the CustomerDrawer inline.

import { useState } from "react";
import { CustomerDrawer } from "./customer-drawer";

interface Props {
  customerId: string;
  displayName: string | null;
}

export function DrawerOpener({ customerId, displayName }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-700 underline hover:text-brand-900"
      >
        View
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
