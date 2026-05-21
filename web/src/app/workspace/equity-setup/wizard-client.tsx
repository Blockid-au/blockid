"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Coins,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EquityPie, type PieSlice } from "@/components/workspace/equity-pie";
import { CreditGate } from "@/components/ui/credit-gate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type StakeholderRole = "founder" | "cofounder" | "advisor" | "employee";
type VestingType = "linear" | "front-weighted" | "back-weighted";
type AccelerationType = "none" | "single-trigger" | "double-trigger";
type ShareMode = "fixed" | "dynamic";

interface Stakeholder {
  id: string;
  name: string;
  role: StakeholderRole;
  email: string;
  equityPct: number;
  vestingCliff: number;    // months
  vestingTotal: number;    // months
  vestingType: VestingType;
  acceleration: AccelerationType;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_TITLES: Record<WizardStep, string> = {
  1: "You're the founder",
  2: "Add your team",
  3: "Set vesting",
  4: "ESOP pool",
  5: "Share structure",
  6: "Review & save",
};

const STEP_DESCRIPTIONS: Record<WizardStep, string> = {
  1: "Start with your founding equity position",
  2: "Add co-founders, advisors, and key employees",
  3: "Configure vesting schedules for each stakeholder",
  4: "Reserve shares for future hires",
  5: "Choose how your shares are valued",
  6: "Review everything before creating your cap table",
};

const ROLE_LABELS: Record<StakeholderRole, string> = {
  founder: "Founder",
  cofounder: "Co-Founder",
  advisor: "Advisor",
  employee: "Employee",
};

const ROLE_COLORS: Record<StakeholderRole, string> = {
  founder: "bg-brand-100 text-brand-700",
  cofounder: "bg-violet-100 text-violet-700",
  advisor: "bg-amber-100 text-amber-700",
  employee: "bg-emerald-100 text-emerald-700",
};

const VESTING_LABELS: Record<VestingType, string> = {
  linear: "Linear",
  "front-weighted": "Front-weighted",
  "back-weighted": "Back-weighted",
};

const ACCELERATION_LABELS: Record<AccelerationType, string> = {
  none: "None",
  "single-trigger": "Single trigger",
  "double-trigger": "Double trigger",
};

const INPUT_CLS =
  "w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors";

// ---------------------------------------------------------------------------
// Utility: generate stable IDs
// ---------------------------------------------------------------------------

let _idCounter = 0;
function nextId(): string {
  return `stk_${Date.now()}_${++_idCounter}`;
}

// ---------------------------------------------------------------------------
// Analytics helper (fire-and-forget)
// ---------------------------------------------------------------------------

function trackEvent(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && "gtag" in window) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        event,
        props,
      );
    }
  } catch {
    // silently ignore
  }
}

// ---------------------------------------------------------------------------
// Main Wizard Component
// ---------------------------------------------------------------------------

interface EquityWizardProps {
  email: string;
  userName: string;
  projectId: string;
  projectName: string;
}

