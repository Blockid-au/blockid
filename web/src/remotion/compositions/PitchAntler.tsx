import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { ComparisonTable } from "../components/ComparisonTable";
import { DropMic } from "../components/DropMic";
import { FlowDiagram } from "../components/FlowDiagram";
import { MetricsGrid } from "../components/MetricsGrid";
import { RoadmapTimeline } from "../components/RoadmapTimeline";
import { SlideTransition } from "../components/SlideTransition";
import { StatCounter } from "../components/StatCounter";
import { TAMCircles } from "../components/TAMCircles";
import { TeamOrg } from "../components/TeamOrg";
import { TextReveal } from "../components/TextReveal";
import { BRAND } from "../styles/brand";

/**
 * PitchAntler — Antler Australia Pre-Seed Pitch Video
 *
 * Duration: 180 seconds (3 minutes) @ 30fps = 5400 frames
 * Target: Antler Demo Day / Application Video
 *
 * 12 Scenes matching the 12-slide pitch deck:
 *   1. Title/Logo         0:00-0:10   (0-300)
 *   2. Problem            0:10-0:25   (300-750)
 *   3. AI Explosion       0:25-0:38   (750-1140)
 *   4. Solution           0:38-0:55   (1140-1650)
 *   5. How It Works       0:55-1:10   (1650-2100)
 *   6. Market             1:10-1:25   (2100-2250)
 *   7. Business Model     1:25-1:38   (2250-2640)
 *   8. Traction           1:38-1:55   (2640-3150)
 *   9. Competition        1:55-2:10   (3150-3600)
 *  10. Roadmap            2:10-2:25   (3600-4050)
 *  11. Team               2:25-2:40   (4050-4500)
 *  12. The Ask + CTA      2:40-3:00   (4500-5400)
 */

const fps = BRAND.fps;

const SCENES = {
  title:      { from: 0,    dur: 300 },
  problem:    { from: 300,  dur: 450 },
  ai:         { from: 750,  dur: 390 },
  solution:   { from: 1140, dur: 510 },
  howItWorks: { from: 1650, dur: 450 },
  market:     { from: 2100, dur: 450 },
  business:   { from: 2550, dur: 390 },
  traction:   { from: 2940, dur: 510 },
  compete:    { from: 3450, dur: 450 },
  roadmap:    { from: 3900, dur: 450 },
  team:       { from: 4350, dur: 450 },
  ask:        { from: 4800, dur: 600 },
} as const;

/* ─── Scene Components ────────────────────────────────────────────────── */

