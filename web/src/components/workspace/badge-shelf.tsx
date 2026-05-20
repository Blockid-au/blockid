"use client";

import * as React from "react";
import {
  Rocket,
  Search,
  Upload,
  FileText,
  FolderOpen,
  Target,
  Star,
  Trophy,
  Award,
  TrendingUp,
  Flame,
  ArrowUp,
  GitBranch,
  BarChart3,
  CreditCard,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon map for badge rendering
const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Search,
  Upload,
  FileText,
  FolderOpen,
  Target,
  Star,
  Trophy,
  Award,
  TrendingUp,
  Flame,
  ArrowUp,
  Github: GitBranch,
  BarChart3,
  CreditCard,
};

interface Badge {
  code: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  earned: boolean;
  earnedAt?: string;
}

interface BadgeShelfProps {
  email: string;
}

export function BadgeShelf({ email }: BadgeShelfProps) {
  const [badges, setBadges] = React.useState<Badge[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/badges?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setBadges(d.badges);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  if (loading)
    return <div className="animate-pulse h-20 bg-surface-100 rounded-2xl" />;

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-ink-800">Milestones</h3>
        <span className="text-xs text-ink-500">
          {earnedCount}/{badges.length} earned
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {badges.map((badge) => {
          const Icon = ICON_MAP[badge.icon] ?? Target;
          return (
            <div
              key={badge.code}
              title={`${badge.label}: ${badge.description}${
                badge.earned
                  ? ` (earned ${new Date(badge.earnedAt!).toLocaleDateString()})`
                  : " — not yet earned"
              }`}
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-xl border transition-all",
                badge.earned
                  ? "border-brand-200 bg-brand-50 text-brand-600 shadow-sm"
                  : "border-surface-200 bg-surface-50 text-ink-300",
              )}
            >
              <Icon className="h-5 w-5" />
              {!badge.earned && (
                <Lock className="absolute -bottom-1 -right-1 h-3 w-3 text-ink-300" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
