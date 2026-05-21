import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Subtitle } from "../components/Subtitle";
import { BRAND } from "../styles/brand";

/**
 * PitchVideoSWC — Startup World Cup Sydney 2026 (3-minute pitch)
 * V2: Rich visuals — real screenshots, infographic cards, animated diagrams
 */

const CLIPS: Array<[string, number]> = [
  ["01-stat.mp3",       148],
  ["02-reason.mp3",     312],
  ["03-intro.mp3",      160],
  ["04-problem-1.mp3",  337],
  ["05-problem-2.mp3",  400],
  ["06-problem-3.mp3",  280],
  ["07-solution-1.mp3", 301],
  ["08-solution-2.mp3",  96],
  ["09-evidence-1.mp3", 329],
  ["10-evidence-2.mp3", 146],
  ["11-lifecycle.mp3",  142],
  ["12-traction-1.mp3", 434],
  ["13-traction-2.mp3", 327],
  ["14-market-1.mp3",   347],
  ["15-market-2.mp3",   356],
  ["16-australia.mp3",  243],
  ["17-close-1.mp3",    203],
  ["18-close-2.mp3",    264],
  ["19-vision.mp3",     459],
  ["20-dropmic.mp3",    187],
  ["21-thanks.mp3",      34],
];

const GAP = 6;
function buildFrameMap() {
  const starts: number[] = [];
  let cursor = 90;
  for (const [, dur] of CLIPS) { starts.push(cursor); cursor += dur + GAP; }
  return { starts, totalFrames: cursor + 90 };
}
const { starts, totalFrames } = buildFrameMap();

const SUBS = [
  "Last year, 370,000 Australian businesses shut their doors.",
  "More than 1,000 businesses dying every day. #1 reason? They ran out of cash.",
  "I'm Do Van Long, founder of BlockID.au, and we are fixing this.",
  "Two options: pay $5K–$50K and wait 6 weeks. Or guess.",
  "Carta, Pulley, Cake Equity — spreadsheets with a subscription.",
  "60% of Australian startups fail within 3 years. Founders fly blind.",
  "BlockID.au — AI valuation across 8 dimensions in under 60 seconds.",
  "Institutional-grade valuation report.",
  "Connect GitHub, Stripe, Analytics, LinkedIn — AI watches you grow.",
  "Evidence Vault: your score goes up as your startup proves itself.",
  "From Day Zero idea to exit. One platform.",
  "50+ founders. 200+ analyses. 10 free tools. Live today.",
  "6 AI providers. Solo founder with 7 AI agents as C-suite.",
  "2.7M AU businesses. $4.4T global ecosystem. $3.2B cap table market.",
  "Free → $0.50/analysis → $49–$499/month → $60K/year enterprise.",
  "Australia-first. ESIC-aware. ASIC-registered.",
  "Not a pitch deck. A live product with real users.",
  "Raising $500K pre-seed. 500 users. Cap table. Equity tokenization.",
  "Every startup knows its value on Day 1.",
  "BlockID.au — from idea to exit, one platform.",
  "Thank you.",
];

// ═══════════════════════════════════════════════════════════════════════
// REUSABLE VISUAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

// Gradient background for all scenes
const BG = "linear-gradient(160deg, #050A15 0%, #0C1629 50%, #0F1B33 100%)";

