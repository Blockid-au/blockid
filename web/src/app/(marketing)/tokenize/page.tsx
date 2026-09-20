/**
 * /tokenize — marketing page for the blockchain-equity pillar (30% of the
 * homepage's 70/30 story). Purpose: give the tokenization story a proper
 * shelf so the homepage's shorter blockchain card can hand off here.
 *
 * Sections (G17 P2-A, on the unicorn template):
 *   1. PageHero — headline, subhead, dual CTA (See pricing / Try demo).
 *   2. Section + FeatureGrid — Private EVM · MetaMask · Vesting contract.
 *   3. Section — workflow diagram (inline SVG, off-chain-first mirror).
 *   4. Section (sunken) — the blockchain layer is optional.
 *   5. CtaBand.
 *
 * Server component inside `MarketingShell`.
 */

import type { Metadata } from "next";
import { LEGAL_ENTITY, LEGAL_ENTITY_SHORT_NAME } from "@/lib/site/legal-entity";
import { pageMetadata } from "@/lib/seo/page-meta";
import { Wallet, Cpu, Lock } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/template";

export const metadata: Metadata = pageMetadata({
  title: "Blockchain equity for Australian startups",
  description: "On-chain shares for AU founders on a private EVM (Anvil chainId 420). MetaMask-ready, ESOP and vesting enforced by smart contract; legal register stays off-chain.",
  path: "/tokenize",
});

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
      `Founders sign transactions from the wallet they already trust. ${LEGAL_ENTITY_SHORT_NAME} covers gas; founders never touch a public exchange.`,
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
    <figure aria-labelledby="tokenize-workflow-caption">
      <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface-sunken p-6 shadow-1">
        <svg
          viewBox="0 0 720 220"
          role="img"
          aria-labelledby="tokenize-workflow-title"
          className="mx-auto block h-auto w-full max-w-3xl"
        >
          <title id="tokenize-workflow-title">
            Off-chain-first workflow: {LEGAL_ENTITY_SHORT_NAME} issues legally, tokens mirror on-chain
          </title>
          {/* Off-chain lane */}
          <g>
            <rect x="20" y="30" width="200" height="60" rx="12" className="fill-action/10 stroke-action" strokeWidth="1.5" />
            <text x="120" y="55" textAnchor="middle" className="fill-primary" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="600">{LEGAL_ENTITY.operator}</text>
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
      <PageHero
        eyebrow="Blockchain equity"
        title="On-chain shares. Off-chain law."
        sub={`Issue shares legally through ${LEGAL_ENTITY.operator}, then mirror them on a private EVM your founders control from MetaMask. Vesting cliffs and ESOP releases run as smart contracts. AU corporate law stays the source of truth.`}
        ctas={[
          { href: "/pricing", label: "See pricing", ctaId: "tokenize_hero_pricing" },
          { href: "/tools/cap-table", label: "Try demo" },
        ]}
        align="start"
      />

      <Section id="parts" eyebrow="What you get" title="Three parts, one contract set" tone="sunken">
        <FeatureGrid
          columns={3}
          ariaLabel="What you get"
          items={FEATURES.map(({ title, body, Icon }) => ({ icon: Icon, title, body }))}
        />
      </Section>

      <Section
        id="workflow"
        eyebrow="How the mirror works"
        title="Off-chain-first workflow"
        lede={`${LEGAL_ENTITY.operator} issues shares under the Corporations Act — the legal share register in the founder-facing cap table is the source of truth. On a paid plan you can deploy a company token to the private EVM and put holdings on-chain, so founders and grantees can see them in MetaMask without an external exchange, custodian, or KYC gate. Putting a register event on-chain is a deliberate, signed step — nothing is mirrored automatically, and the register stands on its own whether or not you ever use the chain.`}
      >
        <WorkflowDiagram />
      </Section>

      <Section
        id="optional"
        eyebrow="Optional by design"
        title="Blockchain layer is optional"
        lede={`Off-chain equity is the source of truth per AU corporate law. You can run BlockID.au forever with tokenization switched off, turn it on for a subset of grants, or mirror the whole register — the legal register never diverges. ${LEGAL_ENTITY_SHORT_NAME} is the issuer of record; the smart contract is a read-through of that record.`}
        tone="sunken"
        actions={[
          { href: "/pricing", label: "See pricing", variant: "link" },
          { href: "/tools/cap-table", label: "Try the cap-table demo", variant: "link" },
        ]}
      />

      <CtaBand
        title="Start with the free analysis. Turn tokenization on when you're ready."
        primary={{ href: "/analyze", label: "Analyse my startup — free", ctaId: "tokenize_final_score" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </MarketingShell>
  );
}
