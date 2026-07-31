// Private mentor notes tab. Read-only skeleton — write UI (markdown editor
// + POST /api/reseller/mentor/[id]/notes) is a follow-up ticket. RSC.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

export default async function MentorNotesTab({
  params,
}: {
  params: Promise<{ founderId: string }>;
}) {
  const { founderId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) return null;
    throw err;
  }
  const db = resellerSupabase(scope);
  const notes = await db.mentorNotes(founderId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        Private mentor notes. Visible only to reseller admins unless consent tier = full.
      </p>
      {notes.length === 0 && (
        <p className="rounded-lg border border-dashed border-surface-300 p-3 text-xs text-ink-500 dark:border-surface-600">
          No notes yet. TODO: add markdown composer that POSTs to
          /api/reseller/mentor/{founderId}/notes.
        </p>
      )}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li
            key={n.id}
            className="rounded-lg border border-surface-200 bg-white p-3 text-sm dark:border-surface-700 dark:bg-surface-800"
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-ink-500">
              <span>{new Date(n.created_at).toISOString().slice(0, 10)}</span>
              {(n.tags ?? []).map((t) => (
                <span key={t} className="rounded bg-surface-100 px-1.5 py-0.5 dark:bg-surface-700">
                  {t}
                </span>
              ))}
            </div>
            <p className="whitespace-pre-wrap text-ink-800 dark:text-ink-100">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
