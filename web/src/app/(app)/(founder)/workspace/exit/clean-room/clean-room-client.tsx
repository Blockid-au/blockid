"use client";

/**
 * Clean-room preparation guide (S29-A) — /workspace/exit/clean-room.
 *
 *   - progress strip (done ÷ total) and the "no data room yet" hint;
 *   - seven stages in process order, each with its one-paragraph "why"
 *     and its tasks: a computed task shows what the room proves (and a
 *     link to the control), a founder task is a checkbox with an optional
 *     note (editor+), an "either" task is both;
 *   - the practical-not-legal note.
 *
 * `initial` lets the colocated render test seed the state without a fetch.
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink, Loader2, Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLEAN_ROOM_NOTE, type CleanRoomChecklist, type CleanRoomTaskState } from "@/lib/dataroom/clean-room";

export interface CleanRoomState {
  role: "owner" | "admin" | "editor" | "viewer" | null;
  roomId: string | null;
  updatedAt: string | null;
  checklist: CleanRoomChecklist;
}

export function canTick(role: CleanRoomState["role"]): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

/** "Room shows: NDA gate on" / "Ticked 1 Sep 2026" / "Not yet". */
export function taskStatusLine(t: CleanRoomTaskState): string {
  const parts: string[] = [];
  if (t.evidence) parts.push(`Room shows: ${t.evidence}`);
  if (t.doneAt) parts.push(`Ticked ${new Date(t.doneAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`);
  if (parts.length === 0) parts.push(t.done ? "Done" : "Not yet");
  return parts.join(" · ");
}

