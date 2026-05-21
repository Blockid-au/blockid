"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";

interface CreditConfirmProps {
  action: string;          // "Standard Report"
  cost: number;            // 0.50
  balance: number;         // 47.50
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function CreditConfirm({ action, cost, balance, onConfirm, onCancel, isOpen }: CreditConfirmProps) {
  if (!isOpen) return null;
  const canAfford = balance >= cost;
  const remaining = balance - cost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
            <Coins className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <p className="font-semibold text-ink-800">{action}</p>
            <p className="text-xs text-ink-500">This action costs credits</p>
          </div>
        </div>

        <div className="rounded-xl bg-surface-50 p-4 space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-ink-500">Cost</span>
            <span className="font-semibold text-ink-800">{cost.toFixed(2)} credits</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-500">Your balance</span>
            <span className="font-semibold text-ink-800">{balance.toFixed(2)} credits</span>
          </div>
          <hr className="border-surface-200" />
          <div className="flex justify-between text-sm">
            <span className="text-ink-500">After this action</span>
            <span className={`font-semibold ${remaining < 2 ? "text-amber-600" : "text-ink-800"}`}>
              {remaining.toFixed(2)} credits
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>Cancel</Button>
          {canAfford ? (
            <Button variant="primary" size="sm" className="flex-1" onClick={onConfirm}>
              Confirm — {cost.toFixed(2)} cr
            </Button>
          ) : (
            <Button variant="primary" size="sm" className="flex-1" onClick={() => window.location.href = "/workspace/billing#credits"}>
              Buy Credits
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
