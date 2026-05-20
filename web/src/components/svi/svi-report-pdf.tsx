import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { SVIAnalysis } from "@/lib/svi-analysis";

// Use Helvetica (built-in, no registration needed)

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", color: "#1e293b" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 4 },
  sviScore: { fontSize: 48, fontWeight: "bold", color: "#2563eb", textAlign: "center", marginVertical: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#1e293b", marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingBottom: 4 },
  dimRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  dimLabel: { fontSize: 10, color: "#475569" },
  dimValue: { fontSize: 10, fontWeight: "bold", color: "#1e293b" },
  bar: { height: 6, borderRadius: 3, backgroundColor: "#e2e8f0", marginTop: 2 },
  barFill: { height: 6, borderRadius: 3, backgroundColor: "#2563eb" },
  gap: { paddingVertical: 3, paddingHorizontal: 8, marginBottom: 4, backgroundColor: "#f8fafc", borderRadius: 4 },
  gapText: { fontSize: 9, color: "#475569" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8" },
});

const DIM_LABELS: Record<string, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Technical Depth",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

interface Props {
  analysis: SVIAnalysis;
  email?: string;
}

export function SVIReportPDF({ analysis, email }: Props) {
  const date = new Date().toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>BlockID.au — Startup Value Index Report</Text>
          <Text style={styles.subtitle}>Generated {date}{email ? ` for ${email}` : ""}</Text>
        </View>

        {/* SVI Score */}
        <View style={{ alignItems: "center", marginVertical: 16, padding: 20, backgroundColor: "#eff6ff", borderRadius: 8 }}>
          <Text style={{ fontSize: 12, color: "#64748b" }}>Your SVI Score</Text>
          <Text style={styles.sviScore}>{analysis.totalSVI}</Text>
          <Text style={{ fontSize: 11, color: "#475569" }}>{analysis.summary}</Text>
        </View>

        {/* Dimensions */}
        <Text style={styles.sectionTitle}>Dimension Breakdown</Text>
        {(analysis.subs || []).map((sub) => (
          <View key={sub.key} style={styles.dimRow}>
            <Text style={styles.dimLabel}>{DIM_LABELS[sub.key] || sub.label}</Text>
            <Text style={styles.dimValue}>{sub.value}/100</Text>
          </View>
        ))}

        {/* Evidence Gaps */}
        {analysis.evidenceGaps && analysis.evidenceGaps.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Evidence Gaps & Next Steps</Text>
            {analysis.evidenceGaps.slice(0, 8).map((gap, i) => (
              <View key={i} style={styles.gap}>
                <Text style={{ fontSize: 9, fontWeight: "bold", color: "#1e293b" }}>{gap.label}</Text>
                <Text style={styles.gapText}>{gap.action} — potential +{gap.impact} SVI</Text>
              </View>
            ))}
          </View>
        )}

        {/* Risk Flags */}
        {analysis.riskPenalties && analysis.riskPenalties.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Risk Flags</Text>
            {analysis.riskPenalties.map((risk, i) => (
              <Text key={i} style={{ fontSize: 9, color: "#dc2626", marginBottom: 3 }}>
                • {risk.label}: -{risk.points} pts — {risk.reason}
              </Text>
            ))}
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          BlockID.au — Valuation. Ownership. Execution. Growth. | Auschain PTY LTD | blockid.au
        </Text>
      </Page>
    </Document>
  );
}
