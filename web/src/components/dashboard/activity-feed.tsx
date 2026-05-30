"use client";

import { FileText, PieChart, TrendingUp, Users, Shield, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ActivityItem {
  id: string;
  icon: LucideIcon;
  text: string;
  time: string;
}

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

// Helper to build activity items from database records
export function buildActivityItems(actions: { action_type: string; description: string; created_at: string }[]): ActivityItem[] {
  const ICON_MAP: Record<string, LucideIcon> = {
    svi_analysis: TrendingUp,
    evidence_added: FileText,
    cap_table_updated: PieChart,
    shareholder_added: Users,
    report_generated: BarChart3,
    equity_setup: Shield,
  };

  return actions.map((a, i) => ({
    id: String(i),
    icon: ICON_MAP[a.action_type] ?? FileText,
    text: a.description || a.action_type.replace(/_/g, " "),
    time: formatRelativeTime(a.created_at),
  }));
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
