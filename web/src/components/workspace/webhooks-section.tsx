"use client";

// S20-B — "Webhooks" section on /workspace/integrations.
//
// Add an endpoint (url + events), see the signing secret ONCE (copy
// button), test it (ping), inspect the last 50 deliveries with status
// chips, pause / resume, delete. Everything goes through /api/webhooks
// (lib/webhooks/http.ts shapes). The server page passes the initial list
// + the plan-gate verdict so the first paint needs no fetch; a
// `readOnly` viewer sees the list but no controls.

import { useState } from "react";
import type { PublicDelivery, PublicEndpoint } from "@/lib/webhooks/http";
import type { WebhookEvent } from "@/lib/webhooks/registry";

export interface WebhookEventOption {
  event: WebhookEvent;
  label: string;
  description: string;
}

export interface WebhooksSectionProps {
  initialEndpoints: PublicEndpoint[];
  events: WebhookEventOption[];
  access: { allowed: boolean; reason: string };
  /** Project-level endpoints are created for this project (admin+ only); null = user-level. */
  projectId: string | null;
  readOnly?: boolean;
}

type Busy = "create" | `test:${string}` | `toggle:${string}` | `delete:${string}` | `deliveries:${string}` | null;

const STATUS_CHIP: Record<PublicDelivery["status"], string> = {
  delivered: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  queued: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  failed: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  dead: "border-red-500/40 bg-red-500/10 text-red-300",
};

// S20-B review: `disabled_reason` values the API writes — auto_disabled:*
// (20 consecutive failures), paused_by_user, creator_not_member (the admin
// who created a project endpoint was removed from the project — P1) and
// secret_unreadable (sealing key missing / rotated — P2-4). The last two
// cannot be "resumed" into a working state: recreate the endpoint.
function disabledLabel(reason: string | null | undefined): string {
  if (reason?.startsWith("auto_disabled")) return "Auto-disabled";
  if (reason === "creator_not_member") return "Creator removed";
  if (reason === "secret_unreadable") return "Secret unreadable";
  return "Paused";
}

function disabledHint(reason: string | null | undefined): string | null {
  if (reason?.startsWith("auto_disabled")) return "Disabled after 20 consecutive failed deliveries. Fix the receiver, then resume.";
  if (reason === "creator_not_member") return "The team member who created this endpoint no longer has admin access to the project. Delete it and create your own if you still need it.";
  if (reason === "secret_unreadable") return "The signing secret for this endpoint could not be read. Delete it and create a new one.";
  return null;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

async function api<T>(url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    credentials: "same-origin",
  });
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    body = {} as T;
  }
  return { status: res.status, body };
}

