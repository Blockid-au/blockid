"use client";

/**
 * Client component for /admin/i18n/review — inline-edit each cached
 * translation and POST the override to /api/i18n/cache. Admins reach
 * this page via cookie-auth so the endpoint uses `x-admin-key` from a
 * simple prompt on first save (kept client-side for the session).
 */

import { useMemo, useState } from "react";

interface Entry {
  en: string;
  vi: string;
  ts: string;
}

interface Props {
  entries: readonly Entry[];
}

export function I18nReviewClient({ entries }: Props) {
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, "idle" | "saving" | "ok" | "err">>({});
  const [adminKey, setAdminKey] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.en.toLowerCase().includes(q) || e.vi.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const saveOne = async (en: string) => {
    const vi = overrides[en];
    if (typeof vi !== "string" || vi.length === 0) return;
    let key = adminKey;
    if (!key) {
      const prompted = typeof window !== "undefined" ? window.prompt("Admin key (INTERNAL_ADMIN_KEY)") : "";
      if (!prompted) return;
      key = prompted;
      setAdminKey(prompted);
    }
    setSaving((s) => ({ ...s, [en]: "saving" }));
    try {
      const res = await fetch("/api/i18n/cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({ locale: "vi", en, vi }),
      });
      setSaving((s) => ({ ...s, [en]: res.ok ? "ok" : "err" }));
    } catch {
      setSaving((s) => ({ ...s, [en]: "err" }));
    }
  };

  return (
    <div className="space-y-4" data-i18n-skip>
      <input
        type="search"
        placeholder="Filter EN or VI…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-brand-ink placeholder:text-brand-ink-muted focus:border-brand-cyan focus:outline-none"
      />
      <div className="text-xs text-brand-ink-muted">
        Showing {filtered.length} of {entries.length}
      </div>
      <ul className="space-y-3">
        {filtered.map((e) => {
          const current = overrides[e.en] ?? e.vi;
          const state = saving[e.en] ?? "idle";
          return (
            <li
              key={e.en}
              className="rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="mb-2 text-xs text-brand-ink-muted">
                {e.ts.slice(0, 19).replace("T", " ")} UTC
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wider text-brand-ink-muted">EN</div>
                  <div className="whitespace-pre-wrap rounded bg-black/30 p-2 text-sm text-brand-ink">
                    {e.en}
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wider text-brand-ink-muted">
                    <span>VI</span>
                    <span className={
                      state === "ok" ? "text-emerald-400"
                      : state === "err" ? "text-red-400"
                      : state === "saving" ? "text-amber-400"
                      : ""
                    }>
                      {state === "ok" ? "saved" : state === "err" ? "error" : state === "saving" ? "saving…" : ""}
                    </span>
                  </div>
                  <textarea
                    value={current}
                    rows={Math.max(2, Math.min(8, Math.ceil(current.length / 60)))}
                    onChange={(ev) =>
                      setOverrides((o) => ({ ...o, [e.en]: ev.target.value }))
                    }
                    className="w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-brand-ink focus:border-brand-cyan focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => saveOne(e.en)}
                    disabled={state === "saving" || current === e.vi}
                    className="mt-2 rounded bg-brand-cyan px-3 py-1 text-xs font-semibold text-brand-navy disabled:opacity-40"
                  >
                    Save override
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
