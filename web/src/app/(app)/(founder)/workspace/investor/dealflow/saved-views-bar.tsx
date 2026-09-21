"use client";

/**
 * SavedViewsBar — deal-flow saved views + the GA4 filter tracker
 * (G13-W3-T2, BA spec §B.8 "Saved views", §B.10 T6, §C.5). Views are
 * links (the filters are URL-serialised so a view is shareable inside the
 * org); "Save view" POSTs the current filters to
 * /api/investor/dealflow/views (≤ 10) and refreshes; delete is a DELETE.
 * Fires `dealflow_filter_applied` once per active axis on mount and
 * `dealflow_view_saved` after a save.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { useLocale } from "@/lib/use-locale";
import { activeAxes, filtersToQuery, type DealFlowFiltersV2, type SavedView } from "@/lib/investors/saved-views";

const BASE = "/workspace/investor/dealflow";

export interface SavedViewsBarProps {
  views: SavedView[];
  filters: DealFlowFiltersV2;
  /** The "My mandate" default view (the mandate as filters); null without a mandate. */
  mandateView: DealFlowFiltersV2 | null;
  mandateLabel: string | null;
}

const COPY = {
  en: { views: "Views", mine: "My mandate", all: "All matches", save: "Save view", name: "View name", saving: "Saving…", saved: "View saved.", limit: "You already have 10 views — delete one first.", failed: "Could not save the view.", del: "Delete view" },
  vi: { views: "Chế độ xem", mine: "Mandate của tôi", all: "Tất cả", save: "Lưu chế độ xem", name: "Tên chế độ xem", saving: "Đang lưu…", saved: "Đã lưu.", limit: "Bạn đã có 10 chế độ xem — hãy xoá bớt.", failed: "Không lưu được.", del: "Xoá chế độ xem" },
} as const;

export function SavedViewsBar({ views, filters, mandateView, mandateLabel }: SavedViewsBarProps) {
  const [locale] = useLocale();
  const c = COPY[locale];
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "limit" | "failed">("idle");
  const uid = React.useId();
  const axes = activeAxes(filters);
  const current = filtersToQuery(filters);

  React.useEffect(() => {
    for (const axis of axes) trackEvent("dealflow_filter_applied", { axis: axis as "industry" });
    if (filters.mandate_id) trackEvent("dealflow_filter_applied", { axis: "mandate" });
    // once per page render — the deps are the serialised filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/investor/dealflow/views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filters, sort: filters.sort }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; views?: unknown[] };
      if (res.status === 402 && body.error === "limit_reached") return setStatus("limit");
      if (!res.ok || !body.ok) return setStatus("failed");
      setStatus("saved");
      setName("");
      trackEvent("dealflow_view_saved", { views: body.views?.length ?? views.length + 1 });
      router.refresh();
    } catch {
      setStatus("failed");
    }
  }

  async function remove(id: string) {
    await fetch(`/api/investor/dealflow/views?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    router.refresh();
  }

  const chip = (active: boolean) =>
    active
      ? "inline-flex min-h-11 items-center rounded-full bg-brand-navy text-white px-3 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
      : "inline-flex min-h-11 items-center rounded-full border border-surface-300 bg-white text-ink-700 px-3 text-xs font-medium hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2";
  const mandateQuery = mandateView ? filtersToQuery(mandateView) : "";

  return (
    <section aria-label={c.views} className="flex flex-wrap items-center gap-2" data-saved-views data-count={views.length}>
      <span className="text-[11px] uppercase tracking-wide text-ink-500">{c.views}</span>
      <Link href={BASE} className={chip(current === "")} data-view="all">
        {c.all}
      </Link>
      {mandateView ? (
        <Link href={mandateQuery ? `${BASE}?${mandateQuery}` : BASE} className={chip(current === mandateQuery && current !== "")} data-view="mandate" title={mandateLabel ?? undefined}>
          {c.mine}
        </Link>
      ) : null}
      {views.map((v) => {
        const q = filtersToQuery({ ...v.filters, sort: v.sort });
        return (
          <span key={v.id} className="inline-flex items-center gap-1" data-saved-view={v.id}>
            <Link href={q ? `${BASE}?${q}` : BASE} className={chip(current === q && q !== "")}>
              {v.name}
            </Link>
            <button type="button" onClick={() => void remove(v.id)} aria-label={`${c.del}: ${v.name}`} className="text-xs text-ink-400 hover:text-rose-600">
              ×
            </button>
          </span>
        );
      })}
      {axes.length > 0 ? (
        <form onSubmit={save} className="ml-auto flex items-center gap-2" data-save-view>
          <label htmlFor={`${uid}-name`} className="sr-only">
            {c.name}
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            value={name}
            maxLength={40}
            placeholder={c.name}
            onChange={(e) => setName(e.target.value)}
            className="w-40 rounded-lg border border-surface-300 bg-white px-2 py-1 text-xs text-ink-800"
          />
          <button type="submit" disabled={status === "saving" || !name.trim()} className="rounded-lg bg-brand-navy hover:bg-brand-navy-elev-1 text-white px-3 py-1 text-xs font-semibold disabled:opacity-60">
            {status === "saving" ? c.saving : c.save}
          </button>
          <span role="status" aria-live="polite" className="text-xs text-ink-500">
            {status === "saved" ? c.saved : status === "limit" ? c.limit : status === "failed" ? c.failed : null}
          </span>
        </form>
      ) : null}
    </section>
  );
}

export default SavedViewsBar;
