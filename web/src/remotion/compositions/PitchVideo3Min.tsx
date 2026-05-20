import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ComparisonTable } from "../components/ComparisonTable";
import { CTASlide } from "../components/CTASlide";
import { DropMic } from "../components/DropMic";
import { LogoReveal } from "../components/LogoReveal";
import { RoadmapTimeline } from "../components/RoadmapTimeline";
import { ScreenDemo } from "../components/ScreenDemo";
import { SlideTransition } from "../components/SlideTransition";
import { StatCounter } from "../components/StatCounter";
import { TAMCircles } from "../components/TAMCircles";
import { TeamOrg } from "../components/TeamOrg";
import { TextReveal } from "../components/TextReveal";
import { BRAND } from "../styles/brand";

/**
 * PitchVideo3Min — 3-minute pitch for Spacubed Fellowship + Google for Startups
 *
 * Timeline (30fps, 5400 total frames):
 *   Scene 1:  Opening Crisis       0:00 - 0:08  (frames 0-240)
 *   Scene 2:  Founder Intro        0:08 - 0:15  (frames 240-450)
 *   Scene 3:  3 Problems           0:15 - 0:30  (frames 450-900)
 *   Scene 4:  Live Demo — SVI      0:30 - 1:00  (frames 900-1800)
 *   Scene 5:  Actionable Report    1:00 - 1:20  (frames 1800-2400)
 *   Scene 6:  Evidence Vault       1:20 - 1:40  (frames 2400-3000)
 *   Scene 7:  Roadmap              1:40 - 2:00  (frames 3000-3600)
 *   Scene 8:  Market & Business    2:00 - 2:20  (frames 3600-4200)
 *   Scene 9:  Competitor Compare   2:20 - 2:35  (frames 4200-4650)
 *   Scene 10: Team & Compliance    2:35 - 2:50  (frames 4650-5100)
 *   Scene 11: Drop Mic             2:50 - 2:55  (frames 5100-5250)
 *   Scene 12: CTA                  2:55 - 3:00  (frames 5250-5400)
 */
