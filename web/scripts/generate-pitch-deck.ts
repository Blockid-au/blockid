#!/usr/bin/env npx tsx
/**
 * Generate BlockID Antler Pitch Deck as PPTX
 *
 * Usage: npx tsx scripts/generate-pitch-deck.ts
 * Output: public/pitch/BlockID-Pitch-Deck-Antler-2026.pptx
 */

import PptxGenJS from "pptxgenjs";
import * as fs from "fs";
import * as path from "path";

const pptx = new PptxGenJS();

// ─── Brand ──────────────────────────────────────────────────────────────
const BRAND = {
  blue: "2563EB",
  blueDark: "1E40AF",
  blueLight: "DBEAFE",
  navy: "0F172A",
  navyDeep: "0B1220",
  ink800: "1E293B",
  ink700: "334155",
  ink500: "64748B",
  ink400: "94A3B8",
  ink300: "CBD5E1",
  white: "FFFFFF",
  surface50: "F8FAFC",
  surface100: "F1F5F9",
  surface200: "E2E8F0",
  emerald: "059669",
  emeraldLight: "D1FAE5",
  amber: "D97706",
  amberLight: "FEF3C7",
  red: "DC2626",
  redLight: "FEE2E2",
  gold: "FBBF24",
};

// ─── Presentation Setup ─────────────────────────────────────────────────
pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5" (16:9)
pptx.author = "Do Van Long — BlockID.au";
pptx.company = "Auschain PTY LTD";
pptx.subject = "BlockID.au — Antler Pre-Seed Pitch Deck";
pptx.title = "BlockID.au Pitch Deck — From Idea to Exit";

