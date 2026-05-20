import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { CTASlide } from "../components/CTASlide";
import { DropMic } from "../components/DropMic";
import { LogoReveal } from "../components/LogoReveal";
import { ScreenDemo } from "../components/ScreenDemo";
import { SlideTransition } from "../components/SlideTransition";
import { StatCounter } from "../components/StatCounter";
import { TAMCircles } from "../components/TAMCircles";
import { TextReveal } from "../components/TextReveal";
import { BRAND } from "../styles/brand";

/**
 * PitchVideo1Min — 60-second pitch for Google for Startups
 *
 * Timeline (30fps):
 *   Scene 1: Logo Reveal          0:00 - 0:03  (frames 0-90)
 *   Scene 2: Problem Stats        0:03 - 0:10  (frames 90-300)
 *   Scene 3: AI Explosion          0:10 - 0:18  (frames 300-540)
 *   Scene 4: The Gap              0:18 - 0:25  (frames 540-750)
 *   Scene 5: Live Demo            0:25 - 0:40  (frames 750-1200)
 *   Scene 6: Features Montage    0:40 - 0:50  (frames 1200-1500)
 *   Scene 7: Market (TAM)        0:50 - 0:55  (frames 1500-1650)
 *   Scene 8: Drop Mic            0:55 - 0:58  (frames 1650-1740)
 *   Scene 9: CTA                  0:58 - 1:00  (frames 1740-1800)
 */
