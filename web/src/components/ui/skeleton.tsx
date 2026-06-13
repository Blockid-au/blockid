/**
 * Lightweight skeleton primitives for route-level loading.tsx boundaries.
 * Uses adaptive surface tokens so they render correctly in light and dark mode.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-200 ${className}`} aria-hidden />;
}

function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-surface-200 bg-surface-50 p-6 shadow-sm ${className}`}>
      <Skeleton className="h-3 w-32" />
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2.5 w-28" />
          </div>
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
      <CardSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <CardSkeleton />
    </div>
  );
}
