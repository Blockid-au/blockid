"use client";

import { FileText, PieChart, TrendingUp } from "lucide-react";
import type { ActivityItem } from "./activity-feed-utils";

export { buildActivityItems } from "./activity-feed-utils";

interface ActivityFeedProps {
  items: ActivityItem[];
}

const EMPTY_ITEMS: ActivityItem[] = [
  { id: "1", icon: TrendingUp, text: "Get your first SVI score to start tracking", time: "Start now" },
  { id: "2", icon: FileText, text: "Upload evidence to strengthen your profile", time: "Next step" },
  { id: "3", icon: PieChart, text: "Set up your cap table", time: "Coming soon" },
];

export function ActivityFeed({ items }: ActivityFeedProps) {
  const displayItems = items.length > 0 ? items.slice(0, 5) : EMPTY_ITEMS;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <h3 className="text-sm font-bold text-ink-800 mb-1">Recent Activity</h3>
      <p className="text-xs text-ink-500 mb-4">Your latest actions</p>

      <div className="space-y-3">
        {displayItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="flex items-start gap-3">
              <div className="mt-0.5 h-7 w-7 rounded-lg bg-surface-100 flex items-center justify-center text-ink-500 shrink-0">
                <Icon strokeWidth={1.75} className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-700 leading-relaxed">{item.text}</p>
                <p className="text-[10px] text-ink-400 mt-0.5">{item.time}</p>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 5 && (
        <a href="/workspace/journal" className="mt-4 inline-flex items-center text-xs font-medium text-brand-600 hover:text-brand-700">
          View All Activity →
        </a>
      )}
    </div>
  );
}
