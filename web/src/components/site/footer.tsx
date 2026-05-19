import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ShieldCheck, MapPin, Users, BarChart3 } from "lucide-react";

const columns = [
  {
    title: "Product",
    items: [
      { href: "/score", label: "Investor-Ready Score" },
      { href: "/#product", label: "Cap Table OS" },
      { href: "/#product", label: "Term Sheet AI" },
      { href: "/#product", label: "Investor View Link" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/tools/dilution", label: "Dilution Calculator" },
      { href: "/tools/cap-table", label: "Cap Table Diff" },
      { href: "/tools/term-sheet", label: "Term Sheet AI" },
      { href: "/tools/data-room", label: "Data Room Checklist" },
      { href: "/score", label: "Free Score" },
    ],
  },
  {
    title: "Company",
    items: [
      { href: "#", label: "About" },
      { href: "#", label: "Investors" },
      { href: "#", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
      { href: "#", label: "Security" },
    ],
  },
];

const VALUE_PROPS = [
  {
    icon: ShieldCheck,
    title: "CLEAR OWNERSHIP",
    body: "Build trust from the idea stage",
  },
  {
    icon: Users,
    title: "SMARTER FUNDRAISING",
    body: "Be investor-ready, always",
  },
  {
    icon: BarChart3,
    title: "REAL VALUE",
    body: "Track, understand and grow equity value",
  },
];

export function Footer() {
  return (
    <footer className="mt-24">
      {/* Main footer links */}
      <div className="border-t border-ink-700 bg-ink-950">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
            <div className="col-span-2">
              <Logo variant="dark" />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
                The all-in-one ownership and fundraising platform for Australian
                startups and SMEs.
              </p>
              <div className="mt-6 space-y-2 text-xs text-slate-500">
                <p className="flex items-center gap-2">
                  <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-400" />
                  <span>
                    ABN <span className="font-mono tabular-nums text-slate-300">00 000 000 000</span>
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin strokeWidth={1.75} className="h-4 w-4 text-brand-400" />
                  <span>AU data residency. SOC2 Type II in progress.</span>
                </p>
              </div>
            </div>
            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-xs uppercase tracking-[0.2em] text-gold-400 font-medium">
                  {col.title}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="text-sm text-slate-400 hover:text-slate-50 cursor-pointer transition-colors"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-ink-700 pt-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
            <p>
              &copy; {new Date().getFullYear()} BlockID Pty Ltd. Sydney, Australia.
            </p>
            <p>
              Not financial advice. BlockID is a software platform — engage a
              licensed adviser for your raise.
            </p>
          </div>
        </div>
      </div>

      {/* Brand value props strip — matches brand image footer */}
      <div className="bg-ink-950 border-t border-ink-700">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              </span>
              <span className="text-base font-semibold tracking-tight text-slate-50">
                BlockID<span className="text-brand-400">.au</span>
              </span>
              <span className="ml-2 hidden text-xs font-medium uppercase tracking-[0.15em] text-slate-500 sm:inline">
                Valuation. <span className="text-brand-400">Ownership.</span> Growth.
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {VALUE_PROPS.map((vp) => {
                const Icon = vp.icon;
                return (
                  <div key={vp.title} className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-500/25 bg-brand-500/10 text-brand-400">
                      <Icon strokeWidth={1.75} className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wider text-gold-400">
                        {vp.title}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {vp.body}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