export function EquityWizard({
  email,
  userName,
  projectId,
  projectName,
}: EquityWizardProps) {
  const router = useRouter();

  // ---- Wizard state ----
  const [step, setStep] = React.useState<WizardStep>(1);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // ---- Step 1: Founder setup ----
  const [companyName, setCompanyName] = React.useState(projectName);
  const [authorizedShares, setAuthorizedShares] = React.useState(10_000_000);

  // ---- Step 2-3: Stakeholders ----
  const [stakeholders, setStakeholders] = React.useState<Stakeholder[]>([
    {
      id: nextId(),
      name: userName || "",
      role: "founder",
      email,
      equityPct: 100,
      vestingCliff: 12,
      vestingTotal: 48,
      vestingType: "linear",
      acceleration: "none",
    },
  ]);

  // ---- Step 4: ESOP ----
  const [esopPool, setEsopPool] = React.useState(10);

  // ---- Step 5: Share structure ----
  const [shareMode, setShareMode] = React.useState<ShareMode>("fixed");
  const [pricePerShare, setPricePerShare] = React.useState(0.001);

  // ---- Credit gate ----
  const [creditGateOpen, setCreditGateOpen] = React.useState(false);
  const [creditGateFeature, setCreditGateFeature] = React.useState("");
  const [creditGateCost, setCreditGateCost] = React.useState(0);
  const [creditBalance, setCreditBalance] = React.useState(0);
  const [aiLoading, setAiLoading] = React.useState<string | null>(null);

  // Track step visit
  React.useEffect(() => {
    trackEvent("equity_wizard_started", { step });
  }, [step]);

  // ---- Computed values ----
  const totalAllocated = stakeholders.reduce((s, h) => s + h.equityPct, 0);
  const unallocated = 100 - totalAllocated;

  // After ESOP dilution
  const esopDilutionFactor = (100 - esopPool) / 100;
  const stakeholdersPostEsop = stakeholders.map((s) => ({
    ...s,
    dilutedPct: s.equityPct * esopDilutionFactor,
  }));

  // Pie slices for chart
  const pieSlices: PieSlice[] = stakeholders.map((s) => ({
    label: s.name || ROLE_LABELS[s.role],
    value: s.equityPct,
  }));

  const pieSlicesWithEsop: PieSlice[] = [
    ...stakeholdersPostEsop.map((s) => ({
      label: s.name || ROLE_LABELS[s.role],
      value: Number(s.dilutedPct.toFixed(2)),
    })),
    { label: "ESOP Pool", value: esopPool, color: "#94a3b8" },
  ];

  // ---- Stakeholder CRUD ----
  const addStakeholder = (role: StakeholderRole) => {
    const defaults: Record<StakeholderRole, Partial<Stakeholder>> = {
      founder: { vestingCliff: 12, vestingTotal: 48, equityPct: 0 },
      cofounder: { vestingCliff: 12, vestingTotal: 48, equityPct: 0 },
      advisor: { vestingCliff: 6, vestingTotal: 24, equityPct: 0 },
      employee: { vestingCliff: 12, vestingTotal: 48, equityPct: 0 },
    };
    setStakeholders((prev) => [
      ...prev,
      {
        id: nextId(),
        name: "",
        role,
        email: "",
        equityPct: defaults[role].equityPct ?? 0,
        vestingCliff: defaults[role].vestingCliff ?? 12,
        vestingTotal: defaults[role].vestingTotal ?? 48,
        vestingType: "linear",
        acceleration: "none",
      },
    ]);
  };

  const updateStakeholder = (
    id: string,
    updates: Partial<Stakeholder>,
  ) => {
    setStakeholders((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const removeStakeholder = (id: string) => {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));
  };

  // ---- AI Suggest handler ----
  const handleAiSuggest = async (
    type: string,
    cost: number,
    _feature: string,
  ) => {
    setAiLoading(type);
    trackEvent("equity_wizard_ai_suggest", { type, credits: cost });

    try {
      // Check credit balance first
      const balRes = await fetch("/api/credits/balance");
      const balData = await balRes.json();
      const balance = balData.balance ?? 0;
      setCreditBalance(balance);

      if (balance < cost) {
        setCreditGateFeature(type);
        setCreditGateCost(cost);
        setCreditGateOpen(true);
        return;
      }

      // AI suggest endpoint would be called here in production
      // For now, apply sensible defaults based on the type
      if (type === "equity_split") {
        // Apply Slicing Pie style defaults
        const founderCount = stakeholders.filter(
          (s) => s.role === "founder" || s.role === "cofounder",
        ).length;
        const advisorCount = stakeholders.filter(
          (s) => s.role === "advisor",
        ).length;
        const employeeCount = stakeholders.filter(
          (s) => s.role === "employee",
        ).length;

        const totalAdvisors = advisorCount * 2; // 2% each typical
        const totalEmployees = employeeCount * 1; // 1% each typical
        const founderPool = 100 - totalAdvisors - totalEmployees;
        const perFounder =
          founderCount > 0 ? founderPool / founderCount : 100;

        setStakeholders((prev) =>
          prev.map((s) => {
            if (s.role === "founder" || s.role === "cofounder") {
              return { ...s, equityPct: Number(perFounder.toFixed(2)) };
            }
            if (s.role === "advisor") return { ...s, equityPct: 2 };
            if (s.role === "employee") return { ...s, equityPct: 1 };
            return s;
          }),
        );
      } else if (type === "esop_pool") {
        // Suggest based on stage
        setEsopPool(10);
      } else if (type === "share_structure") {
        setShareMode("fixed");
        setPricePerShare(0.001);
      }
    } catch {
      // silently ignore
    } finally {
      setAiLoading(null);
    }
  };

  // ---- Navigation validation ----
  const canProceed = React.useMemo(() => {
    switch (step) {
      case 1:
        return (
          companyName.trim().length > 0 &&
          stakeholders[0]?.name.trim().length > 0 &&
          authorizedShares > 0
        );
      case 2: {
        const allNamed = stakeholders.every((s) => s.name.trim().length > 0);
        const totalPct = stakeholders.reduce((s, h) => s + h.equityPct, 0);
        return allNamed && totalPct > 0 && totalPct <= 100;
      }
      case 3:
        return stakeholders.every(
          (s) => s.vestingTotal > 0 && s.vestingCliff >= 0,
        );
      case 4:
        return esopPool >= 0 && esopPool <= 50;
      case 5:
        return shareMode === "dynamic" || pricePerShare > 0;
      case 6:
        return true;
      default:
        return false;
    }
  }, [
    step,
    companyName,
    stakeholders,
    authorizedShares,
    esopPool,
    shareMode,
    pricePerShare,
  ]);

  const goNext = () => {
    if (step < 6 && canProceed) setStep((s) => (s + 1) as WizardStep);
  };
  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  };

  // ---- Save cap table ----
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      // 1. Create share class (Ordinary)
      const classRes = await fetch("/api/cap-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_class",
          data: {
            name: "Ordinary",
            classType: "ordinary",
            totalAuthorized: authorizedShares,
            pricePerShare:
              shareMode === "fixed" ? pricePerShare : 0.001,
            votingRights: true,
          },
        }),
      });
      const classData = await classRes.json();
      if (!classData.ok) {
        throw new Error(classData.error || "Failed to create share class");
      }
      const shareClassId = classData.shareClass?.id;

      // 2. Add each stakeholder
      for (const s of stakeholders) {
        const sharesHeld = Math.round(
          (s.equityPct * esopDilutionFactor / 100) * authorizedShares,
        );

        const shRes = await fetch("/api/cap-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_shareholder",
            data: {
              name: s.name,
              email: s.email || null,
              role: s.role === "cofounder" ? "co-founder" : s.role,
              shareClassId,
              sharesHeld,
              vestingMonths: s.vestingTotal,
              cliffMonths: s.vestingCliff,
              vestingStart: new Date().toISOString().split("T")[0],
              notes: `Added via Equity Setup Wizard. Vesting: ${VESTING_LABELS[s.vestingType]}, Acceleration: ${ACCELERATION_LABELS[s.acceleration]}`,
            },
          }),
        });
        const shData = await shRes.json();
        if (!shData.ok) {
          throw new Error(
            shData.error || `Failed to add shareholder: ${s.name}`,
          );
        }
      }

      // 3. Setup ESOP pool
      if (esopPool > 0) {
        const esopShares = Math.round(
          (esopPool / 100) * authorizedShares,
        );
        const esopRes = await fetch("/api/cap-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "setup_esop",
            data: {
              totalPoolShares: esopShares,
              poolPct: esopPool,
            },
          }),
        });
        const esopData = await esopRes.json();
        if (!esopData.ok) {
          throw new Error(esopData.error || "Failed to setup ESOP");
        }
      }

      trackEvent("equity_wizard_completed", {
        founders: stakeholders.length,
        esop: esopPool,
      });

      // Redirect to cap table
      router.push("/workspace/cap-table");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- Render ----
  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3, 4, 5, 6] as WizardStep[]).map((s) => (
          <div
            key={s}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors duration-300",
              s < step
                ? "bg-brand-600"
                : s === step
                  ? "bg-brand-500"
                  : "bg-surface-200",
            )}
          />
        ))}
      </div>

      {/* Step indicator */}
      <div className="mb-6">
        <div className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">
          Step {step} of 6
        </div>
        <h2 className="text-xl font-bold text-ink-800">
          {STEP_TITLES[step]}
        </h2>
        <p className="text-sm text-ink-500 mt-0.5">
          {STEP_DESCRIPTIONS[step]}
        </p>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        {step === 1 && (
          <Step1Founder
            companyName={companyName}
            setCompanyName={setCompanyName}
            authorizedShares={authorizedShares}
            setAuthorizedShares={setAuthorizedShares}
            founder={stakeholders[0]}
            onUpdateFounder={(updates) =>
              updateStakeholder(stakeholders[0].id, updates)
            }
          />
        )}
        {step === 2 && (
          <Step2Stakeholders
            stakeholders={stakeholders}
            totalAllocated={totalAllocated}
            unallocated={unallocated}
            onAdd={addStakeholder}
            onUpdate={updateStakeholder}
            onRemove={removeStakeholder}
            onAiSuggest={() =>
              handleAiSuggest("equity_split", 1.0, "AI Equity Split")
            }
            aiLoading={aiLoading === "equity_split"}
            pieSlices={pieSlices}
          />
        )}
        {step === 3 && (
          <Step3Vesting
            stakeholders={stakeholders}
            onUpdate={updateStakeholder}
            onAiSuggest={(id: string) =>
              handleAiSuggest(`vesting_${id}`, 0.5, "AI Vesting")
            }
            aiLoading={aiLoading}
          />
        )}
        {step === 4 && (
          <Step4ESOP
            esopPool={esopPool}
            setEsopPool={setEsopPool}
            stakeholders={stakeholders}
            esopDilutionFactor={esopDilutionFactor}
            onAiSuggest={() =>
              handleAiSuggest("esop_pool", 0.5, "AI ESOP")
            }
            aiLoading={aiLoading === "esop_pool"}
          />
        )}
        {step === 5 && (
          <Step5ShareStructure
            shareMode={shareMode}
            setShareMode={setShareMode}
            pricePerShare={pricePerShare}
            setPricePerShare={setPricePerShare}
            authorizedShares={authorizedShares}
            onAiSuggest={() =>
              handleAiSuggest("share_structure", 0.75, "AI Share Structure")
            }
            aiLoading={aiLoading === "share_structure"}
          />
        )}
        {step === 6 && (
          <Step6Review
            companyName={companyName}
            authorizedShares={authorizedShares}
            stakeholders={stakeholdersPostEsop}
            esopPool={esopPool}
            shareMode={shareMode}
            pricePerShare={pricePerShare}
            pieSlices={pieSlicesWithEsop}
            saving={saving}
            saveError={saveError}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        {step > 1 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={goBack}
            disabled={saving}
          >
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
            Back
          </Button>
        ) : (
          <div />
        )}

        {step < 6 ? (
          <Button
            variant="primary"
            size="sm"
            onClick={goNext}
            disabled={!canProceed}
          >
            Next
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2
                  strokeWidth={1.75}
                  className="h-4 w-4 animate-spin"
                />
                Saving...
              </>
            ) : (
              <>
                <Check strokeWidth={1.75} className="h-4 w-4" />
                Save &amp; Create Cap Table
              </>
            )}
          </Button>
        )}
      </div>

      {/* Credit gate modal */}
      <CreditGate
        isOpen={creditGateOpen}
        onClose={() => setCreditGateOpen(false)}
        feature={creditGateFeature}
        cost={creditGateCost}
        balance={creditBalance}
      />
    </div>
  );
}

