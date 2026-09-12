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
  // S18-B review P2-3: an editor on an admin surface (members roster, GA
  // link) can ask an ADMIN as well as the owner — "only the owner" was
  // wrong there. An admin only ever sees this note on an owner-only surface.
  const hint =
    role === "admin"
      ? `only the project owner can ${action}.`
      : role === "editor"
        ? `ask an admin or the project owner to ${action}.`
        : `ask the owner for editor rights to ${action}.`;
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
      <span>View-only access — {hint}</span>
    </div>
  );
}