export function WebhooksSection({ initialEndpoints, events, access, projectId, readOnly = false }: WebhooksSectionProps) {
  const [endpoints, setEndpoints] = useState<PublicEndpoint[]>(initialEndpoints);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<WebhookEvent[]>(events.map((e) => e.event));
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [deliveries, setDeliveries] = useState<Record<string, PublicDelivery[] | undefined>>({});
  const [open, setOpen] = useState<string | null>(null);

  const canManage = !readOnly && access.allowed;

  const toggleEvent = (e: WebhookEvent) =>
    setSelected((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  async function create() {
    setError(null);
    if (!url.trim()) return setError("Enter an https:// URL.");
    if (selected.length === 0) return setError("Pick at least one event.");
    setBusy("create");
    try {
      const { status, body } = await api<{ ok: boolean; endpoint?: PublicEndpoint; secret?: string; error?: string; reason?: string; message?: string }>(
        "/api/webhooks",
        { method: "POST", body: JSON.stringify({ url: url.trim(), events: selected, description: description.trim() || undefined, project_id: projectId ?? undefined }) },
      );
      if (!body.ok || !body.endpoint || !body.secret) {
        if (status === 402) setError(body.message ?? "Webhooks need the Growth plan, the Startup Package or an evaluator plan.");
        else if (body.error === "url_rejected") setError(`URL rejected (${body.reason ?? "not allowed"}) — use a public https:// address.`);
        else if (body.error === "limit_reached") setError("Endpoint limit reached (10). Delete one first.");
        else setError(body.error ? `Could not add endpoint: ${body.error.replaceAll("_", " ")}` : "Could not add endpoint.");
        return;
      }
      setEndpoints((cur) => [body.endpoint!, ...cur]);
      setRevealed({ id: body.endpoint.id, secret: body.secret });
      setCopied(false);
      setUrl("");
      setDescription("");
      setShowForm(false);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copySecret() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function test(id: string) {
    setBusy(`test:${id}`);
    setError(null);
    try {
      const { body } = await api<{ ok: boolean; status?: number | null; error?: string; duration_ms?: number }>(`/api/webhooks/${id}/test`, { method: "POST" });
      setTestResult((cur) => ({
        ...cur,
        [id]: body.ok ? `Ping delivered (HTTP ${body.status}, ${body.duration_ms ?? 0} ms)` : `Ping failed: ${body.error ?? "unknown"}${body.status ? ` (HTTP ${body.status})` : ""}`,
      }));
      if (open === id) await loadDeliveries(id);
    } catch {
      setTestResult((cur) => ({ ...cur, [id]: "Ping failed: network error" }));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(ep: PublicEndpoint) {
    setBusy(`toggle:${ep.id}`);
    setError(null);
    try {
      const { body } = await api<{ ok: boolean; endpoint?: PublicEndpoint; error?: string }>(`/api/webhooks/${ep.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !ep.active }),
      });
      if (body.ok && body.endpoint) setEndpoints((cur) => cur.map((e) => (e.id === ep.id ? body.endpoint! : e)));
      else setError(body.error ? `Update failed: ${body.error.replaceAll("_", " ")}` : "Update failed.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this webhook endpoint and its delivery log?")) return;
    setBusy(`delete:${id}`);
    setError(null);
    try {
      const { body } = await api<{ ok: boolean; error?: string }>(`/api/webhooks/${id}`, { method: "DELETE" });
      if (body.ok) {
        setEndpoints((cur) => cur.filter((e) => e.id !== id));
        if (revealed?.id === id) setRevealed(null);
        if (open === id) setOpen(null);
      } else setError(body.error ? `Delete failed: ${body.error.replaceAll("_", " ")}` : "Delete failed.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function loadDeliveries(id: string) {
    setBusy(`deliveries:${id}`);
    try {
      const { body } = await api<{ ok: boolean; deliveries?: PublicDelivery[] }>(`/api/webhooks/${id}/deliveries`);
      setDeliveries((cur) => ({ ...cur, [id]: body.ok ? (body.deliveries ?? []) : [] }));
    } catch {
      setDeliveries((cur) => ({ ...cur, [id]: [] }));
    } finally {
      setBusy(null);
    }
  }

  async function toggleOpen(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!deliveries[id]) await loadDeliveries(id);
  }

  return (
    <section id="webhooks" data-webhooks-section className="bg-surface-sunken border border-line-subtle backdrop-blur-sm rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-primary">Webhooks</h2>
          <p className="text-xs text-muted mt-1">
            Get a signed POST when your SVI is rescored, evidence lands in the vault, or a Money Finder / evaluation report is ready.
            Verify <span className="font-mono">X-BlockID-Signature</span> with the secret shown once —{" "}
            <a href="/docs#webhooks" className="underline">verification example</a>.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-xs rounded-md border border-line-subtle px-3 py-1.5 text-primary hover:bg-surface-raised"
            data-webhooks-add
          >
            {showForm ? "Cancel" : "Add endpoint"}
          </button>
        ) : null}
      </div>

      {!access.allowed ? (
        <p className="text-xs text-amber-300" data-webhooks-gate>
          Webhooks are included with Growth, the Startup Package and every evaluator plan.{" "}
          <a href="/pricing" className="underline">See plans</a>.
        </p>
      ) : null}
      {readOnly ? <p className="text-xs text-muted">View only — your role on this project cannot change integrations.</p> : null}

      {error ? <p className="text-xs text-red-300" role="alert">{error}</p> : null}

      {showForm && canManage ? (
        <form
          className="space-y-3 rounded-xl border border-line-subtle p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="block text-xs text-muted">
            Endpoint URL (https only)
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/blockid"
              className="mt-1 w-full rounded-md border border-line-subtle bg-transparent px-2 py-1.5 text-sm text-primary"
            />
          </label>
          <label className="block text-xs text-muted">
            Description (optional)
            <input
              type="text"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Zapier → HubSpot"
              className="mt-1 w-full rounded-md border border-line-subtle bg-transparent px-2 py-1.5 text-sm text-primary"
            />
          </label>
          <fieldset className="space-y-1">
            <legend className="text-xs text-muted">Events</legend>
            {events.map((ev) => (
              <label key={ev.event} className="flex items-start gap-2 text-xs text-primary">
                <input type="checkbox" checked={selected.includes(ev.event)} onChange={() => toggleEvent(ev.event)} className="mt-0.5" />
                <span>
                  <span className="font-mono">{ev.event}</span> — {ev.label}. <span className="text-muted">{ev.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            disabled={busy === "create"}
            className="text-xs rounded-md bg-brand-600 px-3 py-1.5 text-white disabled:opacity-60"
          >
            {busy === "create" ? "Adding…" : "Create endpoint"}
          </button>
        </form>
      ) : null}

      {revealed ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2" data-webhooks-secret>
          <p className="text-xs text-emerald-200 font-semibold">Signing secret — shown once. Store it now; it cannot be retrieved later.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs break-all text-primary">{revealed.secret}</code>
            <button type="button" onClick={() => void copySecret()} className="text-xs rounded-md border border-line-subtle px-2 py-1 text-primary">
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => setRevealed(null)} className="text-xs text-muted underline">
              I have saved it
            </button>
          </div>
        </div>
      ) : null}

      {endpoints.length === 0 ? (
        <p className="text-xs text-muted" data-webhooks-empty>No endpoints yet.</p>
      ) : (
        <ul className="space-y-3">
          {endpoints.map((ep) => (
            <li key={ep.id} className="rounded-xl border border-line-subtle p-3 space-y-2" data-webhook-endpoint={ep.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-primary break-all">{ep.url}</p>
                  <p className="text-xs text-muted">
                    {ep.description ? `${ep.description} · ` : ""}
                    {ep.events.join(", ")}
                    {ep.project_id ? " · project" : " · account"}
                  </p>
                  <p className="text-xs text-muted">
                    Last success {fmt(ep.last_success_at)} · last failure {fmt(ep.last_failure_at)}
                    {ep.failure_count > 0 ? ` · ${ep.failure_count} consecutive failure${ep.failure_count === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${
                    ep.active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"
                  }`}
                  data-webhook-status={ep.active ? "active" : "disabled"}
                >
                  {ep.active ? "Active" : disabledLabel(ep.disabled_reason)}
                </span>
              </div>
              {!ep.active && disabledHint(ep.disabled_reason) ? (
                <p className="text-xs text-amber-300">{disabledHint(ep.disabled_reason)}</p>
              ) : null}
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy === `test:${ep.id}`} onClick={() => void test(ep.id)} className="text-xs rounded-md border border-line-subtle px-2 py-1 text-primary disabled:opacity-60">
                    {busy === `test:${ep.id}` ? "Sending…" : "Send test ping"}
                  </button>
                  <button type="button" disabled={busy === `toggle:${ep.id}`} onClick={() => void toggle(ep)} className="text-xs rounded-md border border-line-subtle px-2 py-1 text-primary disabled:opacity-60">
                    {ep.active ? "Pause" : "Resume"}
                  </button>
                  <button type="button" onClick={() => void toggleOpen(ep.id)} className="text-xs rounded-md border border-line-subtle px-2 py-1 text-primary">
                    {open === ep.id ? "Hide deliveries" : "Deliveries"}
                  </button>
                  <button type="button" disabled={busy === `delete:${ep.id}`} onClick={() => void remove(ep.id)} className="text-xs rounded-md border border-red-500/40 px-2 py-1 text-red-300 disabled:opacity-60">
                    Delete
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void toggleOpen(ep.id)} className="text-xs rounded-md border border-line-subtle px-2 py-1 text-primary">
                  {open === ep.id ? "Hide deliveries" : "Deliveries"}
                </button>
              )}
              {testResult[ep.id] ? <p className="text-xs text-muted" data-webhook-test-result>{testResult[ep.id]}</p> : null}
              {open === ep.id ? (
                <div className="overflow-x-auto">
                  {busy === `deliveries:${ep.id}` && !deliveries[ep.id] ? (
                    <p className="text-xs text-muted">Loading…</p>
                  ) : (deliveries[ep.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted">No deliveries yet.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="py-1 pr-2">Event</th>
                          <th className="py-1 pr-2">Status</th>
                          <th className="py-1 pr-2">Attempts</th>
                          <th className="py-1 pr-2">HTTP</th>
                          <th className="py-1 pr-2">Created</th>
                          <th className="py-1 pr-2">Next / delivered</th>
                          <th className="py-1">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(deliveries[ep.id] ?? []).map((d) => (
                          <tr key={d.id} className="border-t border-line-subtle text-primary">
                            <td className="py-1 pr-2 font-mono">{d.event}</td>
                            <td className="py-1 pr-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 border ${STATUS_CHIP[d.status]}`}>{d.status}</span>
                            </td>
                            <td className="py-1 pr-2">{d.attempts}</td>
                            <td className="py-1 pr-2">{d.response_status ?? "—"}</td>
                            <td className="py-1 pr-2">{fmt(d.created_at)}</td>
                            <td className="py-1 pr-2">{fmt(d.delivered_at ?? d.next_attempt_at)}</td>
                            <td className="py-1 text-muted">{d.last_error ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
