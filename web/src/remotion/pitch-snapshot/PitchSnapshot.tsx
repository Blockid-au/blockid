/**
 * PitchSnapshot — 60-second "Pitch Snapshot" Remotion composition.
 *
 * 8 slides across 1800 frames @ 30fps:
 *   Slide 1 (0–120f)    : Cover — startup name + tagline + logo placeholder
 *   Slide 2 (120–360f)  : Problem statement
 *   Slide 3 (360–600f)  : Solution / product overview
 *   Slide 4 (600–840f)  : Market size (TAM / SAM / SOM)
 *   Slide 5 (840–1080f) : Traction / key metrics
 *   Slide 6 (1080–1320f): Team intro
 *   Slide 7 (1320–1560f): Ask / funding round
 *   Slide 8 (1560–1800f): CTA — blockid.au/startup/[slug]
 *
 * All fields have graceful fallbacks so the composition renders even when
 * the startup profile is sparse.
 */

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PitchSnapshotProps {
  startupName: string;
  tagline?: string | null;
  description?: string | null;
  /** Explicit problem statement; falls back to description. */
  problem?: string | null;
  solution?: string | null;
  sector?: string | null;
  stage?: string | null;
  tam?: string | null;
  sam?: string | null;
  som?: string | null;
  traction?: string | null;
  team?: string | null;
  ask?: string | null;
  /** URL slug for the CTA slide, e.g. "acme-ai" → blockid.au/startup/acme-ai */
  slug?: string | null;
  sviScore?: number | null;
  sviGrade?: string | null;
}

// ── Frame constants ─────────────────────────────────────────────────────────

const S = {
  cover:    { from: 0,    dur: 120 },  // 0:00 – 0:04
  problem:  { from: 120,  dur: 240 },  // 0:04 – 0:12
  solution: { from: 360,  dur: 240 },  // 0:12 – 0:20
  market:   { from: 600,  dur: 240 },  // 0:20 – 0:28
  traction: { from: 840,  dur: 240 },  // 0:28 – 0:36
  team:     { from: 1080, dur: 240 },  // 0:36 – 0:44
  ask:      { from: 1320, dur: 240 },  // 0:44 – 0:52
  cta:      { from: 1560, dur: 240 },  // 0:52 – 1:00
} as const;

// ── Shared animation helpers ────────────────────────────────────────────────

function useFadeSlide(
  slideFrame: number,
  totalDur: number,
  { fadeIn = 15, fadeOut = 12 }: { fadeIn?: number; fadeOut?: number } = {},
): { opacity: number; translateY: number } {
  const opacity = interpolate(
    slideFrame,
    [0, fadeIn, totalDur - fadeOut, totalDur],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const translateY = interpolate(slideFrame, [0, fadeIn], [32, 0], {
    extrapolateRight: "clamp",
  });
  return { opacity, translateY };
}

// ── Layout / brand primitives ───────────────────────────────────────────────

const C = {
  bg: BRAND.colors.ink950,       // #0B1220
  surface: BRAND.colors.ink900,  // #0F172A
  card: BRAND.colors.ink800,     // #172033
  cyan: "#00D4FF",               // brand accent
  brand: BRAND.colors.brand500,  // #3B7DD8
  white: BRAND.colors.white,
  slate: BRAND.colors.slate300,
  gold: BRAND.colors.gold400,
  emerald: BRAND.colors.emerald500,
};

const T = BRAND.fonts.heading;

// Shared page wrapper
const Slide: React.FC<{
  children: React.ReactNode;
  bg?: string;
}> = ({ children, bg = C.bg }) => (
  <AbsoluteFill style={{ backgroundColor: bg, fontFamily: T }}>
    {children}
  </AbsoluteFill>
);

// Slide-level animated wrapper
const AnimatedSlide: React.FC<{
  children: React.ReactNode;
  frame: number;
  dur: number;
}> = ({ children, frame, dur }) => {
  const { opacity, translateY } = useFadeSlide(frame, dur);
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px 120px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
};

// Pill label
const Label: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = C.cyan,
}) => (
  <span
    style={{
      fontFamily: T,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
      color,
      marginBottom: 24,
    }}
  >
    {children}
  </span>
);

