import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { DropMic } from "../components/DropMic";
import { FlowDiagram } from "../components/FlowDiagram";
import { MetricsGrid } from "../components/MetricsGrid";
import { ScreenDemo } from "../components/ScreenDemo";
import { SlideTransition } from "../components/SlideTransition";
import { StatCounter } from "../components/StatCounter";
import { Subtitle } from "../components/Subtitle";
import { TAMCircles } from "../components/TAMCircles";
import { TextReveal } from "../components/TextReveal";
import { BRAND } from "../styles/brand";

/**
 * PitchVideo1MinV2 — Updated 60-second pitch (May 2026)
 *
 * New: vesting, equity wizard, blockchain, AI recommendations,
 *      11 AI agents, bigger logo, infographics, synced subtitles
 *
 * Timeline (30fps = 1800 frames):
 *   Scene 1:  Logo Reveal (big)     0:00-0:04  (0-120)
 *   Scene 2:  Problem Stats         0:04-0:10  (120-300)
 *   Scene 3:  The Gap               0:10-0:16  (300-488)
 *   Scene 4:  Solution Intro        0:16-0:22  (488-652)
 *   Scene 5:  Demo — SVI            0:22-0:27  (652-799)
 *   Scene 6:  Equity & Vesting      0:27-0:34  (799-1017)
 *   Scene 7:  Blockchain Lifecycle   0:34-0:41  (1017-1212)
 *   Scene 8:  Traction & Team       0:41-0:49  (1212-1448)
 *   Scene 9:  Market TAM            0:49-0:54  (1448-1601)
 *   Scene 10: Drop Mic              0:54-0:58  (1601-1742)
 *   Scene 11: CTA                   0:58-1:00  (1742-1800)
 */

// Frame calc from audio durations (30fps):
// Logo: 120 frames (4s silence)
// 02-problem: 177 frames → starts 120, ends 297
// 03-gap: 188 frames → starts 300, ends 488
// 04-solution: 164 frames → starts 490, ends 654
// 05-demo-svi: 147 frames → starts 656, ends 803
// 06-equity: 218 frames → starts 805, ends 1023
// 07-blockchain: 195 frames → starts 1025, ends 1220
// 08-traction: 236 frames → starts 1222, ends 1458
// 09-market: 153 frames → starts 1460, ends 1613
// 10-dropmic: 141 frames → starts 1615, ends 1756
// 11-cta: 68 frames → starts 1758, ends 1800+

const S = {
  logo:       { from: 0,    dur: 120 },
  problem:    { from: 120,  dur: 180 },
  gap:        { from: 300,  dur: 190 },
  solution:   { from: 490,  dur: 166 },
  demo:       { from: 656,  dur: 150 },
  equity:     { from: 806,  dur: 220 },
  blockchain: { from: 1026, dur: 197 },
  traction:   { from: 1223, dur: 238 },
  market:     { from: 1461, dur: 155 },
  dropmic:    { from: 1616, dur: 124 },
  cta:        { from: 1740, dur: 60 },
} as const;