export const PitchVideo1Min: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      {/* ============================================= */}
      {/* Scene 1: Logo Reveal (0:00 - 0:03 = 0-90)    */}
      {/* ============================================= */}
      <Sequence from={0} durationInFrames={90}>
        <LogoReveal />
      </Sequence>

      {/* ============================================= */}
      {/* Scene 2: Problem Stats (0:03 - 0:10 = 90-300) */}
      {/* ============================================= */}
      <Sequence from={90} durationInFrames={210}>
        <SlideTransition durationInFrames={210}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* "90% of startups fail" — appears immediately */}
            <Sequence from={0} durationInFrames={120}>
              <StatCounter
                target={90}
                suffix="%"
                label="of startups fail"
                color="red"
                source="Failory 2026"
                duration={40}
              />
            </Sequence>

            {/* AU business churn — appears after 3s (90 frames relative) */}
            <Sequence from={90} durationInFrames={120}>
              <AbsoluteFill>
                <StatCounter
                  target={370}
                  suffix=",000"
                  label="Australian businesses closed last year"
                  color="red"
                  source="ABS June 2025 — 437,150 started vs 370,500 closed"
                  duration={40}
                  formatNumber={false}
                />
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 3: AI Explosion (0:10 - 0:18 = 300-540) */}
      {/* ============================================= */}
      <Sequence from={300} durationInFrames={240}>
        <SlideTransition durationInFrames={240}>
          <AbsoluteFill>
            {/* "$97 billion poured into AI startups in 2024" */}
            <Sequence from={0} durationInFrames={130}>
              <StatCounter
                target={97}
                prefix="$"
                suffix="B"
                label="poured into AI startups in 2024 alone"
                color="gold"
                source="Second Talent — 34% of all VC funding"
                duration={40}
                formatNumber={false}
              />
            </Sequence>

            {/* "90% of AI startups still fail. 18 months median." */}
            <Sequence from={110} durationInFrames={130}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 32,
                  }}
                >
                  <StatCounter
                    target={90}
                    suffix="%"
                    label="of AI startups still fail"
                    color="red"
                    duration={30}
                  />
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 4: The Gap (0:18 - 0:25 = 540-750)     */}
      {/* ============================================= */}
      <Sequence from={540} durationInFrames={210}>
        <SlideTransition durationInFrames={210}>
          <AbsoluteFill>
            {/* "AI can build products. But it can't value them." */}
            <Sequence from={0} durationInFrames={120}>
              <TextReveal
                lines={[
                  "AI can build products.",
                  "But it can\u2019t value them.",
                  "It can\u2019t split equity.",
                  "It can\u2019t prepare for investors.",
                ]}
                fontSize={44}
                staggerFrames={25}
                color={BRAND.colors.slate300}
                fontWeight={500}
              />
            </Sequence>

            {/* "Manual valuation costs $5K-$50K" */}
            <Sequence from={110} durationInFrames={100}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 56,
                      fontWeight: 700,
                      color: BRAND.colors.red400,
                    }}
                  >
                    A$5,000 \u2013 $50,000
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 28,
                      color: BRAND.colors.slate300,
                    }}
                  >
                    Manual valuation cost. Takes 2\u20136 weeks.
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 5: Live Demo (0:25 - 0:40 = 750-1200)  */}
      {/* ============================================= */}
      <Sequence from={750} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <AbsoluteFill>
            {/* "BlockID changes this." text */}
            <Sequence from={0} durationInFrames={60}>
              <TextReveal
                lines={["BlockID changes this."]}
                fontSize={64}
                color={BRAND.colors.brand500}
                fontWeight={700}
              />
            </Sequence>

            {/* Browser demo mockup */}
            <Sequence from={50} durationInFrames={400}>
              <ScreenDemo
                url="blockid.au"
                descriptionLines={[
                  '[LIVE DEMO] User types: "An AI platform for Australian property management"',
                  '[Input detected] "Idea Analysis" badge appears',
                  '[Click] "Get My SVI" button',
                  '[SSE Status] "Researching market..." "Analyzing competition..."',
                  "[Result] SVI Report appears: Score 142 \u25B2",
                  "[Scroll] 10-page AI analysis in 60 seconds",
                ]}
                status="AI-powered valuation in 60 seconds. From Day 0."
              />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 6: Features Montage (0:40 - 0:50 = 1200-1500) */}
      {/* ============================================= */}
      <Sequence from={1200} durationInFrames={300}>
        <SlideTransition durationInFrames={300}>
          <AbsoluteFill>
            {/* "One platform. Entire lifecycle." */}
            <Sequence from={0} durationInFrames={60}>
              <TextReveal
                lines={["One platform.", "Entire lifecycle."]}
                fontSize={56}
                staggerFrames={20}
                color={BRAND.colors.white}
                fontWeight={700}
              />
            </Sequence>

            {/* Flow diagram text */}
            <Sequence from={50} durationInFrames={100}>
              <TextReveal
                lines={[
                  "Idea \u2192 [Validates] \u2192 MVP \u2192 [Tracks Value] \u2192 Fundraise",
                  "\u2192 [Cap Table] \u2192 Growth \u2192 [Tokenize Equity] \u2192 Exit",
                ]}
                fontSize={32}
                staggerFrames={25}
                color={BRAND.colors.brand400}
                fontWeight={500}
              />
            </Sequence>

            {/* Feature cards */}
            <Sequence from={140} durationInFrames={160}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 24,
                    maxWidth: 1000,
                    width: "100%",
                    padding: "0 120px",
                  }}
                >
                  {[
                    {
                      title: "Evidence Vault",
                      desc: "Upload docs \u2192 SVI +8 points",
                      icon: "\uD83D\uDCC2",
                    },
                    {
                      title: "Cap Table Tool",
                      desc: "Fair equity split calculator",
                      icon: "\uD83D\uDCCA",
                    },
                    {
                      title: "Milestone Badges",
                      desc: "Track progress visually",
                      icon: "\uD83C\uDFC5",
                    },
                    {
                      title: "Living Report",
                      desc: "Dashboard that grows with you",
                      icon: "\uD83D\uDCCB",
                    },
                  ].map((feature, idx) => (
                    <div
                      key={feature.title}
                      style={{
                        padding: "24px 28px",
                        borderRadius: 16,
                        backgroundColor: `${BRAND.colors.ink800}80`,
                        border: `1px solid ${BRAND.colors.brand500}30`,
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}
                    >
                      <div style={{ fontSize: 36 }}>{feature.icon}</div>
                      <div>
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 24,
                            fontWeight: 600,
                            color: BRAND.colors.white,
                          }}
                        >
                          {feature.title}
                        </div>
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 16,
                            color: BRAND.colors.slate300,
                          }}
                        >
                          {feature.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 7: Market / TAM (0:50 - 0:55 = 1500-1650) */}
      {/* ============================================= */}
      <Sequence from={1500} durationInFrames={150}>
        <SlideTransition durationInFrames={150}>
          <TAMCircles />
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 8: Drop Mic (0:55 - 0:58 = 1650-1740)  */}
      {/* ============================================= */}
      <Sequence from={1650} durationInFrames={90}>
        <DropMic
          lines={[
            {
              text: "AI builds products.",
              color: BRAND.colors.slate300,
              fontSize: 48,
              fontWeight: 500,
            },
            {
              text: "BlockID builds businesses.",
              color: BRAND.colors.brand500,
              fontSize: 64,
              fontWeight: 700,
            },
          ]}
          beatFrames={35}
          delay={5}
        />
      </Sequence>

      {/* ============================================= */}
      {/* Scene 9: CTA (0:58 - 1:00 = 1740-1800)       */}
      {/* ============================================= */}
      <Sequence from={1740} durationInFrames={60}>
        <CTASlide
          ctaText="Try free: blockid.au"
          tagline="Where AI meets startup valuation"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
