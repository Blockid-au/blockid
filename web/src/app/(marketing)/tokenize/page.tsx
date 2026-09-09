/**
 * /tokenize — marketing page for the blockchain-equity pillar (30% of the
 * homepage's 70/30 story). Purpose: give the tokenization story a proper
 * shelf so the homepage's shorter blockchain card can hand off here.
 *
 * Sections:
 *   1. Hero — headline, subhead, dual CTA (See pricing / Try demo).
 *   2. Three feature cards — Private EVM · MetaMask · Vesting contract.
 *   3. Workflow diagram — inline SVG, off-chain-first mirror pattern.
 *   4. Trust footnote — off-chain source of truth per AU corporate law.
 *   5. Final CTA strip — reuses MarketingCtaStrip so page footer matches.
 *
 * Server component. Reuses `MarketingShell` + `MarketingHero` +
 * `MarketingSection` for layout parity with /pricing, /roadmap etc.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Wallet, Cpu, Lock, Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

export const metadata: Metadata = {
  title: "Blockchain equity for Australian startups — private EVM, off-chain-first",
  description:
    "On-chain shares for AU founders on a private EVM (Anvil chainId 420). MetaMask-ready, ESOP + vesting enforced by smart contract, off-chain legal register is the source of truth.",
  alternates: { canonical: "https://blockid.au/tokenize" },
};

export const dynamic = "force-dynamic";

interface Feature {
  title: string;
  body: string;
  Icon: typeof Cpu;
}

const FEATURES: Feature[] = [
  {
    title: "Private EVM (Anvil chainId 420)",
    body:
      "Isolated chain — no public-mainnet gas, no MEV surface, no accidental exposure. Deterministic block times keep test → prod parity intact.",
    Icon: Cpu,
  },
  {
    title: "Wallet-native (MetaMask)",
    body:
      "Founders sign transactions from the wallet they already trust. Auschain covers gas; founders never touch a public exchange.",
    Icon: Wallet,
  },
  {
    // The contract really does hold vesting: SVToken.sol grantVesting /
    // revokeVesting, with client bindings in lib/wallet.ts. What it does not
    // do is populate itself — a grant reaches the chain when someone signs it,
    // not when the register changes. The body says so.
    title: "ESOP + vesting smart contract",
    body:
      "Cliffs, monthly release schedules and leaver clauses are held by the contract and enforced on-chain. Each grant is signed onto the chain deliberately, to match the option-plan agreement you have already signed off-chain.",
    Icon: Lock,
  },
];

function WorkflowDiagram() {
  // Inline SVG — no external asset. Every fill/stroke is a Tailwind
  // utility over the semantic ramp (fill-action, fill-primary,
  // fill-tertiary, stroke-warn), so the diagram retints with the theme
  // instead of baking the old dark palette in as raw hex. Reduced-motion
  // respected (no animation).
  return (
    <figure aria-labelledby="tokenize-workflow-caption" className="mt-6">
      <div className="overflow-x-auto rounded-2xl border border-line-subtle bg-surface-sunken p-6">
        <svg
          viewBox="0 0 720 220"
          role="img"
          aria-labelledby="tokenize-workflow-title"
          className="mx-auto block h-auto w-full max-w-3xl"
        >
          <title id="tokenize-workflow-title">
            Off-chain-first workflow: Auschain issues legally, tokens mirror on-chain
          </title>
          {/* Off-chain lane */}
          <g>
            <rect x="20" y="30" width="200" height="60" rx="12" className="fill-action/10 stroke-action" strokeWidth="1.5" />
            <text x="120" y="55" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">Auschain PTY LTD</text>
            <text x="120" y="75" textAnchor="middle" className="fill-tertiary" fontFamily="Inter, sans-serif" fontSize="11">Legal share issue (ASIC)</text>
          </g>
          <g>
            <rect x="260" y="30" width="200" height="60" rx="12" className="fill-action/10 stroke-action" strokeWidth="1.5" />
            <text x="360" y="55" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">Share Register</text>
            <text x="360" y="75" textAnchor="middle" className="fill-tertiary" fontFamily="Inter, sans-serif" fontSize="11">Source of truth (AU law)</text>
          </g>
          <g>
            <rect x="500" y="30" width="200" height="60" rx="12" className="fill-action/10 stroke-action" strokeWidth="1.5" />
            <text x="600" y="55" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">Cap Table</text>
            <text x="600" y="75" textAnchor="middle" className="fill-tertiary" fontFamily="Inter, sans-serif" fontSize="11">Founder-facing UI</text>
          </g>
          {/* Vertical mirror arrows */}
          <g className="stroke-warn" strokeWidth="1.5" fill="none">
            <path d="M120 90 L120 130" markerEnd="url(#arrow)" />
            <path d="M360 90 L360 130" markerEnd="url(#arrow)" />
            <path d="M600 90 L600 130" markerEnd="url(#arrow)" />
          </g>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-warn" />
            </marker>
          </defs>
          <text x="360" y="118" textAnchor="middle" className="fill-warn" fontFamily="IBM Plex Mono, monospace" fontSize="10" letterSpacing="0.14em">MIRROR (OPTIONAL · SIGNED PER EVENT)</text>
          {/* On-chain lane */}
          <g>
            <rect x="20" y="140" width="200" height="60" rx="12" className="fill-warn/10 stroke-warn" strokeWidth="1.5" />
            <text x="120" y="165" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">ERC-20 shares</text>
            <text x="120" y="185" textAnchor="middle" className="fill-tertiary" fontFamily="Inter, sans-serif" fontSize="11">Private EVM · chainId 420</text>
          </g>
          <g>
            <rect x="260" y="140" width="200" height="60" rx="12" className="fill-warn/10 stroke-warn" strokeWidth="1.5" />
            <text x="360" y="165" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">Vesting contract</text>
            <text x="360" y="185" textAnchor="middle" className="fill-tertiary" fontFamily="Inter, sans-serif" fontSize="11">Cliff + monthly release</text>
          </g>
          <g>
            <rect x="500" y="140" width="200" height="60" rx="12" className="fill-warn/10 stroke-warn" strokeWidth="1.5" />
            <text x="600" y="165" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">MetaMask view</text>
            <text x="600" y="185" textAnchor="middle" className="fill-tertiary" fontFamily="Inter, sans-serif" fontSize="11">Founder wallet balance</text>
          </g>
        </svg>
      </div>
      <figcaption
        id="tokenize-workflow-caption"
        className="mt-3 text-center text-xs text-secondary"
      >
        Off-chain first. On-chain mirrors the legal register — never overrides it.
      </figcaption>
    </figure>
  );
}