// ===========================================================================
// Step 1: Founder Setup
// ===========================================================================

function Step1Founder({
  companyName,
  setCompanyName,
  authorizedShares,
  setAuthorizedShares,
  founder,
  onUpdateFounder,
}: {
  companyName: string;
  setCompanyName: (v: string) => void;
  authorizedShares: number;
  setAuthorizedShares: (v: number) => void;
  founder: Stakeholder;
  onUpdateFounder: (updates: Partial<Stakeholder>) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Hero message */}
      <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
          <User strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
        </div>
        <p className="text-sm font-medium text-brand-700">
          You currently own <span className="text-lg font-bold">100%</span> of
          your startup
        </p>
        <p className="text-xs text-brand-500 mt-1">
          We will guide you through structuring your equity step by step
        </p>
      </div>

      {/* Pie chart - 100% */}
      <div className="flex justify-center">
        <EquityPie
          slices={[
            {
              label: founder.name || "You",
              value: 100,
            },
          ]}
          showUnallocated={false}
          size={160}
        />
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <Label className="mb-1.5">
            Your name <span className="text-rose-500">*</span>
          </Label>
          <Input
            value={founder.name}
            onChange={(e) => onUpdateFounder({ name: e.target.value })}
            placeholder="e.g. Alice Chen"
          />
        </div>
        <div>
          <Label className="mb-1.5">
            Your role
          </Label>
          <Input
            value="Founder & CEO"
            readOnly
            className="bg-surface-50 cursor-not-allowed"
          />
        </div>
        <div>
          <Label className="mb-1.5">
            Company name <span className="text-rose-500">*</span>
          </Label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Pty Ltd"
          />
        </div>
        <div>
          <Label className="mb-1.5">
            Authorized shares <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="number"
            min={1000}
            step={1000}
            value={authorizedShares}
            onChange={(e) =>
              setAuthorizedShares(parseInt(e.target.value) || 10_000_000)
            }
            className="font-mono"
          />
          <p className="text-xs text-ink-400 mt-1">
            Default: 10,000,000 shares. Standard for AU startups.
          </p>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Step 2: Add Stakeholders
// ===========================================================================

function Step2Stakeholders({
  stakeholders,
  totalAllocated,
  unallocated,
  onAdd,
  onUpdate,
  onRemove,
  onAiSuggest,
  aiLoading,
  pieSlices,
}: {
  stakeholders: Stakeholder[];
  totalAllocated: number;
  unallocated: number;
  onAdd: (role: StakeholderRole) => void;
  onUpdate: (id: string, updates: Partial<Stakeholder>) => void;
  onRemove: (id: string) => void;
  onAiSuggest: () => void;
  aiLoading: boolean;
  pieSlices: PieSlice[];
}) {
  const [addMenuOpen, setAddMenuOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Live pie chart */}
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="shrink-0">
          <EquityPie slices={pieSlices} size={180} />
        </div>
        <div className="flex-1 space-y-2 text-sm w-full">
          <div className="flex items-center justify-between rounded-lg bg-surface-50 px-3 py-2">
            <span className="text-ink-500">Total allocated</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                totalAllocated > 100 ? "text-rose-600" : "text-ink-800",
              )}
            >
              {totalAllocated.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-50 px-3 py-2">
            <span className="text-ink-500">Unallocated</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                unallocated < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              {unallocated.toFixed(1)}%
            </span>
          </div>
          {totalAllocated > 100 && (
            <p className="text-xs text-rose-600 font-medium px-1">
              Total exceeds 100%. Please adjust before proceeding.
            </p>
          )}
        </div>
      </div>

      {/* Stakeholder list */}
      <div className="space-y-3">
        {stakeholders.map((s, idx) => (
          <div
            key={s.id}
            className="rounded-xl border border-surface-200 bg-surface-50/50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink-500 mb-1">
                    Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) =>
                      onUpdate(s.id, { name: e.target.value })
                    }
                    placeholder="Full name"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-500 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={s.email}
                    onChange={(e) =>
                      onUpdate(s.id, { email: e.target.value })
                    }
                    placeholder="email@example.com"
                    className={INPUT_CLS}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-ink-500 mb-1">
                      Equity %{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={s.equityPct}
                        onChange={(e) =>
                          onUpdate(s.id, {
                            equityPct:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        className={cn(INPUT_CLS, "pr-7 font-mono")}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="pt-5">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap",
                        ROLE_COLORS[s.role],
                      )}
                    >
                      {ROLE_LABELS[s.role]}
                    </span>
                  </div>
                </div>
              </div>
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  className="mt-5 h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                  title="Remove"
                >
                  <Trash2 strokeWidth={1.75} className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-surface-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30 transition-all cursor-pointer"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Add stakeholder
            <ChevronDown
              strokeWidth={1.75}
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                addMenuOpen && "rotate-180",
              )}
            />
          </button>
          {addMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 rounded-xl border border-surface-200 bg-white shadow-lg z-10 py-1">
              {(
                [
                  "cofounder",
                  "advisor",
                  "employee",
                ] as StakeholderRole[]
              ).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    onAdd(role);
                    setAddMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  <UserPlus
                    strokeWidth={1.75}
                    className="h-3.5 w-3.5 text-ink-400"
                  />
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Suggest button */}
        <button
          type="button"
          onClick={onAiSuggest}
          disabled={aiLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-50"
        >
          {aiLoading ? (
            <Loader2
              strokeWidth={1.75}
              className="h-4 w-4 animate-spin"
            />
          ) : (
            <Sparkles strokeWidth={1.75} className="h-4 w-4" />
          )}
          AI Suggest Split
          <span className="text-[10px] text-brand-500 ml-1">
            <Coins strokeWidth={1.75} className="h-3 w-3 inline -mt-0.5" />{" "}
            1.00
          </span>
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Step 3: Vesting Terms
// ===========================================================================

function Step3Vesting({
  stakeholders,
  onUpdate,
  onAiSuggest,
  aiLoading,
}: {
  stakeholders: Stakeholder[];
  onUpdate: (id: string, updates: Partial<Stakeholder>) => void;
  onAiSuggest: (id: string) => void;
  aiLoading: string | null;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-500">
        Set vesting schedules for each stakeholder. Standard startup vesting
        is 4 years with a 12-month cliff.
      </p>

      {stakeholders.map((s) => (
        <div
          key={s.id}
          className="rounded-xl border border-surface-200 p-4 space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-ink-800">
                {s.name || "Unnamed"}
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                  ROLE_COLORS[s.role],
                )}
              >
                {ROLE_LABELS[s.role]}
              </span>
              <span className="text-xs text-ink-400 tabular-nums">
                {s.equityPct}%
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAiSuggest(s.id)}
              disabled={aiLoading === `vesting_${s.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              {aiLoading === `vesting_${s.id}` ? (
                <Loader2
                  strokeWidth={1.75}
                  className="h-3 w-3 animate-spin"
                />
              ) : (
                <Sparkles strokeWidth={1.75} className="h-3 w-3" />
              )}
              AI Suggest
              <span className="text-[9px] text-brand-500">
                <Coins
                  strokeWidth={1.75}
                  className="h-2.5 w-2.5 inline -mt-0.5"
                />{" "}
                0.50
              </span>
            </button>
          </div>

          {/* Vesting fields */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">
                Cliff (months)
              </label>
              <input
                type="number"
                min={0}
                max={48}
                value={s.vestingCliff}
                onChange={(e) =>
                  onUpdate(s.id, {
                    vestingCliff: parseInt(e.target.value) || 0,
                  })
                }
                className={cn(INPUT_CLS, "font-mono")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">
                Total (months)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={s.vestingTotal}
                onChange={(e) =>
                  onUpdate(s.id, {
                    vestingTotal: parseInt(e.target.value) || 48,
                  })
                }
                className={cn(INPUT_CLS, "font-mono")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">
                Type
              </label>
              <select
                value={s.vestingType}
                onChange={(e) =>
                  onUpdate(s.id, {
                    vestingType: e.target.value as VestingType,
                  })
                }
                className={INPUT_CLS}
              >
                {(
                  Object.entries(VESTING_LABELS) as [
                    VestingType,
                    string,
                  ][]
                ).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">
                Acceleration
              </label>
              <select
                value={s.acceleration}
                onChange={(e) =>
                  onUpdate(s.id, {
                    acceleration: e.target.value as AccelerationType,
                  })
                }
                className={INPUT_CLS}
              >
                {(
                  Object.entries(ACCELERATION_LABELS) as [
                    AccelerationType,
                    string,
                  ][]
                ).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Vesting preview bar */}
          <div className="space-y-1">
            <div className="relative h-2 bg-surface-100 rounded-full overflow-hidden">
              {s.vestingCliff > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-ink-300 z-10"
                  style={{
                    left: `${(s.vestingCliff / s.vestingTotal) * 100}%`,
                  }}
                />
              )}
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full bg-brand-400"
                style={{
                  width: `${(s.vestingCliff / s.vestingTotal) * 100}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-ink-400">
              <span>Month 0</span>
              {s.vestingCliff > 0 && (
                <span>
                  Cliff: {s.vestingCliff}m ({((s.vestingCliff / s.vestingTotal) * s.equityPct).toFixed(1)}%)
                </span>
              )}
              <span>
                {s.vestingTotal}m (fully vested)
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Step 4: ESOP Pool
// ===========================================================================

function Step4ESOP({
  esopPool,
  setEsopPool,
  stakeholders,
  esopDilutionFactor,
  onAiSuggest,
  aiLoading,
}: {
  esopPool: number;
  setEsopPool: (v: number) => void;
  stakeholders: Stakeholder[];
  esopDilutionFactor: number;
  onAiSuggest: () => void;
  aiLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">
        Reserve an ESOP pool for future hires. This dilutes all existing
        shareholders proportionally. Typical range: 10-15% for early-stage
        startups.
      </p>

      {/* Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>ESOP Pool Size</Label>
          <span className="text-lg font-bold text-brand-600 tabular-nums">
            {esopPool}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={esopPool}
          onChange={(e) => setEsopPool(parseInt(e.target.value))}
          className="w-full h-2 bg-surface-200 rounded-full appearance-none cursor-pointer accent-brand-600"
        />
        <div className="flex justify-between text-xs text-ink-400">
          <span>0%</span>
          <span>5%</span>
          <span>10%</span>
          <span>15%</span>
          <span>20%</span>
          <span>25%</span>
          <span>30%</span>
        </div>
      </div>

      {/* Dilution impact table */}
      <div className="rounded-xl border border-surface-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
          <h3 className="text-sm font-semibold text-ink-700">
            Dilution Impact
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Stakeholder
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Before ESOP
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  After ESOP
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => {
                const after = s.equityPct * esopDilutionFactor;
                const change = after - s.equityPct;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink-800">
                      {s.name || ROLE_LABELS[s.role]}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-600">
                      {s.equityPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink-800">
                      {after.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-600 text-xs">
                      {change.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
              {esopPool > 0 && (
                <tr className="bg-surface-50">
                  <td className="px-4 py-2.5 font-medium text-ink-600">
                    ESOP Pool
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-400">
                    --
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink-800">
                    {esopPool.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 text-xs">
                    +{esopPool.toFixed(2)}%
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Suggest */}
      <button
        type="button"
        onClick={onAiSuggest}
        disabled={aiLoading}
        className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-50"
      >
        {aiLoading ? (
          <Loader2
            strokeWidth={1.75}
            className="h-4 w-4 animate-spin"
          />
        ) : (
          <Sparkles strokeWidth={1.75} className="h-4 w-4" />
        )}
        AI Suggest Pool Size
        <span className="text-[10px] text-brand-500 ml-1">
          <Coins
            strokeWidth={1.75}
            className="h-3 w-3 inline -mt-0.5"
          />{" "}
          0.50
        </span>
      </button>
    </div>
  );
}

// ===========================================================================
// Step 5: Share Structure
// ===========================================================================

function Step5ShareStructure({
  shareMode,
  setShareMode,
  pricePerShare,
  setPricePerShare,
  authorizedShares,
  onAiSuggest,
  aiLoading,
}: {
  shareMode: ShareMode;
  setShareMode: (v: ShareMode) => void;
  pricePerShare: number;
  setPricePerShare: (v: number) => void;
  authorizedShares: number;
  onAiSuggest: () => void;
  aiLoading: boolean;
}) {
  const valuation =
    shareMode === "fixed"
      ? pricePerShare * authorizedShares
      : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">
        Choose how your share price is determined. Fixed mode lets you set
        the price manually; dynamic mode auto-updates based on your SVI
        score.
      </p>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setShareMode("fixed")}
          className={cn(
            "rounded-xl border-2 p-4 text-left transition-all cursor-pointer",
            shareMode === "fixed"
              ? "border-brand-500 bg-brand-50 shadow-sm"
              : "border-surface-200 bg-white hover:border-surface-300",
          )}
        >
          <div className="text-sm font-semibold text-ink-800">
            Fixed Shares
          </div>
          <p className="text-xs text-ink-500 mt-1">
            Set price per share manually. Good for early stage when valuation
            is unknown.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setShareMode("dynamic")}
          className={cn(
            "rounded-xl border-2 p-4 text-left transition-all cursor-pointer",
            shareMode === "dynamic"
              ? "border-brand-500 bg-brand-50 shadow-sm"
              : "border-surface-200 bg-white hover:border-surface-300",
          )}
        >
          <div className="text-sm font-semibold text-ink-800">
            Dynamic (SVI-linked)
          </div>
          <p className="text-xs text-ink-500 mt-1">
            Share price auto-updates based on your SVI score. Ideal for
            ongoing valuation.
          </p>
        </button>
      </div>

      {/* Mode-specific config */}
      {shareMode === "fixed" && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 space-y-4">
          <div>
            <Label className="mb-1.5">
              Price per share (A$)
            </Label>
            <Input
              type="number"
              min={0.0001}
              step={0.0001}
              value={pricePerShare}
              onChange={(e) =>
                setPricePerShare(parseFloat(e.target.value) || 0.001)
              }
              className="font-mono"
            />
          </div>
          {valuation != null && (
            <div className="flex items-center justify-between rounded-lg bg-white border border-surface-200 px-4 py-3">
              <span className="text-sm text-ink-500">
                Implied valuation
              </span>
              <span className="text-lg font-bold text-ink-800 font-mono">
                A${valuation.toLocaleString("en-AU")}
              </span>
            </div>
          )}
        </div>
      )}

      {shareMode === "dynamic" && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 space-y-3">
          <p className="text-sm text-ink-600">
            When dynamic mode is enabled, your share price will be calculated
            using the formula:
          </p>
          <div className="rounded-lg bg-white border border-surface-200 px-4 py-3 text-center">
            <code className="text-sm text-brand-700 font-mono">
              share_price = SVI_valuation / authorized_shares
            </code>
          </div>
          <p className="text-xs text-ink-500">
            Your SVI score will be used to determine a market-comparable
            valuation. The share price updates automatically when your SVI
            changes by more than 5 points.
          </p>
        </div>
      )}

      {/* AI Suggest */}
      <button
        type="button"
        onClick={onAiSuggest}
        disabled={aiLoading}
        className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-50"
      >
        {aiLoading ? (
          <Loader2
            strokeWidth={1.75}
            className="h-4 w-4 animate-spin"
          />
        ) : (
          <Sparkles strokeWidth={1.75} className="h-4 w-4" />
        )}
        AI Suggest Structure
        <span className="text-[10px] text-brand-500 ml-1">
          <Coins
            strokeWidth={1.75}
            className="h-3 w-3 inline -mt-0.5"
          />{" "}
          0.75
        </span>
      </button>
    </div>
  );
}

// ===========================================================================
// Step 6: Review & Save
// ===========================================================================

function Step6Review({
  companyName,
  authorizedShares,
  stakeholders,
  esopPool,
  shareMode,
  pricePerShare,
  pieSlices,
  saving,
  saveError,
}: {
  companyName: string;
  authorizedShares: number;
  stakeholders: Array<Stakeholder & { dilutedPct: number }>;
  esopPool: number;
  shareMode: ShareMode;
  pricePerShare: number;
  pieSlices: PieSlice[];
  saving: boolean;
  saveError: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Company info */}
      <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-ink-500">Company</p>
            <p className="font-semibold text-ink-800">{companyName}</p>
          </div>
          <div>
            <p className="text-xs text-ink-500">Authorized Shares</p>
            <p className="font-semibold text-ink-800 font-mono">
              {authorizedShares.toLocaleString("en-AU")}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-500">Share Mode</p>
            <p className="font-semibold text-ink-800 capitalize">
              {shareMode}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-500">ESOP Pool</p>
            <p className="font-semibold text-ink-800">{esopPool}%</p>
          </div>
        </div>
      </div>

      {/* Final pie chart */}
      <div className="flex justify-center">
        <EquityPie
          slices={pieSlices}
          showUnallocated={false}
          size={200}
        />
      </div>

      {/* Summary table */}
      <div className="rounded-xl border border-surface-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
          <h3 className="text-sm font-semibold text-ink-700">
            Final Cap Table
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Stakeholder
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Equity %
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Shares
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Cliff
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-ink-500 uppercase tracking-wider">
                  Vesting
                </th>
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => {
                const shares = Math.round(
                  (s.dilutedPct / 100) * authorizedShares,
                );
                return (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink-800">
                        {s.name}
                      </div>
                      {s.email && (
                        <div className="text-xs text-ink-400">{s.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                          ROLE_COLORS[s.role],
                        )}
                      >
                        {ROLE_LABELS[s.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink-800">
                      {s.dilutedPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-600 font-mono">
                      {shares.toLocaleString("en-AU")}
                    </td>
                    <td className="px-4 py-2.5 text-center text-ink-600">
                      {s.vestingCliff}m
                    </td>
                    <td className="px-4 py-2.5 text-center text-ink-600">
                      {s.vestingTotal}m{" "}
                      <span className="text-ink-400 text-xs">
                        ({VESTING_LABELS[s.vestingType].toLowerCase()})
                      </span>
                    </td>
                  </tr>
                );
              })}
              {esopPool > 0 && (
                <tr className="bg-surface-50 border-t border-surface-200">
                  <td className="px-4 py-2.5 font-medium text-ink-600">
                    ESOP Pool
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-200 text-ink-600">
                      Reserved
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink-800">
                    {esopPool.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-600 font-mono">
                    {Math.round(
                      (esopPool / 100) * authorizedShares,
                    ).toLocaleString("en-AU")}
                  </td>
                  <td className="px-4 py-2.5 text-center text-ink-400">
                    --
                  </td>
                  <td className="px-4 py-2.5 text-center text-ink-400">
                    --
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Valuation summary */}
      {shareMode === "fixed" && pricePerShare > 0 && (
        <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 text-center">
          <p className="text-xs text-brand-500 uppercase tracking-wider font-medium">
            Implied Valuation
          </p>
          <p className="text-2xl font-bold text-brand-700 mt-1 font-mono">
            A$
            {(pricePerShare * authorizedShares).toLocaleString("en-AU")}
          </p>
          <p className="text-xs text-brand-500 mt-1">
            {authorizedShares.toLocaleString("en-AU")} shares @ A$
            {pricePerShare.toFixed(4)}/share
          </p>
        </div>
      )}

      {/* Error */}
      {saveError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {saveError}
        </div>
      )}

      {/* Blockchain CTA */}
      <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50/50 p-4 text-center">
        <p className="text-sm text-ink-500">
          Want to deploy your cap table to the blockchain?
        </p>
        <p className="text-xs text-ink-400 mt-1">
          After saving, you can tokenize your equity on-chain via the
          Equity Dashboard.
        </p>
      </div>
    </div>
  );
}
