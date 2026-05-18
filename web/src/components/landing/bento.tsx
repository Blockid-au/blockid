import Link from "next/link";
import {
  ArrowUpRight,
  Gauge,
  Link as LinkIcon,
  FileSignature,
  Layers,
  BarChart3,
  ScrollText,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tile {
  eyebrow: string;
  title: string;
  body: string;
  icon: LucideIcon;
  span: string;
  visual: React.ReactNode;
  href?: string;
  cta?: string;
}

const tiles: Tile[] = [
  {
    eyebrow: "Wedge product",
    title: "Investor-Ready Score",
    body: "One number. One page. One link to share with every investor — generated in 5 minutes from your Stripe and Xero.",
    icon: Gauge,
    span: "md:col-span-6 lg:col-span-5",
    visual: <ScoreVisual />,
  },
  {
    eyebrow: "Distribution",
    title: "Investor View Link",
    body: "A secure link with read receipts. Know the moment an investor opens your pre-diligence pack.",
    icon: LinkIcon,
    span: "md:col-span-6 lg:col-span-4",
    visual: <ViewLinkVisual />,
  },
  {
    eyebrow: "Save AUD $5k+",
    title: "Term Sheet AI",
    body: "Paste a term sheet. Get a plain-English redline, AU-market comparison and a live dilution simulation.",
    icon: FileSignature,
    span: "md:col-span-6 lg:col-span-3",
    visual: <TermSheetVisual />,
    href: "/tools/term-sheet",
    cta: "Try it",
  },
  {
    eyebrow: "Cap table",
    title: "Cap Table Diff",
    body: "Drag a new round in, see exactly who gains, who dilutes, how voting changes — board-ready PDF.",
    icon: Layers,
    span: "md:col-span-6 lg:col-span-4",
    visual: <CapDiffVisual />,
    href: "/tools/cap-table",
    cta: "Try it",
  },
  {
    eyebrow: "Defensible moat",
    title: "Comparable Companies Wall",
    body: "5 anonymised AU SMEs in your stage and sector. Multiples nobody else has — sourced from 500+ live raises.",
    icon: BarChart3,
    span: "md:col-span-6 lg:col-span-4",
    visual: <CompsVisual />,
  },
  {
    eyebrow: "AU-only",
    title: "Australia-Native Compliance",
    body: "ASIC sync, ESIC eligibility, R&D readiness, AUSTRAC alignment. No US competitor has this.",
    icon: ScrollText,
    span: "md:col-span-6 lg:col-span-4",
    visual: <ComplianceVisual />,
  },
  {
    eyebrow: "5-minute onboarding",
    title: "Stripe + Xero / MYOB Plug",
    body: "Connect in seconds. Instant data import. Time-to-first-value under 5 minutes.",
    icon: Plug,
    span: "md:col-span-12 lg:col-span-12",
    visual: <PlugVisual />,
  },
];

export function Bento() {
  return (
    <section
      id="product"
      aria-labelledby="features-title"
      className="py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-medium">
            Product
          </p>
          <h2
            id="features-title"
            className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-brand-900"
          >
            Every feature makes ownership visible and fundraising faster.
          </h2>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-600">
            From AI-powered readiness scoring to tamper-evident proof, every tool
            helps you raise with evidence investors trust.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
          {tiles.map((tile) => (
            <BentoTile key={tile.title} tile={tile} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BentoTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-surface-300 bg-white p-6 md:p-8 shadow-sm transition-colors duration-200 hover:border-brand-500 cursor-default",
        tile.span,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-medium">
            {tile.eyebrow}
          </p>
          <h3 className="mt-2 text-lg md:text-xl font-semibold text-brand-900">
            {tile.title}
          </h3>
          <p className="mt-2 max-w-md text-sm md:text-base leading-relaxed text-slate-600">
            {tile.body}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-300 bg-surface-100 text-brand-500">
          <Icon strokeWidth={1.75} className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-6">{tile.visual}</div>
      {tile.href && tile.cta && (
        <div className="mt-4">
          <Link
            href={tile.href}
            className="inline-flex items-center gap-1 text-xs font-medium text-gold-500 hover:text-gold-600 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 rounded-sm"
          >
            {tile.cta}
            <ArrowUpRight strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </article>
  );
}

function ScoreVisual() {
  return (
    <div className="rounded-xl border border-surface-300 bg-surface-100 p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Acme Co · Series A
          </p>
          <div className="mt-1 flex items-end gap-1">
            <span className="font-mono tabular-nums text-5xl font-semibold text-brand-500 leading-none">
              87
            </span>
            <span className="font-mono tabular-nums text-base text-slate-400 leading-none mb-1.5">
              /100
            </span>
          </div>
        </div>
        <div className="text-right text-xs">
          <p className="text-slate-400">Sector median</p>
          <p className="font-mono tabular-nums text-slate-700">71</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {[88, 92, 81, 90, 84].map((v, i) => (
          <div key={i}>
            <div className="h-1.5 w-full rounded-full bg-surface-300">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${v}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewLinkVisual() {
  return (
    <div className="rounded-xl border border-surface-300 bg-surface-100 p-4 space-y-2">
      {[
        { who: "Blackbird Ventures", time: "12m 04s" },
        { who: "AirTree Partner", time: "06m 18s" },
        { who: "Square Peg", time: "02m 51s" },
      ].map((row) => (
        <div
          key={row.who}
          className="flex items-center justify-between text-xs"
        >
          <span className="text-slate-700">{row.who}</span>
          <span className="font-mono tabular-nums text-brand-500">
            {row.time}
          </span>
        </div>
      ))}
    </div>
  );
}

function TermSheetVisual() {
  return (
    <div className="rounded-xl border border-surface-300 bg-surface-100 p-4 text-xs">
      <p className="text-slate-400">SAFE valuation cap</p>
      <p className="font-mono tabular-nums text-brand-900 text-lg">$8.0M</p>
      <div className="mt-2 flex items-center gap-2 text-amber-600">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <span>Above AU median (+18%)</span>
      </div>
    </div>
  );
}

function CapDiffVisual() {
  const before = [60, 25, 15];
  const after = [48, 22, 18, 12];
  const colors = ["bg-brand-500", "bg-brand-500/70", "bg-brand-500/45", "bg-amber-400/80"];
  return (
    <div className="rounded-xl border border-surface-300 bg-surface-100 p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
        Before → After Series A
      </p>
      <div className="mt-3 space-y-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {before.map((v, i) => (
            <div key={i} className={`${colors[i]} h-full`} style={{ width: `${v}%` }} />
          ))}
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {after.map((v, i) => (
            <div key={i} className={`${colors[i]} h-full`} style={{ width: `${v}%` }} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Founders dilute <span className="font-mono tabular-nums text-amber-600">12%</span>
        {" · "}ESOP top-up <span className="font-mono tabular-nums text-brand-500">+10%</span>
      </p>
    </div>
  );
}

function CompsVisual() {
  const rows = [
    { label: "AU SaaS · Seed", mult: "4.2x" },
    { label: "AU SaaS · Series A", mult: "5.6x" },
    { label: "Sector median", mult: "3.8x" },
  ];
  return (
    <div className="rounded-xl border border-surface-300 bg-surface-100 p-4 space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-xs">
          <span className="text-slate-600">{r.label}</span>
          <span className="font-mono tabular-nums text-brand-500">{r.mult}</span>
        </div>
      ))}
    </div>
  );
}

function ComplianceVisual() {
  return (
    <div className="flex flex-wrap gap-2">
      {["ASIC", "ESIC", "R&D", "AUSTRAC"].map((b) => (
        <span
          key={b}
          className="inline-flex items-center rounded-md border border-surface-300 bg-surface-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-700"
        >
          {b}
        </span>
      ))}
    </div>
  );
}

function PlugVisual() {
  const items = ["Stripe", "Xero", "MYOB", "HubSpot"];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((label) => (
        <div
          key={label}
          className="rounded-lg border border-surface-300 bg-surface-100 px-4 py-3 text-sm font-medium text-slate-700"
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-500">OAuth</p>
          <p className="mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
}