// Logo path
const logoPath = path.join(process.cwd(), "public", "images", "logo-transparent.png");
const hasLogo = fs.existsSync(logoPath);
const logoData = hasLogo ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}` : null;

// ─── Helper functions ───────────────────────────────────────────────────

function addFooter(slide: PptxGenJS.Slide, num: number, dark = false) {
  slide.addText(
    [
      { text: "BlockID.au — Auschain PTY LTD | ACN 659 615 111 | Confidential", options: { fontSize: 7, color: dark ? BRAND.ink500 : BRAND.ink400 } },
      { text: `   ${num}/12`, options: { fontSize: 7, color: dark ? BRAND.ink500 : BRAND.ink400 } },
    ],
    { x: 0.5, y: 6.9, w: 12, h: 0.3 },
  );
}

function darkBg(slide: PptxGenJS.Slide) {
  slide.background = { fill: BRAND.navy };
}

function lightBg(slide: PptxGenJS.Slide) {
  slide.background = { fill: BRAND.white };
}

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 1: TITLE
// ═══════════════════════════════════════════════════════════════════════
const s1 = pptx.addSlide();
darkBg(s1);
if (logoData) {
  s1.addImage({ data: logoData, x: 4.4, y: 0.8, w: 4.5, h: 1.0 });
}
s1.addText("From Idea to Exit. One Platform.", {
  x: 1, y: 2.2, w: 11.3, h: 1,
  fontSize: 36, fontFace: "Arial", bold: true, color: BRAND.white,
  align: "center",
});
s1.addText("AI-powered startup valuation and ownership platform", {
  x: 1, y: 3.3, w: 11.3, h: 0.6,
  fontSize: 18, fontFace: "Arial", color: BRAND.ink400,
  align: "center",
});
// Badges
s1.addShape(pptx.ShapeType.roundRect, { x: 4.8, y: 4.2, w: 1.6, h: 0.45, fill: { color: BRAND.emeraldLight }, rectRadius: 0.1 });
s1.addText("LIVE PRODUCT", { x: 4.8, y: 4.2, w: 1.6, h: 0.45, fontSize: 11, fontFace: "Arial", bold: true, color: BRAND.emerald, align: "center" });
s1.addShape(pptx.ShapeType.roundRect, { x: 6.7, y: 4.2, w: 1.4, h: 0.45, fill: { color: BRAND.blueLight }, rectRadius: 0.1 });
s1.addText("PRE-SEED", { x: 6.7, y: 4.2, w: 1.4, h: 0.45, fontSize: 11, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center" });
s1.addText("Auschain PTY LTD | ACN 659 615 111 | blockid.au", {
  x: 1, y: 5.2, w: 11.3, h: 0.4, fontSize: 11, fontFace: "Arial", color: BRAND.ink500, align: "center",
});
s1.addText("Do Van Long — Founder & CEO | linkedin.com/in/dovanlong", {
  x: 1, y: 5.6, w: 11.3, h: 0.4, fontSize: 11, fontFace: "Arial", color: BRAND.ink500, align: "center",
});
addFooter(s1, 1, true);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 2: THE PROBLEM
// ═══════════════════════════════════════════════════════════════════════
const s2 = pptx.addSlide();
lightBg(s2);
s2.addText("90% of Startups Fail. The Valuation Black Hole is Why.", {
  x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 28, fontFace: "Arial", bold: true, color: BRAND.ink800,
});
s2.addText("Founders make critical decisions with no data — and pay A$5K-$50K for manual valuations that take weeks.", {
  x: 0.5, y: 1.2, w: 12, h: 0.5, fontSize: 14, fontFace: "Arial", color: BRAND.ink500,
});

// Stat cards
const stats2 = [
  { val: "90%", label: "Startups fail\n(Failory 2026)", color: BRAND.red },
  { val: "60%", label: "AU fail in 3 years\n(ABS 2025)", color: BRAND.red },
  { val: "70%", label: "Run out of cash\n(CB Insights)", color: BRAND.amber },
  { val: "$50K", label: "Manual valuation\ncost (2-6 weeks)", color: BRAND.amber },
];
stats2.forEach((st, i) => {
  const x = 0.5 + i * 3.1;
  s2.addShape(pptx.ShapeType.roundRect, { x, y: 2.2, w: 2.8, h: 2.8, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface100, width: 1 }, rectRadius: 0.15 });
  s2.addText(st.val, { x, y: 2.4, w: 2.8, h: 1.2, fontSize: 40, fontFace: "Arial", bold: true, color: st.color, align: "center" });
  s2.addText(st.label, { x, y: 3.6, w: 2.8, h: 1, fontSize: 11, fontFace: "Arial", color: BRAND.ink500, align: "center" });
});
addFooter(s2, 2);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 3: AI EXPLOSION
// ═══════════════════════════════════════════════════════════════════════
const s3 = pptx.addSlide();
darkBg(s3);
s3.addText("$252B Invested in AI — But 90% of AI Startups Fail", {
  x: 0.5, y: 0.4, w: 12, h: 0.8, fontSize: 28, fontFace: "Arial", bold: true, color: BRAND.white,
});
s3.addText("AI generates ideas at unprecedented speed, but cannot build sustainable businesses.", {
  x: 0.5, y: 1.2, w: 12, h: 0.5, fontSize: 14, fontFace: "Arial", color: BRAND.ink400,
});

const aiStats = [
  { val: "$97B", label: "AI startup funding 2024\n(Second Talent)", color: BRAND.blue },
  { val: "$252B", label: "Total AI investment\n(Stanford HAI 2025)", color: BRAND.gold },
  { val: "90%", label: "AI startups fail in 18mo\n(AI4SP)", color: BRAND.red },
];
aiStats.forEach((st, i) => {
  const x = 1.0 + i * 3.8;
  s3.addText(st.val, { x, y: 2.3, w: 3.4, h: 1.4, fontSize: 52, fontFace: "Arial", bold: true, color: st.color, align: "center" });
  s3.addText(st.label, { x, y: 3.7, w: 3.4, h: 0.8, fontSize: 11, fontFace: "Arial", color: BRAND.ink400, align: "center" });
});

s3.addShape(pptx.ShapeType.roundRect, { x: 2.0, y: 5.0, w: 9.0, h: 1.0, fill: { color: BRAND.navyDeep }, line: { color: BRAND.ink700, width: 1 }, rectRadius: 0.12 });
s3.addText("The $252B Problem: Investment Without Validation — BlockID bridges the gap", {
  x: 2.0, y: 5.0, w: 9.0, h: 1.0, fontSize: 16, fontFace: "Arial", bold: true, color: BRAND.gold, align: "center",
});
addFooter(s3, 3, true);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 4: THE SOLUTION
// ═══════════════════════════════════════════════════════════════════════
const s4 = pptx.addSlide();
lightBg(s4);
s4.addText("BlockID.au — AI-Powered Startup Intelligence, Instantly", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: BRAND.ink800,
});

// Left column: SVI + Evidence
s4.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.4, w: 5.8, h: 2.4, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface100, width: 1 }, rectRadius: 0.12 });
s4.addText("Startup Value Index (SVI)", { x: 0.7, y: 1.5, w: 5.4, h: 0.4, fontSize: 15, fontFace: "Arial", bold: true, color: BRAND.blue });
s4.addText("• Full startup valuation report in 60 seconds\n• 8-dimension scoring: Team, Market, Product, Traction, Cap Table, Investor Readiness, Legal, Moat\n• Unlimited depth for paid reports — from scans to consultant-grade", {
  x: 0.7, y: 2.0, w: 5.4, h: 1.5, fontSize: 11, fontFace: "Arial", color: BRAND.ink700, lineSpacingMultiple: 1.3,
});

s4.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 4.0, w: 5.8, h: 1.8, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface100, width: 1 }, rectRadius: 0.12 });
s4.addText("Evidence Vault", { x: 0.7, y: 4.1, w: 5.4, h: 0.4, fontSize: 15, fontFace: "Arial", bold: true, color: BRAND.emerald });
s4.addText("• Connect GitHub, Stripe, Analytics — score updates in real-time\n• Confidence grows from 20% → 75%+ with verified data", {
  x: 0.7, y: 4.5, w: 5.4, h: 1.1, fontSize: 11, fontFace: "Arial", color: BRAND.ink700, lineSpacingMultiple: 1.3,
});

// Right column: 10 Free Tools
s4.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.4, w: 5.8, h: 3.2, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface100, width: 1 }, rectRadius: 0.12 });
s4.addText("10 Free Tools", { x: 7.0, y: 1.5, w: 5.4, h: 0.4, fontSize: 15, fontFace: "Arial", bold: true, color: BRAND.amber });
s4.addText("• Equity Split Calculator\n• Dilution Modeller\n• Cap Table Manager\n• Term Sheet AI\n• Data Room Builder\n• R&D Tax Calculator\n• ESIC Eligibility Checker\n• Funding Plan Generator\n• Co-Founder Match\n• Investor Score", {
  x: 7.0, y: 2.0, w: 5.4, h: 2.4, fontSize: 11, fontFace: "Arial", color: BRAND.ink700, lineSpacingMultiple: 1.2,
});

s4.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 4.8, w: 5.8, h: 1.0, fill: { color: BRAND.blueLight }, rectRadius: 0.12 });
s4.addText("One Platform. Entire Startup Lifecycle. From Idea to Exit.", {
  x: 6.8, y: 4.8, w: 5.8, h: 1.0, fontSize: 14, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center",
});
addFooter(s4, 4);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 5: HOW IT WORKS
// ═══════════════════════════════════════════════════════════════════════
const s5 = pptx.addSlide();
lightBg(s5);
s5.addText("From Idea to Intelligence in 60 Seconds", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: BRAND.ink800,
});

const steps = [
  { n: "1", title: "Enter Details", desc: "URL, text, or\nupload documents", time: "~5 min" },
  { n: "2", title: "AI Analyses", desc: "8 dimensions +\ndeep tech audit", time: "~60 sec" },
  { n: "3", title: "Get Report", desc: "Scores, gaps &\nnext steps", time: "Instant" },
  { n: "4", title: "Upload Evidence", desc: "GitHub, Stripe,\nAnalytics", time: "Ongoing" },
  { n: "5", title: "Grow & Fundraise", desc: "Cap table, data\nroom, investors", time: "Lifecycle" },
];
steps.forEach((step, i) => {
  const x = 0.3 + i * 2.55;
  s5.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.3, h: 3.5, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface200, width: 1 }, rectRadius: 0.12 });
  s5.addShape(pptx.ShapeType.ellipse, { x: x + 0.8, y: 1.7, w: 0.7, h: 0.7, fill: { color: BRAND.blue } });
  s5.addText(step.n, { x: x + 0.8, y: 1.7, w: 0.7, h: 0.7, fontSize: 18, fontFace: "Arial", bold: true, color: BRAND.white, align: "center", valign: "middle" });
  s5.addText(step.title, { x, y: 2.6, w: 2.3, h: 0.5, fontSize: 13, fontFace: "Arial", bold: true, color: BRAND.ink800, align: "center" });
  s5.addText(step.desc, { x, y: 3.1, w: 2.3, h: 0.8, fontSize: 10, fontFace: "Arial", color: BRAND.ink500, align: "center" });
  s5.addText(step.time, { x, y: 4.1, w: 2.3, h: 0.4, fontSize: 11, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center" });
});

s5.addShape(pptx.ShapeType.roundRect, { x: 1.5, y: 5.4, w: 10.0, h: 0.7, fill: { color: BRAND.blueLight }, rectRadius: 0.1 });
s5.addText("6 AI Providers (Claude, GPT, Gemini + 3 fallbacks) — 99.9% uptime with auto-failover", {
  x: 1.5, y: 5.4, w: 10.0, h: 0.7, fontSize: 12, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center",
});
addFooter(s5, 5);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 6: MARKET OPPORTUNITY
// ═══════════════════════════════════════════════════════════════════════
const s6 = pptx.addSlide();
darkBg(s6);
s6.addText("A$15B Ecosystem. 2,600+ Startups. Zero Unified Platform.", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: BRAND.white,
});

// TAM/SAM/SOM circles (left)
s6.addShape(pptx.ShapeType.ellipse, { x: 1.2, y: 1.6, w: 4.5, h: 4.5, line: { color: BRAND.blue, width: 2 } });
s6.addText("TAM: $4.4T\nGlobal Startup\nEcosystem", { x: 1.2, y: 1.8, w: 4.5, h: 1.2, fontSize: 10, color: BRAND.blue, align: "center" });
s6.addShape(pptx.ShapeType.ellipse, { x: 2.0, y: 2.8, w: 3.0, h: 3.0, line: { color: BRAND.gold, width: 2 } });
s6.addText("SAM: $3.2B\nCap Table +\nValuation", { x: 2.0, y: 3.0, w: 3.0, h: 1.0, fontSize: 10, color: BRAND.gold, align: "center" });
s6.addShape(pptx.ShapeType.ellipse, { x: 2.6, y: 3.7, w: 1.8, h: 1.8, fill: { color: BRAND.emerald } });
s6.addText("SOM\nA$250K Y1", { x: 2.6, y: 3.9, w: 1.8, h: 1.0, fontSize: 10, bold: true, color: BRAND.white, align: "center" });

// Right stats
const mktStats = [
  { val: "2,600+", label: "Active AU startups (Startup Genome)", color: BRAND.blue },
  { val: "300+", label: "Accelerators & incubators (StartupAus)", color: BRAND.gold },
  { val: "15,000+", label: "Angel investors (AAAI)", color: BRAND.emerald },
];
mktStats.forEach((st, i) => {
  s6.addShape(pptx.ShapeType.roundRect, { x: 7.0, y: 1.6 + i * 1.6, w: 5.5, h: 1.3, fill: { color: BRAND.navyDeep }, line: { color: BRAND.ink700, width: 1 }, rectRadius: 0.1 });
  s6.addText(st.val, { x: 7.2, y: 1.65 + i * 1.6, w: 5.1, h: 0.7, fontSize: 30, fontFace: "Arial", bold: true, color: st.color });
  s6.addText(st.label, { x: 7.2, y: 2.2 + i * 1.6, w: 5.1, h: 0.4, fontSize: 11, fontFace: "Arial", color: BRAND.ink400 });
});
s6.addText("Expansion: Australia → NZ → APAC → Global", {
  x: 7.0, y: 6.0, w: 5.5, h: 0.4, fontSize: 11, fontFace: "Arial", color: BRAND.ink500,
});
addFooter(s6, 6, true);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 7: BUSINESS MODEL
// ═══════════════════════════════════════════════════════════════════════
const s7 = pptx.addSlide();
lightBg(s7);
s7.addText("Land Free. Expand Paid. Grow with Founders.", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: BRAND.ink800,
});

const tiers = [
  { name: "Free", price: "$0", features: "SVI score\nBasic tools\n1 analysis", color: BRAND.ink500 },
  { name: "Founding 50", price: "A$49", features: "50 credits lifetime\nEvidence vault\nCap table tools\nTerm sheet AI", color: BRAND.blue },
  { name: "Growth", price: "A$99/mo", features: "100 credits/month\nFull reports\nData room\nPriority support", color: BRAND.emerald },
  { name: "Enterprise", price: "Custom", features: "Portfolio dashboard\nAPI access\nWhite-label\nDedicated CSM", color: BRAND.gold },
];
tiers.forEach((t, i) => {
  const x = 0.4 + i * 3.15;
  s7.addShape(pptx.ShapeType.roundRect, { x, y: 1.4, w: 2.9, h: 3.4, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface200, width: 1 }, rectRadius: 0.12 });
  // Top border color
  s7.addShape(pptx.ShapeType.rect, { x, y: 1.4, w: 2.9, h: 0.06, fill: { color: t.color } });
  s7.addText(t.name, { x, y: 1.6, w: 2.9, h: 0.4, fontSize: 13, fontFace: "Arial", bold: true, color: t.color, align: "center" });
  s7.addText(t.price, { x, y: 2.0, w: 2.9, h: 0.6, fontSize: 22, fontFace: "Arial", bold: true, color: BRAND.ink800, align: "center" });
  s7.addText(t.features, { x: x + 0.2, y: 2.7, w: 2.5, h: 1.8, fontSize: 10, fontFace: "Arial", color: BRAND.ink500, lineSpacingMultiple: 1.4 });
});

// Revenue targets row
const revTargets = [
  { val: "10%", label: "Free-to-paid target" },
  { val: "<5%", label: "Monthly churn target" },
  { val: "A$250K", label: "Year 1 ARR target" },
  { val: "A$5M", label: "Year 3 ARR target" },
];
revTargets.forEach((r, i) => {
  const x = 0.4 + i * 3.15;
  s7.addText(r.val, { x, y: 5.1, w: 2.9, h: 0.6, fontSize: 22, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center" });
  s7.addText(r.label, { x, y: 5.7, w: 2.9, h: 0.4, fontSize: 10, fontFace: "Arial", color: BRAND.ink500, align: "center" });
});
addFooter(s7, 7);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 8: TRACTION
// ═══════════════════════════════════════════════════════════════════════
const s8 = pptx.addSlide();
darkBg(s8);
s8.addText("Live Product. Real Users. Growing Fast.", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 28, fontFace: "Arial", bold: true, color: BRAND.white,
});
s8.addText("BlockID.au is operational today — not a pitch deck, a production platform.", {
  x: 0.5, y: 1.1, w: 12, h: 0.4, fontSize: 14, fontFace: "Arial", color: BRAND.ink400,
});

const tractionMetrics = [
  { val: "50+", label: "Australian founders", color: BRAND.blue },
  { val: "200+", label: "SVI analyses", color: BRAND.emerald },
  { val: "$2M+", label: "Valuations tracked", color: BRAND.gold },
  { val: "10", label: "Free tools live", color: BRAND.white },
];
tractionMetrics.forEach((m, i) => {
  const x = 0.5 + i * 3.1;
  s8.addShape(pptx.ShapeType.roundRect, { x, y: 1.8, w: 2.8, h: 1.8, fill: { color: BRAND.navyDeep }, line: { color: BRAND.ink700, width: 1 }, rectRadius: 0.12 });
  s8.addText(m.val, { x, y: 1.9, w: 2.8, h: 1.0, fontSize: 36, fontFace: "Arial", bold: true, color: m.color, align: "center" });
  s8.addText(m.label, { x, y: 2.9, w: 2.8, h: 0.5, fontSize: 11, fontFace: "Arial", color: BRAND.ink400, align: "center" });
});

// Phase status
const phases = [
  { title: "✓ Complete", items: "Phase 1: SVI scoring\nPhase 2: Evidence Vault\nPhase 5: Cosmos testnet", color: BRAND.emerald },
  { title: "⚡ In Progress", items: "Phase 3: Valuation engine\nPhase 4: Cap table\nPhase 6: Pitch + data room", color: BRAND.blue },
  { title: "Tech Stack", items: "6 AI providers (failover)\n31+ SEO articles\n37 custom analytics events", color: BRAND.gold },
];
phases.forEach((p, i) => {
  const x = 0.5 + i * 4.2;
  s8.addShape(pptx.ShapeType.roundRect, { x, y: 4.0, w: 3.9, h: 2.4, fill: { color: BRAND.navyDeep }, line: { color: BRAND.ink700, width: 1 }, rectRadius: 0.1 });
  s8.addText(p.title, { x: x + 0.2, y: 4.1, w: 3.5, h: 0.4, fontSize: 13, fontFace: "Arial", bold: true, color: p.color });
  s8.addText(p.items, { x: x + 0.2, y: 4.5, w: 3.5, h: 1.6, fontSize: 11, fontFace: "Arial", color: BRAND.ink300, lineSpacingMultiple: 1.4 });
});
addFooter(s8, 8, true);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 9: COMPETITIVE LANDSCAPE
// ═══════════════════════════════════════════════════════════════════════
const s9 = pptx.addSlide();
lightBg(s9);
s9.addText("No One Covers the Full Lifecycle", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: BRAND.ink800,
});

// Table
const tableRows: PptxGenJS.TableRow[] = [
  [
    { text: "Feature", options: { bold: true, color: BRAND.white, fill: { color: BRAND.navy }, fontSize: 10 } },
    { text: "BlockID", options: { bold: true, color: BRAND.blue, fill: { color: BRAND.navy }, fontSize: 10, align: "center" } },
    { text: "Carta", options: { bold: true, color: BRAND.ink400, fill: { color: BRAND.navy }, fontSize: 10, align: "center" } },
    { text: "Pulley", options: { bold: true, color: BRAND.ink400, fill: { color: BRAND.navy }, fontSize: 10, align: "center" } },
    { text: "Equidam", options: { bold: true, color: BRAND.ink400, fill: { color: BRAND.navy }, fontSize: 10, align: "center" } },
  ],
];
const features = [
  ["AI Valuation Scoring", "✓", "✗", "✗", "✓"],
  ["Full Report Generation", "✓", "✗", "✗", "✗"],
  ["Cap Table Management", "✓", "✓", "✓", "✗"],
  ["Evidence Vault (live data)", "✓", "✗", "✗", "✗"],
  ["Australian Focus (ESIC, R&D Tax)", "✓", "✗", "✗", "✗"],
  ["Free Tier Available", "✓", "✗", "✗", "✓"],
  ["Blockchain Equity (Roadmap)", "✓", "✗", "✗", "✗"],
  ["Full Startup Lifecycle", "✓", "✗", "✗", "✗"],
];
features.forEach((row, i) => {
  const bgColor = i % 2 === 0 ? BRAND.white : BRAND.surface50;
  tableRows.push(row.map((cell, j) => ({
    text: cell,
    options: {
      fontSize: 10,
      color: j === 0 ? BRAND.ink700 : (cell === "✓" ? BRAND.emerald : BRAND.red),
      fill: { color: bgColor },
      align: j === 0 ? ("left" as const) : ("center" as const),
      bold: cell === "✓",
    },
  })));
});
s9.addTable(tableRows, { x: 0.5, y: 1.4, w: 12.0, colW: [3.5, 2.1, 2.1, 2.1, 2.1], border: { color: BRAND.surface200, pt: 0.5 } });

s9.addShape(pptx.ShapeType.roundRect, { x: 1.5, y: 5.8, w: 10.0, h: 0.7, fill: { color: BRAND.blueLight }, rectRadius: 0.1 });
s9.addText("Carta: $8K+/yr, US-only | Manual valuation: $5K-$50K, 2-6 weeks | BlockID: Free to start, 60 seconds, full lifecycle", {
  x: 1.5, y: 5.8, w: 10.0, h: 0.7, fontSize: 10, fontFace: "Arial", color: BRAND.blue, align: "center",
});
addFooter(s9, 9);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 10: ROADMAP
// ═══════════════════════════════════════════════════════════════════════
const s10 = pptx.addSlide();
darkBg(s10);
s10.addText("8 Phases: Idea to IPO", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 28, fontFace: "Arial", bold: true, color: BRAND.white,
});

const roadmap = [
  { n: "1", name: "Idea & Analysis", status: "✅ COMPLETE", time: "Done", color: BRAND.emerald },
  { n: "2", name: "Validation & Evidence", status: "✅ COMPLETE", time: "Done", color: BRAND.emerald },
  { n: "3", name: "MVP & Dollar Valuation", status: "⚡ In Progress", time: "Q3 2026", color: BRAND.blue },
  { n: "4", name: "Equity & Cap Table", status: "⚡ In Progress", time: "Q4 2026", color: BRAND.blue },
  { n: "5", name: "Tokenization (Cosmos)", status: "✅ Chain Live", time: "Q1 2027", color: BRAND.emerald },
  { n: "6", name: "Investment & Fundraise", status: "⚡ Starting", time: "Q2 2027", color: BRAND.gold },
  { n: "7", name: "Revenue & Dividends", status: "📋 Planned", time: "2028", color: BRAND.ink500 },
  { n: "8", name: "Growth & Exit", status: "📋 Planned", time: "2028+", color: BRAND.ink500 },
];
roadmap.forEach((p, i) => {
  const y = 1.3 + i * 0.7;
  s10.addShape(pptx.ShapeType.ellipse, { x: 0.8, y, w: 0.5, h: 0.5, fill: { color: p.color } });
  s10.addText(p.n, { x: 0.8, y, w: 0.5, h: 0.5, fontSize: 14, fontFace: "Arial", bold: true, color: BRAND.white, align: "center", valign: "middle" });
  s10.addText(p.name, { x: 1.6, y, w: 3.5, h: 0.5, fontSize: 14, fontFace: "Arial", bold: true, color: BRAND.white, valign: "middle" });
  s10.addText(p.status, { x: 5.5, y, w: 2.5, h: 0.5, fontSize: 11, fontFace: "Arial", color: p.color, valign: "middle" });
  s10.addText(p.time, { x: 8.5, y, w: 2.0, h: 0.5, fontSize: 11, fontFace: "Arial", color: BRAND.ink400, valign: "middle" });
});
addFooter(s10, 10, true);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 11: TEAM
// ═══════════════════════════════════════════════════════════════════════
const s11 = pptx.addSlide();
lightBg(s11);
s11.addText("Built by a Founder Who Knows the Pain", {
  x: 0.5, y: 0.4, w: 12, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: BRAND.ink800,
});

// Founder card
s11.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.4, w: 5.5, h: 4.5, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface200, width: 1 }, rectRadius: 0.12 });
s11.addText("Do Van Long", { x: 0.7, y: 1.6, w: 5.1, h: 0.5, fontSize: 22, fontFace: "Arial", bold: true, color: BRAND.ink800, align: "center" });
s11.addText("Founder & CEO", { x: 0.7, y: 2.1, w: 5.1, h: 0.4, fontSize: 14, fontFace: "Arial", color: BRAND.blue, align: "center" });
s11.addText("Full-stack technical founder who single-handedly built BlockID.au from concept to live production. Designed the AI engine, built the frontend, configured infrastructure, and shipped — all before seeking external funding.\n\nlinkedin.com/in/dovanlong", {
  x: 0.9, y: 2.7, w: 4.7, h: 2.5, fontSize: 11, fontFace: "Arial", color: BRAND.ink500, lineSpacingMultiple: 1.4, align: "center",
});

// AI C-Suite
s11.addShape(pptx.ShapeType.roundRect, { x: 6.5, y: 1.4, w: 6.3, h: 2.8, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface200, width: 1 }, rectRadius: 0.12 });
s11.addText("AI-Augmented C-Suite — 11 Agents, 45+ Skills", { x: 6.7, y: 1.5, w: 5.9, h: 0.5, fontSize: 14, fontFace: "Arial", bold: true, color: BRAND.blue });
const roles = ["CTO", "CFO", "CMO", "CPO", "CRO", "COO", "CHRO", "CLO", "CISO", "CDO", "CBO"];
roles.forEach((role, i) => {
  const col = i % 6;
  const row = Math.floor(i / 6);
  s11.addShape(pptx.ShapeType.roundRect, {
    x: 6.8 + col * 0.95, y: 2.2 + row * 0.7, w: 0.85, h: 0.5,
    fill: { color: BRAND.blueLight }, rectRadius: 0.08,
  });
  s11.addText(role, {
    x: 6.8 + col * 0.95, y: 2.2 + row * 0.7, w: 0.85, h: 0.5,
    fontSize: 9, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center", valign: "middle",
  });
});

// Next hires
s11.addShape(pptx.ShapeType.roundRect, { x: 6.5, y: 4.5, w: 6.3, h: 1.4, fill: { color: BRAND.surface50 }, line: { color: BRAND.surface200, width: 1 }, rectRadius: 0.12 });
s11.addText("Next Key Hires", { x: 6.7, y: 4.6, w: 5.9, h: 0.4, fontSize: 14, fontFace: "Arial", bold: true, color: BRAND.emerald });
s11.addText("• Growth Lead — user acquisition + accelerator partnerships\n• Blockchain Engineer — Cosmos chain production + smart contracts", {
  x: 6.7, y: 5.0, w: 5.9, h: 0.8, fontSize: 11, fontFace: "Arial", color: BRAND.ink500, lineSpacingMultiple: 1.3,
});
addFooter(s11, 11);

// ═══════════════════════════════════════════════════════════════════════
// SLIDE 12: THE ASK
// ═══════════════════════════════════════════════════════════════════════
const s12 = pptx.addSlide();
darkBg(s12);
s12.addText("PRE-SEED ROUND", {
  x: 1, y: 1.0, w: 11.3, h: 0.5, fontSize: 16, fontFace: "Arial", bold: true, color: BRAND.blue, align: "center", charSpacing: 4,
});
s12.addText("A$500,000", {
  x: 1, y: 1.7, w: 11.3, h: 1.2, fontSize: 56, fontFace: "Arial", bold: true, color: BRAND.white, align: "center",
});
s12.addText("12-month runway to A$250K ARR and 500 active users", {
  x: 1, y: 2.9, w: 11.3, h: 0.5, fontSize: 16, fontFace: "Arial", color: BRAND.ink400, align: "center",
});

const fundItems = [
  { pct: "50%", label: "Engineering\n(AI + Blockchain)", color: BRAND.blue },
  { pct: "20%", label: "Marketing\n& Growth", color: BRAND.emerald },
  { pct: "15%", label: "Operations\n& Infrastructure", color: BRAND.gold },
  { pct: "10%", label: "Legal, IP\n& Compliance", color: BRAND.amber },
  { pct: "5%", label: "Reserve", color: BRAND.ink500 },
];
fundItems.forEach((f, i) => {
  const x = 1.2 + i * 2.3;
  s12.addText(f.pct, { x, y: 3.8, w: 2.0, h: 0.7, fontSize: 26, fontFace: "Arial", bold: true, color: f.color, align: "center" });
  s12.addText(f.label, { x, y: 4.5, w: 2.0, h: 0.6, fontSize: 10, fontFace: "Arial", color: BRAND.ink400, align: "center" });
});

s12.addText("Every great company started exactly where we are. Let's build this together.", {
  x: 1, y: 5.5, w: 11.3, h: 0.5, fontSize: 18, fontFace: "Arial", bold: true, color: BRAND.white, align: "center",
});
s12.addText("Do Van Long — ceo@longcare.au — blockid.au — linkedin.com/in/dovanlong", {
  x: 1, y: 6.1, w: 11.3, h: 0.4, fontSize: 12, fontFace: "Arial", color: BRAND.blue, align: "center",
});
s12.addText("Auschain PTY LTD | ACN 659 615 111 | ABN 79 659 615 111 | Sydney, NSW", {
  x: 1, y: 6.5, w: 11.3, h: 0.3, fontSize: 10, fontFace: "Arial", color: BRAND.ink500, align: "center",
});
addFooter(s12, 12, true);

// ═══════════════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════════════

const outputDir = path.join(process.cwd(), "public", "pitch");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "BlockID-Pitch-Deck-Antler-2026.pptx");

pptx.writeFile({ fileName: outputPath }).then(() => {
  console.log(`✅ Pitch deck generated: ${outputPath}`);
  console.log(`   12 slides, 16:9 widescreen, professional design`);
  console.log(`   Download: /pitch/BlockID-Pitch-Deck-Antler-2026.pptx`);
}).catch((err) => {
  console.error("❌ Failed to generate pitch deck:", err);
  process.exit(1);
});