// Heading
const Heading: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  align?: React.CSSProperties["textAlign"];
}> = ({ children, size = 72, color = C.white, align = "center" }) => (
  <h1
    style={{
      fontFamily: T,
      fontSize: size,
      fontWeight: 800,
      color,
      margin: 0,
      lineHeight: 1.1,
      textAlign: align,
    }}
  >
    {children}
  </h1>
);

// Body text
const Body: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  align?: React.CSSProperties["textAlign"];
}> = ({ children, size = 38, color = C.slate, align = "center" }) => (
  <p
    style={{
      fontFamily: T,
      fontSize: size,
      fontWeight: 400,
      color,
      margin: 0,
      lineHeight: 1.55,
      textAlign: align,
    }}
  >
    {children}
  </p>
);

// Divider
const Divider: React.FC<{ color?: string; mb?: number; mt?: number }> = ({
  color = C.cyan,
  mb = 32,
  mt = 32,
}) => (
  <div
    style={{
      width: 80,
      height: 4,
      borderRadius: 2,
      backgroundColor: color,
      marginTop: mt,
      marginBottom: mb,
    }}
  />
);

// Metric row
const MetricRow: React.FC<{
  label: string;
  value: string;
  color?: string;
}> = ({ label, value, color = C.cyan }) => (
  <div
    style={{
      display: "flex",
      alignItems: "baseline",
      gap: 20,
      marginBottom: 28,
    }}
  >
    <span
      style={{
        fontFamily: T,
        fontSize: 28,
        fontWeight: 700,
        color,
        minWidth: 240,
        textAlign: "right",
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: T,
        fontSize: 34,
        fontWeight: 500,
        color: C.white,
      }}
    >
      {value}
    </span>
  </div>
);

// ── Slide 1: Cover ──────────────────────────────────────────────────────────

const CoverSlide: React.FC<{
  frame: number;
  name: string;
  tagline: string;
  sector: string;
  sviScore: number | null;
  sviGrade: string | null;
}> = ({ frame, name, tagline, sector, sviScore, sviGrade }) => {
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 55, mass: 1 } });
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const taglineY = interpolate(frame, [30, 55], [24, 0], { extrapolateRight: "clamp" });
  const glowOpacity = interpolate(frame, [10, 50, 90, 120], [0, 0.6, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const badgeOpacity = interpolate(frame, [55, 80], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Slide bg={C.bg}>
      {/* Cyan glow blob */}
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.cyan}40 0%, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(80px)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Logo placeholder / startup name */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Logo box */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.brand} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
            boxShadow: `0 0 48px ${C.cyan}60`,
          }}
        >
          <span
            style={{
              fontFamily: T,
              fontSize: 56,
              fontWeight: 900,
              color: C.white,
              letterSpacing: "-2px",
            }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        </div>

        <Heading size={96}>{name}</Heading>

        {/* Tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
          }}
        >
          <Divider />
          <Body size={42} color={C.slate}>
            {tagline}
          </Body>

          {/* Sector pill */}
          <div style={{ display: "flex", gap: 16, marginTop: 36, opacity: badgeOpacity }}>
            {sector && (
              <span
                style={{
                  fontFamily: T,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.bg,
                  backgroundColor: C.cyan,
                  padding: "8px 24px",
                  borderRadius: 100,
                }}
              >
                {sector}
              </span>
            )}
            {sviScore != null && (
              <span
                style={{
                  fontFamily: T,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.bg,
                  backgroundColor: C.gold,
                  padding: "8px 24px",
                  borderRadius: 100,
                }}
              >
                SVI {sviScore} {sviGrade ? `(${sviGrade})` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* blockid.au watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 36,
          right: 60,
          fontFamily: T,
          fontSize: 22,
          color: C.brand,
          opacity: 0.7,
          fontWeight: 600,
        }}
      >
        blockid.au
      </div>
    </Slide>
  );
};

