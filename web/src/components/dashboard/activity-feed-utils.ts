import { FileText, PieChart, TrendingUp, Users, Shield, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ActivityItem {
  id: string;
  icon: LucideIcon;
  text: string;
  time: string;
}

export function buildActivityItems(
  actions: { action_type: string; description: string; created_at: string }[],
): ActivityItem[] {
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

export function formatRelativeTime(iso: string): string {
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