export function CleanRoomClient({ initial }: { initial?: CleanRoomState }) {
  const [state, setState] = React.useState<CleanRoomState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  const apply = React.useCallback((d: Record<string, unknown> | null) => {
    if (d?.ok) {
      const s = d as unknown as CleanRoomState;
      setState({ role: s.role ?? null, roomId: s.roomId ?? null, updatedAt: s.updatedAt ?? null, checklist: s.checklist });
    } else setError((d?.error as string | undefined) ?? "Could not load the guide");
  }, []);

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch("/api/data-room/clean-room")
      .then((r) => r.json())
      .then((d) => alive && apply(d))
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial, apply]);

  const tick = React.useCallback(
    async (t: CleanRoomTaskState, done: boolean) => {
      setError(null);
      setBusy(t.id);
      try {
        const res = await fetch("/api/data-room/clean-room", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: t.id, done, note: notes[t.id] ?? t.note ?? null }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error === "computed_task" ? "That row is decided by the data room — change the setting it points to." : (json.error ?? "Could not save"));
          return;
        }
        apply(json);
      } catch {
        setError("Network error");
      } finally {
        setBusy(null);
      }
    },
    [notes, apply],
  );

  if (loading && !state) return <div className="animate-pulse h-40 bg-surface-100 rounded-2xl" data-testid="clean-room-loading" />;
  if (!state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="clean-room-error">
        {error ?? "Clean-room guide unavailable"}
      </div>
    );
  }

  const editable = canTick(state.role);
  const c = state.checklist;

  return (
    <section className="space-y-5" data-testid="clean-room">
      <div className="grid gap-3 sm:grid-cols-3" data-testid="clean-room-progress">
        <div className="rounded-xl border border-surface-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-ink-400">Prepared</p>
          <p className="text-lg font-semibold text-ink-900">{c.pct} %</p>
          <p className="text-[10px] text-ink-400">
            {c.done} of {c.total} tasks
          </p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-ink-400">Proven by the data room</p>
          <p className="text-lg font-semibold text-ink-900">{c.stages.flatMap((s) => s.tasks).filter((t) => t.source !== "founder" && t.done && t.evidence).length}</p>
          <p className="text-[10px] text-ink-400">NDA gate, watermark, links, sections, log</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-ink-400">Your record</p>
          <p className="text-lg font-semibold text-ink-900">{c.stages.flatMap((s) => s.tasks).filter((t) => t.source === "founder" && t.done).length}</p>
          <p className="text-[10px] text-ink-400">{state.updatedAt ? `last ticked ${new Date(state.updatedAt).toLocaleDateString("en-AU")}` : "nothing ticked yet"}</p>
        </div>
      </div>

      {state.role === null && (
        <p className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-500" data-testid="clean-room-no-project">
          Pick a startup first — the computed rows read that project&apos;s data room.
        </p>
      )}
      {state.role !== null && !c.roomExists && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="clean-room-no-room">
          No data room yet — the computed rows stay undone until you{" "}
          <Link href="/workspace/documents/data-room" className="underline">
            create the data room
          </Link>
          .
        </p>
      )}

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex gap-2" data-testid="clean-room-note">
        <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{CLEAN_ROOM_NOTE}</span>
      </p>

      {error && (
        <p className="text-xs text-red-700" role="alert" data-testid="clean-room-error-inline">
          {error}
        </p>
      )}
      {!editable && state.role ? (
        <p className="text-xs text-ink-400" data-testid="clean-room-readonly">
          View only — {state.role} on this project cannot tick tasks.
        </p>
      ) : null}

      <ol className="space-y-4" data-testid="clean-room-stages">
        {c.stages.map((stage, i) => (
          <li key={stage.id} className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="clean-room-stage" data-stage={stage.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-800">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">{i + 1}</span>
                {stage.title}
              </h2>
              <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", stage.done === stage.total ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-surface-200 bg-surface-50 text-ink-500")}>
                {stage.done} / {stage.total}
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-600 leading-relaxed" data-testid="clean-room-why">
              {stage.why}
            </p>
            <ul className="mt-3 divide-y divide-surface-100">
              {stage.tasks.map((t) => {
                const computedOnly = t.source === "computed";
                const tickable = editable && !computedOnly;
                return (
                  <li key={t.id} className="py-3 flex gap-3" data-testid="clean-room-task" data-task={t.id} data-done={t.done ? "1" : "0"} data-source={t.source}>
                    <div className="pt-0.5">
                      {tickable ? (
                        <button type="button" onClick={() => void tick(t, !t.done)} disabled={busy !== null} aria-label={t.done ? `Untick ${t.label}` : `Tick ${t.label}`} data-testid="clean-room-tick" className="text-brand-600 disabled:opacity-60">
                          {busy === t.id ? <Loader2 strokeWidth={1.75} className="h-5 w-5 animate-spin" /> : t.done ? <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 text-emerald-600" /> : <Circle strokeWidth={1.75} className="h-5 w-5" />}
                        </button>
                      ) : t.done ? (
                        <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 text-emerald-600" aria-hidden />
                      ) : computedOnly ? (
                        <Lock strokeWidth={1.75} className="h-5 w-5 text-ink-300" aria-hidden />
                      ) : (
                        <Circle strokeWidth={1.75} className="h-5 w-5 text-ink-300" aria-hidden />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium", t.done ? "text-ink-500 line-through decoration-ink-300" : "text-ink-800")}>{t.label}</p>
                      <p className="mt-0.5 text-xs text-ink-600">{t.detail}</p>
                      <p className="mt-1 text-[11px] text-ink-400" data-testid="clean-room-task-status">
                        {computedOnly ? "Decided by the data room · " : t.source === "either" ? "Room or your tick · " : ""}
                        {taskStatusLine(t)}
                        {t.link && (
                          <>
                            {" · "}
                            <Link href={t.link.href} className="inline-flex items-center gap-0.5 text-brand-600 underline">
                              {t.link.label} <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
                            </Link>
                          </>
                        )}
                      </p>
                      {t.note && !tickable && <p className="mt-1 text-[11px] text-ink-500 italic">{t.note}</p>}
                      {tickable && (
                        <input
                          value={notes[t.id] ?? t.note ?? ""}
                          onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })}
                          onBlur={() => {
                            if ((notes[t.id] ?? t.note ?? "") !== (t.note ?? "") && t.done) void tick(t, true);
                          }}
                          placeholder="Note (who, which document, reference)"
                          maxLength={500}
                          data-testid="clean-room-note-input"
                          className="mt-1 w-full max-w-md rounded-lg border border-surface-200 bg-white px-2 py-1 text-[11px] text-ink-800"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