const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 60 } });
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: "clamp" });
  const taglineY = interpolate(frame, [60, 90], [30, 0], { extrapolateRight: "clamp" });
  const badgeOpacity = interpolate(frame, [120, 150], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, justifyContent: "center", alignItems: "center" }}>
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND.colors.brand500}40, transparent 70%)`,
        opacity: interpolate(frame, [30, 80, 200, 300], [0, 0.6, 0.4, 0], { extrapolateRight: "clamp" }),
        filter: "blur(80px)",
      }} />
      <div style={{ opacity, transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <Img src={staticFile("images/logo-icon-transparent.png")} style={{ width: 280, height: 280, objectFit: "contain" }} />
        <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 80, fontWeight: 700, color: BRAND.colors.white }}>
          Block<span style={{ color: BRAND.colors.brand500 }}>ID</span>
          <span style={{ color: BRAND.colors.slate400, fontSize: 56 }}>.au</span>
        </div>
      </div>
      <div style={{
        opacity: taglineOpacity, transform: `translateY(${taglineY}px)`,
        position: "absolute", bottom: 180,
        fontFamily: BRAND.fonts.heading, fontSize: 36, color: BRAND.colors.slate300, textAlign: "center",
      }}>
        From Idea to Exit. One Platform.
      </div>
      <div style={{
        opacity: badgeOpacity, position: "absolute", bottom: 100,
        display: "flex", gap: 16,
      }}>
        <div style={{ padding: "8px 20px", borderRadius: 8, backgroundColor: "#10B98130", fontFamily: BRAND.fonts.heading, fontSize: 18, fontWeight: 600, color: BRAND.colors.emerald500 }}>
          LIVE PRODUCT
        </div>
        <div style={{ padding: "8px 20px", borderRadius: 8, backgroundColor: `${BRAND.colors.brand500}30`, fontFamily: BRAND.fonts.heading, fontSize: 18, fontWeight: 600, color: BRAND.colors.brand500 }}>
          PRE-SEED
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProblemScene: React.FC = () => (
  <SlideTransition direction="left">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 80 }}>
      <TextReveal
        lines={["90% of Startups Fail.", "The Valuation Black Hole is Why."]}
        fontSize={52}
        color={BRAND.colors.white}
        staggerFrames={20}
      />
      <div style={{ position: "absolute", bottom: 120, left: 80, right: 80, display: "flex", gap: 32 }}>
        <StatCounter target={90} suffix="%" label="Startups fail" color={BRAND.colors.red400} duration={60} delay={30} />
        <StatCounter target={60} suffix="%" label="AU fail in 3 years" color={BRAND.colors.red400} duration={60} delay={45} />
        <StatCounter target={70} suffix="%" label="Run out of cash" color={BRAND.colors.gold} duration={60} delay={60} />
        <StatCounter target={50} prefix="$" suffix="K" label="Manual valuation cost" color={BRAND.colors.gold} duration={60} delay={75} />
      </div>
    </AbsoluteFill>
  </SlideTransition>
);

const AIExplosionScene: React.FC = () => (
  <SlideTransition direction="right">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 80 }}>
      <TextReveal
        lines={["$252B Invested in AI.", "90% of AI Startups Still Fail."]}
        fontSize={48}
        color={BRAND.colors.white}
        staggerFrames={25}
      />
      <div style={{ position: "absolute", bottom: 140, left: 80, right: 80, display: "flex", gap: 40 }}>
        <StatCounter target={97} prefix="$" suffix="B" label="AI startup funding 2024" color={BRAND.colors.brand500} duration={70} delay={40} />
        <StatCounter target={252} prefix="$" suffix="B" label="Total AI investment" color={BRAND.colors.gold} duration={70} delay={55} />
        <StatCounter target={90} suffix="%" label="AI startups die in 18mo" color={BRAND.colors.red400} duration={70} delay={70} />
      </div>
      <div style={{
        position: "absolute", bottom: 60, left: 80, right: 80, textAlign: "center",
        fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.gold,
      }}>
        AI generates ideas — but it takes BlockID to build businesses.
      </div>
    </AbsoluteFill>
  </SlideTransition>
);

const SolutionScene: React.FC = () => (
  <SlideTransition direction="up">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 80 }}>
      <TextReveal
        lines={["BlockID.au", "AI-Powered Startup Intelligence. Instantly."]}
        fontSize={46}
        color={BRAND.colors.brand500}
        staggerFrames={20}
      />
      <div style={{ position: "absolute", top: 280, left: 80, right: 80 }}>
        <FlowDiagram
          steps={[
            { label: "Submit Idea", detail: "URL, text, or document" },
            { label: "AI Scores", detail: "8 dimensions, 60 seconds" },
            { label: "Full Report", detail: "Unlimited depth analysis" },
            { label: "Upload Evidence", detail: "Boost score with real data" },
            { label: "Grow & Fundraise", detail: "Cap table, data room, exit" },
          ]}
          title=""
          direction="horizontal"
          delay={60}
        />
      </div>
      <div style={{
        position: "absolute", bottom: 80, left: 80, right: 80,
        display: "flex", justifyContent: "center", gap: 32,
      }}>
        <MetricsGrid
          metrics={[
            { icon: "⚡", value: "60s", label: "Report generation" },
            { icon: "📊", value: "8", label: "Scoring dimensions" },
            { icon: "🛠️", value: "10", label: "Free tools included" },
            { icon: "🔗", value: "6", label: "AI providers" },
          ]}
          columns={4}
          delay={120}
        />
      </div>
    </AbsoluteFill>
  </SlideTransition>
);

const HowItWorksScene: React.FC = () => (
  <SlideTransition direction="left">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 60 }}>
      <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 40, fontWeight: 700, color: BRAND.colors.white, marginBottom: 40 }}>
        From Idea to Intelligence in 60 Seconds
      </div>
      <ScreenDemo
        url="blockid.au"
        imageSrc={staticFile("video-assets/svi-search.png")}
        descriptionLines={[
          "Enter your startup details or paste a URL",
          "AI analyses across 8 dimensions with deep tech audit",
          "Full valuation report with scores, gaps & next steps",
          "Upload evidence → score updates in real-time",
        ]}
        status="live"
      />
    </AbsoluteFill>
  </SlideTransition>
);

const MarketScene: React.FC = () => (
  <SlideTransition direction="right">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 80, justifyContent: "center" }}>
      <TAMCircles
        tam={{ value: "$4.4T", label: "Global Startup Ecosystem" }}
        sam={{ value: "$3.2B", label: "Cap Table & Valuation Tools" }}
        som={{ value: "A$250K", label: "500 AU Startups Year 1" }}
        title="A$15B Ecosystem. 2,600+ Startups. Zero Unified Platform."
      />
    </AbsoluteFill>
  </SlideTransition>
);

const TractionScene: React.FC = () => (
  <SlideTransition direction="up">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 80 }}>
      <TextReveal
        lines={["Live Product. Real Users.", "Growing Fast."]}
        fontSize={46}
        color={BRAND.colors.emerald500}
        staggerFrames={15}
      />
      <div style={{ position: "absolute", bottom: 140, left: 80, right: 80, display: "flex", gap: 40 }}>
        <StatCounter target={50} suffix="+" label="Australian founders" color={BRAND.colors.brand500} duration={50} delay={30} />
        <StatCounter target={200} suffix="+" label="SVI analyses completed" color={BRAND.colors.emerald500} duration={50} delay={45} />
        <StatCounter target={2} prefix="$" suffix="M+" label="Valuations tracked" color={BRAND.colors.gold} duration={50} delay={60} />
        <StatCounter target={10} label="Free tools live" color={BRAND.colors.white} duration={50} delay={75} />
      </div>
    </AbsoluteFill>
  </SlideTransition>
);

const CompeteScene: React.FC = () => (
  <SlideTransition direction="left">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 60 }}>
      <ComparisonTable
        title="No One Covers the Full Lifecycle"
        headers={["Feature", "BlockID", "Carta", "Pulley", "Equidam"]}
        rows={[
          ["AI Valuation", "✓", "✗", "✗", "✓"],
          ["Full Report Gen", "✓", "✗", "✗", "✗"],
          ["Cap Table", "✓", "✓", "✓", "✗"],
          ["Evidence Vault", "✓", "✗", "✗", "✗"],
          ["AU Focus (ESIC)", "✓", "✗", "✗", "✗"],
          ["Free Tier", "✓", "✗", "✗", "✓"],
          ["Blockchain Equity", "✓", "✗", "✗", "✗"],
          ["Full Lifecycle", "✓", "✗", "✗", "✗"],
        ]}
        delay={30}
      />
    </AbsoluteFill>
  </SlideTransition>
);

const RoadmapScene: React.FC = () => (
  <SlideTransition direction="right">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 60 }}>
      <RoadmapTimeline
        title="8 Phases: Idea to IPO"
        phases={[
          { name: "Idea & Analysis", status: "complete" as const },
          { name: "Evidence & Validation", status: "complete" as const },
          { name: "MVP & Valuation", status: "current" as const },
          { name: "Equity & Cap Table", status: "current" as const },
          { name: "Tokenization", status: "complete" as const },
          { name: "Investment Tools", status: "current" as const },
          { name: "Revenue & Dividends", status: "planned" as const },
          { name: "Growth & Exit", status: "planned" as const },
        ]}
        staggerFrames={15}
      />
    </AbsoluteFill>
  </SlideTransition>
);

const TeamScene: React.FC = () => (
  <SlideTransition direction="up">
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 60 }}>
      <TeamOrg
        founderName="Do Van Long"
        companyInfo="Founder & CEO — Full-stack technical founder who built BlockID.au from zero to live product"
        members={[
          { role: "CTO", status: "AI Agent" },
          { role: "CFO", status: "AI Agent" },
          { role: "CMO", status: "AI Agent" },
          { role: "CPO", status: "AI Agent" },
          { role: "CRO", status: "AI Agent" },
          { role: "COO", status: "AI Agent" },
          { role: "CHRO", status: "AI Agent" },
          { role: "CLO", status: "AI Agent" },
          { role: "CISO", status: "AI Agent" },
          { role: "CDO", status: "AI Agent" },
          { role: "CBO", status: "AI Agent" },
        ]}
      />
    </AbsoluteFill>
  </SlideTransition>
);

const AskScene: React.FC = () => {
  const frame = useCurrentFrame();
  const amountOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const amountScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  const detailsOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: "clamp" });
  const ctaOpacity = interpolate(frame, [300, 330], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, justifyContent: "center", alignItems: "center" }}>
      <div style={{
        position: "absolute", width: 800, height: 800, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND.colors.brand500}25, transparent 70%)`,
        filter: "blur(100px)",
      }} />
      <div style={{ opacity: amountOpacity, transform: `scale(${amountScale})`, textAlign: "center" }}>
        <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 24, fontWeight: 500, color: BRAND.colors.brand500, letterSpacing: 4, marginBottom: 16 }}>
          PRE-SEED ROUND
        </div>
        <div style={{ fontFamily: BRAND.fonts.mono, fontSize: 96, fontWeight: 700, color: BRAND.colors.white }}>
          A$500K
        </div>
        <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.slate400, marginTop: 12 }}>
          12-month runway → A$250K ARR → 500 users
        </div>
      </div>
      <div style={{
        opacity: detailsOpacity, position: "absolute", bottom: 200,
        display: "flex", gap: 40,
      }}>
        {[
          { pct: "50%", label: "Engineering", color: BRAND.colors.brand500 },
          { pct: "20%", label: "Growth", color: BRAND.colors.emerald500 },
          { pct: "15%", label: "Operations", color: BRAND.colors.gold },
          { pct: "10%", label: "Legal & IP", color: BRAND.colors.slate400 },
          { pct: "5%", label: "Reserve", color: BRAND.colors.ink500 },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: BRAND.fonts.mono, fontSize: 32, fontWeight: 700, color: item.color }}>{item.pct}</div>
            <div style={{ fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.slate400 }}>{item.label}</div>
          </div>
        ))}
      </div>
      <div style={{
        opacity: ctaOpacity, position: "absolute", bottom: 60,
        textAlign: "center",
      }}>
        <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 28, fontWeight: 600, color: BRAND.colors.white, marginBottom: 12 }}>
          Every great company started exactly where we are.
        </div>
        <div style={{ fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.brand500 }}>
          Do Van Long — ceo@longcare.au — blockid.au — linkedin.com/in/dovanlong
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ─── Main Composition ────────────────────────────────────────────────── */

