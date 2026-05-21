import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile } from "remotion";
import { CTASlide } from "../components/CTASlide";
import { DropMic } from "../components/DropMic";
import { FlowDiagram } from "../components/FlowDiagram";
import { LogoReveal } from "../components/LogoReveal";
import { MetricsGrid } from "../components/MetricsGrid";
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
      {/* Voiceover audio — one clip per scene */}
      <Sequence from={0}><Audio src={staticFile("video-assets/audio/1min-final/01.mp3")} /></Sequence>
      <Sequence from={90}><Audio src={staticFile("video-assets/audio/1min-final/02.mp3")} /></Sequence>
      <Sequence from={300}><Audio src={staticFile("video-assets/audio/1min-final/03.mp3")} /></Sequence>
      <Sequence from={540}><Audio src={staticFile("video-assets/audio/1min-final/04.mp3")} /></Sequence>
      <Sequence from={750}><Audio src={staticFile("video-assets/audio/1min-final/05.mp3")} /></Sequence>
      <Sequence from={1200}><Audio src={staticFile("video-assets/audio/1min-final/06.mp3")} /></Sequence>
      <Sequence from={1500}><Audio src={staticFile("video-assets/audio/1min-final/07.mp3")} /></Sequence>
      <Sequence from={1650}><Audio src={staticFile("video-assets/audio/1min-final/08.mp3")} /></Sequence>
      <Sequence from={1740}><Audio src={staticFile("video-assets/audio/1min-final/09.mp3")} /></Sequence>

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

            {/* Browser demo: Homepage */}
            <Sequence from={50} durationInFrames={130}>
              <ScreenDemo
                url="blockid.au"
                imageSrc="video-assets/homepage-hero.png"
                descriptionLines={[
                  '[Homepage] "The agentic AI valuation platform"',
                ]}
                status="Describe your startup. Get an AI valuation in 60 seconds."
              />
            </Sequence>

            {/* Browser demo: SVI Search */}
            <Sequence from={170} durationInFrames={120}>
              <ScreenDemo
                url="blockid.au"
                imageSrc="video-assets/svi-search.png"
                descriptionLines={[
                  '[User types] "An AI platform for Australian property management"',
                ]}
                status="AI analyzes across 8 dimensions in real time."
              />
            </Sequence>

            {/* Browser demo: Score page */}
            <Sequence from={280} durationInFrames={170}>
              <ScreenDemo
                url="blockid.au/dashboard/svi"
                imageSrc="video-assets/score-page.png"
                descriptionLines={[
                  "[Result] SVI Score with 10-page AI analysis",
                ]}
                status="AI-powered valuation in 60 seconds. From Day Zero."
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

            {/* Flow diagram — animated lifecycle */}
            <Sequence from={50} durationInFrames={100}>
              <FlowDiagram
                steps={[
                  { icon: "\uD83D\uDCA1", label: "Idea", sublabel: "Validate" },
                  { icon: "\uD83D\uDE80", label: "MVP", sublabel: "Track value" },
                  { icon: "\uD83D\uDCB0", label: "Fundraise", sublabel: "Cap table" },
                  { icon: "\uD83D\uDCC8", label: "Growth", sublabel: "Tokenize" },
                  { icon: "\uD83C\uDFC6", label: "Exit", sublabel: "IPO ready" },
                ]}
              />
            </Sequence>

            {/* Feature screenshots: Cap Table */}
            <Sequence from={140} durationInFrames={80}>
              <ScreenDemo
                url="blockid.au/tools/cap-table"
                imageSrc="video-assets/cap-table.png"
                descriptionLines={["Cap Table Tool — fair equity split"]}
                status="Evidence Vault, Cap Table, Milestones, Living Report"
              />
            </Sequence>

            {/* Feature screenshots: Dashboard */}
            <Sequence from={210} durationInFrames={90}>
              <ScreenDemo
                url="blockid.au/dashboard"
                imageSrc="video-assets/08-dashboard.png"
                descriptionLines={["Living dashboard that grows with you"]}
                status="Your startup's value — tracked continuously"
              />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 7: Market / TAM (0:50 - 0:55 = 1500-1650) */}
      {/* ============================================= */}
      <Sequence from={1500} durationInFrames={150}>
        <SlideTransition durationInFrames={150}>
          <AbsoluteFill>
            {/* TAM/SAM/SOM circles */}
            <Sequence from={0} durationInFrames={90}>
              <TAMCircles />
            </Sequence>

            {/* Market metrics with animated counters */}
            <Sequence from={75} durationInFrames={75}>
              <MetricsGrid
                metrics={[
                  {
                    label: "Active AU startups",
                    value: 2600,
                    color: "brand",
                  },
                  {
                    label: "AI valuation platforms",
                    value: 0,
                    color: "red",
                  },
                ]}
                columns={2}
              />
            </Sequence>
          </AbsoluteFill>
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
        <AbsoluteFill
          style={{
            backgroundColor: BRAND.colors.ink950,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            {/* Logo */}
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 56,
                fontWeight: 700,
                color: BRAND.colors.white,
              }}
            >
              Block
              <span style={{ color: BRAND.colors.brand500 }}>ID</span>
              <span style={{ color: BRAND.colors.slate400, fontSize: 36 }}>
                .au
              </span>
            </div>

            {/* QR Code */}
            <Img
              src={staticFile("video-assets/qr-contact.png")}
              style={{ width: 200, height: 200, borderRadius: 8 }}
            />

            {/* Founder info */}
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 28,
                fontWeight: 600,
                color: BRAND.colors.white,
              }}
            >
              Do Van Long
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 20,
                color: BRAND.colors.brand400,
              }}
            >
              CEO &amp; Founder — BlockID.au
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 16,
                color: BRAND.colors.slate400,
              }}
            >
              Executive Management | Digital Transformation | Agentic AI
            </div>

            {/* CTA */}
            <div
              style={{
                marginTop: 8,
                fontFamily: BRAND.fonts.heading,
                fontSize: 22,
                fontWeight: 600,
                color: BRAND.colors.white,
                backgroundColor: BRAND.colors.brand500,
                padding: "12px 36px",
                borderRadius: 10,
              }}
            >
              Try free: blockid.au
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
