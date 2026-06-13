import { DashboardSkeleton } from "@/components/ui/skeleton";

// Route-level loading boundary — instant skeleton while the SSR page streams.
export default function Loading() {
  return <DashboardSkeleton />;
}
