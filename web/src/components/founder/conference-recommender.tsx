"use client";

/**
 * ConferenceRecommender — client widget that fetches
 * `/api/founder/conferences` for the active startup and renders the top 5
 * recommendations as cards. Failure and empty states are inline so the page
 * never suspends or shows a skeleton for longer than the fetch takes.
 */

import * as React from "react";
import { CalendarDays, MapPin, ExternalLink, Sparkles } from "lucide-react";

interface Conference {
  slug: string;
  name: string;
  date: string;
  city: string;
  country: string;
  url: string;
  audience: string[];
  stages: number[];
  sectors: string[];
  cost: "free" | "paid" | "invite";
  pitchCompetition: boolean;
  notes?: string;
}

interface ApiResponse {
  ok: boolean;
  conferences?: Conference[];
  error?: string;
  filters?: {
    sector: string | null;
    stage: number | null;
    region: string | null;
    budget: string | null;
  };
}

const COST_LABEL: Record<Conference["cost"], string> = {
  free: "Free",
  paid: "Ticketed",
  invite: "Invite-only",
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function ConferenceRecommender() {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: Conference[]; filters: ApiResponse["filters"] | null }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/founder/conferences?limit=5", { cache: "no-store" });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setState({ status: "error", message: json.error ?? `HTTP ${res.status}` });
          return;
        }
        setState({
          status: "ready",
          data: json.conferences ?? [],
          filters: json.filters ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "fetch_failed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-labelledby="conference-recommender-heading"
      className="rounded-xl border border-ink-100 bg-white p-6 shadow-sm"
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2
            id="conference-recommender-heading"
            className="text-base font-semibold text-ink-800 flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden="true" />
            Conferences worth flying to
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Matched to your startup's sector, stage, and region. Refreshed from the
            curated seed list.
          </p>
        </div>
        {state.status === "ready" && state.filters ? (
          <p className="hidden text-[10px] uppercase tracking-widest text-ink-400 sm:block">
            {state.filters.sector ?? "any sector"} ·{" "}
            {state.filters.region ?? "AU"}
          </p>
        ) : null}
      </header>

      {state.status === "loading" ? (
        <p className="text-sm text-ink-500">Finding the best fits…</p>
      ) : null}

      {state.status === "error" ? (
        <p className="text-sm text-rose-600">
          Couldn't load recommendations: {state.message}
        </p>
      ) : null}

      {state.status === "ready" && state.data.length === 0 ? (
        <p className="text-sm text-ink-500">
          No upcoming events matched your filters. Try broadening the region or
          budget.
        </p>
      ) : null}

      {state.status === "ready" && state.data.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {state.data.map((c) => (
            <li
              key={c.slug}
              className="rounded-lg border border-ink-100 bg-canvas-50 p-4 transition hover:border-brand-300 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-ink-800 hover:text-brand-700"
                  >
                    {c.name}
                    <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
                  </a>
                  <p className="mt-1 flex items-center gap-3 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" aria-hidden="true" />
                      {formatDate(c.date)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {c.city}, {c.country}
                    </span>
                  </p>
                </div>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-600">
                  {COST_LABEL[c.cost]}
                </span>
              </div>
              {c.notes ? (
                <p className="mt-2 text-xs text-ink-600">{c.notes}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1">
                {c.sectors.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className="rounded bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700"
                  >
                    {s}
                  </span>
                ))}
                {c.pitchCompetition ? (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                    Pitch comp
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
