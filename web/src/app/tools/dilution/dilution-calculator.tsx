"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatAud, formatNumber, formatPercent } from "@/lib/utils";

interface Inputs {
  preMoney: number; // AUD
  raise: number; // AUD
  currentShares: number;
  esopTopUp: number; // %
}

interface Outputs {
  postMoney: number;
  newSharePrice: number;
  investorShares: number;
  esopShares: number;
  founderDilutionPct: number;
  founderPctBefore: number;
  founderPctAfter: number;
  investorPct: number;
  esopPct: number;
}

function compute(inp: Inputs): Outputs {
  const preMoney = Math.max(0, inp.preMoney);
  const raise = Math.max(0, inp.raise);
  const current = Math.max(1, inp.currentShares);
  const esopPct = Math.max(0, Math.min(50, inp.esopTopUp)) / 100;
  const postMoney = preMoney + raise;
  const sharePrice = preMoney / current;
  const investorShares = sharePrice > 0 ? raise / sharePrice : 0;

  // ESOP top-up sized so that the ESOP pool equals esopPct of the post-money,
  // pre-financing cap table — modelled as additional shares.
  // Solve: esopShares / (current + esopShares + investorShares) = esopPct
  // -> esopShares = esopPct * (current + investorShares) / (1 - esopPct)
  const esopShares =
    esopPct < 1
      ? (esopPct * (current + investorShares)) / (1 - esopPct)
      : 0;

  const totalShares = current + investorShares + esopShares;
  const founderPctBefore = 100;
  const founderPctAfter = (current / totalShares) * 100;
  const founderDilutionPct = founderPctBefore - founderPctAfter;
  const investorPct = (investorShares / totalShares) * 100;
  const esopPctOut = (esopShares / totalShares) * 100;

  return {
    postMoney,
    newSharePrice: sharePrice,
    investorShares,
    esopShares,
    founderDilutionPct,
    founderPctBefore,
    founderPctAfter,
    investorPct,
    esopPct: esopPctOut,
  };
}

const DEFAULTS: Inputs = {
  preMoney: 8_000_000,
  raise: 2_000_000,
  currentShares: 10_000_000,
  esopTopUp: 10,
};

