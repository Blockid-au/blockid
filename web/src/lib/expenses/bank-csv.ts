// S28-C — AU bank-statement CSV parser, shared by
//   POST /api/evidence/bank-statement   (one svi_evidence row: burn / runway)
//   POST /api/expenses/import           (one bank_transactions row per line)
//
// Lifted verbatim from the evidence route (no external dependency) and
// extended with `parseAuDate` (DD/MM/YYYY first — `new Date("01/06/2026")`
// reads as 6 January in V8) and `transactionHash` (the per-project dedupe
// key, migration 0377).
//
// Accepted CSV formats (auto-detected by header):
//   ANZ:      Date, Details, Debit, Credit, Balance
//   CBA:      Date, Amount, Description, Balance
//   NAB:      Date, Amount, Account Number, Transaction Type, Description
//   Westpac:  BSB, Account Number, Transaction Date, Narration, Cheque Number,
//             Debit Amount, Credit Amount, Balance
//   Generic:  any CSV with Date + (Amount | Debit/Credit) columns

import { createHash } from "node:crypto";

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (const ch of trimmed) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

export interface Tx { date: string; amount: number; description: string }

export function detectAndParse(rows: string[][]): { txs: Tx[]; bankName: string } | null {
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z ]/g, "").trim());

  // ANZ: Date, Details, Debit, Credit, Balance
  const anzDebit = header.indexOf("debit");
  const anzCredit = header.indexOf("credit");
  const anzDate = header.indexOf("date");
  if (anzDate >= 0 && anzDebit >= 0 && anzCredit >= 0) {
    const txs: Tx[] = [];
    for (const row of rows.slice(1)) {
      if (row.length < 3) continue;
      const debit = parseFloat(row[anzDebit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      const credit = parseFloat(row[anzCredit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      txs.push({ date: row[anzDate] ?? "", amount: credit - debit, description: row[1] ?? "" });
    }
    return { txs, bankName: "ANZ" };
  }

  // CBA: Date, Amount, Description, Balance
  const cbaAmount = header.indexOf("amount");
  const cbaDate = header.indexOf("date");
  const cbaDesc = header.indexOf("description");
  if (cbaDate >= 0 && cbaAmount >= 0 && cbaDesc >= 0 && anzDebit < 0) {
    const txs: Tx[] = rows.slice(1).map((row) => ({
      date: row[cbaDate] ?? "",
      amount: parseFloat(row[cbaAmount]?.replace(/[,$\s]/g, "") ?? "") || 0,
      description: row[cbaDesc] ?? "",
    }));
    return { txs, bankName: "CBA" };
  }

  // Westpac: Debit Amount / Credit Amount columns
  const wDebit = header.findIndex((h) => h.includes("debit"));
  const wCredit = header.findIndex((h) => h.includes("credit"));
  const wDate = header.findIndex((h) => h.includes("date") || h.includes("transaction date"));
  if (wDate >= 0 && wDebit >= 0 && wCredit >= 0 && wDebit !== anzDebit) {
    const txs: Tx[] = rows.slice(1).map((row) => {
      const debit = parseFloat(row[wDebit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      const credit = parseFloat(row[wCredit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      return { date: row[wDate] ?? "", amount: credit - debit, description: row[3] ?? "" };
    });
    return { txs, bankName: "Westpac" };
  }

  // Generic: first column with "date" + column with "amount"
  const gDate = header.findIndex((h) => h.includes("date"));
  const gAmount = header.findIndex((h) => h.includes("amount") || h.includes("value"));
  if (gDate >= 0 && gAmount >= 0) {
    const txs: Tx[] = rows.slice(1).map((row) => ({
      date: row[gDate] ?? "",
      amount: parseFloat(row[gAmount]?.replace(/[,$\s]/g, "") ?? "") || 0,
      description: row.find((_, i) => i !== gDate && i !== gAmount) ?? "",
    }));
    return { txs, bankName: "Generic" };
  }

  return null;
}

/**
 * AU bank date → "YYYY-MM-DD". Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
 * D/M/YY, YYYY-MM-DD, YYYY/MM/DD and "3 Jun 2026". Returns null when the
 * string is not a real calendar date (31/02, 13 as a month, …).
 */
export function parseAuDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
    if (match[3].length === 2) y += 2000;
  } else if ((match = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/))) {
    d = Number(match[1]);
    m = MONTH_NAMES.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    y = Number(match[3]);
    if (match[3].length === 2) y += 2000;
  } else {
    return null;
  }
  if (!m || m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Single-space, trimmed narration (what the hash and the rules see). */
export function normaliseDescription(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

/**
 * Dedupe key (migration 0377: UNIQUE (project_id, hash)). Same day, same
 * signed cents, same narration ⇒ same line — a second upload of the same
 * statement, or an overlapping export, stores each line once. Two genuine
 * identical purchases on one day collapse too; that is the trade-off the
 * bank's own exports force (no stable transaction id in any AU CSV).
 */
export function transactionHash(occurredOn: string, amountAud: number, description: string): string {
  const cents = Math.round(amountAud * 100);
  const key = `${occurredOn}|${cents}|${normaliseDescription(description).toLowerCase()}`;
  return createHash("sha256").update(key).digest("hex");
}

export interface NormalisedTx {
  occurredOn: string;
  amountAud: number;
  description: string;
  hash: string;
}

/** Parsed lines → normalised rows; lines without a real date / amount / narration are dropped and counted. */
export function normaliseTransactions(txs: Tx[]): { rows: NormalisedTx[]; skipped: number } {
  const rows: NormalisedTx[] = [];
  let skipped = 0;
  for (const t of txs) {
    const occurredOn = parseAuDate(t.date);
    const description = normaliseDescription(t.description);
    const amountAud = Math.round((Number(t.amount) || 0) * 100) / 100;
    if (!occurredOn || !description || amountAud === 0 || !Number.isFinite(amountAud)) {
      skipped++;
      continue;
    }
    rows.push({ occurredOn, amountAud, description, hash: transactionHash(occurredOn, amountAud, description) });
  }
  return { rows, skipped };
}

export function analyzeTransactions(txs: Tx[]): {
  totalDebits: number;
  totalCredits: number;
  netCashFlow: number;
  avgMonthlyBurn: number;
  months: number;
  sviImpact: number;
} {
  const validTxs = txs.filter((t) => !isNaN(t.amount));
  const totalDebits = validTxs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalCredits = validTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const netCashFlow = totalCredits - totalDebits;

  // Estimate months covered (AU day-first dates; `new Date` as the last resort)
  const dates = validTxs
    .map((t) => {
      const iso = parseAuDate(t.date);
      return iso ? new Date(`${iso}T00:00:00Z`) : new Date(t.date);
    })
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const months = dates.length >= 2
    ? Math.max(1, Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / (30 * 86_400_000)))
    : 1;

  const avgMonthlyBurn = Math.round(totalDebits / months);

  // SVI impact: evidence quality based on data richness
  const sviImpact = Math.min(20, Math.max(5, Math.floor(validTxs.length / 10)));

  return { totalDebits, totalCredits, netCashFlow, avgMonthlyBurn, months, sviImpact };
}

/** "<bank>:<file name>:<sha256(text)[0:16]>" — the upload id stored on every row it produced. */
export function statementRef(bankName: string, fileName: string, text: string): string {
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return `${bankName}:${fileName.slice(0, 80)}:${digest}`;
}