export const PitchVideo3Min: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      {/* ============================================= */}
      {/* Scene 1: Opening Crisis (0:00-0:08 = 0-240)   */}
      {/* Dark bg, white text appearing one line at a time */}
      {/* ============================================= */}
      <Sequence from={0} durationInFrames={240}>
        <TextReveal
          lines={[
            "90% of startups fail.",
            "370,000 Australian businesses closed last year.",
            "$97 billion in AI funding. 90% still fail.",
            "The gap: AI builds products. Nothing builds businesses.",
          ]}
          staggerFrames={45}
          fontSize={48}
          color={BRAND.colors.white}
          fontWeight={600}
          source="ABS 2025, Stanford HAI, CB Insights"
        />
      </Sequence>

      {/* ============================================= */}
      {/* Scene 2: Founder Intro (0:08-0:15 = 240-450)  */}
      {/* ============================================= */}
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
              {/* Founder name */}
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
                  fontSize: 30,
                  fontWeight: 400,
                  color: BRAND.colors.slate300,
                  textAlign: "center",
                  lineHeight: 1.6,
                  maxWidth: 900,
                }}
              >
                {
                  "I\u2019ve seen founders build amazing AI products, then struggle to value them, split equity fairly, or get investor-ready."
                }
              </div>
            </div>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 3: 3 Problems We Solve (0:15-0:30 = 450-900) */}
      {/* ============================================= */}
      <Sequence from={450} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <AbsoluteFill>
            {/* Problem 1: How much is my idea worth? */}
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
                      color: BRAND.colors.brand400,
                      fontWeight: 600,
                    }}
                  >
                    PROBLEM 1
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
                    {'"How much is my idea worth?"'}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 60,
                      marginTop: 24,
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 28,
                          color: BRAND.colors.red400,
                          fontWeight: 600,
                        }}
                      >
                        A$5,000 - $50,000
                      </div>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 18,
                          color: BRAND.colors.slate400,
                        }}
                      >
                        Manual valuation, 2-6 weeks
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        color: BRAND.colors.slate400,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {"\u2192"}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 28,
                          color: BRAND.colors.emerald500,
                          fontWeight: 600,
                        }}
                      >
                        AI valuation in 60 seconds
                      </div>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 18,
                          color: BRAND.colors.slate400,
                        }}
                      >
                        From A$1
                      </div>
                    </div>
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>

            {/* Problem 2: How do I split equity? */}
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
                      color: BRAND.colors.brand400,
                      fontWeight: 600,
                    }}
                  >
                    PROBLEM 2
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
                    {'"How do I split equity?"'}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 60,
                      marginTop: 24,
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 28,
                          color: BRAND.colors.red400,
                          fontWeight: 600,
                        }}
                      >
                        42% of co-founder disputes
                      </div>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 18,
                          color: BRAND.colors.slate400,
                        }}
                      >
                        destroy startups (Noam Wasserman)
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        color: BRAND.colors.slate400,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {"\u2192"}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 28,
                          color: BRAND.colors.emerald500,
                          fontWeight: 600,
                        }}
                      >
                        Fair equity calculator
                      </div>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 18,
                          color: BRAND.colors.slate400,
                        }}
                      >
                        Based on contributions
                      </div>
                    </div>
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>

            {/* Problem 3: How do I get investor-ready? */}
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
                      color: BRAND.colors.brand400,
                      fontWeight: 600,
                    }}
                  >
                    PROBLEM 3
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
                    {'"How do I get investor-ready?"'}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 60,
                      marginTop: 24,
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 28,
                          color: BRAND.colors.red400,
                          fontWeight: 600,
                        }}
                      >
                        3-6 weeks data room prep
                      </div>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 18,
                          color: BRAND.colors.slate400,
                        }}
                      >
                        Manual process
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        color: BRAND.colors.slate400,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {"\u2192"}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 28,
                          color: BRAND.colors.emerald500,
                          fontWeight: 600,
                        }}
                      >
                        Evidence vault + auto-scored
                      </div>
                      <div
                        style={{
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 18,
                          color: BRAND.colors.slate400,
                        }}
                      >
                        Investor readiness
                      </div>
                    </div>
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 4: Live Demo - SVI (0:30-1:00 = 900-1800) */}
      {/* ============================================= */}
      <Sequence from={900} durationInFrames={900}>
        <SlideTransition durationInFrames={900}>
          <AbsoluteFill>
            {/* "Let me show you how BlockID works." */}
            <Sequence from={0} durationInFrames={75}>
              <TextReveal
                lines={["Let me show you how BlockID works."]}
                fontSize={52}
                color={BRAND.colors.white}
                fontWeight={600}
              />
            </Sequence>

            {/* Demo: Homepage + Search */}
            <Sequence from={60} durationInFrames={300}>
              <ScreenDemo
                url="blockid.au"
                descriptionLines={[
                  '[Homepage] "The agentic AI valuation platform"',
                  "[Search bar] Glowing border, ready for input",
                  '[User types] "An AI-powered recruitment platform for',
                  '  Australian SMEs using NLP to match candidates"',
                  '[Badge] "Idea Analysis" input type detected',
                  "[Enter email] user@example.com",
                ]}
              />
            </Sequence>

            {/* Demo: SSE Status + Results */}
            <Sequence from={340} durationInFrames={300}>
              <ScreenDemo
                url="blockid.au/dashboard/svi"
                descriptionLines={[
                  '[Click] "Get My SVI" button',
                  '[SSE] "Analyzing your input..."',
                  '[SSE] "Researching market size..."',
                  '[SSE] "Scanning competitors..."',
                  '[SSE] "Evaluating business model..."',
                  '[SSE] "Generating report..."',
                ]}
                status="Processing..."
              />
            </Sequence>

            {/* Demo: Report appears */}
            <Sequence from={620} durationInFrames={280}>
              <ScreenDemo
                url="blockid.au/dashboard/svi"
                descriptionLines={[
                  "[RESULT] SVI Score: 138 with gauge animation",
                  "[Scroll] Executive Summary \u2192 Market & Problem \u2192 Product",
                  "[10-page report] Market research, competitors, business model",
                  "[Actionable] Recommendations with next steps",
                ]}
                status="10-page AI analysis. All in under a minute."
              />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 5: Actionable Report (1:00-1:20 = 1800-2400) */}
      {/* ============================================= */}
      <Sequence from={1800} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* Zoom into recommendations */}
            <Sequence from={0} durationInFrames={300}>
              <ScreenDemo
                url="blockid.au/dashboard/svi"
                descriptionLines={[
                  "[Recommendations section]",
                  '[Action button] "Build your cap table \u2192"',
                  '[Action button] "Upload pitch deck \u2192"',
                  '[Click] "Build your cap table \u2192"',
                ]}
                status="Every recommendation links directly to a tool."
              />
            </Sequence>

            {/* Cap table demo */}
            <Sequence from={280} durationInFrames={320}>
              <ScreenDemo
                url="blockid.au/tools/cap-table"
                descriptionLines={[
                  "[Cap Table Tool] Equity split calculator opens",
                  "[Founder] 60% equity",
                  "[Co-founder] 30% equity",
                  "[ESOP Pool] 10% reserved",
                  "[Complete] Action completed \u2192 SVI auto-rescores",
                ]}
                status="SVI 138 \u2192 146 \u25B2 +8 points"
              />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 6: Evidence Vault (1:20-1:40 = 2400-3000) */}
      {/* ============================================= */}
      <Sequence from={2400} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* Evidence upload demo */}
            <Sequence from={0} durationInFrames={300}>
              <ScreenDemo
                url="blockid.au/workspace/evidence"
                descriptionLines={[
                  "[Evidence Vault] Upload documents page",
                  '[Upload] "pitch-deck.pdf" \u2192 processing...',
                  '[Toast] "SVI +5 points \u2192 New score: 151"',
                  '[Badge earned] "Pitch Ready" \u2728',
                ]}
                status="Each piece of verified evidence lifts your score."
              />
            </Sequence>

            {/* Connected services + dashboard */}
            <Sequence from={280} durationInFrames={320}>
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
                    Your startup&apos;s value grows with you
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 32,
                      marginTop: 16,
                    }}
                  >
                    {[
                      { name: "Stripe", desc: "Revenue data" },
                      { name: "GitHub", desc: "Code activity" },
                      { name: "Pitch Deck", desc: "Investor docs" },
                      { name: "Milestones", desc: "4 badges earned" },
                    ].map((item) => (
                      <div
                        key={item.name}
                        style={{
                          padding: "24px 32px",
                          borderRadius: 16,
                          backgroundColor: `${BRAND.colors.ink800}80`,
                          border: `1px solid ${BRAND.colors.brand500}30`,
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 22,
                            fontWeight: 600,
                            color: BRAND.colors.white,
                          }}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            fontFamily: BRAND.fonts.heading,
                            fontSize: 16,
                            color: BRAND.colors.slate400,
                            marginTop: 4,
                          }}
                        >
                          {item.desc}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* SVI trend line placeholder */}
                  <div
                    style={{
                      width: 800,
                      height: 120,
                      borderRadius: 12,
                      border: `1px dashed ${BRAND.colors.brand500}40`,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontFamily: BRAND.fonts.mono,
                      fontSize: 18,
                      color: BRAND.colors.slate400,
                      marginTop: 16,
                    }}
                  >
                    [Living Report Dashboard \u2014 SVI trend chart over time]
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 7: Roadmap (1:40-2:00 = 3000-3600)     */}
      {/* ============================================= */}
      <Sequence from={3000} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* "But we're just getting started." */}
            <Sequence from={0} durationInFrames={75}>
              <TextReveal
                lines={["But we\u2019re just getting started."]}
                fontSize={52}
                color={BRAND.colors.white}
                fontWeight={600}
              />
            </Sequence>

            {/* Animated roadmap */}
            <Sequence from={60} durationInFrames={420}>
              <RoadmapTimeline staggerFrames={15} />
            </Sequence>

            {/* Vision text */}
            <Sequence from={460} durationInFrames={140}>
              <TextReveal
                lines={[
                  "Equity tokenized on blockchain.",
                  "Automatic dividend distribution.",
                  "From idea to IPO \u2014 one platform.",
                ]}
                fontSize={36}
                staggerFrames={25}
                color={BRAND.colors.brand400}
                fontWeight={500}
              />
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 8: Market & Business (2:00-2:20 = 3600-4200) */}
      {/* ============================================= */}
      <Sequence from={3600} durationInFrames={600}>
        <SlideTransition durationInFrames={600}>
          <AbsoluteFill>
            {/* TAM/SAM/SOM circles */}
            <Sequence from={0} durationInFrames={360}>
              <TAMCircles />
            </Sequence>

            {/* Market stats */}
            <Sequence from={250} durationInFrames={120}>
              <AbsoluteFill
                style={{
                  justifyContent: "flex-end",
                  alignItems: "center",
                  paddingBottom: 80,
                }}
              >
                <div
                  style={{
                    fontFamily: BRAND.fonts.heading,
                    fontSize: 24,
                    color: BRAND.colors.slate300,
                    textAlign: "center",
                    lineHeight: 1.6,
                  }}
                >
                  2,600 active Australian startups \u00B7 300+ accelerators
                  \u00B7 15,000 angel investors
                </div>
              </AbsoluteFill>
            </Sequence>

            {/* Pricing */}
            <Sequence from={350} durationInFrames={250}>
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

                  <div
                    style={{
                      display: "flex",
                      gap: 24,
                    }}
                  >
                    {[
                      {
                        name: "Free",
                        price: "A$0",
                        desc: "First analysis",
                        highlight: false,
                      },
                      {
                        name: "Pay-per-report",
                        price: "A$1",
                        desc: "Early bird rate",
                        highlight: false,
                      },
                      {
                        name: "Founder",
                        price: "A$49",
                        desc: "100 credits, lifetime",
                        highlight: true,
                      },
                      {
                        name: "Growth",
                        price: "A$99/mo",
                        desc: "200 credits/month",
                        highlight: false,
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
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 9: Competitor Compare (2:20-2:35 = 4200-4650) */}
      {/* ============================================= */}
      <Sequence from={4200} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <ComparisonTable
            headers={["Carta", "Pulley", "Qapita", "BlockID"]}
            rows={[
              {
                feature: "AI Valuation",
                values: ["no", "no", "no", "yes"],
              },
              {
                feature: "AU-native",
                values: ["no", "no", "partial", "yes"],
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
                feature: "Blockchain equity",
                values: ["no", "no", "no", "yes"],
              },
            ]}
          />
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 10: Team & Compliance (2:35-2:50 = 4650-5100) */}
      {/* ============================================= */}
      <Sequence from={4650} durationInFrames={450}>
        <SlideTransition durationInFrames={450}>
          <AbsoluteFill>
            {/* Org chart */}
            <Sequence from={0} durationInFrames={300}>
              <TeamOrg />
            </Sequence>

            {/* AU Compliance section */}
            <Sequence from={280} durationInFrames={170}>
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
                    gap: 24,
                  }}
                >
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 42,
                      fontWeight: 700,
                      color: BRAND.colors.white,
                    }}
                  >
                    Built for Australian Compliance
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 32,
                      marginTop: 16,
                    }}
                  >
                    {[
                      "ASIC Registration",
                      "ESIC Tax Incentives",
                      "R&D Tax Offset",
                      "AU Data Residency",
                    ].map((item) => (
                      <div
                        key={item}
                        style={{
                          padding: "16px 24px",
                          borderRadius: 12,
                          backgroundColor: `${BRAND.colors.emerald500}10`,
                          border: `1px solid ${BRAND.colors.emerald500}30`,
                          fontFamily: BRAND.fonts.heading,
                          fontSize: 20,
                          fontWeight: 500,
                          color: BRAND.colors.emerald500,
                        }}
                      >
                        {"\u2713"} {item}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      fontFamily: BRAND.fonts.mono,
                      fontSize: 18,
                      color: BRAND.colors.slate400,
                      marginTop: 16,
                    }}
                  >
                    Auschain Pty Ltd (ACN 659 615 111) \u2014 Sydney, NSW,
                    Australia
                  </div>
                </div>
              </AbsoluteFill>
            </Sequence>
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ============================================= */}
      {/* Scene 11: Drop Mic (2:50-2:55 = 5100-5250)   */}
      {/* ============================================= */}
      <Sequence from={5100} durationInFrames={150}>
        <DropMic
          lines={[
            {
              text: "$252 billion invested in AI last year.",
              color: BRAND.colors.white,
              fontSize: 44,
              fontWeight: 600,
            },
            {
              text: "90% of those startups will fail.",
              color: BRAND.colors.red400,
              fontSize: 44,
              fontWeight: 600,
            },
            {
              text: "Not because of bad ideas.",
              color: BRAND.colors.slate300,
              fontSize: 40,
              fontWeight: 500,
            },
            {
              text: "Because nobody helped them prove their value.",
              color: BRAND.colors.white,
              fontSize: 40,
              fontWeight: 500,
            },
            {
              text: "Until now.",
              color: BRAND.colors.brand500,
              fontSize: 64,
              fontWeight: 700,
            },
          ]}
          beatFrames={25}
          delay={5}
        />
      </Sequence>

      {/* ============================================= */}
      {/* Scene 12: CTA (2:55-3:00 = 5250-5400)        */}
      {/* ============================================= */}
      <Sequence from={5250} durationInFrames={150}>
        <CTASlide
          founderName="Do Van Long"
          founderTitle="Founder & CEO"
          companyEntity="Auschain Pty Ltd"
          linkedIn="linkedin.com/in/dovanlong"
          ctaText="First analysis free. Start today."
          tagline="Where AI meets startup valuation"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
