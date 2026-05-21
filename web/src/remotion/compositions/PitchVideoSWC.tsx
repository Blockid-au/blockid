import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenDemo } from "../components/ScreenDemo";
import { Subtitle } from "../components/Subtitle";
import { BRAND } from "../styles/brand";

// Simple fade-in wrapper (no durationInFrames requirement)
function FadeIn({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/**
 * PitchVideoSWC — Startup World Cup Sydney 2026 (3-minute pitch)
 *
 * Voice clips play at natural speed. Scenes match audio duration + 9-frame gaps.
 *
 * Audio durations (measured from swc-final/):
 *   01: 4.9s=148f  02: 10.4s=312f  03: 5.3s=160f  04: 11.2s=337f
 *   05: 13.3s=400f  06: 9.3s=280f  07: 10.0s=301f  08: 3.2s=96f
 *   09: 11.0s=329f  10: 4.9s=146f  11: 4.7s=142f  12: 14.5s=434f
 *   13: 10.9s=327f  14: 11.6s=347f  15: 11.9s=356f  16: 8.1s=243f
 *   17: 6.8s=203f  18: 8.8s=264f  19: 15.3s=459f  20: 6.2s=187f
 *   21: 1.1s=34f
 *
 * Frame timeline (30fps, 6-frame gaps between clips):
 */

// Audio clip metadata: [filename, duration_frames, gap_after]
const CLIPS: Array<[string, number]> = [
  ["01-stat.mp3",       148],  // S1: Opening Hook
  ["02-reason.mp3",     312],
  ["03-intro.mp3",      160],
  ["04-problem-1.mp3",  337],  // S2: The Problem
  ["05-problem-2.mp3",  400],
  ["06-problem-3.mp3",  280],
  ["07-solution-1.mp3", 301],  // S3: The Solution
  ["08-solution-2.mp3",  96],
  ["09-evidence-1.mp3", 329],
  ["10-evidence-2.mp3", 146],
  ["11-lifecycle.mp3",  142],
  ["12-traction-1.mp3", 434],  // S4: Traction
  ["13-traction-2.mp3", 327],
  ["14-market-1.mp3",   347],  // S5: Market
  ["15-market-2.mp3",   356],
  ["16-australia.mp3",  243],
  ["17-close-1.mp3",    203],  // S6: Close
  ["18-close-2.mp3",    264],
  ["19-vision.mp3",     459],
  ["20-dropmic.mp3",    187],
  ["21-thanks.mp3",      34],
];

const GAP = 6; // 0.2s gap between clips

// Build start frames
function buildFrameMap() {
  const starts: number[] = [];
  let cursor = 90; // 3s logo reveal at start
  for (const [, dur] of CLIPS) {
    starts.push(cursor);
    cursor += dur + GAP;
  }
  return { starts, totalFrames: cursor + 90 }; // 3s hold at end
}

const { starts, totalFrames } = buildFrameMap();

// Scene boundaries (clip indices)
const SCENES = {
  logoReveal:   { from: 0,           dur: 90 },  // 3s logo
  openingHook:  { from: starts[0],   dur: starts[3] - starts[0] },
  theProblem:   { from: starts[3],   dur: starts[6] - starts[3] },
  theSolution:  { from: starts[6],   dur: starts[11] - starts[6] },
  traction:     { from: starts[11],  dur: starts[13] - starts[11] },
  market:       { from: starts[13],  dur: starts[16] - starts[13] },
  closeAndAsk:  { from: starts[16],  dur: totalFrames - starts[16] },
};

// Subtitle text for each clip
const SUBS = [
  "Last year, 370,000 Australian businesses shut their doors.",
  "More than 1,000 businesses dying every day. The #1 reason? They ran out of cash.",
  "I'm Do Van Long, founder of BlockID.au, and we are fixing this.",
  "Two options: pay $5K–$50K and wait 6 weeks. Or guess.",
  "Carta, Pulley, Cake Equity — spreadsheets with a subscription. Built for Silicon Valley.",
  "60% of Australian startups fail within 3 years. Founders fly blind.",
  "BlockID.au — AI valuation across 8 dimensions in under 60 seconds.",
  "Institutional-grade valuation report.",
  "Connect GitHub, Stripe, Analytics, LinkedIn — AI watches you grow in real time.",
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

// ─── Logo Reveal (LARGE, clear) ──────────────────────────────────────
function LogoRevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, from: 0.5, to: 1, durationInFrames: 45, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const glowOpacity = interpolate(frame, [15, 50], [0, 0.8], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#050A15" }}>
      {/* Large glow behind logo */}
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND.colors.brand}30, transparent 70%)`,
        opacity: glowOpacity, filter: "blur(60px)",
      }} />
      <div style={{ transform: `scale(${scale})`, opacity, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 200, height: 200 }} />
        <div style={{
          marginTop: 28, fontSize: 72, fontWeight: 900, color: "#FFFFFF",
          fontFamily: BRAND.fonts.heading, letterSpacing: -2,
          opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" }),
        }}>
          BlockID<span style={{ color: BRAND.colors.brand }}>.au</span>
        </div>
        <div style={{
          marginTop: 12, fontSize: 22, color: "#CBD5E1", fontWeight: 500,
          fontFamily: BRAND.fonts.body, letterSpacing: 2,
          opacity: interpolate(frame, [45, 65], [0, 1], { extrapolateRight: "clamp" }),
        }}>
          THE AGENTIC AI VALUATION PLATFORM
        </div>
        <div style={{
          marginTop: 32, fontSize: 16, color: "#94A3B8",
          fontFamily: BRAND.fonts.body,
          opacity: interpolate(frame, [55, 75], [0, 1], { extrapolateRight: "clamp" }),
        }}>
          Startup World Cup Sydney 2026
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Stat Scene (high contrast: bright text on #050A15) ──────────────
function BigStat({ value, label, color = "#F87171" }: { value: string; label: string; color?: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#050A15" }}>
      <div style={{ opacity, textAlign: "center" }}>
        <div style={{ fontSize: 120, fontWeight: 900, color, fontFamily: BRAND.fonts.mono, textShadow: "0 0 40px rgba(0,0,0,0.5)" }}>{value}</div>
        <div style={{ fontSize: 32, color: "#F1F5F9", fontWeight: 600, fontFamily: BRAND.fonts.body, marginTop: 16, maxWidth: 700 }}>{label}</div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Drop Mic Scene (high contrast) ──────────────────────────────────
function DropMicScene({ line1, line2 }: { line1: string; line2: string }) {
  const frame = useCurrentFrame();
  const o1 = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const o2 = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#050A15" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: "#FFFFFF", fontFamily: BRAND.fonts.heading, opacity: o1, textShadow: "0 0 60px rgba(59,125,216,0.3)" }}>{line1}</div>
        <div style={{ fontSize: 48, fontWeight: 700, color: "#93C5FD", fontFamily: BRAND.fonts.heading, opacity: o2, marginTop: 20 }}>{line2}</div>
      </div>
    </AbsoluteFill>
  );
}

// ─── CTA End Screen (LinkedIn card style — founder photo + QR) ───────
function CTAScreen() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#E8E4DF", opacity }}>
      {/* Card container — matches LinkedIn card style */}
      <div style={{
        background: "white", borderRadius: 24, padding: 48, width: 700,
        display: "flex", flexDirection: "column", alignItems: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        {/* Founder photo placeholder — circular */}
        <div style={{
          width: 100, height: 100, borderRadius: "50%",
          background: `linear-gradient(135deg, ${BRAND.colors.brand}, #1E40AF)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, fontWeight: 800, color: "white", fontFamily: BRAND.fonts.heading,
          marginBottom: 16,
        }}>
          DL
        </div>

        {/* Name */}
        <div style={{ fontSize: 36, fontWeight: 900, color: "#1F2937", fontFamily: BRAND.fonts.heading }}>
          Do Van Long
        </div>

        {/* Title */}
        <div style={{ fontSize: 16, color: "#6B7280", textAlign: "center", marginTop: 8, lineHeight: 1.5, maxWidth: 500 }}>
          Executive Management | Digital Transformation | Agentic AI & Blockchain
        </div>

        {/* Divider */}
        <div style={{ width: 60, height: 3, background: BRAND.colors.brand, borderRadius: 2, margin: "20px 0" }} />

        {/* BlockID branding */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 36, height: 36 }} />
          <div style={{ fontSize: 24, fontWeight: 800, color: "#1F2937" }}>
            BlockID<span style={{ color: BRAND.colors.brand }}>.au</span>
          </div>
        </div>

        {/* CTA */}
        <div style={{
          padding: "12px 40px", background: BRAND.colors.brand, borderRadius: 12,
          fontSize: 18, fontWeight: 700, color: "white", marginTop: 8,
        }}>
          Try Free → blockid.au
        </div>

        {/* Company info */}
        <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 16, textAlign: "center", lineHeight: 1.6 }}>
          Auschain Pty Ltd — ACN 659 615 111 — Sydney, Australia
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
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      {/* ─── AUDIO ──────────────────────────────────────────────────── */}
      {CLIPS.map(([file], i) => (
        <Sequence key={file} from={starts[i]}>
          <Audio src={staticFile(`video-assets/audio/swc-final/${file}`)} />
        </Sequence>
      ))}

      {/* ─── S0: LOGO REVEAL (0–3s) ────────────────────────────────── */}
      <Sequence from={0} durationInFrames={90}>
        <LogoRevealScene />
      </Sequence>

      {/* ─── S1: OPENING HOOK — Stats ──────────────────────────────── */}
      <Sequence from={starts[0]} durationInFrames={CLIPS[0][1]}>
        <FadeIn>
          <BigStat value="370,500" label="Australian businesses closed last year" />
        </FadeIn>
      </Sequence>
      <Sequence from={starts[1]} durationInFrames={CLIPS[1][1]}>
        <BigStat value="1,014" label="businesses dying every single day" color="#EF4444" />
      </Sequence>
      <Sequence from={starts[2]} durationInFrames={CLIPS[2][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: "white", fontFamily: BRAND.fonts.heading }}>Do Van Long</div>
              <div style={{ fontSize: 20, color: BRAND.colors.brand, marginTop: 8 }}>Founder & CEO — BlockID.au</div>
              <div style={{ fontSize: 16, color: BRAND.colors.ink400, marginTop: 4 }}>Auschain Pty Ltd — Sydney, Australia</div>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>

      {/* ─── S2: THE PROBLEM — Competitors fail ───────────────────── */}
      <Sequence from={starts[3]} durationInFrames={CLIPS[3][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 80 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.6 }}>
              Two options:<br />
              <span style={{ color: "#F87171" }}>$5K–$50K + 6 weeks</span><br />
              or <span style={{ color: "#FBBF24" }}>guess</span>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>
      <Sequence from={starts[4]} durationInFrames={CLIPS[4][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 60 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.colors.ink400, marginBottom: 24 }}>Cap Table Platforms</div>
              <div style={{ display: "flex", gap: 32, justifyContent: "center" }}>
                {["Carta", "Pulley", "Cake Equity"].map(name => (
                  <div key={name} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: "white" }}>{name}</div>
                    <div style={{ fontSize: 14, color: "#F87171", marginTop: 8 }}>✗ No AI Valuation</div>
                    <div style={{ fontSize: 14, color: "#F87171", marginTop: 4 }}>✗ US-centric</div>
                  </div>
                ))}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.colors.brand }}>BlockID.au</div>
                  <div style={{ fontSize: 14, color: "#34D399", marginTop: 8 }}>✓ AI Valuation</div>
                  <div style={{ fontSize: 14, color: "#34D399", marginTop: 4 }}>✓ AU-first</div>
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#FBBF24", marginTop: 32 }}>"Spreadsheets with a subscription"</div>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>
      <Sequence from={starts[5]} durationInFrames={CLIPS[5][1]}>
        <BigStat value="60%" label="of Australian startups fail within 3 years" />
      </Sequence>

      {/* ─── S3: THE SOLUTION — Demo ──────────────────────────────── */}
      <Sequence from={starts[6]} durationInFrames={CLIPS[6][1] + GAP + CLIPS[7][1]}>
        <FadeIn>
          <ScreenDemo
            imageSrc="video-assets/01-homepage-hero.png"
            status="AI Valuation — 8 Dimensions — 60 Seconds"
            descriptionLines={["Startup Value Index", "Analyse across 8 dimensions in 60 seconds"]}
          />
        </FadeIn>
      </Sequence>
      <Sequence from={starts[8]} durationInFrames={CLIPS[8][1] + GAP + CLIPS[9][1]}>
        <ScreenDemo
          imageSrc="video-assets/09-score.png"
          status="Evidence Vault — GitHub • Stripe • Analytics • LinkedIn"
          descriptionLines={["Connected Sources", "Score grows as your startup proves itself"]}
        />
      </Sequence>
      <Sequence from={starts[10]} durationInFrames={CLIPS[10][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 60 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {["Idea", "Validate", "MVP", "Traction", "Fundraise", "Growth", "Scale", "Exit"].map((step, i) => (
                <React.Fragment key={step}>
                  <div style={{ padding: "8px 16px", borderRadius: 8, background: BRAND.colors.brand, color: "white", fontSize: 14, fontWeight: 700 }}>{step}</div>
                  {i < 7 && <div style={{ color: BRAND.colors.ink500, fontSize: 18 }}>→</div>}
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 24, fontSize: 20, color: "white", fontWeight: 600 }}>Day 0 to Exit — One Platform</div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>

      {/* ─── S4: TRACTION — Metrics ───────────────────────────────── */}
      <Sequence from={starts[11]} durationInFrames={CLIPS[11][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 80 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, textAlign: "center" }}>
              {[
                { value: "50+", label: "Australian Founders", color: BRAND.colors.brand },
                { value: "200+", label: "SVI Analyses", color: "#14B8A6" },
                { value: "10", label: "Free Tools", color: "#FBBF24" },
                { value: "$5.5M+", label: "Valuations Tracked", color: "#34D399" },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 56, fontWeight: 900, color: m.color, fontFamily: BRAND.fonts.mono }}>{m.value}</div>
                  <div style={{ fontSize: 16, color: BRAND.colors.ink400, marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>
      <Sequence from={starts[12]} durationInFrames={CLIPS[12][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 60 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, color: BRAND.colors.ink400, marginBottom: 20 }}>AI-Augmented C-Suite</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
                <div style={{ padding: "10px 20px", borderRadius: 12, border: `2px solid ${BRAND.colors.brand}`, color: "white", fontSize: 14, fontWeight: 700 }}>CEO (Human)</div>
                {["CTO", "CMO", "CFO", "CPO", "CRO", "COO", "IR"].map(role => (
                  <div key={role} style={{ padding: "10px 20px", borderRadius: 12, background: BRAND.colors.brand + "20", border: `1px solid ${BRAND.colors.brand}50`, color: BRAND.colors.brand, fontSize: 14, fontWeight: 600 }}>{role} (AI)</div>
                ))}
              </div>
              <div style={{ marginTop: 20, fontSize: 16, color: BRAND.colors.ink400 }}>6 AI Providers · Automatic Fallback</div>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>

      {/* ─── S5: MARKET — TAM/SAM/SOM ────────────────────────────── */}
      <Sequence from={starts[13]} durationInFrames={CLIPS[13][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950 }}>
            <div style={{ position: "relative", width: 500, height: 500 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${BRAND.colors.brand}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 14, color: BRAND.colors.ink400, position: "absolute", top: 20 }}>TAM</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.colors.brand }}>$4.4T</div>
              </div>
              <div style={{ position: "absolute", top: 100, left: 100, right: 100, bottom: 100, borderRadius: "50%", border: `2px solid #14B8A650`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 14, color: BRAND.colors.ink400, position: "absolute", top: 15 }}>SAM</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#14B8A6" }}>$3.2B</div>
              </div>
              <div style={{ position: "absolute", top: 180, left: 180, right: 180, bottom: 180, borderRadius: "50%", border: `2px solid #FBBF2450`, background: "#FBBF2410", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                <div style={{ fontSize: 12, color: BRAND.colors.ink400 }}>SOM</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#FBBF24" }}>2.7M</div>
                <div style={{ fontSize: 11, color: BRAND.colors.ink500 }}>AU businesses</div>
              </div>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>
      <Sequence from={starts[14]} durationInFrames={CLIPS[14][1] + GAP + CLIPS[15][1]}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 80 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "white", lineHeight: 1.8 }}>
              Free → <span style={{ color: BRAND.colors.brand }}>$0.50/analysis</span> → <span style={{ color: BRAND.colors.gold }}>$49–$499/mo</span> → <span style={{ color: "#34D399" }}>$60K/yr</span>
            </div>
            <div style={{ fontSize: 18, color: BRAND.colors.ink400, marginTop: 16 }}>Australia-first · ESIC-aware · ASIC-registered</div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ─── S6: CLOSE & ASK ──────────────────────────────────────── */}
      <Sequence from={starts[16]} durationInFrames={CLIPS[16][1] + GAP + CLIPS[17][1]}>
        <FadeIn>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 80 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: BRAND.colors.brand, fontFamily: BRAND.fonts.mono }}>$500K</div>
              <div style={{ fontSize: 24, color: "white", marginTop: 12 }}>Pre-Seed Round</div>
              <div style={{ fontSize: 16, color: BRAND.colors.ink400, marginTop: 20, lineHeight: 1.8 }}>
                500 users · Cap Table Management · Equity Tokenization
              </div>
            </div>
          </AbsoluteFill>
        </FadeIn>
      </Sequence>
      <Sequence from={starts[18]} durationInFrames={CLIPS[18][1]}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: BRAND.colors.ink950, padding: 100 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.6 }}>
            Every startup in Australia<br />knows its value on <span style={{ color: BRAND.colors.brand }}>Day 1</span>.
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={starts[19]} durationInFrames={CLIPS[19][1]}>
        <DropMicScene line1="BlockID.au" line2="From idea to exit, one platform." />
      </Sequence>
      <Sequence from={starts[20]} durationInFrames={CLIPS[20][1] + 90}>
        <CTAScreen />
      </Sequence>

      {/* ─── SUBTITLES ────────────────────────────────────────────── */}
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
