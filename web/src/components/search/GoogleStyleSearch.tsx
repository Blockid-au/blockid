"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

/**
 * Google-style hero search input with an animated conic-gradient ring.
 * The ring is a `::before` layer positioned behind the input, spun via
 * a CSS custom-property angle animation, and masked so it appears as a
 * 2px halo border. Focusing the input boosts glow and lifts the field.
 *
 * On submit, navigates to `/search?q=…` and fires `search_submit`
 * through window.gtag when GA is loaded.
 */
export function GoogleStyleSearch({
  placeholder = "Search startups, sectors, valuations…",
  autoFocus = false,
}: {
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const q = value.trim();
      if (!q) return;
      if (typeof window !== "undefined") {
        const gtag = (
          window as unknown as { gtag?: (...args: unknown[]) => void }
        ).gtag;
        if (typeof gtag === "function") {
          gtag("event", "search_submit", {
            query: q,
            length: q.length,
            source: "home_hero",
          });
        }
      }
      router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [router, value],
  );

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-[720px]"
    >
        <div
          data-focused={focused ? "true" : "false"}
          className="gss-ring group relative"
        >
          <label htmlFor="gss-input" className="sr-only">
            Search
          </label>
          <div className="relative flex min-h-12 items-center rounded-full border border-line bg-surface px-5 py-3.5 shadow-1">
            <Search
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-muted"
            />
            <input
              id="gss-input"
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              autoFocus={autoFocus}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              className="mx-3 min-w-0 flex-1 bg-transparent text-[15px] text-primary placeholder:text-muted focus:outline-none"
            />
            <span
              aria-hidden="true"
              className="hidden select-none rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted sm:inline-block"
            >
              Enter to search
            </span>
          </div>
        </div>
    </form>
  );
}

export default GoogleStyleSearch;
