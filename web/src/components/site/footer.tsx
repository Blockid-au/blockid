import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ShieldCheck, MapPin } from "lucide-react";

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

export function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-ink-950 mt-24">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Persistent Identity & Trust Infrastructure for Australian private
              capital markets.
            </p>
            <div className="mt-6 space-y-2 text-xs text-slate-500">
              <p className="flex items-center gap-2">
                <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-teal-400" />
                <span>
                  ABN <span className="font-mono tabular-nums text-slate-300">00 000 000 000</span>
                </span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin strokeWidth={1.75} className="h-4 w-4 text-teal-400" />
                <span>AU data residency. SOC2 Type II in progress.</span>
              </p>
            </div>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
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
    </footer>
  );
}