function FadeIn({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

// Browser window frame for screenshots
function BrowserFrame({ src, url = "blockid.au", label }: { src: string; url?: string; label?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, from: 0.92, to: 1, durationInFrames: 20, config: { damping: 15 } });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", padding: 40 }}>
      <div style={{ transform: `scale(${scale})`, width: 1600, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)" }}>
        {/* Browser chrome */}
        <div style={{ background: "#1E293B", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#EF4444" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FBBF24" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22C55E" }} />
          </div>
          <div style={{ flex: 1, background: "#0F172A", borderRadius: 6, padding: "4px 12px", fontSize: 13, color: "#94A3B8", fontFamily: BRAND.fonts.mono }}>
            https://{url}
          </div>
        </div>
        {/* Screenshot */}
        <Img src={staticFile(src)} style={{ width: "100%", display: "block" }} />
      </div>
      {/* Label overlay */}
      {label && (
        <div style={{ position: "absolute", bottom: 50, left: 0, right: 0, textAlign: "center" }}>
          <span style={{ background: "rgba(59,125,216,0.9)", padding: "10px 28px", borderRadius: 12, fontSize: 22, fontWeight: 700, color: "white", fontFamily: BRAND.fonts.heading }}>
            {label}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
}

// Large stat with visual card
function StatCard({ value, label, color = "#F87171", icon }: { value: string; label: string; color?: string; icon?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, from: 0.8, to: 1, durationInFrames: 18, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        {icon && <div style={{ fontSize: 64, marginBottom: 16 }}>{icon}</div>}
        <div style={{ fontSize: 140, fontWeight: 900, color, fontFamily: BRAND.fonts.mono, lineHeight: 1, textShadow: `0 0 80px ${color}40` }}>{value}</div>
        <div style={{ fontSize: 36, color: "#E2E8F0", fontWeight: 600, fontFamily: BRAND.fonts.heading, marginTop: 20, maxWidth: 800 }}>{label}</div>
      </div>
    </AbsoluteFill>
  );
}

// Visual card with large icon + short text (minimal words)
function VisualCard({ icon, bigText, smallText, color = "#F87171" }: { icon: string; bigText: string; smallText: string; color?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, from: 0.85, to: 1, durationInFrames: 18, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `scale(${s})`, display: "flex", alignItems: "center", gap: 60 }}>
        <div style={{ fontSize: 120, lineHeight: 1 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 56, fontWeight: 900, color, fontFamily: BRAND.fonts.mono }}>{bigText}</div>
          <div style={{ fontSize: 28, color: "#CBD5E1", marginTop: 8, maxWidth: 600 }}>{smallText}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SCENE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function LogoRevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, from: 0.5, to: 1, durationInFrames: 40, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.colors.brand}25, transparent 70%)`, filter: "blur(80px)", opacity: interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" }) }} />
      <div style={{ transform: `scale(${scale})`, opacity, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 220, height: 220 }} />
        <div style={{ marginTop: 32, fontSize: 80, fontWeight: 900, color: "#FFFFFF", fontFamily: BRAND.fonts.heading, letterSpacing: -2, opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" }) }}>
          BlockID<span style={{ color: BRAND.colors.brand }}>.au</span>
        </div>
        <div style={{ marginTop: 14, fontSize: 24, color: "#94A3B8", fontWeight: 500, fontFamily: BRAND.fonts.body, letterSpacing: 4, textTransform: "uppercase", opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" }) }}>
          The Agentic AI Valuation Platform
        </div>
      </div>
    </AbsoluteFill>
  );
}

function FounderIntroScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", opacity }}>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        {/* Avatar */}
        <div style={{ width: 160, height: 160, borderRadius: "50%", background: `linear-gradient(135deg, ${BRAND.colors.brand}, #1E40AF)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 900, color: "white", boxShadow: `0 0 60px ${BRAND.colors.brand}40` }}>DL</div>
        <div>
          <div style={{ fontSize: 52, fontWeight: 900, color: "#FFFFFF", fontFamily: BRAND.fonts.heading }}>Do Van Long</div>
          <div style={{ fontSize: 26, color: BRAND.colors.brand, marginTop: 8, fontWeight: 600 }}>Founder & CEO — BlockID.au</div>
          <div style={{ fontSize: 20, color: "#94A3B8", marginTop: 6 }}>Auschain Pty Ltd · Sydney, Australia</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Competitor visual — 3 competitors with X, BlockID with checkmarks
function CompetitorScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const competitors = [
    { name: "Carta", flag: "🇺🇸" },
    { name: "Pulley", flag: "🇺🇸" },
    { name: "Cake Equity", flag: "🇦🇺" },
  ];
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", padding: 80 }}>
      <div style={{ display: "flex", gap: 40, alignItems: "flex-end" }}>
        {/* Competitors — small, faded, with X */}
        {competitors.map((c, i) => {
          const s = spring({ frame, fps, from: 0, to: 1, durationInFrames: 15, delay: i * 5, config: { damping: 12 } });
          return (
            <div key={c.name} style={{ transform: `scale(${s})`, textAlign: "center", opacity: 0.6 }}>
              <div style={{ width: 180, height: 220, borderRadius: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ fontSize: 48 }}>{c.flag}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#CBD5E1", marginTop: 12 }}>{c.name}</div>
                <div style={{ fontSize: 56, color: "#EF4444", marginTop: 8 }}>✗</div>
                <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>No AI Valuation</div>
              </div>
            </div>
          );
        })}
        {/* BlockID — large, highlighted */}
        <div style={{ transform: `scale(${spring({ frame, fps, from: 0, to: 1, durationInFrames: 20, delay: 15, config: { damping: 10 } })})`, textAlign: "center" }}>
          <div style={{ width: 280, height: 320, borderRadius: 24, background: `${BRAND.colors.brand}12`, border: `3px solid ${BRAND.colors.brand}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, boxShadow: `0 0 60px ${BRAND.colors.brand}20` }}>
            <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 64, height: 64 }} />
            <div style={{ fontSize: 28, fontWeight: 900, color: "#FFFFFF", marginTop: 12 }}>BlockID.au</div>
            <div style={{ fontSize: 56, color: "#22C55E", marginTop: 8 }}>✓</div>
            <div style={{ fontSize: 15, color: "#22C55E", fontWeight: 600 }}>AI Valuation + AU-first</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function MetricsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const metrics = [
    { value: "50+", label: "Founders", color: BRAND.colors.brand, icon: "👥" },
    { value: "200+", label: "Analyses", color: "#14B8A6", icon: "📊" },
    { value: "10", label: "Free Tools", color: "#FBBF24", icon: "🛠️" },
    { value: "$5.5M+", label: "Tracked", color: "#22C55E", icon: "💰" },
  ];
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 32 }}>
        {metrics.map((m, i) => {
          const s = spring({ frame, fps, from: 0.6, to: 1, durationInFrames: 18, delay: i * 5, config: { damping: 12 } });
          return (
            <div key={m.label} style={{ transform: `scale(${s})`, background: "rgba(255,255,255,0.04)", borderRadius: 24, padding: "36px 40px", border: `2px solid ${m.color}30`, textAlign: "center", width: 220 }}>
              <div style={{ fontSize: 56 }}>{m.icon}</div>
              <div style={{ fontSize: 72, fontWeight: 900, color: m.color, fontFamily: BRAND.fonts.mono, marginTop: 8, lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 18, color: "#CBD5E1", marginTop: 12, fontWeight: 600 }}>{m.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function TeamOrgScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const roles = ["CTO", "CMO", "CFO", "CPO", "CRO", "COO", "IR"];
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", padding: 60, opacity }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#F1F5F9", fontFamily: BRAND.fonts.heading, marginBottom: 48 }}>AI-Augmented C-Suite</div>
        {/* CEO at top */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "14px 32px", borderRadius: 16, border: `3px solid ${BRAND.colors.brand}`, background: `${BRAND.colors.brand}15` }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: BRAND.colors.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 16 }}>DL</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#FFFFFF" }}>CEO <span style={{ color: "#94A3B8", fontWeight: 400 }}>— Human Founder</span></div>
          </div>
        </div>
        {/* Connector line */}
        <div style={{ width: 3, height: 24, background: `${BRAND.colors.brand}50`, margin: "0 auto 20px" }} />
        {/* AI agents */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {roles.map((role) => (
            <div key={role} style={{ padding: "12px 24px", borderRadius: 12, background: "rgba(59,125,216,0.1)", border: "1px solid rgba(59,125,216,0.25)", fontSize: 20, fontWeight: 600, color: BRAND.colors.brand }}>
              🤖 {role}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 32, fontSize: 22, color: "#94A3B8" }}>6 AI Providers · Claude · GPT-4 · Gemini · Automatic Fallback</div>
      </div>
    </AbsoluteFill>
  );
}

function TAMScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 15 } });
  const s2 = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, delay: 8, config: { damping: 15 } });
  const s3 = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, delay: 16, config: { damping: 15 } });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "relative", width: 700, height: 700 }}>
        {/* TAM */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${BRAND.colors.brand}40`, transform: `scale(${s1})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 30, fontSize: 18, fontWeight: 700, color: BRAND.colors.brand }}>TAM — Global Startup Ecosystem</div>
          <div style={{ fontSize: 48, fontWeight: 900, color: BRAND.colors.brand, fontFamily: BRAND.fonts.mono }}>$4.4T</div>
        </div>
        {/* SAM */}
        <div style={{ position: "absolute", top: 130, left: 130, right: 130, bottom: 130, borderRadius: "50%", border: `3px solid #14B8A650`, background: "#14B8A608", transform: `scale(${s2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 25, fontSize: 16, fontWeight: 700, color: "#14B8A6" }}>SAM — Cap Table Market</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#14B8A6", fontFamily: BRAND.fonts.mono }}>$3.2B</div>
        </div>
        {/* SOM */}
        <div style={{ position: "absolute", top: 240, left: 240, right: 240, bottom: 240, borderRadius: "50%", border: `3px solid #FBBF2460`, background: "#FBBF2412", transform: `scale(${s3})`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FBBF24" }}>SOM</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#FBBF24", fontFamily: BRAND.fonts.mono }}>2.7M</div>
          <div style={{ fontSize: 14, color: "#CBD5E1" }}>AU businesses</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function PricingScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tiers = [
    { price: "Free", icon: "🎁", color: "#22C55E" },
    { price: "$0.50", icon: "⚡", color: BRAND.colors.brand },
    { price: "$49–499", icon: "🚀", color: "#FBBF24" },
    { price: "$60K", icon: "🏢", color: "#A78BFA" },
  ];
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {tiers.map((t, i) => {
          const s = spring({ frame, fps, from: 0.7, to: 1, durationInFrames: 15, delay: i * 6, config: { damping: 12 } });
          return (
            <React.Fragment key={t.price}>
              <div style={{ transform: `scale(${s})`, background: `${t.color}10`, borderRadius: 20, padding: "32px 36px", border: `2px solid ${t.color}40`, textAlign: "center" }}>
                <div style={{ fontSize: 56 }}>{t.icon}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: t.color, fontFamily: BRAND.fonts.mono, marginTop: 12 }}>{t.price}</div>
              </div>
              {i < 3 && <div style={{ fontSize: 36, color: "#475569" }}>→</div>}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ marginTop: 40, fontSize: 28, color: "#94A3B8", fontWeight: 600 }}>🇦🇺 Australia-first · ESIC · ASIC</div>
    </AbsoluteFill>
  );
}

function FundraiseScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center", padding: 80, opacity }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, color: "#94A3B8", fontWeight: 600, marginBottom: 12 }}>PRE-SEED ROUND</div>
        <div style={{ fontSize: 96, fontWeight: 900, color: BRAND.colors.brand, fontFamily: BRAND.fonts.mono, textShadow: `0 0 80px ${BRAND.colors.brand}30` }}>$500K</div>
        <div style={{ marginTop: 40, display: "flex", gap: 20, justifyContent: "center" }}>
          {[
            { icon: "👥", text: "500 Users", color: BRAND.colors.brand },
            { icon: "📊", text: "Cap Table Tools", color: "#14B8A6" },
            { icon: "🔗", text: "Equity Tokenization", color: "#FBBF24" },
          ].map(m => (
            <div key={m.text} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 28px", border: `1px solid ${m.color}30`, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>{m.icon}</span>
              <span style={{ fontSize: 22, color: "#E2E8F0", fontWeight: 600 }}>{m.text}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function DropMicScene() {
  const frame = useCurrentFrame();
  const o1 = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const o2 = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#020408", justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "absolute", width: 800, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.colors.brand}15, transparent 70%)`, filter: "blur(60px)" }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 900, color: "#FFFFFF", fontFamily: BRAND.fonts.heading, opacity: o1, textShadow: `0 0 60px ${BRAND.colors.brand}30` }}>BlockID.au</div>
        <div style={{ fontSize: 44, fontWeight: 600, color: "#93C5FD", fontFamily: BRAND.fonts.heading, opacity: o2, marginTop: 20 }}>From idea to exit, one platform.</div>
      </div>
    </AbsoluteFill>
  );
}

// CTA — LinkedIn card matching the reference image (founder photo + QR)
function CTAScreen() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#D6D1CB", justifyContent: "center", alignItems: "center", opacity }}>
      <div style={{ background: "white", borderRadius: 28, padding: "40px 48px", width: 640, display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        {/* Founder avatar */}
        <div style={{ width: 100, height: 100, borderRadius: "50%", background: `linear-gradient(135deg, ${BRAND.colors.brand}, #1E40AF)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 900, color: "white", marginBottom: 16, border: "3px solid white", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>DL</div>

        {/* Name */}
        <div style={{ fontSize: 36, fontWeight: 900, color: "#374151", fontFamily: BRAND.fonts.heading }}>Do Van Long</div>

        {/* Title — matches LinkedIn card */}
        <div style={{ fontSize: 16, color: "#6B7280", textAlign: "center", marginTop: 6, lineHeight: 1.4 }}>
          Executive Management | Digital Transformation | Agentic AI & Blockchain
        </div>

        {/* LinkedIn QR code — real image */}
        <div style={{ marginTop: 24, marginBottom: 20 }}>
          <Img src={staticFile("video-assets/qr-linkedin.png")} style={{ width: 240, height: 240, borderRadius: 12 }} />
        </div>

        {/* Scan prompt */}
        <div style={{ fontSize: 15, color: "#94A3B8", fontWeight: 500 }}>Scan to connect on LinkedIn</div>

        {/* BlockID branding */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, padding: "8px 24px", background: "#F8FAFC", borderRadius: 12 }}>
          <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 28, height: 28 }} />
          <div style={{ fontSize: 20, fontWeight: 800, color: "#374151" }}>BlockID<span style={{ color: BRAND.colors.brand }}>.au</span></div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION
// ═══════════════════════════════════════════════════════════════════════
export const PitchVideoSWC: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#050A15" }}>
      {/* Audio */}
      {CLIPS.map(([file], i) => (
        <Sequence key={file} from={starts[i]}>
          <Audio src={staticFile(`video-assets/audio/swc-final/${file}`)} />
        </Sequence>
      ))}

      {/* S0: LOGO REVEAL */}
      <Sequence from={0} durationInFrames={90}>
        <LogoRevealScene />
      </Sequence>

      {/* S1: OPENING HOOK — Stats with visuals */}
      <Sequence from={starts[0]} durationInFrames={CLIPS[0][1]}>
        <StatCard value="370,500" label="Australian businesses closed last year" icon="🇦🇺" />
      </Sequence>
      <Sequence from={starts[1]} durationInFrames={CLIPS[1][1]}>
        <StatCard value="1,014/day" label="businesses dying every single day" color="#EF4444" icon="📉" />
      </Sequence>
      <Sequence from={starts[2]} durationInFrames={CLIPS[2][1]}>
        <FounderIntroScene />
      </Sequence>

      {/* S2: THE PROBLEM — Visual cards */}
      <Sequence from={starts[3]} durationInFrames={CLIPS[3][1]}>
        <VisualCard icon="💸" bigText="$5K – $50K" smallText="Manual valuation cost + 6 weeks wait" color="#F87171" />
      </Sequence>
      <Sequence from={starts[4]} durationInFrames={CLIPS[4][1]}>
        <CompetitorScene />
      </Sequence>
      <Sequence from={starts[5]} durationInFrames={CLIPS[5][1]}>
        <StatCard value="60%" label="of Australian startups fail within 3 years" color="#EF4444" icon="⚠️" />
      </Sequence>

      {/* S3: THE SOLUTION — Product screenshots in browser frames */}
      <Sequence from={starts[6]} durationInFrames={CLIPS[6][1] + GAP + CLIPS[7][1]}>
        <BrowserFrame src="video-assets/01-homepage-hero.png" label="8-Dimension AI Valuation" />
      </Sequence>
      <Sequence from={starts[8]} durationInFrames={CLIPS[8][1]}>
        <BrowserFrame src="video-assets/evidence-vault.png" url="blockid.au/workspace/evidence" label="Evidence Vault" />
      </Sequence>
      <Sequence from={starts[9]} durationInFrames={CLIPS[9][1]}>
        <BrowserFrame src="video-assets/helpnow-svi-results.png" url="blockid.au/svi/report" label="SVI Score Grows" />
      </Sequence>
      <Sequence from={starts[10]} durationInFrames={CLIPS[10][1]}>
        <BrowserFrame src="video-assets/helpnow-15-roadmap.png" url="blockid.au/dashboard" label="Day 0 to Exit" />
      </Sequence>

      {/* S4: TRACTION */}
      <Sequence from={starts[11]} durationInFrames={CLIPS[11][1]}>
        <MetricsScene />
      </Sequence>
      <Sequence from={starts[12]} durationInFrames={CLIPS[12][1]}>
        <TeamOrgScene />
      </Sequence>

      {/* S5: MARKET */}
      <Sequence from={starts[13]} durationInFrames={CLIPS[13][1]}>
        <TAMScene />
      </Sequence>
      <Sequence from={starts[14]} durationInFrames={CLIPS[14][1] + GAP + CLIPS[15][1]}>
        <PricingScene />
      </Sequence>

      {/* S6: CLOSE */}
      <Sequence from={starts[16]} durationInFrames={CLIPS[16][1] + GAP + CLIPS[17][1]}>
        <FundraiseScene />
      </Sequence>
      <Sequence from={starts[18]} durationInFrames={CLIPS[18][1]}>
        <FadeIn>
          <AbsoluteFill style={{ background: "#020408", justifyContent: "center", alignItems: "center" }}>
            <div style={{ position: "absolute", width: 900, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.colors.brand}10, transparent 70%)`, filter: "blur(80px)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 64, fontWeight: 900, color: "#FFFFFF", fontFamily: BRAND.fonts.heading, lineHeight: 1.3 }}>
                Every startup knows<br />its value on <span style={{ color: BRAND.colors.brand }}>Day 1</span>
              </div>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>
      <Sequence from={starts[19]} durationInFrames={CLIPS[19][1]}>
        <DropMicScene />
      </Sequence>
      <Sequence from={starts[20]} durationInFrames={CLIPS[20][1] + 90}>
        <CTAScreen />
      </Sequence>

      {/* SUBTITLES */}
      {CLIPS.map(([, dur], i) => (
        SUBS[i] ? (
          <Sequence key={`sub-${i}`} from={starts[i]} durationInFrames={dur}>
            <Subtitle text={SUBS[i]} />
          </Sequence>
        ) : null
      ))}
    </AbsoluteFill>
  );
};
