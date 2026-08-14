/**
 * LogoBand — "Trusted by AU founders" placeholder logo row.
 * Server component (no interactivity needed).
 */

import { cn } from "@/lib/utils";

const LOGOS = [
  { name: "Atlassian", abbr: "AT" },
  { name: "Canva", abbr: "CV" },
  { name: "Afterpay", abbr: "AP" },
  { name: "Zip Co", abbr: "ZP" },
];

export function LogoBand({ className }: { className?: string }) {
  return (
    <section
      aria-label="Trusted by Australian founders"
      className={cn("border-y py-10", className)}
      style={{
        backgroundColor: "#0A0F1E",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div className="mx-auto max-w-5xl px-6">
        <p
          className="mb-6 text-center text-xs uppercase tracking-[0.2em]"
          style={{ color: "#94A3B8" }}
        >
          Trusted by AU founders
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          {LOGOS.map((logo) => (
            <div
              key={logo.name}
              className="flex items-center gap-2 opacity-40 transition-opacity duration-200 hover:opacity-70"
            >
              {/* Placeholder logo block */}
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#F8FAFC",
                }}
                aria-hidden
              >
                {logo.abbr}
              </div>
              <span
                className="text-sm font-semibold tracking-tight"
                style={{ color: "#F8FAFC" }}
              >
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
