import { Skeleton, SkeletonText } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-md mx-auto p-8 space-y-6">
      <Skeleton className="h-10 w-2/3" />
      <SkeletonText lines={2} />
      <div className="space-y-4">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
