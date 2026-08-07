import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

// Streaming SSR fallback for /founding-50. The page awaits a Supabase count
// (getSpotsRemaining) + platform config on every request (force-dynamic), so
// first paint blocks on Supabase RTT — the skeleton keeps LCP visible while
// the counter/spots-remaining fetch resolves.
export default function Loading() {
  return (
    <main className="min-h-svh bg-surface-100 text-ink-800 pt-28 pb-24">
      <div className="max-w-4xl mx-auto px-6 space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-10 w-3/4 max-w-xl" />
          <SkeletonText lines={2} />
          <Skeleton className="h-16 w-64 rounded-2xl" />
        </div>
        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
