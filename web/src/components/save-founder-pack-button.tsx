"use client";

import * as React from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveFounderPackModal } from "./save-founder-pack-modal";

// Drop-in CTA button that owns the modal open state. Each idea-phase tool
// imports this and places it wherever feels right (post-result CTA strip).

export function SaveFounderPackButton({
  className,
  label = "Save my Founder Pack",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={() => setOpen(true)}
        className={className}
      >
        <BookmarkPlus strokeWidth={1.75} className="h-4 w-4" />
        {label}
      </Button>
      <SaveFounderPackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