export default function TokenizePage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Blockchain equity · 30% of the platform"
        title={
          <>
            Cổ phần startup trên private EVM
            <span className="block text-action">
              quản trị on-chain, compliance off-chain
            </span>
          </>
        }
        subtitle="Issue shares legally through Auschain PTY LTD, then mirror them on a private EVM your founders control from MetaMask. Vesting cliffs and ESOP releases run as smart contracts. AU corporate law stays the source of truth."
        primaryCta={{ href: "/pricing", label: "See pricing" }}
        secondaryCta={{ href: "/tools/cap-table", label: "Try demo" }}
      />

      <MarketingSection kicker="What you get" title="Three parts, one contract set">
        <ul
          role="list"
          className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3"
        >
          {FEATURES.map(({ title, body, Icon }) => (
            <li
              key={title}
              className="rounded-2xl border border-line-subtle bg-surface-sunken p-6"
            >
              <div
                aria-hidden
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-action/10 text-action"
              >
                <Icon size={18} />
              </div>
              <h3 className="font-display text-lg font-semibold text-primary">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        kicker="How the mirror works"
        title="Off-chain-first workflow"
      >
        <p className="max-w-2xl text-sm leading-relaxed text-secondary">
          Auschain PTY LTD issues shares under the Corporations Act — the
          legal share register in the founder-facing cap table is the source
          of truth. On a paid plan you can deploy a company token to the
          private EVM and put holdings on-chain, so founders and grantees can
          see them in MetaMask without an external exchange, custodian, or KYC
          gate. Putting a register event on-chain is a deliberate, signed step
          — nothing is mirrored automatically, and the register stands on its
          own whether or not you ever use the chain.
        </p>
        <WorkflowDiagram />
      </MarketingSection>

      <MarketingSection tone="elevated">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div
            aria-hidden
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn/10 text-warn"
          >
            <Check size={18} />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-primary">
              Blockchain layer is optional
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              Off-chain equity is the source of truth per AU corporate law.
              You can run BlockID.au forever with tokenization switched off,
              turn it on for a subset of grants, or mirror the whole register
              — the legal register never diverges. Auschain is the issuer of
              record; the smart contract is a read-through of that record.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-sm font-semibold text-action hover:underline"
              >
                See pricing
                <ArrowRight size={14} aria-hidden />
              </Link>
              <Link
                href="/tools/cap-table"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Try the cap-table demo
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Start with the free analysis. Turn tokenization on when you're ready."
        primary={{ href: "/analyze", label: "Analyse my startup — free" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </MarketingShell>
  );
}