export const PitchAntler: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      <Sequence from={SCENES.title.from} durationInFrames={SCENES.title.dur} name="01-Title">
        <TitleScene />
      </Sequence>

      <Sequence from={SCENES.problem.from} durationInFrames={SCENES.problem.dur} name="02-Problem">
        <ProblemScene />
      </Sequence>

      <Sequence from={SCENES.ai.from} durationInFrames={SCENES.ai.dur} name="03-AI-Explosion">
        <AIExplosionScene />
      </Sequence>

      <Sequence from={SCENES.solution.from} durationInFrames={SCENES.solution.dur} name="04-Solution">
        <SolutionScene />
      </Sequence>

      <Sequence from={SCENES.howItWorks.from} durationInFrames={SCENES.howItWorks.dur} name="05-How-It-Works">
        <HowItWorksScene />
      </Sequence>

      <Sequence from={SCENES.market.from} durationInFrames={SCENES.market.dur} name="06-Market">
        <MarketScene />
      </Sequence>

      <Sequence from={SCENES.business.from} durationInFrames={SCENES.business.dur} name="07-Business-Model">
        <SlideTransition direction="left">
          <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950, padding: 80 }}>
            <TextReveal
              lines={["Land Free. Expand Paid.", "Grow with Founders."]}
              fontSize={44}
              color={BRAND.colors.white}
              staggerFrames={20}
            />
            <div style={{ position: "absolute", bottom: 120, left: 80, right: 80, display: "flex", gap: 32 }}>
              <StatCounter target={0} prefix="$" label="Free tier" color={BRAND.colors.slate400} duration={40} delay={30} />
              <StatCounter target={49} prefix="A$" label="Founding 50 lifetime" color={BRAND.colors.brand500} duration={40} delay={45} />
              <StatCounter target={99} prefix="A$" suffix="/mo" label="Growth plan" color={BRAND.colors.emerald500} duration={40} delay={60} />
              <StatCounter target={250} prefix="A$" suffix="K" label="Year 1 ARR target" color={BRAND.colors.gold} duration={40} delay={75} />
            </div>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      <Sequence from={SCENES.traction.from} durationInFrames={SCENES.traction.dur} name="08-Traction">
        <TractionScene />
      </Sequence>

      <Sequence from={SCENES.compete.from} durationInFrames={SCENES.compete.dur} name="09-Competition">
        <CompeteScene />
      </Sequence>

      <Sequence from={SCENES.roadmap.from} durationInFrames={SCENES.roadmap.dur} name="10-Roadmap">
        <RoadmapScene />
      </Sequence>

      <Sequence from={SCENES.team.from} durationInFrames={SCENES.team.dur} name="11-Team">
        <TeamScene />
      </Sequence>

      <Sequence from={SCENES.ask.from} durationInFrames={SCENES.ask.dur} name="12-The-Ask">
        <AskScene />
      </Sequence>
    </AbsoluteFill>
  );
};
