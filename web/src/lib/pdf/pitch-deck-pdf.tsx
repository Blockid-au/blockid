import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import * as path from "path";
import * as fs from "fs";

// Load logo
const LOGO_PATH = path.join(process.cwd(), "public", "images", "logo-transparent.png");
const LOGO_SRC = fs.existsSync(LOGO_PATH)
  ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`
  : null;

/* ─── Brand Colors ─────────────────────────────────────────────────────── */
const C = {
  brand: "#2563eb",
  brandDark: "#1e40af",
  brandLight: "#dbeafe",
  ink950: "#0B1220",
  ink900: "#0F172A",
  ink800: "#1e293b",
  ink700: "#334155",
  ink500: "#64748b",
  ink400: "#94a3b8",
  ink300: "#cbd5e1",
  surface50: "#f8fafc",
  surface100: "#f1f5f9",
  surface200: "#e2e8f0",
  white: "#ffffff",
  emerald: "#059669",
  emeraldLight: "#d1fae5",
  amber: "#d97706",
  amberLight: "#fef3c7",
  red: "#dc2626",
  redLight: "#fee2e2",
  gold: "#FBBF24",
};

/* ─── Styles ──────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: C.ink800,
    backgroundColor: C.white,
  },
  darkPage: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: C.surface50,
    backgroundColor: C.ink900,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 7, color: C.ink400 },
  footerBrand: { fontSize: 7, color: C.brand, fontWeight: "bold" },
  slideNum: { fontSize: 7, color: C.ink400 },
  headline: { fontSize: 24, fontWeight: "bold", color: C.ink900, marginBottom: 8 },
  headlineDark: { fontSize: 24, fontWeight: "bold", color: C.white, marginBottom: 8 },
  subheadline: { fontSize: 13, color: C.ink500, marginBottom: 20 },
  subheadlineDark: { fontSize: 13, color: C.ink400, marginBottom: 20 },
  bullet: { fontSize: 11, color: C.ink700, marginBottom: 6, lineHeight: 1.5 },
  bulletDark: { fontSize: 11, color: C.ink300, marginBottom: 6, lineHeight: 1.5 },
  stat: { fontSize: 36, fontWeight: "bold", color: C.brand, textAlign: "center" },
  statLabel: { fontSize: 10, color: C.ink500, textAlign: "center", marginTop: 2 },
  card: { backgroundColor: C.surface50, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: C.surface200 },
  cardDark: { backgroundColor: C.ink950, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: C.ink700 },
  tag: { fontSize: 8, fontWeight: "bold", color: C.brand, backgroundColor: C.brandLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  speakerNote: { fontSize: 8, color: C.ink400, fontStyle: "italic", marginTop: 12, lineHeight: 1.4 },
});

/* ─── Footer Component ────────────────────────────────────────────────── */
function Footer({ num, dark }: { num: number; dark?: boolean }) {
  return (
    <View style={s.footer}>
      <Text style={dark ? { ...s.footerText, color: C.ink500 } : s.footerText}>
        BlockID.au — Auschain PTY LTD | ACN 659 615 111 | Confidential
      </Text>
      <Text style={dark ? { ...s.footerBrand, color: C.brand } : s.footerBrand}>
        blockid.au
      </Text>
      <Text style={dark ? { ...s.slideNum, color: C.ink500 } : s.slideNum}>
        {num} / 12
      </Text>
    </View>
  );
}

/* ─── Stat Box ────────────────────────────────────────────────────────── */
function StatBox({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ ...s.stat, color: color ?? C.brand }}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

/* ─── Check/Cross for comparison ──────────────────────────────────────── */
function Check() { return <Text style={{ fontSize: 12, color: C.emerald }}>✓</Text>; }
function Cross() { return <Text style={{ fontSize: 12, color: C.red }}>✗</Text>; }

/* ─── Main PDF Component ──────────────────────────────────────────────── */
export function PitchDeckPDF() {
  return (
    <Document>
      {/* ═══ Slide 1: Title ═══ */}
      <Page size="A4" orientation="landscape" style={[s.darkPage, { paddingTop: 0, paddingBottom: 0 }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {LOGO_SRC && <Image src={LOGO_SRC} style={{ width: 240, height: 54, marginBottom: 12 }} />}
          {!LOGO_SRC && <Text style={{ fontSize: 32, fontWeight: "bold", color: C.brand }}>BlockID<Text style={{ color: C.ink500 }}>.au</Text></Text>}
          <Text style={{ fontSize: 28, fontWeight: "bold", color: C.white, marginTop: 8, textAlign: "center" }}>
            From Idea to Exit. One Platform.
          </Text>
          <Text style={{ fontSize: 14, color: C.ink400, marginTop: 8, textAlign: "center" }}>
            AI-powered startup valuation and ownership platform
          </Text>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 24, alignItems: "center" }}>
            <Text style={{ ...s.tag, backgroundColor: C.emeraldLight, color: C.emerald }}>LIVE PRODUCT</Text>
            <Text style={{ ...s.tag }}>PRE-SEED</Text>
          </View>
          <Text style={{ fontSize: 10, color: C.ink500, marginTop: 24 }}>
            Auschain PTY LTD | ACN 659 615 111 | blockid.au
          </Text>
          <Text style={{ fontSize: 10, color: C.ink500, marginTop: 4 }}>
            Do Van Long — Founder & CEO | linkedin.com/in/dovanlong
          </Text>
        </View>
        <Footer num={1} dark />
      </Page>

      {/* ═══ Slide 2: The Problem ═══ */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.headline}>90% of Startups Fail. The Valuation Black Hole is Why.</Text>
        <Text style={s.subheadline}>Founders make critical decisions with no data — and pay A$5K-$50K for manual valuations that take weeks.</Text>
        <View style={s.row}>
          <View style={s.col}>
            <View style={s.card}>
              <Text style={{ fontSize: 32, fontWeight: "bold", color: C.red }}>90%</Text>
              <Text style={{ fontSize: 10, color: C.ink500, marginTop: 2 }}>of startups fail over their lifetime (Failory 2026)</Text>
            </View>
            <View style={s.card}>
              <Text style={{ fontSize: 32, fontWeight: "bold", color: C.red }}>60%</Text>
              <Text style={{ fontSize: 10, color: C.ink500, marginTop: 2 }}>of Australian startups fail within 3 years (ABS 2025)</Text>
            </View>
          </View>
          <View style={s.col}>
            <View style={s.card}>
              <Text style={{ fontSize: 32, fontWeight: "bold", color: C.amber }}>70%</Text>
              <Text style={{ fontSize: 10, color: C.ink500, marginTop: 2 }}>of failures are &quot;ran out of cash&quot; with hidden valuation issues (CB Insights)</Text>
            </View>
            <View style={s.card}>
              <Text style={{ fontSize: 11, fontWeight: "bold", color: C.ink800, marginBottom: 4 }}>Manual Valuation</Text>
              <Text style={{ fontSize: 10, color: C.ink500 }}>A$5,000 – $50,000 per engagement</Text>
              <Text style={{ fontSize: 10, color: C.ink500 }}>2–6 weeks to complete</Text>
              <Text style={{ fontSize: 10, color: C.ink500 }}>Outdated by the time it&apos;s done</Text>
            </View>
          </View>
        </View>
        <Footer num={2} />
      </Page>

      {/* ═══ Slide 3: AI Explosion ═══ */}
      <Page size="A4" orientation="landscape" style={s.darkPage}>
        <Text style={s.headlineDark}>$252B Invested in AI — But 90% of AI Startups Fail</Text>
        <Text style={s.subheadlineDark}>AI generates ideas at unprecedented speed, but cannot build sustainable businesses. That gap is BlockID.</Text>
        <View style={s.row}>
          <View style={[s.col, { alignItems: "center" }]}>
            <Text style={{ fontSize: 42, fontWeight: "bold", color: C.brand }}>$97B</Text>
            <Text style={{ fontSize: 10, color: C.ink400 }}>AI startup funding in 2024</Text>
            <Text style={{ fontSize: 8, color: C.ink500, marginTop: 2 }}>34% of all VC (Second Talent)</Text>
          </View>
          <View style={[s.col, { alignItems: "center" }]}>
            <Text style={{ fontSize: 42, fontWeight: "bold", color: C.gold }}>$252B</Text>
            <Text style={{ fontSize: 10, color: C.ink400 }}>Total corporate AI investment</Text>
            <Text style={{ fontSize: 8, color: C.ink500, marginTop: 2 }}>Stanford HAI 2025</Text>
          </View>
          <View style={[s.col, { alignItems: "center" }]}>
            <Text style={{ fontSize: 42, fontWeight: "bold", color: C.red }}>90%</Text>
            <Text style={{ fontSize: 10, color: C.ink400 }}>AI startups fail in 18 months</Text>
            <Text style={{ fontSize: 8, color: C.ink500, marginTop: 2 }}>AI4SP, WinSavvy</Text>
          </View>
        </View>
        <View style={[s.cardDark, { marginTop: 16, alignItems: "center" }]}>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: C.gold, textAlign: "center" }}>
            The $252B Problem: Investment Without Validation
          </Text>
          <Text style={{ fontSize: 10, color: C.ink400, textAlign: "center", marginTop: 4 }}>
            AI can generate an idea in seconds — but it takes BlockID to validate, score, and grow it into a real business.
          </Text>
        </View>
        <Footer num={3} dark />
      </Page>

      {/* ═══ Slide 4: The Solution ═══ */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.headline}>BlockID.au — AI-Powered Startup Intelligence, Instantly</Text>
        <View style={s.row}>
          <View style={s.col}>
            <View style={s.card}>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: C.brand, marginBottom: 4 }}>Startup Value Index (SVI)</Text>
              <Text style={s.bullet}>• Full startup valuation report in 60 seconds</Text>
              <Text style={s.bullet}>• 8-dimension scoring: Team, Market, Product, Traction, Cap Table, Investor Readiness, Legal, Moat</Text>
              <Text style={s.bullet}>• Unlimited depth for paid reports — from quick scans to consultant-grade analysis</Text>
            </View>
            <View style={s.card}>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: C.emerald, marginBottom: 4 }}>Evidence Vault</Text>
              <Text style={s.bullet}>• Upload documents, connect GitHub, Stripe, Analytics</Text>
              <Text style={s.bullet}>• Score updates in real-time with verified data</Text>
              <Text style={s.bullet}>• Confidence grows from 20% → 75%+ with evidence</Text>
            </View>
          </View>
          <View style={s.col}>
            <View style={s.card}>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: C.amber, marginBottom: 4 }}>10 Free Tools</Text>
              <Text style={s.bullet}>• Equity Split Calculator</Text>
              <Text style={s.bullet}>• Dilution Modeller</Text>
              <Text style={s.bullet}>• Cap Table Manager</Text>
              <Text style={s.bullet}>• Term Sheet AI</Text>
              <Text style={s.bullet}>• Data Room Builder</Text>
              <Text style={s.bullet}>• R&D Tax Calculator & ESIC Checker</Text>
            </View>
            <View style={[s.card, { backgroundColor: C.brandLight }]}>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: C.brand, textAlign: "center" }}>
                One Platform. Entire Startup Lifecycle. From Idea to Exit.
              </Text>
            </View>
          </View>
        </View>
        <Footer num={4} />
      </Page>

      {/* ═══ Slide 5: How It Works ═══ */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.headline}>From Idea to Intelligence in 60 Seconds</Text>
        <View style={[s.row, { marginTop: 8 }]}>
          {[
            { step: "1", title: "Enter Details", desc: "Founder inputs startup info, URL, or uploads documents", time: "~5 min" },
            { step: "2", title: "AI Analyses", desc: "Multi-model AI scores across 8 dimensions + deep tech audit", time: "~60 sec" },
            { step: "3", title: "Get Report", desc: "Full valuation report with scores, gaps, and specific next steps", time: "Instant" },
            { step: "4", title: "Upload Evidence", desc: "Connect GitHub, Stripe, Analytics — score updates in real-time", time: "Ongoing" },
            { step: "5", title: "Grow & Fundraise", desc: "Cap table, data room, investor prep — all in one platform", time: "Lifecycle" },
          ].map((item) => (
            <View key={item.step} style={[s.card, { flex: 1, alignItems: "center", paddingVertical: 16 }]}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "bold", color: C.white }}>{item.step}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: C.ink800, textAlign: "center", marginBottom: 4 }}>{item.title}</Text>
              <Text style={{ fontSize: 9, color: C.ink500, textAlign: "center", lineHeight: 1.4 }}>{item.desc}</Text>
              <Text style={{ fontSize: 8, color: C.brand, fontWeight: "bold", marginTop: 6 }}>{item.time}</Text>
            </View>
          ))}
        </View>
        <View style={[s.card, { marginTop: 12, backgroundColor: C.brandLight, alignItems: "center" }]}>
          <Text style={{ fontSize: 11, fontWeight: "bold", color: C.brand }}>
            6 AI Providers (Claude, GPT, Gemini + 3 fallbacks) with 99.9% uptime — auto-failover if any provider goes down
          </Text>
        </View>
        <Footer num={5} />
      </Page>

      {/* ═══ Slide 6: Market Opportunity ═══ */}
      <Page size="A4" orientation="landscape" style={s.darkPage}>
        <Text style={s.headlineDark}>A$15B Ecosystem. 2,600+ Startups. Zero Unified Platform.</Text>
        <View style={s.row}>
          <View style={[s.col, { alignItems: "center" }]}>
            <View style={{ width: 180, height: 180, borderRadius: 90, borderWidth: 2, borderColor: C.brand, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderColor: C.gold, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.emerald, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "bold", color: C.white }}>SOM</Text>
                  <Text style={{ fontSize: 8, color: C.white }}>A$250K Y1</Text>
                </View>
              </View>
            </View>
            <Text style={{ fontSize: 9, color: C.brand, marginTop: 8 }}>TAM: $4.4T (Global)</Text>
            <Text style={{ fontSize: 9, color: C.gold }}>SAM: $3.2B (Cap table + valuation)</Text>
            <Text style={{ fontSize: 9, color: C.emerald }}>SOM: A$250K (500 AU startups Y1)</Text>
          </View>
          <View style={s.col}>
            <View style={s.cardDark}>
              <Text style={{ fontSize: 28, fontWeight: "bold", color: C.brand }}>2,600+</Text>
              <Text style={{ fontSize: 10, color: C.ink400 }}>Active Australian startups (Startup Genome)</Text>
            </View>
            <View style={s.cardDark}>
              <Text style={{ fontSize: 28, fontWeight: "bold", color: C.gold }}>300+</Text>
              <Text style={{ fontSize: 10, color: C.ink400 }}>Accelerators & incubators (StartupAus)</Text>
            </View>
            <View style={s.cardDark}>
              <Text style={{ fontSize: 28, fontWeight: "bold", color: C.emerald }}>15,000+</Text>
              <Text style={{ fontSize: 10, color: C.ink400 }}>Angel investors (AAAI)</Text>
            </View>
            <Text style={{ fontSize: 10, color: C.ink500, marginTop: 8 }}>
              Expansion: Australia → NZ → APAC → Global
            </Text>
          </View>
        </View>
        <Footer num={6} dark />
      </Page>

      {/* ═══ Slide 7: Business Model ═══ */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.headline}>Land Free. Expand Paid. Grow with Founders.</Text>
        <View style={s.row}>
          {[
            { tier: "Free", price: "$0", features: ["SVI score", "Basic tools", "1 analysis"], color: C.ink500 },
            { tier: "Founding 100", price: "A$1", features: ["100 credits lifetime", "Evidence vault", "Cap table tools", "Term sheet AI"], color: C.brand },
            { tier: "Growth", price: "A$99/mo", features: ["100 credits/month", "Full reports", "Data room", "Priority support"], color: C.emerald },
            { tier: "Enterprise", price: "Custom", features: ["Portfolio dashboard", "API access", "White-label", "Dedicated CSM"], color: C.gold },
          ].map((t) => (
            <View key={t.tier} style={[s.card, { flex: 1, borderTopWidth: 3, borderTopColor: t.color }]}>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: t.color, marginBottom: 2 }}>{t.tier}</Text>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: C.ink800, marginBottom: 8 }}>{t.price}</Text>
              {t.features.map((f) => (
                <Text key={f} style={{ fontSize: 9, color: C.ink500, marginBottom: 3 }}>• {f}</Text>
              ))}
            </View>
          ))}
        </View>
        <View style={s.row}>
          <StatBox value="10%" label="Free-to-paid target" />
          <StatBox value="<5%" label="Monthly churn target" />
          <StatBox value="A$250K" label="Year 1 ARR target" color={C.emerald} />
          <StatBox value="A$5M" label="Year 3 ARR target" color={C.gold} />
        </View>
        <Footer num={7} />
      </Page>

      {/* ═══ Slide 8: Traction ═══ */}
      <Page size="A4" orientation="landscape" style={s.darkPage}>
        <Text style={s.headlineDark}>Live Product. Real Users. Growing Fast.</Text>
        <Text style={s.subheadlineDark}>BlockID.au is operational today — not a pitch deck, a production platform.</Text>
        <View style={s.row}>
          {[
            { value: "50+", label: "Australian founders", color: C.brand },
            { value: "200+", label: "SVI analyses completed", color: C.emerald },
            { value: "$2M+", label: "Valuations tracked", color: C.gold },
            { value: "10", label: "Free tools live", color: C.white },
          ].map((m) => (
            <View key={m.label} style={[s.cardDark, { flex: 1, alignItems: "center", paddingVertical: 16 }]}>
              <Text style={{ fontSize: 32, fontWeight: "bold", color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 9, color: C.ink400, marginTop: 4 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        <View style={s.row}>
          <View style={[s.cardDark, { flex: 1 }]}>
            <Text style={{ fontSize: 11, fontWeight: "bold", color: C.emerald, marginBottom: 4 }}>✓ Complete</Text>
            <Text style={s.bulletDark}>• Phase 1: SVI scoring engine live</Text>
            <Text style={s.bulletDark}>• Phase 2: Evidence Vault + OAuth connectors</Text>
            <Text style={s.bulletDark}>• Phase 5: Cosmos blockchain testnet running</Text>
          </View>
          <View style={[s.cardDark, { flex: 1 }]}>
            <Text style={{ fontSize: 11, fontWeight: "bold", color: C.brand, marginBottom: 4 }}>⚡ In Progress</Text>
            <Text style={s.bulletDark}>• Phase 3: Dollar valuation engine</Text>
            <Text style={s.bulletDark}>• Phase 4: Cap table + vesting</Text>
            <Text style={s.bulletDark}>• Phase 6: Pitch deck + data room tools</Text>
          </View>
          <View style={[s.cardDark, { flex: 1 }]}>
            <Text style={{ fontSize: 11, fontWeight: "bold", color: C.gold, marginBottom: 4 }}>Tech Stack</Text>
            <Text style={s.bulletDark}>• 6 AI providers with auto-failover</Text>
            <Text style={s.bulletDark}>• 31+ SEO articles published</Text>
            <Text style={s.bulletDark}>• 37 custom analytics events</Text>
          </View>
        </View>
        <Footer num={8} dark />
      </Page>

      {/* ═══ Slide 9: Competition ═══ */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.headline}>No One Covers the Full Lifecycle</Text>
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 8, overflow: "hidden" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", backgroundColor: C.ink900, padding: 10 }}>
            <Text style={{ flex: 2, fontSize: 9, fontWeight: "bold", color: C.white }}>Feature</Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: "bold", color: C.brand, textAlign: "center" }}>BlockID</Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: "bold", color: C.ink400, textAlign: "center" }}>Carta</Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: "bold", color: C.ink400, textAlign: "center" }}>Pulley</Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: "bold", color: C.ink400, textAlign: "center" }}>Equidam</Text>
          </View>
          {/* Rows */}
          {[
            { feature: "AI Valuation Scoring", blockid: true, carta: false, pulley: false, equidam: true },
            { feature: "Full Report Generation", blockid: true, carta: false, pulley: false, equidam: false },
            { feature: "Cap Table Management", blockid: true, carta: true, pulley: true, equidam: false },
            { feature: "Evidence Vault (live data)", blockid: true, carta: false, pulley: false, equidam: false },
            { feature: "Australian Focus (ESIC, R&D Tax)", blockid: true, carta: false, pulley: false, equidam: false },
            { feature: "Free Tier Available", blockid: true, carta: false, pulley: false, equidam: true },
            { feature: "Blockchain Equity (Roadmap)", blockid: true, carta: false, pulley: false, equidam: false },
            { feature: "Full Startup Lifecycle", blockid: true, carta: false, pulley: false, equidam: false },
          ].map((row, i) => (
            <View key={row.feature} style={{ flexDirection: "row", padding: 8, backgroundColor: i % 2 === 0 ? C.white : C.surface50 }}>
              <Text style={{ flex: 2, fontSize: 9, color: C.ink700 }}>{row.feature}</Text>
              <View style={{ flex: 1, alignItems: "center" }}>{row.blockid ? <Check /> : <Cross />}</View>
              <View style={{ flex: 1, alignItems: "center" }}>{row.carta ? <Check /> : <Cross />}</View>
              <View style={{ flex: 1, alignItems: "center" }}>{row.pulley ? <Check /> : <Cross />}</View>
              <View style={{ flex: 1, alignItems: "center" }}>{row.equidam ? <Check /> : <Cross />}</View>
            </View>
          ))}
        </View>
        <View style={[s.card, { marginTop: 12, backgroundColor: C.brandLight }]}>
          <Text style={{ fontSize: 10, color: C.brand, textAlign: "center" }}>
            Carta: $8K+/year, US-focused, no AI | Manual valuation: $5K-$50K, 2-6 weeks | BlockID: Free to start, 60 seconds, full lifecycle
          </Text>
        </View>
        <Footer num={9} />
      </Page>

      {/* ═══ Slide 10: Roadmap ═══ */}
      <Page size="A4" orientation="landscape" style={s.darkPage}>
        <Text style={s.headlineDark}>8 Phases: Idea to IPO</Text>
        <View style={{ gap: 6 }}>
          {[
            { phase: "1", name: "Idea & Analysis", status: "✅ COMPLETE", time: "Done", color: C.emerald },
            { phase: "2", name: "Validation & Evidence", status: "✅ COMPLETE", time: "Done", color: C.emerald },
            { phase: "3", name: "MVP & Dollar Valuation", status: "⚡ In Progress", time: "Q3 2026", color: C.brand },
            { phase: "4", name: "Equity & Cap Table", status: "⚡ In Progress", time: "Q4 2026", color: C.brand },
            { phase: "5", name: "Tokenization (Cosmos)", status: "✅ Chain Live", time: "Q1 2027", color: C.emerald },
            { phase: "6", name: "Investment & Fundraise", status: "⚡ Starting", time: "Q2 2027", color: C.gold },
            { phase: "7", name: "Revenue & Dividends", status: "📋 Planned", time: "2028", color: C.ink500 },
            { phase: "8", name: "Growth & Exit", status: "📋 Planned", time: "2028+", color: C.ink500 },
          ].map((p) => (
            <View key={p.phase} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "bold", color: C.white }}>{p.phase}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: C.white, width: 200 }}>{p.name}</Text>
              <Text style={{ fontSize: 10, color: p.color, width: 120 }}>{p.status}</Text>
              <Text style={{ fontSize: 10, color: C.ink400 }}>{p.time}</Text>
            </View>
          ))}
        </View>
        <Footer num={10} dark />
      </Page>

      {/* ═══ Slide 11: Team ═══ */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.headline}>Built by a Founder Who Knows the Pain</Text>
        <View style={s.row}>
          <View style={[s.col, s.card, { alignItems: "center", paddingVertical: 20 }]}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: C.ink800 }}>Do Van Long</Text>
            <Text style={{ fontSize: 11, color: C.brand, marginTop: 4 }}>Founder & CEO</Text>
            <Text style={{ fontSize: 10, color: C.ink500, marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
              Full-stack technical founder who single-handedly built BlockID.au from concept to live production. Designed the AI engine, built the frontend, configured infrastructure, and shipped — all before seeking external funding.
            </Text>
            <Text style={{ fontSize: 9, color: C.brand, marginTop: 8 }}>linkedin.com/in/dovanlong</Text>
          </View>
          <View style={s.col}>
            <View style={s.card}>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: C.brand, marginBottom: 6 }}>AI-Augmented C-Suite</Text>
              <Text style={{ fontSize: 9, color: C.ink500, marginBottom: 4 }}>11 C-level AI agents with 45+ specialized skills operating across:</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {["CTO", "CFO", "CMO", "CPO", "CRO", "COO", "CHRO", "CLO", "CISO", "CDO", "CBO"].map((role) => (
                  <Text key={role} style={{ fontSize: 8, color: C.brand, backgroundColor: C.brandLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 }}>{role}</Text>
                ))}
              </View>
            </View>
            <View style={s.card}>
              <Text style={{ fontSize: 12, fontWeight: "bold", color: C.emerald, marginBottom: 4 }}>Next Key Hires</Text>
              <Text style={s.bullet}>• Growth Lead — user acquisition + accelerator partnerships</Text>
              <Text style={s.bullet}>• Blockchain Engineer — Cosmos chain production</Text>
            </View>
          </View>
        </View>
        <Footer num={11} />
      </Page>

      {/* ═══ Slide 12: The Ask ═══ */}
      <Page size="A4" orientation="landscape" style={[s.darkPage, { paddingTop: 0, paddingBottom: 0 }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 14, color: C.brand, fontWeight: "bold", letterSpacing: 2, marginBottom: 8 }}>PRE-SEED ROUND</Text>
          <Text style={{ fontSize: 42, fontWeight: "bold", color: C.white }}>A$500,000</Text>
          <Text style={{ fontSize: 14, color: C.ink400, marginTop: 8 }}>12-month runway to A$250K ARR and 500 active users</Text>

          <View style={{ flexDirection: "row", gap: 16, marginTop: 28 }}>
            {[
              { pct: "50%", label: "Engineering\n(AI + Blockchain)", color: C.brand },
              { pct: "20%", label: "Marketing\n& Growth", color: C.emerald },
              { pct: "15%", label: "Operations\n& Infrastructure", color: C.gold },
              { pct: "10%", label: "Legal, IP\n& Compliance", color: C.amber },
              { pct: "5%", label: "Reserve", color: C.ink500 },
            ].map((item) => (
              <View key={item.label} style={{ alignItems: "center", width: 100 }}>
                <Text style={{ fontSize: 22, fontWeight: "bold", color: item.color }}>{item.pct}</Text>
                <Text style={{ fontSize: 8, color: C.ink400, textAlign: "center", marginTop: 4 }}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 28, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: C.white }}>
              Every great company started exactly where we are. Let&apos;s build this together.
            </Text>
          </View>

          <View style={{ marginTop: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 11, color: C.brand, fontWeight: "bold" }}>Do Van Long — Founder & CEO</Text>
            <Text style={{ fontSize: 10, color: C.ink400, marginTop: 4 }}>ceo@longcare.au | linkedin.com/in/dovanlong | blockid.au</Text>
            <Text style={{ fontSize: 9, color: C.ink500, marginTop: 4 }}>Auschain PTY LTD | ACN 659 615 111 | ABN 79 659 615 111 | Sydney, NSW</Text>
          </View>
        </View>
        <Footer num={12} dark />
      </Page>
    </Document>
  );
}
