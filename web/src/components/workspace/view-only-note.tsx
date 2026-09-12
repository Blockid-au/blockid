// S18-B — inline "view only" note for a shared-project member whose role
// cannot mutate the surface (viewer), or for a member on an owner-only
// surface. Server-safe (no hooks); pairs with the `SharedRoleChip` the
// project switcher shows in the header.

import { SharedRoleChip } from "@/components/ui/project-switcher";
import type { ProjectRole } from "@/lib/projects";

export function ViewOnlyNote({
  role,
  action = "make changes",
  className,
}: {
  role?: ProjectRole;
  /** What the missing right would allow, e.g. "add competitors". */
  action?: string;
  className?: string;
}) {
  const needsOwner = role === "admin" || role === "editor";
  return (
    <div
      data-testid="viewer-readonly-note"
      role="note"
      className={
        "flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-surface-300 bg-surface-50 px-3 py-2 text-xs text-ink-600 " +
        (className ?? "")
      }
    >
      <SharedRoleChip role={role} />
      <span>
        View-only access —{" "}
        {needsOwner
          ? `only the project owner can ${action}.`
          : `ask the owner for editor rights to ${action}.`}
      </span>
    </div>
  );
}