// ── Big Logo Component ──────────────────────────────────────────────────
const BigLogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 60, mass: 1 } });
  const opacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const glowOpacity = interpolate(frame, [25, 60, 80, 120], [0, 0.7, 0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [50, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const taglineY = interpolate(frame, [50, 75], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, justifyContent: "center", alignItems: "center" }}>
      {/* Large glow */}
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND.colors.brand500}50 0%, transparent 70%)`,
        opacity: glowOpacity, filter: "blur(60px)",
      }} />

      <div style={{ opacity, transform: `scale(${scaleSpring})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
        {/* BIG Logo icon — 350px */}
        <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 350, height: 350, objectFit: "contain" }} />

        {/* BIG text — 96px */}
        <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 96, fontWeight: 700, color: BRAND.colors.white, letterSpacing: "-0.02em" }}>
          Block<span style={{ color: BRAND.colors.brand500 }}>ID</span>
          <span style={{ color: BRAND.colors.slate400, fontSize: 64 }}>.au</span>
        </div>

        {/* Tagline */}
        <div style={{
          opacity: taglineOpacity, transform: `translateY(${taglineY}px)`,
          fontFamily: BRAND.fonts.heading, fontSize: 32, fontWeight: 400,
          color: BRAND.colors.slate300, letterSpacing: "0.04em",
        }}>
          AI-Powered Startup Valuation & Equity Platform
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Radar Chart Infographic ─────────────────────────────────────────────
const RadarChart: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dimensions = [
    { label: "FTV", score: 75 }, { label: "MPC", score: 85 },
    { label: "PTD", score: 70 }, { label: "TRE", score: 60 },
    { label: "CGH", score: 80 }, { label: "IRI", score: 65 },
    { label: "LCO", score: 55 }, { label: "SVM", score: 72 },
  ];

  const cx = 200, cy = 200, r = 160;
  const n = dimensions.length;

  return (
    <div style={{ width: 400, height: 400, position: "relative" }}>
      <svg viewBox="0 0 400 400" width={400} height={400}>
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle key={scale} cx={cx} cy={cy} r={r * scale} fill="none" stroke={BRAND.colors.ink500} strokeWidth={0.5} opacity={0.3} />
        ))}
        {/* Data polygon */}
        <polygon
          points={dimensions.map((d, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const val = (d.score / 100) * r * progress;
            return `${cx + Math.cos(angle) * val},${cy + Math.sin(angle) * val}`;
          }).join(" ")}
          fill={`${BRAND.colors.brand500}40`}
          stroke={BRAND.colors.brand500}
          strokeWidth={2}
        />
        {/* Labels */}
        {dimensions.map((d, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = cx + Math.cos(angle) * (r + 25);
          const ly = cy + Math.sin(angle) * (r + 25);
          return (
            <text key={d.label} x={lx} y={ly} fill={BRAND.colors.slate300} fontSize={14} fontFamily={BRAND.fonts.mono} textAnchor="middle" dominantBaseline="central">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

// ── Equity Flow Infographic ─────────────────────────────────────────────
const EquityFlowInfographic: React.FC = () => {
  const frame = useCurrentFrame();
  const steps = [
    { icon: "👤", label: "Founder 100%", sub: "Start" },
    { icon: "👥", label: "Add Team", sub: "Dilute" },
    { icon: "🤖", label: "AI Split", sub: "Suggest" },
    { icon: "📅", label: "Vesting", sub: "Cliff+Linear" },
    { icon: "💼", label: "ESOP", sub: "10-15%" },
    { icon: "📊", label: "Cap Table", sub: "Live" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 60px" }}>
      {steps.map((step, i) => {
        const appear = interpolate(frame, [i * 25, i * 25 + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div style={{ opacity: appear, color: BRAND.colors.brand400, fontSize: 28, fontWeight: 700 }}>→</div>
            )}
            <div style={{
              opacity: appear, transform: `translateY(${(1 - appear) * 20}px)`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              background: `${BRAND.colors.brand500}15`, borderRadius: 12, padding: "16px 12px", minWidth: 120,
              border: `1px solid ${BRAND.colors.brand500}30`,
            }}>
              <div style={{ fontSize: 32 }}>{step.icon}</div>
              <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 15, fontWeight: 600, color: BRAND.colors.white, textAlign: "center" }}>{step.label}</div>
              <div style={{ fontFamily: BRAND.fonts.mono, fontSize: 11, color: BRAND.colors.brand400 }}>{step.sub}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── Main Composition ────────────────────────────────────────────────────
export const PitchVideo1MinV2: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      {/* ═══ Audio clips ═══ */}
      <Sequence from={S.problem.from}><Audio src={staticFile("video-assets/audio/1min-v2/02-problem.mp3")} /></Sequence>
      <Sequence from={S.gap.from}><Audio src={staticFile("video-assets/audio/1min-v2/03-gap.mp3")} /></Sequence>
      <Sequence from={S.solution.from}><Audio src={staticFile("video-assets/audio/1min-v2/04-solution.mp3")} /></Sequence>
      <Sequence from={S.demo.from}><Audio src={staticFile("video-assets/audio/1min-v2/05-demo-svi.mp3")} /></Sequence>
      <Sequence from={S.equity.from}><Audio src={staticFile("video-assets/audio/1min-v2/06-equity.mp3")} /></Sequence>
      <Sequence from={S.blockchain.from}><Audio src={staticFile("video-assets/audio/1min-v2/07-blockchain.mp3")} /></Sequence>
      <Sequence from={S.traction.from}><Audio src={staticFile("video-assets/audio/1min-v2/08-traction.mp3")} /></Sequence>
      <Sequence from={S.market.from}><Audio src={staticFile("video-assets/audio/1min-v2/09-market.mp3")} /></Sequence>
      <Sequence from={S.dropmic.from}><Audio src={staticFile("video-assets/audio/1min-v2/10-dropmic.mp3")} /></Sequence>
      <Sequence from={S.cta.from}><Audio src={staticFile("video-assets/audio/1min-v2/11-cta.mp3")} /></Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 1: BIG Logo Reveal (0:00-0:04 = 0-120)          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.logo.from} durationInFrames={S.logo.dur}>
        <BigLogoReveal />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 2: Problem Infographic (0:04-0:10 = 120-300)    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.problem.from} durationInFrames={S.problem.dur}>
        <SlideTransition durationInFrames={S.problem.dur}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <Sequence from={0} durationInFrames={90}>
              <StatCounter target={90} suffix="%" label="of startups fail" color="red" source="Failory 2026" duration={30} />
            </Sequence>
            <Sequence from={80} durationInFrames={100}>
              <AbsoluteFill>
                <StatCounter target={370} suffix=",000" label="Australian businesses closed last year" color="red" source="ABS June 2025" duration={30} formatNumber={false} />
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
        <Subtitle text="90% of startups fail. 370,000 AU businesses closed last year." durationInFrames={S.problem.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 3: The Gap — Comparison Infographic (300-490)    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.gap.from} durationInFrames={S.gap.dur}>
        <SlideTransition durationInFrames={S.gap.dur}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <TextReveal
              lines={[
                "Valuation costs A$50,000.",
                "Cap table tools? $99/month.",
                "None show what you're worth.",
              ]}
              fontSize={46}
              staggerFrames={30}
              color={BRAND.colors.red400}
              fontWeight={600}
            />
          </AbsoluteFill>
        </SlideTransition>
        <Subtitle text="Valuation: A$50K. Cap tables: $99/mo. None show your true value." durationInFrames={S.gap.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 4: Solution Intro (490-656)                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.solution.from} durationInFrames={S.solution.dur}>
        <SlideTransition durationInFrames={S.solution.dur}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
              <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 72, fontWeight: 700, color: BRAND.colors.brand500 }}>
                BlockID changes this.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{
                  fontFamily: BRAND.fonts.heading, fontSize: 48, fontWeight: 700,
                  color: BRAND.colors.emerald500, background: `${BRAND.colors.emerald500}15`,
                  padding: "12px 32px", borderRadius: 12, border: `2px solid ${BRAND.colors.emerald500}40`,
                }}>
                  A$1
                </div>
                <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 36, color: BRAND.colors.slate300 }}>
                  AI valuation in 60 seconds
                </div>
              </div>
            </div>
          </AbsoluteFill>
        </SlideTransition>
        <Subtitle text="BlockID: AI valuation in 60 seconds. From A$1." durationInFrames={S.solution.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 5: Demo — SVI with Radar Chart (656-806)         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.demo.from} durationInFrames={S.demo.dur}>
        {/* Sub 5a: Homepage screenshot (first 70 frames) */}
        <Sequence from={0} durationInFrames={70}>
          <SlideTransition durationInFrames={70}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "40px 120px" }}>
              <Img src={staticFile("video-assets/demo/01-homepage.png")} style={{
                width: 1400, height: 788, borderRadius: 12,
                border: `2px solid ${BRAND.colors.brand500}40`,
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }} />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        {/* Sub 5b: SVI results with radar chart (frames 70-150) */}
        <Sequence from={70} durationInFrames={80}>
          <SlideTransition durationInFrames={80}>
            <AbsoluteFill style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 50, padding: "0 80px" }}>
              <div style={{ flex: 1 }}>
                <ScreenDemo
                  url="blockid.au/dashboard/svi"
                  imageSrc="video-assets/score-page.png"
                  descriptionLines={["SVI Score — 8 dimensions analysed"]}
                  status="10-page AI report in under 60 seconds"
                />
              </div>
              <div style={{ flex: 0 }}>
                <RadarChart delay={10} />
              </div>
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        <Subtitle text="8 dimensions analysed. Full 10-page report in under a minute." durationInFrames={S.demo.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 6: Equity & Vesting — real demo screens (806-1026) */}
      {/* Split into 3 sub-scenes: infographic, equity screenshot, cap table screenshot */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.equity.from} durationInFrames={S.equity.dur}>
        {/* Sub 6a: Equity flow infographic (first 75 frames = 2.5s) */}
        <Sequence from={0} durationInFrames={75}>
          <SlideTransition durationInFrames={75}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 30 }}>
              <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 44, fontWeight: 700, color: BRAND.colors.white }}>
                Equity Setup Wizard
              </div>
              <EquityFlowInfographic />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        {/* Sub 6b: Real equity split screenshot (frames 75-145 = 2.3s) */}
        <Sequence from={75} durationInFrames={70}>
          <SlideTransition durationInFrames={70}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "40px 120px" }}>
              <Img src={staticFile("video-assets/helpnow-14-equity.png")} style={{
                width: 1400, height: 788, borderRadius: 12,
                border: `2px solid ${BRAND.colors.brand500}40`,
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }} />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        {/* Sub 6c: Real data room screenshot (frames 145-220 = 2.5s) */}
        <Sequence from={145} durationInFrames={75}>
          <SlideTransition durationInFrames={75}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "40px 120px" }}>
              <Img src={staticFile("video-assets/helpnow-12-dataroom.png")} style={{
                width: 1400, height: 788, borderRadius: 12,
                border: `2px solid ${BRAND.colors.brand500}40`,
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }} />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        <Subtitle text="AI suggests the split. Configure vesting & ESOP. All linked to your cap table." durationInFrames={S.equity.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 7: Blockchain & Lifecycle (1026-1223)             */}
      {/* Split: lifecycle flow → evidence vault screenshot        */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.blockchain.from} durationInFrames={S.blockchain.dur}>
        {/* Sub 7a: Lifecycle flow diagram (first 100 frames) */}
        <Sequence from={0} durationInFrames={100}>
          <SlideTransition durationInFrames={100}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
              <FlowDiagram
                steps={[
                  { icon: "\uD83D\uDCA1", label: "Idea", sublabel: "Validate" },
                  { icon: "\uD83D\uDE80", label: "MVP", sublabel: "Score" },
                  { icon: "\u2696\uFE0F", label: "Equity", sublabel: "Vest" },
                  { icon: "\u26D3\uFE0F", label: "Token", sublabel: "On-chain" },
                  { icon: "\uD83D\uDCB0", label: "Raise", sublabel: "Data room" },
                  { icon: "\uD83C\uDFC6", label: "Exit", sublabel: "IPO ready" },
                ]}
                title="From Idea to Exit — One Platform"
              />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        {/* Sub 7b: Evidence vault real screenshot (frames 100-197) */}
        <Sequence from={100} durationInFrames={97}>
          <SlideTransition durationInFrames={97}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "40px 120px" }}>
              <Img src={staticFile("video-assets/helpnow-11-evidence.png")} style={{
                width: 1400, height: 788, borderRadius: 12,
                border: `2px solid ${BRAND.colors.brand500}40`,
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }} />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        <Subtitle text="Tokenize equity. Sync vesting on-chain. Dividends. Idea → Exit." durationInFrames={S.blockchain.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 8: Traction & Team (1223-1461)                   */}
      {/* Split: metrics grid → real SVI dashboard screenshot     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.traction.from} durationInFrames={S.traction.dur}>
        {/* Sub 8a: Metrics + org badge (first 120 frames) */}
        <Sequence from={0} durationInFrames={120}>
          <SlideTransition durationInFrames={120}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
                <MetricsGrid
                  metrics={[
                    { label: "Founders", value: 50, color: "brand" },
                    { label: "Analyses", value: 200, color: "brand" },
                    { label: "Free Tools", value: 15, color: "brand" },
                    { label: "AI Agents", value: 11, color: "gold" },
                  ]}
                  columns={4}
                  title="Live Today"
                />
                <div style={{
                  display: "flex", alignItems: "center", gap: 16,
                  background: BRAND.colors.ink800, borderRadius: 12, padding: "16px 32px",
                  border: `1px solid ${BRAND.colors.ink500}`,
                }}>
                  <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.brand400, fontWeight: 600 }}>
                    1 Founder
                  </div>
                  <div style={{ color: BRAND.colors.slate400 }}>+</div>
                  <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.gold, fontWeight: 600 }}>
                    11 AI C-Level Agents
                  </div>
                  <div style={{ fontFamily: BRAND.fonts.mono, fontSize: 13, color: BRAND.colors.slate400 }}>
                    CTO · CFO · CMO · CPO · COO · CRO · CHRO · CLO · CISO · CDO · CBO
                  </div>
                </div>
              </div>
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        {/* Sub 8b: Real SVI dashboard screenshot (frames 120-238) */}
        <Sequence from={120} durationInFrames={118}>
          <SlideTransition durationInFrames={118}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "40px 120px" }}>
              <Img src={staticFile("video-assets/helpnow-09-dashboard.png")} style={{
                width: 1400, height: 788, borderRadius: 12,
                border: `2px solid ${BRAND.colors.brand500}40`,
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }} />
            </AbsoluteFill>
          </SlideTransition>
        </Sequence>

        <Subtitle text="50+ founders. 200+ analyses. 15 tools. 1 founder + 11 AI agents." durationInFrames={S.traction.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 9: Market / TAM (1461-1616)                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.market.from} durationInFrames={S.market.dur}>
        <SlideTransition durationInFrames={S.market.dur}>
          <AbsoluteFill style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 60 }}>
            <TAMCircles />
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <StatCounter target={2600} label="active AU startups" color="brand" duration={40} />
              <div style={{
                fontFamily: BRAND.fonts.heading, fontSize: 32, fontWeight: 700,
                color: BRAND.colors.red400, textAlign: "center",
              }}>
                Zero AI-native platforms
              </div>
            </div>
          </AbsoluteFill>
        </SlideTransition>
        <Subtitle text="A$4.4T market. 2,600 AU startups. Zero AI-native platforms." durationInFrames={S.market.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 10: Drop Mic (1616-1740)                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.dropmic.from} durationInFrames={S.dropmic.dur}>
        <DropMic
          lines={[
            { text: "AI builds products.", color: BRAND.colors.slate300, fontSize: 52, fontWeight: 500 },
            { text: "BlockID builds businesses.", color: BRAND.colors.brand500, fontSize: 72, fontWeight: 700 },
          ]}
          beatFrames={40}
          delay={5}
        />
        <Subtitle text="AI builds products. BlockID builds businesses." durationInFrames={S.dropmic.dur} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Scene 11: CTA (1740-1800)                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Sequence from={S.cta.from} durationInFrames={S.cta.dur}>
        <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 120, height: 120, objectFit: "contain" }} />
            <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 56, fontWeight: 700, color: BRAND.colors.white }}>
              Block<span style={{ color: BRAND.colors.brand500 }}>ID</span>
              <span style={{ color: BRAND.colors.slate400, fontSize: 36 }}>.au</span>
            </div>
            <Img src={staticFile("video-assets/qr-contact.png")} style={{ width: 160, height: 160, borderRadius: 8 }} />
            <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 28, fontWeight: 600, color: BRAND.colors.white }}>Do Van Long</div>
            <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 20, color: BRAND.colors.brand400 }}>CEO & Founder — BlockID.au</div>
            <div style={{
              marginTop: 8, fontFamily: BRAND.fonts.heading, fontSize: 22, fontWeight: 600,
              color: BRAND.colors.white, backgroundColor: BRAND.colors.brand500,
              padding: "12px 36px", borderRadius: 10,
            }}>
              Try free: blockid.au
            </div>
          </div>
        </AbsoluteFill>
        <Subtitle text="Try free: blockid.au" durationInFrames={S.cta.dur} />
      </Sequence>
    </AbsoluteFill>
  );
};