// ── Slide 2: Problem ────────────────────────────────────────────────────────

const ProblemSlide: React.FC<{ frame: number; problem: string }> = ({
  frame,
  problem,
}) => {
  const { opacity, translateY } = useFadeSlide(frame, S.problem.dur);

  return (
    <Slide>
      {/* Red accent top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: `linear-gradient(90deg, #F87171 0%, #EF4444 100%)`,
          opacity,
        }}
      />
      <AnimatedSlide frame={frame} dur={S.problem.dur}>
        <Label color="#F87171">The Problem</Label>
        <Heading size={68}>{problem}</Heading>
      </AnimatedSlide>
    </Slide>
  );
};

// ── Slide 3: Solution ───────────────────────────────────────────────────────

const SolutionSlide: React.FC<{ frame: number; solution: string }> = ({
  frame,
  solution,
}) => (
  <Slide>
    {/* Cyan accent top bar */}
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: `linear-gradient(90deg, ${C.cyan} 0%, ${C.brand} 100%)`,
      }}
    />
    <AnimatedSlide frame={frame} dur={S.solution.dur}>
      <Label color={C.cyan}>The Solution</Label>
      <Heading size={64}>{solution}</Heading>
    </AnimatedSlide>
  </Slide>
);

// ── Slide 4: Market ─────────────────────────────────────────────────────────

const MarketSlide: React.FC<{
  frame: number;
  tam: string;
  sam: string;
  som: string;
}> = ({ frame, tam, sam, som }) => {
  const { fps } = useVideoConfig();

  // Each circle pops in sequence
  const tamScale = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 14, stiffness: 60 } });
  const samScale = spring({ frame: Math.max(0, frame - 30), fps, config: { damping: 14, stiffness: 60 } });
  const somScale = spring({ frame: Math.max(0, frame - 50), fps, config: { damping: 14, stiffness: 60 } });

  const { opacity } = useFadeSlide(frame, S.market.dur);

  return (
    <Slide>
      <div
        style={{
          opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "60px 120px",
          boxSizing: "border-box",
        }}
      >
        <Label color={C.gold}>Market Opportunity</Label>

        {/* Concentric circles */}
        <div style={{ position: "relative", width: 800, height: 500 }}>
          {/* TAM */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${tamScale})`,
              width: 480,
              height: 480,
              borderRadius: "50%",
              border: `3px solid ${C.slate}40`,
              backgroundColor: `${C.slate}08`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ position: "absolute", top: 16, textAlign: "center" }}>
              <div style={{ fontFamily: T, fontSize: 22, color: C.slate, fontWeight: 600 }}>TAM</div>
              <div style={{ fontFamily: T, fontSize: 24, color: C.white, fontWeight: 700 }}>{tam}</div>
            </div>
          </div>

          {/* SAM */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${samScale})`,
              width: 320,
              height: 320,
              borderRadius: "50%",
              border: `3px solid ${C.brand}60`,
              backgroundColor: `${C.brand}10`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ position: "absolute", top: 16, textAlign: "center" }}>
              <div style={{ fontFamily: T, fontSize: 20, color: C.brand, fontWeight: 600 }}>SAM</div>
              <div style={{ fontFamily: T, fontSize: 22, color: C.white, fontWeight: 700 }}>{sam}</div>
            </div>
          </div>

          {/* SOM */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${somScale})`,
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: `3px solid ${C.cyan}`,
              backgroundColor: `${C.cyan}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 32px ${C.cyan}40`,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T, fontSize: 18, color: C.cyan, fontWeight: 700 }}>SOM</div>
              <div style={{ fontFamily: T, fontSize: 20, color: C.white, fontWeight: 700 }}>{som}</div>
            </div>
          </div>
        </div>
      </div>
    </Slide>
  );
};

// ── Slide 5: Traction ───────────────────────────────────────────────────────

const TractionSlide: React.FC<{ frame: number; traction: string }> = ({
  frame,
  traction,
}) => (
  <Slide>
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: `linear-gradient(90deg, ${C.emerald} 0%, #059669 100%)`,
      }}
    />
    <AnimatedSlide frame={frame} dur={S.traction.dur}>
      <Label color={C.emerald}>Traction</Label>
      <Heading size={64}>{traction}</Heading>
    </AnimatedSlide>
  </Slide>
);

