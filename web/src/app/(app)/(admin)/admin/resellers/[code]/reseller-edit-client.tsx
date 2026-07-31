"use client";

import { useState } from "react";

interface EditableFields {
  display_name: string;
  billing_model: "retail" | "wholesale";
  status: "active" | "paused" | "terminated";
  gst_registered: boolean;
  abn: string;
  monthly_credit_budget: number;
  monthly_sandbox_credits: number;
  commission_share_pct: number;
  can_create_startups: boolean;
  can_grant_credits: boolean;
  contact_email: string;
  primary_color: string;
  logo_url: string;
  notes: string;
}

interface Props {
  code: string;
  initial: EditableFields;
}

export function ResellerEditClient({ code, initial }: Props) {
  const [fields, setFields] = useState<EditableFields>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function upd<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/resellers/${code.toLowerCase()}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: fields.display_name,
          billing_model: fields.billing_model,
          status: fields.status,
          gst_registered: fields.gst_registered,
          abn: fields.abn || null,
          monthly_credit_budget: fields.monthly_credit_budget,
          monthly_sandbox_credits: fields.monthly_sandbox_credits,
          commission_share_pct: fields.commission_share_pct,
          can_create_startups: fields.can_create_startups,
          can_grant_credits: fields.can_grant_credits,
          contact_email: fields.contact_email || null,
          primary_color: fields.primary_color || null,
          logo_url: fields.logo_url || null,
          notes: fields.notes || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; reason?: string; error?: string };
      if (!res.ok || !body.ok) {
        setMessage({ kind: "err", text: body.reason ?? body.error ?? `HTTP ${res.status}` });
      } else {
        setMessage({ kind: "ok", text: "Saved." });
      }
    } catch (err) {
      setMessage({ kind: "err", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const label = "block text-xs font-medium uppercase tracking-wide text-ink-500";
  const input = "mt-1 w-full rounded-md border border-surface-300 bg-white px-2 py-1 text-sm";

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={label}>Display name</label>
          <input
            className={input}
            value={fields.display_name}
            onChange={(e) => upd("display_name", e.target.value)}
            required
          />
        </div>
        <div>
          <label className={label}>Contact email</label>
          <input
            className={input}
            type="email"
            value={fields.contact_email}
            onChange={(e) => upd("contact_email", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Billing model</label>
          <select
            className={input}
            value={fields.billing_model}
            onChange={(e) => upd("billing_model", e.target.value as "retail" | "wholesale")}
          >
            <option value="retail">retail</option>
            <option value="wholesale">wholesale</option>
          </select>
        </div>
        <div>
          <label className={label}>Status</label>
          <select
            className={input}
            value={fields.status}
            onChange={(e) =>
              upd("status", e.target.value as "active" | "paused" | "terminated")
            }
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="terminated">terminated</option>
          </select>
        </div>
        <div>
          <label className={label}>ABN (NN NNN NNN NNN)</label>
          <input
            className={input}
            value={fields.abn}
            onChange={(e) => upd("abn", e.target.value)}
            placeholder="79 659 615 111"
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={fields.gst_registered}
              onChange={(e) => upd("gst_registered", e.target.checked)}
            />
            GST registered
          </label>
        </div>
        <div>
          <label className={label}>Monthly credit budget</label>
          <input
            className={input}
            type="number"
            min={0}
            value={fields.monthly_credit_budget}
            onChange={(e) => upd("monthly_credit_budget", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Monthly sandbox credits</label>
          <input
            className={input}
            type="number"
            min={0}
            value={fields.monthly_sandbox_credits}
            onChange={(e) => upd("monthly_sandbox_credits", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Commission share %</label>
          <input
            className={input}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={fields.commission_share_pct}
            onChange={(e) => upd("commission_share_pct", Number(e.target.value))}
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={fields.can_create_startups}
              onChange={(e) => upd("can_create_startups", e.target.checked)}
            />
            can create startups
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={fields.can_grant_credits}
              onChange={(e) => upd("can_grant_credits", e.target.checked)}
            />
            can grant credits
          </label>
        </div>
        <div>
          <label className={label}>Primary color (#RRGGBB)</label>
          <input
            className={input}
            value={fields.primary_color}
            onChange={(e) => upd("primary_color", e.target.value)}
            placeholder="#0055AA"
          />
        </div>
        <div>
          <label className={label}>Logo URL</label>
          <input
            className={input}
            value={fields.logo_url}
            onChange={(e) => upd("logo_url", e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div>
        <label className={label}>Notes</label>
        <textarea
          className={`${input} min-h-[80px]`}
          value={fields.notes}
          onChange={(e) => upd("notes", e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {message && (
          <span
            className={
              message.kind === "ok"
                ? "text-sm text-emerald-700"
                : "text-sm text-red-700"
            }
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
