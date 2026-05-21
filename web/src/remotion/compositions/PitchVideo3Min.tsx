import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile } from "remotion";
import { ComparisonTable } from "../components/ComparisonTable";
import { FlowDiagram } from "../components/FlowDiagram";
import { ScreenDemo } from "../components/ScreenDemo";
import { SlideTransition } from "../components/SlideTransition";
import { StatCounter } from "../components/StatCounter";
import { Subtitle } from "../components/Subtitle";
import { TAMCircles } from "../components/TAMCircles";
import { TeamOrg } from "../components/TeamOrg";
import { BRAND } from "../styles/brand";

/**
 * PitchVideo3Min — 3-minute pitch video (voice-led timeline)
 *
 * PRINCIPLE: Voice clips play at natural speed. Video scenes expand/contract
 * to match each voice clip's actual duration. 0.3s (9 frame) gap between clips.
 *
 * Voice clip durations (actual measured):
 *   01.mp3: 10.7s  →  321 frames   Scene 1:  Hook
 *   02.mp3: 10.9s  →  327 frames   Scene 2:  Founder
 *   03.mp3: 11.2s  →  336 frames   Scene 3a: Problem 1
 *   04.mp3:  8.7s  →  261 frames   Scene 3b: Problem 2
 *   05.mp3:  9.2s  →  276 frames   Scene 3c: Problem 3
 *   06.mp3:  8.6s  →  258 frames   Scene 4a: Demo intro
 *   07.mp3: 12.3s  →  369 frames   Scene 4b: Demo search
 *   08.mp3: 16.4s  →  492 frames   Scene 4c: Demo results
 *   09.mp3:  9.1s  →  273 frames   Scene 4d: Demo actions
 *   10.mp3: 16.0s  →  480 frames   Scene 5:  Report
 *   11.mp3: 12.7s  →  381 frames   Scene 6:  Evidence
 *   12.mp3: 15.0s  →  450 frames   Scene 7:  Roadmap
 *   13.mp3: 14.9s  →  447 frames   Scene 8:  Market
 *   14.mp3: 13.3s  →  399 frames   Scene 9:  Competitors
 *   15.mp3: 12.6s  →  378 frames   Scene 10: Team
 *   16.mp3:  8.0s  →  240 frames   Scene 12: CTA
 *
 * Frame timeline (30fps, 9-frame gaps):
 *   Scene 1:  frame    0 –  329  (330 frames)  01.mp3
 *   Scene 2:  frame  338 –  674  (337 frames)  02.mp3
 *   Scene 3a: frame  683 – 1019  (337 frames)  03.mp3
 *   Scene 3b: frame 1028 – 1289  (262 frames)  04.mp3
 *   Scene 3c: frame 1298 – 1574  (277 frames)  05.mp3
 *   Scene 4a: frame 1583 – 1841  (259 frames)  06.mp3
 *   Scene 4b: frame 1850 – 2218  (369 frames)  07.mp3
 *   Scene 4c: frame 2227 – 2719  (493 frames)  08.mp3
 *   Scene 4d: frame 2728 – 3001  (274 frames)  09.mp3
 *   Scene 5:  frame 3010 – 3490  (481 frames)  10.mp3
 *   Scene 6:  frame 3499 – 3880  (382 frames)  11.mp3
 *   Scene 7:  frame 3889 – 4339  (451 frames)  12.mp3
 *   Scene 8:  frame 4348 – 4795  (448 frames)  13.mp3
 *   Scene 9:  frame 4804 – 5203  (400 frames)  14.mp3
 *   Scene 10: frame 5212 – 5590  (379 frames)  15.mp3
 *   Scene 12: frame 5599 – 5850  (252 frames)  16.mp3
 *
 * Total: 5850 frames = 195s @ 30fps
 */
