import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  classifyCert,
  S708_DISCLAIMER,
  summariseCerts,
  type S708CertRecord,
} from "@/lib/compliance/s708-wholesale";

export const metadata: Metadata = {
  title: "s708(8) wholesale investor certificates | BlockID",
  description:
    "Track qualified-accountant certificates that unlock the s708(8) Corporations Act wholesale-investor disclosure exemption.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface CertRow {
  id: string;
  investor_email: string;
  certifying_accountant_name: string;
  certifying_accountant_firm: string;
  cert_type: S708CertRecord["cert_type"];
  cert_date: string;
  expiry_date: string;
  evidence_url: string | null;
}

async function loadCerts(
  userId: string,
  projectId: string | null,
): Promise<S708CertRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("compliance_s708_certs")
    .select(
      "id, investor_email, certifying_accountant_name, certifying_accountant_firm, cert_type, cert_date, expiry_date, evidence_url",
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("cert_date", { ascending: false });

  const now = new Date();
  return ((data as CertRow[] | null) ?? []).map((row) => {
    const cls = classifyCert(row.cert_date, row.expiry_date, now);
    return {
      id: row.id,
      investor_email: row.investor_email,
      certifying_accountant_name: row.certifying_accountant_name,
      certifying_accountant_firm: row.certifying_accountant_firm,
      cert_type: row.cert_type,
      cert_date: row.cert_date,
      expiry_date: row.expiry_date,
      evidence_url: row.evidence_url,
      status: cls.status,
      days_to_expiry: cls.days_to_expiry,
    };
  });
}

const STATUS_LABEL: Record<S708CertRecord["status"], string> = {
  valid: "Valid",
  expiring_soon: "Expiring < 60d",
  expired: "Expired",
};

export default async function S708CompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/s708");

  const project = await getActiveProject(user.id);
  const certs = await loadCerts(user.id, project?.id ?? null);
  const summary = summariseCerts(certs);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            AU compliance
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            s708(8) wholesale investor certificates
          </h1>
          <p className="text-sm text-muted-foreground">
            <em>Corporations Act 2001 (Cth)</em> s708(8) + Regulations 6D.2.03 —
            a qualified accountant (CA/CPA/IPA) certifies the investor holds
            ≥&nbsp;A$2.5M net assets or has earned ≥&nbsp;A$250k gross income for
            two consecutive years. Certificates lapse two years after signing.
          </p>
        </header>

        <section
          aria-label="Certificate summary"
          data-testid="s708-summary"
          className="grid gap-3 sm:grid-cols-4"
        >
          <SummaryTile label="Total" value={summary.total} tone="slate" />
          <SummaryTile label="Valid" value={summary.valid} tone="emerald" />
          <SummaryTile
            label="Expiring < 60d"
            value={summary.expiring_soon}
            tone="amber"
          />
          <SummaryTile label="Expired" value={summary.expired} tone="red" />
        </section>

        {certs.length === 0 ? (
          <section
            data-testid="s708-empty-state"
            className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground"
          >
            No certificates on file. Wholesale-only rounds lose the s708
            exemption without a current cert per investor — collect certificates
            before closing.
          </section>
        ) : (
          <section
            aria-label="Certificate list"
            data-testid="s708-cert-list"
            className="rounded-2xl border border-border bg-background p-4"
          >
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">Investor</th>
                  <th className="pb-2 text-left font-medium">Basis</th>
                  <th className="pb-2 text-left font-medium">Signed</th>
                  <th className="pb-2 text-left font-medium">Expires</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {certs.map((cert) => (
                  <tr key={cert.id} className="text-foreground">
                    <td className="py-2">{cert.investor_email}</td>
                    <td className="py-2">
                      {cert.cert_type === "net_assets"
                        ? "A$2.5M net assets"
                        : "A$250k gross income"}
                    </td>
                    <td className="py-2">{cert.cert_date}</td>
                    <td className="py-2">{cert.expiry_date}</td>
                    <td className="py-2">{STATUS_LABEL[cert.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/workspace/fundraise"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to fundraise workspace
          </Link>
          <Link
            href="/guide/10-fundraise"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-100"
          >
            Read Chapter 10 — Fundraise
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">{S708_DISCLAIMER}</p>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "amber" | "red";
}) {
  const toneClass = {
    slate: "border-border text-foreground",
    emerald: "border-emerald-200 text-emerald-800",
    amber: "border-amber-200 text-amber-800",
    red: "border-red-200 text-red-800",
  }[tone];
  return (
    <div className={`rounded-xl border bg-background p-3 ${toneClass}`}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
