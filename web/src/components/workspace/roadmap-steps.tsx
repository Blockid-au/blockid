"use client";

import * as React from "react";
import {
  CheckCircle2, Globe, FileText, PieChart, GitBranch, BarChart3,
  CreditCard, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoadmapStep {
  id: number;
  icon: React.ElementType;
  title: string;
  titleVi: string;
  desc: string;
  descVi: string;
  time: string;
  sviImpact: number;
  done: boolean;
  href?: string;
}

const STEPS: Omit<RoadmapStep, "done">[] = [
  { id: 1, icon: TrendingUp, title: "Get SVI Baseline", titleVi: "Đánh giá SVI ban đầu", desc: "Submit your idea and get your first score.", descVi: "Nộp ý tưởng và nhận điểm SVI đầu tiên.", time: "2 min", sviImpact: 0, href: "/" },
  { id: 2, icon: Globe, title: "Add Website URL", titleVi: "Thêm URL website", desc: "A public website proves market presence.", descVi: "Website công khai chứng minh sự hiện diện thị trường.", time: "5 min", sviImpact: 8, href: "/workspace/evidence" },
  { id: 3, icon: FileText, title: "Upload Pitch Deck", titleVi: "Tải lên Pitch Deck", desc: "Upload your pitch deck to the Evidence Vault.", descVi: "Tải pitch deck vào Evidence Vault.", time: "10 min", sviImpact: 15, href: "/workspace/evidence" },
  { id: 4, icon: PieChart, title: "Build Cap Table", titleVi: "Xây dựng Cap Table", desc: "Document equity split, vesting, and ESOP.", descVi: "Ghi lại phân bổ cổ phần, vesting và ESOP.", time: "20 min", sviImpact: 12, href: "/workspace/evidence" },
  { id: 5, icon: GitBranch, title: "Connect GitHub", titleVi: "Kết nối GitHub", desc: "Link your source code to verify product depth.", descVi: "Liên kết mã nguồn để xác minh độ sâu sản phẩm.", time: "5 min", sviImpact: 10, href: "/workspace/evidence" },
  { id: 6, icon: BarChart3, title: "Connect Analytics", titleVi: "Kết nối Analytics", desc: "Google Analytics shows real user traction.", descVi: "Google Analytics cho thấy traction người dùng thực.", time: "5 min", sviImpact: 8, href: "/workspace/evidence" },
  { id: 7, icon: CreditCard, title: "Add Revenue Proof", titleVi: "Thêm bằng chứng doanh thu", desc: "Connect Stripe or upload an invoice.", descVi: "Kết nối Stripe hoặc tải lên hóa đơn.", time: "10 min", sviImpact: 18, href: "/workspace/evidence" },
];

export function RoadmapSteps({ completedSteps = [1] }: { completedSteps?: number[] }) {
  const steps: RoadmapStep[] = STEPS.map(s => ({ ...s, done: completedSteps.includes(s.id) }));
  const totalPotential = steps.filter(s => !s.done && s.sviImpact > 0).reduce((sum, s) => sum + s.sviImpact, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium">
          Lộ trình phát triển / Growth Roadmap
        </p>
        <span className="text-xs text-teal-400 font-mono font-medium">+{totalPotential} SVI potential</span>
      </div>

      {steps.map((step) => {
        const Icon = step.icon;
        return (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-4 rounded-xl border px-4 py-3 transition-all",
              step.done
                ? "border-emerald-200 bg-emerald-50"
                : "border-surface-200 bg-white hover:border-brand-200",
            )}
          >
            {/* Status icon */}
            <div className={cn(
              "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
              step.done ? "bg-emerald-100" : "bg-surface-200",
            )}>
              {step.done
                ? <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-500" />
                : <Icon strokeWidth={1.75} className="h-4 w-4 text-ink-600" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={cn("text-sm font-medium", step.done ? "text-emerald-600 line-through opacity-70" : "text-ink-800")}>
                    {step.title}
                  </p>
                  <p className="text-xs text-ink-700 mt-0.5">{step.descVi}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {step.sviImpact > 0 && !step.done && (
                    <span className="text-[10px] font-mono font-semibold text-teal-400">+{step.sviImpact} SVI</span>
                  )}
                  <span className="text-[10px] text-ink-700">{step.time}</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            {!step.done && step.href && (
              <a
                href={step.href}
                className="shrink-0 h-7 px-3 rounded-lg bg-brand-50 border border-brand-200 text-xs font-medium text-brand-600 hover:bg-brand-100 transition-colors flex items-center mt-0.5"
              >
                Làm ngay
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