export const PitchVideo3Min: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.ink950 }}>
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* AUDIO — one clip per scene, placed at exact start frame           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Sequence from={0}>
        <Audio src={staticFile("video-assets/audio/3min-final/01.mp3")} />
      </Sequence>
      <Sequence from={338}>
        <Audio src={staticFile("video-assets/audio/3min-final/02.mp3")} />
      </Sequence>
      <Sequence from={683}>
        <Audio src={staticFile("video-assets/audio/3min-final/03.mp3")} />
      </Sequence>
      <Sequence from={1028}>
        <Audio src={staticFile("video-assets/audio/3min-final/04.mp3")} />
      </Sequence>
      <Sequence from={1298}>
        <Audio src={staticFile("video-assets/audio/3min-final/05.mp3")} />
      </Sequence>
      <Sequence from={1583}>
        <Audio src={staticFile("video-assets/audio/3min-final/06.mp3")} />
      </Sequence>
      <Sequence from={1850}>
        <Audio src={staticFile("video-assets/audio/3min-final/07.mp3")} />
      </Sequence>
      <Sequence from={2227}>
        <Audio src={staticFile("video-assets/audio/3min-final/08.mp3")} />
      </Sequence>
      <Sequence from={2728}>
        <Audio src={staticFile("video-assets/audio/3min-final/09.mp3")} />
      </Sequence>
      <Sequence from={3010}>
        <Audio src={staticFile("video-assets/audio/3min-final/10.mp3")} />
      </Sequence>
      <Sequence from={3499}>
        <Audio src={staticFile("video-assets/audio/3min-final/11.mp3")} />
      </Sequence>
      <Sequence from={3889}>
        <Audio src={staticFile("video-assets/audio/3min-final/12.mp3")} />
      </Sequence>
      <Sequence from={4348}>
        <Audio src={staticFile("video-assets/audio/3min-final/13.mp3")} />
      </Sequence>
      <Sequence from={4804}>
        <Audio src={staticFile("video-assets/audio/3min-final/14.mp3")} />
      </Sequence>
      <Sequence from={5212}>
        <Audio src={staticFile("video-assets/audio/3min-final/15.mp3")} />
      </Sequence>
      <Sequence from={5599}>
        <Audio src={staticFile("video-assets/audio/3min-final/16.mp3")} />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 1: HOOK & PROBLEM (0:00 – 0:52)                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 1: Hook (frames 0–329, 330 frames = 11s) ────────────── */}
      <Sequence from={0} durationInFrames={330}>
        <AbsoluteFill>
          <StatCounter
            target={90}
            suffix="%"
            label="of startups fail. Most don't know why until it's too late."
            color="red"
            duration={60}
            source="CB Insights, Stanford HAI 2024"
          />
          <Subtitle text="90% of startups fail. AI builds products. Nothing builds businesses." />
        </AbsoluteFill>
      </Sequence>

      {/* ─── Scene 2: Founder (frames 338–674, 337 frames ≈ 11.2s) ────── */}
      <Sequence from={338} durationInFrames={337}>
        <SlideTransition durationInFrames={337}>
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
          <Subtitle text="I'm Do Van Long. 15 years in digital transformation. I built BlockID to fix this." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 3a: Problem 1 (frames 683–1019, 337 frames ≈ 11.2s) ── */}
      <Sequence from={683} durationInFrames={337}>
        <SlideTransition durationInFrames={337}>
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
          <Subtitle text="Problem 1: What is your startup worth? Most founders can't answer." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 3b: Problem 2 (frames 1028–1289, 262 frames ≈ 8.7s) ── */}
      <Sequence from={1028} durationInFrames={262}>
        <SlideTransition durationInFrames={262}>
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
          <Subtitle text="Problem 2: Equity on napkins. No vesting. No SHA." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 3c: Problem 3 (frames 1298–1574, 277 frames ≈ 9.2s) ── */}
      <Sequence from={1298} durationInFrames={277}>
        <SlideTransition durationInFrames={277}>
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
                You need Carta + a lawyer + a spreadsheet + an accountant
              </div>
            </div>
          </AbsoluteFill>
          <Subtitle text="Problem 3: No single platform. Carta + lawyer + spreadsheet + accountant." />
        </SlideTransition>
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 2: SOLUTION & DEMO (0:53 – 1:56)                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 4a: Demo intro (frames 1583–1841, 259 frames ≈ 8.6s) ─ */}
      <Sequence from={1583} durationInFrames={259}>
        <SlideTransition durationInFrames={259}>
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
                Real example: HelpNow.au — AI community support platform
              </div>
            </div>
          </AbsoluteFill>
          <Subtitle text='Real example: HelpNow.au — AI community support platform.' />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 4b: Demo typing (frames 1850–2218, 369 frames ≈ 12.3s) */}
      <Sequence from={1850} durationInFrames={369}>
        <SlideTransition durationInFrames={369}>
          <ScreenDemo
            url="blockid.au"
            imageSrc="video-assets/helpnow-03-typed.png"
            descriptionLines={[
              "Two-sided marketplace",
              "Working MVP with council pilots",
              "ABN registered, raising $500K",
            ]}
            status="Describe your startup in plain text. Two-sided marketplace. MVP. ABN. 3 council pilots."
          />
          <Subtitle text="Two-sided marketplace. MVP. ABN. 3 council pilots. Raising $500K." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 4c: Demo results (frames 2227–2719, 493 frames ≈ 16.4s) */}
      <Sequence from={2227} durationInFrames={493}>
        <SlideTransition durationInFrames={493}>
          <ScreenDemo
            url="blockid.au/dashboard/svi"
            imageSrc="video-assets/helpnow-06-results.png"
            descriptionLines={[
              "HelpNow.au — SVI Score: 67",
              "Investor Readiness: 95/100",
            ]}
            status="8 dimensions. 60 seconds. SVI: 67. Investor Readiness: 95/100."
          />
          <Subtitle text="8 dimensions. 60 seconds. SVI: 67. Investor Readiness: 95/100." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 4d: Demo actions (frames 2728–3001, 274 frames ≈ 9.1s) */}
      <Sequence from={2728} durationInFrames={274}>
        <SlideTransition durationInFrames={274}>
          <ScreenDemo
            url="blockid.au/dashboard/svi"
            imageSrc="video-assets/helpnow-07-results-detail.png"
            descriptionLines={[
              "8 dimensions scored",
              "Specific actions to improve each one",
            ]}
            status="Specific actions: cap table, trademark, connect revenue data."
          />
          <Subtitle text="Specific actions: cap table, trademark, connect revenue data." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 5: Report (frames 3010–3490, 481 frames ≈ 16.0s) ───── */}
      <Sequence from={3010} durationInFrames={481}>
        <SlideTransition durationInFrames={481}>
          <ScreenDemo
            url="blockid.au/dashboard/svi/report"
            imageSrc="video-assets/helpnow-07-results-detail.png"
            descriptionLines={[
              "10-page guided report",
              "Market | Product | Cap table | Risk | Action plan",
            ]}
            status="10-page report. Market. Product. Cap table. Risk. Action plan. PDF export."
          />
          <Subtitle text="10-page report. Market. Product. Cap table. Risk. Action plan. PDF export." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 6: Evidence (frames 3499–3880, 382 frames ≈ 12.7s) ─── */}
      <Sequence from={3499} durationInFrames={382}>
        <SlideTransition durationInFrames={382}>
          <AbsoluteFill>
            {/* Evidence Vault — first half */}
            <Sequence from={0} durationInFrames={191}>
              <ScreenDemo
                url="blockid.au/workspace/evidence"
                imageSrc="video-assets/helpnow-11-evidence.png"
                descriptionLines={[
                  "Evidence Vault — upload & verify",
                  "Upload documents. Track completion.",
                ]}
                status="Evidence Vault and Data Room. Upload, verify, confidence lifts."
              />
            </Sequence>

            {/* Data Room — second half */}
            <Sequence from={191} durationInFrames={191}>
              <ScreenDemo
                url="blockid.au/workspace/data-room"
                imageSrc="video-assets/helpnow-12-dataroom.png"
                descriptionLines={[
                  "Data Room checklist",
                  "Every piece of proof lifts the score",
                ]}
                status="From self-declared to verified. Confidence 20% to 90%."
              />
            </Sequence>
          </AbsoluteFill>
          <Subtitle text="Evidence Vault + Data Room. Upload → verify → confidence 20% to 90%." />
        </SlideTransition>
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 3: TRACTION & MARKET (2:10 – 2:53)                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 7: Roadmap (frames 3889–4339, 451 frames ≈ 15.0s) ──── */}
      <Sequence from={3889} durationInFrames={451}>
        <SlideTransition durationInFrames={451}>
          <AbsoluteFill>
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
            <Subtitle text="10 steps. Cap table. Equity. Data room. ESIC. R&D tax. Weekly updates." />
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 8: Market (frames 4348–4795, 448 frames ≈ 14.9s) ───── */}
      <Sequence from={4348} durationInFrames={448}>
        <SlideTransition durationInFrames={448}>
          <AbsoluteFill>
            {/* TAM/SAM/SOM circles — first half */}
            <Sequence from={0} durationInFrames={224}>
              <TAMCircles />
            </Sequence>

            {/* Pricing cards — second half */}
            <Sequence from={224} durationInFrames={224}>
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
            </Sequence>
            <Subtitle text="600K AU companies. 50K raising. Free trial. $1/analysis. 88% margins." />
          </AbsoluteFill>
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 9: Competitors (frames 4804–5203, 400 frames ≈ 13.3s)  */}
      <Sequence from={4804} durationInFrames={400}>
        <SlideTransition durationInFrames={400}>
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
          <Subtitle text="Built for Australia. ABN. ASIC. ESIC. R&D tax. 8 AI agents." />
        </SlideTransition>
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ACT 4: TEAM & CLOSE (2:54 – 3:15)                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ─── Scene 10: Team (frames 5212–5590, 379 frames ≈ 12.6s) ────── */}
      <Sequence from={5212} durationInFrames={379}>
        <SlideTransition durationInFrames={379}>
          <TeamOrg />
          <Subtitle text="1 founder. 8 AI agents. 19 days. 272 files. 70 APIs." />
        </SlideTransition>
      </Sequence>

      {/* ─── Scene 12: CTA + QR (frames 5599–5850, 252 frames ≈ 8.4s) ── */}
      <Sequence from={5599} durationInFrames={252}>
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
        <Subtitle text="blockid.au — Build it right. Build it valuable." />
      </Sequence>
    </AbsoluteFill>
  );
};