// ── Slide 6: Team ───────────────────────────────────────────────────────────

const TeamSlide: React.FC<{ frame: number; team: string }> = ({
  frame,
  team,
}) => (
  <Slide>
    <AnimatedSlide frame={frame} dur={S.team.dur}>
      <Label color={C.brand}>The Team</Label>
      <Heading size={64}>{team}</Heading>
    </AnimatedSlide>
  </Slide>
);

// ── Slide 7: Ask ────────────────────────────────────────────────────────────

const AskSlide: React.FC<{ frame: number; ask: string; stage: string }> = ({
  frame,
  ask,
  stage,
}) => {
  const { opacity, translateY } = useFadeSlide(frame, S.ask.dur);

  return (
    <Slide>
      {/* Gold accent top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: `linear-gradient(90deg, ${C.gold} 0%, #F59E0B 100%)`,
          opacity,
        }}
      />
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "60px 120px",
          boxSizing: "border-box",
          gap: 0,
        }}
      >
        <Label color={C.gold}>The Ask</Label>
        {stage && (
          <span
            style={{
              fontFamily: T,
              fontSize: 26,
              fontWeight: 700,
              color: C.bg,
              backgroundColor: C.gold,
              padding: "8px 28px",
              borderRadius: 100,
              marginBottom: 32,
            }}
          >
            {stage} Round
          </span>
        )}
        <Heading size={64}>{ask}</Heading>
      </div>
    </Slide>
  );
};

// ── Slide 8: CTA ────────────────────────────────────────────────────────────

const CTASlideComp: React.FC<{
  frame: number;
  name: string;
  slug: string;
}> = ({ frame, name, slug }) => {
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 14, stiffness: 60 } });
  const textOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [30, 60], [24, 0], { extrapolateRight: "clamp" });
  const glowOpacity = interpolate(frame, [0, 60, 180, 240], [0, 0.5, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const url = `blockid.au/startup/${slug || ""}`;

  return (
    <Slide bg={C.bg}>
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.cyan}30 0%, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(80px)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 0,
        }}
      >
        {/* Brand logo */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.brand} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
              boxShadow: `0 0 40px ${C.cyan}50`,
            }}
          >
            <span
              style={{
                fontFamily: T,
                fontSize: 48,
                fontWeight: 900,
                color: C.white,
                letterSpacing: "-2px",
              }}
            >
              B
            </span>
          </div>

          <span
            style={{
              fontFamily: T,
              fontSize: 52,
              fontWeight: 800,
              color: C.white,
              letterSpacing: "-1px",
            }}
          >
            blockid.au
          </span>
        </div>

        {/* Text block */}
        <div
          style={{
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 40,
          }}
        >
          <Divider color={C.cyan} />
          <Body size={34} color={C.slate}>
            See the full profile for{" "}
            <span style={{ color: C.white, fontWeight: 700 }}>{name}</span>
          </Body>
          <div
            style={{
              marginTop: 28,
              fontFamily: T,
              fontSize: 40,
              fontWeight: 700,
              color: C.cyan,
              letterSpacing: "-0.5px",
            }}
          >
            {url}
          </div>

          <Body size={24} color={`${C.slate}80`} align="center">
            Powered by BlockID Startup Index™ · blockid.au
          </Body>
        </div>
      </div>
    </Slide>
  );
};

// ── Main composition ─────────────────────────────────────────────────────────

