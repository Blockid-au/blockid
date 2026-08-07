import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

// Streaming SSR fallback for /svi. The SVIEntrance client component hydrates
// a search-param-prefilled textarea; the shell here keeps LCP visible while
// the JS chunk loads on cold hits from the homepage HeroSearch.
export default function Loading() {
  return (
    <div className="min-h-svh bg-surface-100 px-6 pt-28 pb-24">
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <SkeletonText lines={2} />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="flex gap-3">
          <Skeleton className="h-11 w-32 rounded-xl" />
          <Skeleton className="h-11 w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