export function DilutionCalculator() {
  const [inp, setInp] = React.useState<Inputs>(DEFAULTS);
  const [email, setEmail] = React.useState("");
  const [submitState, setSubmitState] = React.useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const out = compute(inp);

  const update = <K extends keyof Inputs>(key: K, value: Inputs[K]) =>
    setInp((p) => ({ ...p, [key]: value }));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || submitState === "submitting") return;
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "dilution-calc",
          email,
          payload: { ...inp, ...out },
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setSubmitState("ok");
    } catch {
      setSubmitState("err");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <section
        aria-labelledby="dilution-inputs"
        className="rounded-2xl border border-ink-700 bg-ink-900 p-6 md:p-8"
      >
        <h2
          id="dilution-inputs"
          className="text-lg font-semibold text-slate-50 flex items-center gap-2"
        >
          <Calculator strokeWidth={1.75} className="h-5 w-5 text-brand-400" />
          Inputs
        </h2>
        <div className="mt-6 grid sm:grid-cols-2 gap-5">
          <Field label="Pre-money valuation (AUD)" htmlFor="pre">
            <Input
              id="pre"
              type="number"
              min={0}
              step={100000}
              value={inp.preMoney}
              onChange={(e) => update("preMoney", Number(e.target.value) || 0)}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Raise amount (AUD)" htmlFor="raise">
            <Input
              id="raise"
              type="number"
              min={0}
              step={50000}
              value={inp.raise}
              onChange={(e) => update("raise", Number(e.target.value) || 0)}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Current shares on issue" htmlFor="shares">
            <Input
              id="shares"
              type="number"
              min={1}
              step={1000}
              value={inp.currentShares}
              onChange={(e) =>
                update("currentShares", Number(e.target.value) || 1)
              }
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="ESOP top-up (%)" htmlFor="esop">
            <Input
              id="esop"
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={inp.esopTopUp}
              onChange={(e) => update("esopTopUp", Number(e.target.value) || 0)}
              className="font-mono tabular-nums"
            />
          </Field>
        </div>
      </section>

      <section
        aria-labelledby="dilution-outputs"
        className="rounded-2xl border border-ink-700 bg-ink-900 p-6 md:p-8"
      >
        <h2
          id="dilution-outputs"
          className="text-lg font-semibold text-slate-50"
        >
          Outputs
        </h2>
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat label="Post-money valuation" value={formatAud(out.postMoney)} />
          <Stat
            label="New share price"
            value={
              out.newSharePrice > 0
                ? `$${out.newSharePrice.toFixed(4)}`
                : "—"
            }
          />
          <Stat
            label="Founder dilution"
            value={formatPercent(out.founderDilutionPct)}
            tone="amber"
          />
          <Stat
            label="Founder ownership after"
            value={formatPercent(out.founderPctAfter)}
            tone="brand"
          />
          <Stat
            label="Investor ownership"
            value={formatPercent(out.investorPct)}
          />
          <Stat
            label="ESOP pool (post)"
            value={formatPercent(out.esopPct)}
          />
        </dl>
        <Stack
          founderBefore={out.founderPctBefore}
          founderAfter={out.founderPctAfter}
          investor={out.investorPct}
          esop={out.esopPct}
        />
        <p className="mt-4 text-xs text-slate-500">
          New shares issued: founders{" "}
          <span className="font-mono tabular-nums text-slate-300">
            {formatNumber(inp.currentShares)}
          </span>{" "}
          · investors{" "}
          <span className="font-mono tabular-nums text-slate-300">
            {formatNumber(Math.round(out.investorShares))}
          </span>{" "}
          · ESOP{" "}
          <span className="font-mono tabular-nums text-slate-300">
            {formatNumber(Math.round(out.esopShares))}
          </span>
        </p>
      </section>

      <form
        onSubmit={onSubmit}
        className="lg:col-span-2 rounded-2xl border border-brand-500/30 bg-ink-900 p-6 md:p-8"
        noValidate
      >
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold-400 font-medium">
              Want the full picture?
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-50">
              Get your Investor-Ready Score with this dilution baked in
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              We&apos;ll send you a magic link to generate your verified score
              and a shareable link your investors can open.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Label htmlFor="dilution-email">Work email</Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="dilution-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="founder@yourstartup.com.au"
                className="flex-1"
                aria-invalid={submitState === "err"}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={submitState === "submitting"}
              >
                {submitState === "ok"
                  ? "Sent"
                  : submitState === "submitting"
                    ? "Sending…"
                    : "Get my Score"}
                {submitState === "ok" ? (
                  <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
                ) : (
                  <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                )}
              </Button>
            </div>
            {submitState === "err" && (
              <p
                role="alert"
                aria-live="assertive"
                className="text-sm text-amber-300"
              >
                Couldn&apos;t send right now. Try again.
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "brand" | "amber";
}) {
  const colour =
    tone === "brand"
      ? "text-brand-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-slate-50";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono tabular-nums text-xl font-semibold ${colour}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Stack({
  founderBefore,
  founderAfter,
  investor,
  esop,
}: {
  founderBefore: number;
  founderAfter: number;
  investor: number;
  esop: number;
}) {
  const before = [{ value: founderBefore, fill: "#3B7DD8", label: "Founders" }];
  const after = [
    { value: founderAfter, fill: "#3B7DD8", label: "Founders" },
    { value: investor, fill: "#5B9AEB", label: "Investors" },
    { value: esop, fill: "#F59E0B", label: "ESOP" },
  ];
  return (
    <div className="mt-8">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
        Cap table — before vs. after
      </p>
      <svg
        viewBox="0 0 400 90"
        className="mt-3 w-full h-[90px]"
        role="img"
        aria-label={`Stacked bar comparing cap table before and after the round. Founders ${founderAfter.toFixed(1)} percent, investors ${investor.toFixed(1)} percent, ESOP ${esop.toFixed(1)} percent.`}
      >
        <BarRow y={10} segments={before} label="Before" />
        <BarRow y={50} segments={after} label="After" />
      </svg>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
        {after.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.fill }}
              aria-hidden
            />
            <span>
              {s.label}{" "}
              <span className="font-mono tabular-nums text-slate-200">
                {s.value.toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarRow({
  y,
  segments,
  label,
}: {
  y: number;
  segments: { value: number; fill: string; label: string }[];
  label: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  return (
    <g>
      <text
        x={0}
        y={y + 14}
        fill="#94A3B8"
        fontSize={10}
        fontFamily="var(--font-mono, monospace)"
      >
        {label}
      </text>
      {segments.map((s, i) => {
        const offset =
          60 +
          (segments.slice(0, i).reduce((acc, p) => acc + p.value, 0) / total) *
            320;
        const w = ((s.value / total) * 320).toFixed(2);
        return (
          <rect
            key={i}
            x={offset}
            y={y}
            width={w}
            height={20}
            fill={s.fill}
            rx={4}
          />
        );
      })}
    </g>
  );
}