export const PitchSnapshot: React.FC<PitchSnapshotProps> = (props) => {
  const {
    startupName,
    tagline,
    description,
    problem,
    solution,
    sector,
    stage,
    tam,
    sam,
    som,
    traction,
    team,
    ask,
    slug,
    sviScore,
    sviGrade,
  } = props;

  // Graceful fallbacks
  const name = startupName || "Your Startup";
  const taglineText = tagline || description || "Building the future";
  const problemText =
    problem ||
    description ||
    "Founders face enormous challenges: high failure rates, expensive due-diligence, and no clear way to track startup health.";
  const solutionText =
    solution ||
    "A comprehensive AI-powered platform that helps founders validate, value, and fund their startup — all in one place.";
  const tamText = tam || "Large addressable market";
  const samText = sam || "Served addressable market";
  const somText = som || "Obtainable market share";
  const tractionText = traction || "Early traction underway. Join us.";
  const teamText = team || "Experienced founders with domain expertise.";
  const askText = ask || "Raising a funding round to accelerate growth.";
  const stageText = stage || "Seed";
  const sectorText = sector || "";
  const slugText = slug || "";

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: T }}>
      {/* Slide 1 — Cover */}
      <Sequence from={S.cover.from} durationInFrames={S.cover.dur}>
        <CoverSlide
          frame={0}  // frame resets inside each Sequence
          name={name}
          tagline={taglineText}
          sector={sectorText}
          sviScore={sviScore ?? null}
          sviGrade={sviGrade ?? null}
        />
      </Sequence>

      {/* Slide 2 — Problem */}
      <Sequence from={S.problem.from} durationInFrames={S.problem.dur}>
        <ProblemInner problem={problemText} />
      </Sequence>

      {/* Slide 3 — Solution */}
      <Sequence from={S.solution.from} durationInFrames={S.solution.dur}>
        <SolutionInner solution={solutionText} />
      </Sequence>

      {/* Slide 4 — Market */}
      <Sequence from={S.market.from} durationInFrames={S.market.dur}>
        <MarketInner tam={tamText} sam={samText} som={somText} />
      </Sequence>

      {/* Slide 5 — Traction */}
      <Sequence from={S.traction.from} durationInFrames={S.traction.dur}>
        <TractionInner traction={tractionText} />
      </Sequence>

      {/* Slide 6 — Team */}
      <Sequence from={S.team.from} durationInFrames={S.team.dur}>
        <TeamInner team={teamText} />
      </Sequence>

      {/* Slide 7 — Ask */}
      <Sequence from={S.ask.from} durationInFrames={S.ask.dur}>
        <AskInner ask={askText} stage={stageText} />
      </Sequence>

      {/* Slide 8 — CTA */}
      <Sequence from={S.cta.from} durationInFrames={S.cta.dur}>
        <CTAInner name={name} slug={slugText} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Inner wrappers (use useCurrentFrame inside each Sequence) ───────────────

const ProblemInner: React.FC<{ problem: string }> = ({ problem }) => {
  const frame = useCurrentFrame();
  return <ProblemSlide frame={frame} problem={problem} />;
};

const SolutionInner: React.FC<{ solution: string }> = ({ solution }) => {
  const frame = useCurrentFrame();
  return <SolutionSlide frame={frame} solution={solution} />;
};

const MarketInner: React.FC<{ tam: string; sam: string; som: string }> = ({
  tam,
  sam,
  som,
}) => {
  const frame = useCurrentFrame();
  return <MarketSlide frame={frame} tam={tam} sam={sam} som={som} />;
};

const TractionInner: React.FC<{ traction: string }> = ({ traction }) => {
  const frame = useCurrentFrame();
  return <TractionSlide frame={frame} traction={traction} />;
};

const TeamInner: React.FC<{ team: string }> = ({ team }) => {
  const frame = useCurrentFrame();
  return <TeamSlide frame={frame} team={team} />;
};

const AskInner: React.FC<{ ask: string; stage: string }> = ({ ask, stage }) => {
  const frame = useCurrentFrame();
  return <AskSlide frame={frame} ask={ask} stage={stage} />;
};

const CTAInner: React.FC<{ name: string; slug: string }> = ({ name, slug }) => {
  const frame = useCurrentFrame();
  return <CTASlideComp frame={frame} name={name} slug={slug} />;
};
