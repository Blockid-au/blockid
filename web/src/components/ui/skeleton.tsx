/**
 * Lightweight skeleton primitives for route-level loading.tsx boundaries.
 * Uses adaptive surface tokens so they render correctly in light and dark mode.
 */

const SHIMMER = "animate-pulse rounded-md bg-[var(--ds-border)]";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`${SHIMMER} ${className}`} aria-hidden />;
}

/** N text lines of varying width — realistic paragraph placeholder. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-11/12", "w-full", "w-10/12", "w-9/12", "w-8/12"];
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/** Rectangular avatar/thumbnail placeholder. */
export function SkeletonAvatar({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  return <div className={`${SHIMMER} rounded-full ${dim} ${className}`} aria-hidden />;
}

/** Metric-card placeholder: eyebrow label + big number + delta. */
export function SkeletonMetric({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-2.5 w-28" />
    </div>
  );
}

/** Card-shaped placeholder with configurable metric row count. */
export function SkeletonCard({
  rows = 3,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] p-6 shadow-sm ${className}`}
    >
      <Skeleton className="h-3 w-32" />
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonMetric key={i} />
        ))}
      </div>
    </div>
  );
}

/** Full-page dashboard placeholder shown while the server component streams. */
export function DashboardSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8"
      role="status"
      aria-label="Loading your dashboard"
    >
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <SkeletonCard />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
    </div>
  );
}
