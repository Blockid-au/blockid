import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile } from "remotion";
import { ComparisonTable } from "../components/ComparisonTable";
import { DropMic } from "../components/DropMic";
import { FlowDiagram } from "../components/FlowDiagram";
import { ScreenDemo } from "../components/ScreenDemo";
import { SlideTransition } from "../components/SlideTransition";
import { StatCounter } from "../components/StatCounter";
import { Subtitle } from "../components/Subtitle";
import { TAMCircles } from "../components/TAMCircles";
import { TeamOrg } from "../components/TeamOrg";
import { BRAND } from "../styles/brand";

/**
 * PitchVideo3Min — 3-minute pitch video for Spacubed Fellowship + Google for Startups
 *
 * Professional storytelling structure:
 *   Act 1: Hook & Problem (0:00 - 0:30)
 *     Scene 1:  Hook — crisis stat         0:00 - 0:08  (frames 0-240)
 *     Scene 2:  Founder intro              0:08 - 0:15  (frames 240-450)
 *     Scene 3:  Three pain points          0:15 - 0:30  (frames 450-900)
 *
 *   Act 2: Solution & Demo (0:30 - 1:40)
 *     Scene 4:  The Solution (BlockID)     0:30 - 1:00  (frames 900-1800)
 *     Scene 5:  The Report                 1:00 - 1:20  (frames 1800-2400)
 *     Scene 6:  Evidence Vault             1:20 - 1:40  (frames 2400-3000)
 *
 *   Act 3: Traction & Market (1:40 - 2:35)
 *     Scene 7:  Growth Roadmap             1:40 - 2:00  (frames 3000-3600)
 *     Scene 8:  Market Opportunity         2:00 - 2:20  (frames 3600-4200)
 *     Scene 9:  Why Us                     2:20 - 2:35  (frames 4200-4650)
 *
 *   Act 4: Team & Close (2:35 - 3:00)
 *     Scene 10: The Team                   2:35 - 2:50  (frames 4650-5100)
 *     Scene 11: Drop Mic                   2:50 - 2:55  (frames 5100-5250)
 *     Scene 12: CTA + QR                   2:55 - 3:00  (frames 5250-5400)
 *
 * 30fps, 5400 total frames
 */
export const PitchVideo3Min: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* AUDIO — one clip per scene / sub-scene                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Scene 1: Hook */}
      <Sequence from={0}>
        <Audio src={staticFile("video-assets/audio/3min-final/01.mp3")} />
      </Sequence>
      {/* Scene 2: Founder */}
      <Sequence from={240}>
        <Audio src={staticFile("video-assets/audio/3min-final/02.mp3")} />
      </Sequence>
      {/* Scene 3a: Problem 1 */}
      <Sequence from={450}>
        <Audio src={staticFile("video-assets/audio/3min-final/03.mp3")} />
      </Sequence>
      {/* Scene 3b: Problem 2 */}
      <Sequence from={600}>
        <Audio src={staticFile("video-assets/audio/3min-final/04.mp3")} />
      </Sequence>
      {/* Scene 3c: Problem 3 */}
      <Sequence from={750}>
        <Audio src={staticFile("video-assets/audio/3min-final/05.mp3")} />
      </Sequence>
      {/* Scene 4a: Introducing BlockID */}
      <Sequence from={900}>
        <Audio src={staticFile("video-assets/audio/3min-final/06.mp3")} />
      </Sequence>
      {/* Scene 4b: Describe your startup */}
      <Sequence from={960}>
        <Audio src={staticFile("video-assets/audio/3min-final/07.mp3")} />
      </Sequence>
      {/* Scene 4c: 8 dimensions */}
      <Sequence from={1240}>
        <Audio src={staticFile("video-assets/audio/3min-final/08.mp3")} />
      </Sequence>
      {/* Scene 4d: Not just a number */}
      <Sequence from={1520}>
        <Audio src={staticFile("video-assets/audio/3min-final/09.mp3")} />
      </Sequence>
      {/* Scene 5: Report */}
      <Sequence from={1800}>
        <Audio src={staticFile("video-assets/audio/3min-final/10.mp3")} />
      </Sequence>
      {/* Scene 6: Evidence Vault */}
      <Sequence from={2400}>
        <Audio src={staticFile("video-assets/audio/3min-final/11.mp3")} />
      </Sequence>
      {/* Scene 7: Roadmap */}
      <Sequence from={3000}>
        <Audio src={staticFile("video-assets/audio/3min-final/12.mp3")} />
      </Sequence>
      {/* Scene 8: Market */}
      <Sequence from={3600}>
        <Audio src={staticFile("video-assets/audio/3min-final/13.mp3")} />
      </Sequence>
      {/* Scene 9: Why Us */}
      <Sequence from={4200}>
        <Audio src={staticFile("video-assets/audio/3min-final/14.mp3")} />
      </Sequence>
      {/* Scene 10: Team */}
      <Sequence from={4650}>
        <Audio src={staticFile("video-assets/audio/3min-final/15.mp3")} />
      </Sequence>
      {/* Scene 12: CTA */}
      <Sequence from={5250}>
        <Audio src={staticFile("video-assets/audio/3min-final/16.mp3")} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 1: HOOK & PROBLEM (0:00 - 0:30)                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 1: Hook (0:00-0:08, frames 0-240) ─────────────────── */}
      <Sequence from={0} durationInFrames={240}>
        <AbsoluteFill>
          <StatCounter
            target={90}
            suffix="%"
            label="of startups fail. Most don't know why until it's too late."
            color="red"
            duration={60}
            source="CB Insights, Stanford HAI 2024"
          />
          <Subtitle text="90% of startups fail. Most don't know why until it's too late." />
        </AbsoluteFill>
      </Sequence>

      {/* ─── Scene 2: The Founder (0:08-0:15, frames 240-450) ────────── */}
      <Sequence from={240} durationInFrames={210}>
        <SlideTransition durationInFrames={210}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              padding: "0 160px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 24,
              }}
            >
              <div
                style={{
                  fontFamily: BRAND.fonts.heading,
                  fontSize: 56,
                  fontWeight: 700,
                  color: BRAND.colors.white,
                }}
              >
                Do Van Long
              </div>
              <div
                style={{
                  fontFamily: BRAND.fonts.heading,
                  fontSize: 28,
                  color: BRAND.colors.brand400,
                }}
              >
                Founder & CEO, BlockID.au
              </div>

              <div
                style={{
                  width: 120,
                  height: 2,
                  backgroundColor: BRAND.colors.brand500,
                  marginTop: 8,
                  marginBottom: 8,
                }}
              />

              <div
                style={{
                  fontFamily: BRAND.fonts.heading,
                  fontSize: 26,
                  fontWeight: 400,
                  color: BRAND.colors.slate300,
                  textAlign: "center",
                  lineHeight: 1.6,
                  maxWidth: 900,
                }}
              >
                Executive Management | Digital Transformation | Agentic AI
              </div>
            </div>
          </AbsoluteFill>
          <Subtitle text="I've watched founders build incredible products, then lose it all at the cap table." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 3: Three Pain Points (0:15-0:30, frames 450-900) ── */}
      <Sequence from={450} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <AbsoluteFill>
            {/* Problem 1 (frames 0-150 local) */}
            <Sequence from={0} durationInFrames={150}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0 120px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 20,
                    maxWidth: 1000,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.mono,
                      fontSize: 18,
                      color: BRAND.colors.red400,
                      fontWeight: 600,
                    }}
                  >
                    PROBLEM 1
                  </div>
                  <div
                    style={{
                      fontSize: 72,
                      lineHeight: 1,
                      marginBottom: 8,
                    }}
                  >
                    {"\uD83D\uDCB0"}
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 48,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                      textAlign: "center",
                    }}
                  >
                    {'"How much is my startup worth?"'}
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 24,
                      color: BRAND.colors.slate400,
                      textAlign: "center",
                      marginTop: 12,
                    }}
                  >
                    Manual valuation: A$5,000 - $50,000 | 2-6 weeks
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Problem 1: Founders can't answer the most basic investor question." />
            </Sequence>

            {/* Problem 2 (frames 150-300 local) */}
            <Sequence from={150} durationInFrames={150}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0 120px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 20,
                    maxWidth: 1000,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.mono,
                      fontSize: 18,
                      color: BRAND.colors.red400,
                      fontWeight: 600,
                    }}
                  >
                    PROBLEM 2
                  </div>
                  <div
                    style={{
                      fontSize: 72,
                      lineHeight: 1,
                      marginBottom: 8,
                    }}
                  >
                    {"\uD83D\uDCC4"}
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 48,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                      textAlign: "center",
                    }}
                  >
                    {'"Who owns what?"'}
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 24,
                      color: BRAND.colors.slate400,
                      textAlign: "center",
                      marginTop: 12,
                    }}
                  >
                    42% of co-founder disputes destroy startups
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Problem 2: Equity splits done on napkins. Vesting? Never heard of it." />
            </Sequence>

            {/* Problem 3 (frames 300-450 local) */}
            <Sequence from={300} durationInFrames={150}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0 120px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 20,
                    maxWidth: 1000,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.mono,
                      fontSize: 18,
                      color: BRAND.colors.red400,
                      fontWeight: 600,
                    }}
                  >
                    PROBLEM 3
                  </div>
                  <div
                    style={{
                      fontSize: 72,
                      lineHeight: 1,
                      marginBottom: 8,
                    }}
                  >
                    {"\u23F0"}
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 48,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                      textAlign: "center",
                    }}
                  >
                    {'"When will I be investor-ready?"'}
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 24,
                      color: BRAND.colors.slate400,
                      textAlign: "center",
                      marginTop: 12,
                    }}
                  >
                    You need Carta + a lawyer + a spreadsheet
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Problem 3: No single platform. You need Carta, a lawyer, and a spreadsheet." />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 2: SOLUTION & DEMO (0:30 - 1:40)                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 4: The Solution (0:30-1:00, frames 900-1800) ──────── */}
      <Sequence from={900} durationInFrames={900}>
        <SlideTransition durationInFrames={900}>
          <AbsoluteFill>
            {/* Sub 4a: Logo reveal (2s = 60 frames) */}
            <Sequence from={0} durationInFrames={60}>
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
                    gap: 20,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 72,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                    }}
                  >
                    Block
                    <span style={{ color: BRAND.colors.brand500 }}>ID</span>
                    <span
                      style={{ color: BRAND.colors.slate400, fontSize: 48 }}
                    >
                      .au
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 28,
                      color: BRAND.colors.brand400,
                    }}
                  >
                    The AI valuation platform for Australian founders
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Introducing BlockID — the AI valuation platform for Australian founders." />
            </Sequence>

            {/* Sub 4b: Homepage screenshot (9s = 270 frames) */}
            <Sequence from={60} durationInFrames={280}>
              <ScreenDemo
                url="blockid.au"
                imageSrc="video-assets/homepage-hero.png"
                descriptionLines={[
                  "The agentic AI valuation platform",
                  "Search bar ready for input",
                ]}
                status="Describe your startup in plain text. Any language. Any stage."
              />
              <Subtitle text="Describe your startup in plain text. Any language. Any stage." />
            </Sequence>

            {/* Sub 4c: SVI Search result (9s = 280 frames) */}
            <Sequence from={340} durationInFrames={280}>
              <ScreenDemo
                url="blockid.au/dashboard/svi"
                imageSrc="video-assets/svi-search.png"
                descriptionLines={[
                  "AI analyzes across 8 dimensions",
                  "SVI Score gauge animating",
                ]}
                status="8 dimensions. 60 seconds. Evidence-backed."
              />
              <Subtitle text="8 dimensions. 60 seconds. Your Startup Value Index — evidence-backed." />
            </Sequence>

            {/* Sub 4d: Score page detail (9s = 280 frames) */}
            <Sequence from={620} durationInFrames={280}>
              <ScreenDemo
                url="blockid.au/dashboard/svi"
                imageSrc="video-assets/score-page.png"
                descriptionLines={[
                  "Complete diagnostic with actions",
                  "10-page report generated",
                ]}
                status="Not just a number — a complete diagnostic."
              />
              <Subtitle text="Not just a number. A complete diagnostic with specific actions." />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 5: The Report (1:00-1:20, frames 1800-2400) ──────── */}
      <Sequence from={1800} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* Report page with navigation */}
            <Sequence from={0} durationInFrames={300}>
              <ScreenDemo
                url="blockid.au/dashboard/svi/report"
                imageSrc="video-assets/09-score.png"
                descriptionLines={[
                  "10-page guided report",
                  "Market | Product | Traction | Cap Table",
                ]}
                status="Market. Product. Traction. Cap table. All scored."
              />
              <Subtitle text="A 10-page guided report. Market. Product. Traction. Cap table. All scored." />
            </Sequence>

            {/* PDF download + sharing */}
            <Sequence from={300} durationInFrames={300}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0 120px",
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
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 42,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                      textAlign: "center",
                    }}
                  >
                    Share with anyone
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 32,
                      marginTop: 16,
                    }}
                  >
                    {[
                      { icon: "\uD83D\uDCC4", label: "Download PDF" },
                      { icon: "\uD83D\uDCE7", label: "Email co-founders" },
                      { icon: "\uD83D\uDD17", label: "Share with investors" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: "28px 36px",
                          borderRadius: 16,
                          backgroundColor: `${BRAND.colors.ink800}80`,
                          border: `1px solid ${BRAND.colors.brand500}30`,
                          textAlign: "center",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div style={{ fontSize: 48 }}>{item.icon}</div>
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 22,
                            fontWeight: 500,
                            color: BRAND.colors.white,
                          }}
                        >
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Download as PDF. Email to co-founders. Share with investors." />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 6: Evidence Vault (1:20-1:40, frames 2400-3000) ──── */}
      <Sequence from={2400} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* Evidence upload screenshot */}
            <Sequence from={0} durationInFrames={300}>
              <ScreenDemo
                url="blockid.au/workspace/evidence"
                imageSrc="video-assets/evidence-vault.png"
                descriptionLines={[
                  "Evidence Vault — upload & verify",
                  "Pitch decks, GitHub, Stripe connected",
                ]}
                status="Upload pitch decks. Connect GitHub. Verify revenue."
              />
              <Subtitle text="Upload pitch decks. Connect GitHub. Verify revenue through Stripe." />
            </Sequence>

            {/* Confidence bar animation */}
            <Sequence from={300} durationInFrames={300}>
              <AbsoluteFill
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "0 120px",
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
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 42,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                      textAlign: "center",
                    }}
                  >
                    Your score grows with evidence
                  </div>

                  {/* Confidence progression */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      marginTop: 16,
                    }}
                  >
                    {[
                      { score: "20%", label: "Self-declared", color: BRAND.colors.red400 },
                      { score: "50%", label: "+ Pitch Deck", color: BRAND.colors.gold400 },
                      { score: "75%", label: "+ Revenue", color: BRAND.colors.brand400 },
                      { score: "90%", label: "Verified", color: BRAND.colors.emerald500 },
                    ].map((step, i) => (
                      <React.Fragment key={step.label}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 8,
                            padding: "24px 28px",
                            borderRadius: 16,
                            backgroundColor: `${step.color}12`,
                            border: `2px solid ${step.color}60`,
                          }}
                        >
                          <div
                            style={{
                              fontFamily: BRAND.fonts.mono,
                              fontSize: 36,
                              fontWeight: 700,
                              color: step.color,
                            }}
                          >
                            {step.score}
                          </div>
                          <div
                            style={{
                              fontFamily: BRAND.fonts.heading,
                              fontSize: 16,
                              color: BRAND.colors.slate300,
                            }}
                          >
                            {step.label}
                          </div>
                        </div>
                        {i < 3 && (
                          <div
                            style={{
                              fontSize: 28,
                              color: BRAND.colors.brand400,
                              fontWeight: 700,
                            }}
                          >
                            {"\u2192"}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Every piece of evidence lifts your score. From self-declared to verified." />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 3: TRACTION & MARKET (1:40 - 2:35)                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 7: Growth Roadmap (1:40-2:00, frames 3000-3600) ──── */}
      <Sequence from={3000} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* FlowDiagram — 10 steps */}
            <Sequence from={0} durationInFrames={600}>
              <FlowDiagram
                title="From idea to investor — one platform"
                steps={[
                  { icon: "\uD83D\uDCA1", label: "Validate", sublabel: "AI scoring" },
                  { icon: "\uD83D\uDCCA", label: "Cap Table", sublabel: "Equity splits" },
                  { icon: "\uD83D\uDCDD", label: "Data Room", sublabel: "Evidence vault" },
                  { icon: "\u2696\uFE0F", label: "Compliance", sublabel: "ASIC + ESIC" },
                  { icon: "\uD83D\uDE80", label: "Raise", sublabel: "Investor-ready" },
                ]}
              />
            </Sequence>
            <Subtitle text="10 steps from idea to investor. Cap table. Equity. Data room. Compliance." />
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 8: Market Opportunity (2:00-2:20, frames 3600-4200) ─ */}
      <Sequence from={3600} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* TAM/SAM/SOM circles */}
            <Sequence from={0} durationInFrames={300}>
              <TAMCircles />
              <Subtitle text="600,000 Australian companies. 50,000 raising capital. Zero AI platforms." />
            </Sequence>

            {/* Pricing cards */}
            <Sequence from={300} durationInFrames={300}>
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
                    gap: 24,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 42,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                      marginBottom: 16,
                    }}
                  >
                    Pricing
                  </div>

                  <div style={{ display: "flex", gap: 24 }}>
                    {[
                      {
                        name: "Free",
                        price: "A$0",
                        desc: "First analysis",
                        highlight: false,
                      },
                      {
                        name: "Per Report",
                        price: "A$1",
                        desc: "Pay as you go",
                        highlight: false,
                      },
                      {
                        name: "Founder",
                        price: "A$49",
                        desc: "Lifetime access",
                        highlight: true,
                      },
                    ].map((plan) => (
                      <div
                        key={plan.name}
                        style={{
                          padding: "28px 36px",
                          borderRadius: 16,
                          backgroundColor: plan.highlight
                            ? `${BRAND.colors.brand500}15`
                            : `${BRAND.colors.ink800}80`,
                          border: `2px solid ${
                            plan.highlight
                              ? BRAND.colors.brand500
                              : `${BRAND.colors.slate400}20`
                          }`,
                          textAlign: "center",
                          minWidth: 200,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 18,
                            color: BRAND.colors.slate400,
                            marginBottom: 8,
                          }}
                        >
                          {plan.name}
                        </div>
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 36,
                            fontWeight: 700,
                            color: plan.highlight
                              ? BRAND.colors.brand500
                              : BRAND.colors.white,
                          }}
                        >
                          {plan.price}
                        </div>
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 16,
                            color: BRAND.colors.slate400,
                            marginTop: 4,
                          }}
                        >
                          {plan.desc}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      fontFamily: BRAND.fonts.mono,
                      fontSize: 20,
                      color: BRAND.colors.emerald500,
                      marginTop: 12,
                    }}
                  >
                    88%+ gross margins
                  </div>
                </div>
              </AbsoluteFill>
              <Subtitle text="Free trial. $1 per analysis. $49 lifetime account. 88%+ gross margins." />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 9: Why Us (2:20-2:35, frames 4200-4650) ──────────── */}
      <Sequence from={4200} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <ComparisonTable
            title="Built for Australia"
            headers={["Carta", "Pulley", "AI Tools", "BlockID"]}
            rows={[
              {
                feature: "AI Valuation",
                values: ["no", "no", "partial", "yes"],
              },
              {
                feature: "AU-native (ABN, ASIC)",
                values: ["no", "no", "no", "yes"],
              },
              {
                feature: "Day 0 to Exit",
                values: ["no", "no", "no", "yes"],
              },
              {
                feature: "From A$1",
                values: ["no", "no", "no", "yes"],
              },
              {
                feature: "ESIC + R&D Tax",
                values: ["no", "no", "no", "yes"],
              },
            ]}
          />
          <Subtitle text="Built for Australia. ABN. ASIC. ESIC. R&D tax. Not an afterthought." />
        </SlideTransition>
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 4: TEAM & CLOSE (2:35 - 3:00)                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 10: The Team (2:35-2:50, frames 4650-5100) ─────── */}
      <Sequence from={4650} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <TeamOrg />
          <Subtitle text="One founder. Eight AI agents. 272 files. 70 APIs. Built in 19 days." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 11: Drop Mic (2:50-2:55, frames 5100-5250) ──────── */}
      <Sequence from={5100} durationInFrames={150}>
        <DropMic
          lines={[
            {
              text: "We don't just talk about AI.",
              color: BRAND.colors.slate300,
              fontSize: 44,
              fontWeight: 600,
            },
            {
              text: "We ARE AI-native.",
              color: BRAND.colors.brand500,
              fontSize: 64,
              fontWeight: 700,
            },
          ]}
          beatFrames={40}
          delay={10}
        />
        <Subtitle text="We don't just talk about AI. We ARE AI-native." />
      </Sequence>

      {/* ─── Scene 12: CTA + QR (2:55-3:00, frames 5250-5400) ──────── */}
      <Sequence from={5250} durationInFrames={150}>
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
              CEO & Founder — BlockID.au
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 14,
                color: BRAND.colors.slate400,
                marginTop: 4,
              }}
            >
              Auschain Pty Ltd (ACN 659 615 111) — linkedin.com/in/dovanlong
            </div>

            {/* CTA Button */}
            <div
              style={{
                marginTop: 12,
                fontFamily: BRAND.fonts.heading,
                fontSize: 24,
                fontWeight: 600,
                color: BRAND.colors.white,
                backgroundColor: BRAND.colors.brand500,
                padding: "14px 42px",
                borderRadius: 12,
              }}
            >
              Get your free SVI at blockid.au
            </div>
          </div>
        </AbsoluteFill>
        <Subtitle text="Get your free SVI at blockid.au" />
      </Sequence>
    </AbsoluteFill>
  );
};
