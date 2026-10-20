#!/usr/bin/env node
// A2 (pricing v5 §7.4, G35) — builds the model-eval golden set
// web/test-fixtures/model-eval/<task>/{dev,heldout}.json (+ vision PNGs).
//
// SYNTHETIC ONLY: fictional companies, figures drawn from a seeded PRNG,
// public Australian program facts (ESIC / R&DTI thresholds) for the chat
// context. No customer data (the repo is public). Deterministic: the same
// seed produces byte-identical files, so a re-run is a no-op diff.
//
//   node scripts/ai/build-model-eval-fixtures.mjs          # write
//   node scripts/ai/build-model-eval-fixtures.mjs --check  # exit 1 if files would change
//
// Held-out cases use a different seed stream from dev and must never be
// used to tune prompts (SOT §13.1): rotate the seed (bump VERSION) after a
// held-out failure is fixed.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "2026-10-20.1";
const SOURCE = "synthetic — scripts/ai/build-model-eval-fixtures.mjs (fictional companies, seeded figures; chat context = public AU program facts)";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../test-fixtures/model-eval");
const CHECK = process.argv.includes("--check");

const COUNTS = {
  report_chapter: [40, 20],
  ceo_synthesis: [40, 20],
  grounding_judge: [40, 20],
  extraction: [40, 20],
  classify: [40, 20],
  translation: [40, 20],
  chat: [40, 20],
  vision: [24, 12],
};

// ── PRNG ──────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const mk = (task, split) => {
  const r = mulberry32(seedOf(`${VERSION}|${task}|${split}`));
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  return { r, int, pick };
};

// ── Vocabulary (fictional) ────────────────────────────────────────────
const PREFIX = ["Wattle", "Banksia", "Koala", "Tidal", "Saltbush", "Ironbark", "Lyrebird", "Coral", "Dingo", "Quokka", "Mallee", "Spinifex", "Kestrel", "Paperbark", "Bluegum", "Numbat", "Brolga", "Echidna", "Galah", "Jarrah"];
const SUFFIX = ["Labs", "Analytics", "Health", "Pay", "Grid", "Works", "Logic", "Cloud", "Farm", "Learn"];
const CITY = ["Brisbane", "Perth", "Adelaide", "Hobart", "Melbourne", "Sydney", "Darwin", "Canberra", "Newcastle", "Geelong"];
const CITY_VI = { Brisbane: "Brisbane", Perth: "Perth", Adelaide: "Adelaide", Hobart: "Hobart", Melbourne: "Melbourne", Sydney: "Sydney", Darwin: "Darwin", Canberra: "Canberra", Newcastle: "Newcastle", Geelong: "Geelong" };
const SECTORS = {
  saas: { en: "B2B software for accounting firms", vi: "phần mềm B2B cho các công ty kế toán" },
  fintech: { en: "a payments app for small retailers", vi: "ứng dụng thanh toán cho cửa hàng bán lẻ nhỏ" },
  healthtech: { en: "remote monitoring for aged-care residents", vi: "theo dõi từ xa cho người cao tuổi trong viện dưỡng lão" },
  agritech: { en: "soil-moisture sensors for grain farms", vi: "cảm biến độ ẩm đất cho trang trại ngũ cốc" },
  edtech: { en: "a maths tutoring platform for high-school students", vi: "nền tảng dạy kèm toán cho học sinh trung học" },
  cleantech: { en: "battery management software for rooftop solar", vi: "phần mềm quản lý pin cho điện mặt trời áp mái" },
  marketplace: { en: "a two-sided marketplace matching tradies with homeowners", vi: "sàn giao dịch hai chiều kết nối thợ với chủ nhà" },
  deeptech: { en: "quantum-safe encryption chips", vi: "chip mã hoá an toàn lượng tử" },
};
const SECTOR_KEYS = Object.keys(SECTORS);
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n) => n.toLocaleString("en-AU");
const company = (g) => `${g.pick(PREFIX)} ${g.pick(SUFFIX)}`;

// ── Evidence factory (shared by report_chapter / ceo_synthesis / judge) ──
function evidenceSet(g, lang, rich) {
  const mrr = g.int(8, 95) * 1000 + g.int(0, 9) * 100;
  const customers = g.int(12, 480);
  const margin = g.int(38, 84);
  const churn = (g.int(8, 60) / 10).toFixed(1);
  const founded = g.int(2019, 2025);
  const raised = g.int(2, 40) * 50_000;
  const headcount = g.int(2, 35);
  const city = g.pick(CITY);
  const vi = lang === "vi";
  const rows = [
    { id: "e1", label: "Stripe export", text: vi ? `Doanh thu định kỳ hàng tháng (MRR) đạt A$${fmt(mrr)} trong tháng 9/2026.` : `Monthly recurring revenue was A$${fmt(mrr)} in September 2026.` },
    { id: "e2", label: "CRM export", text: vi ? `Có ${customers} khách hàng trả phí tính đến 30/9/2026.` : `${customers} paying customers as of 30 September 2026.` },
    { id: "e3", label: "Management accounts", text: vi ? `Biên lợi nhuận gộp ${margin}% trong năm tài chính 2026.` : `Gross margin was ${margin}% for FY2026.` },
    { id: "e4", label: "Company profile", text: vi ? `Thành lập năm ${founded} tại ${CITY_VI[city]}; hiện có ${headcount} nhân viên toàn thời gian.` : `Founded in ${founded} in ${city}; ${headcount} full-time staff today.` },
    { id: "e5", label: "Billing analytics", text: vi ? `Tỷ lệ khách hàng rời bỏ hàng tháng là ${churn}% trong quý 3/2026.` : `Monthly customer churn was ${churn}% in Q3 2026.` },
    { id: "e6", label: "Cap table", text: vi ? `Đã huy động A$${fmt(raised)} từ nhà đầu tư thiên thần.` : `Raised A$${fmt(raised)} from angel investors.` },
  ];
  const facts = { mrr, customers, margin, churn, founded, raised, headcount, city };
  if (!rich) {
    const poor = [
      { id: "e1", label: "Founder interview", text: vi ? "Nhà sáng lập cho biết sản phẩm đang chạy thử với một số khách hàng; chưa cung cấp số liệu doanh thu." : "The founder says the product is in pilot with a few customers; no revenue figures were provided." },
      { id: "e2", label: "Company profile", text: vi ? `Thành lập năm ${founded} tại ${CITY_VI[city]}.` : `Founded in ${founded} in ${city}.` },
    ];
    return { rows: poor, facts, poor: true };
  }
  const n = g.int(4, 6);
  return { rows: rows.slice(0, n), facts, poor: false };
}

const CHAPTERS = ["traction", "team", "market", "product", "financials", "moat"];
const FORBIDDEN_COMMON = ["guaranteed return", "unicorn status", "lợi nhuận đảm bảo"];

// ── Task builders ─────────────────────────────────────────────────────
const builders = {
  report_chapter(g, i, lang) {
    const rich = g.r() > 0.2;
    const ev = evidenceSet(g, lang, rich);
    const section = CHAPTERS[i % CHAPTERS.length];
    return {
      section,
      input: { company: company(g), section, evidence: ev.rows },
      expected: { min_citations: ev.poor ? 1 : 2, must_not_mention: FORBIDDEN_COMMON },
    };
  },
  ceo_synthesis(g, i, lang) {
    const ev = evidenceSet(g, lang, true);
    const f = ev.facts;
    const vi = lang === "vi";
    const chapters = [
      { section: "traction", score: g.int(40, 80), verdict: vi ? `MRR A$${fmt(f.mrr)} [ev:e1] với ${f.customers} khách hàng [ev:e2].` : `MRR of A$${fmt(f.mrr)} [ev:e1] across ${f.customers} customers [ev:e2].` },
      { section: "financials", score: g.int(35, 80), verdict: vi ? `Biên lợi nhuận gộp ${f.margin}% [ev:e3].` : `Gross margin of ${f.margin}% [ev:e3].` },
      { section: "team", score: g.int(30, 85), verdict: vi ? `Đội ngũ ${f.headcount} người [ev:e4].` : `Team of ${f.headcount} people [ev:e4].` },
    ];
    return {
      section: "executive",
      input: { company: company(g), chapters, evidence: ev.rows },
      expected: { min_citations: 2, must_not_mention: FORBIDDEN_COMMON },
    };
  },
  grounding_judge(g, i, lang) {
    const ev = evidenceSet(g, lang, true);
    const f = ev.facts;
    const vi = lang === "vi";
    const wrongMrr = f.mrr + g.int(3, 20) * 1000;
    const wrongCust = f.customers + g.int(15, 90);
    const claims = [
      { id: "c1", text: vi ? `MRR đạt A$${fmt(f.mrr)} [ev:e1].` : `MRR reached A$${fmt(f.mrr)} [ev:e1].` },
      { id: "c2", text: vi ? `Công ty có ${wrongCust} khách hàng trả phí [ev:e2].` : `The company has ${wrongCust} paying customers [ev:e2].` },
      { id: "c3", text: vi ? `Biên lợi nhuận gộp là ${f.margin}% [ev:e3].` : `Gross margin is ${f.margin}% [ev:e3].` },
      { id: "c4", text: vi ? `MRR đạt A$${fmt(wrongMrr)} [ev:e1].` : `MRR reached A$${fmt(wrongMrr)} [ev:e1].` },
      { id: "c5", text: vi ? `Công ty được thành lập năm ${f.founded} [ev:e9].` : `The company was founded in ${f.founded} [ev:e9].` },
    ];
    return {
      section: "grounding",
      input: { evidence: ev.rows, claims },
      expected: { claim_labels: { c1: true, c2: false, c3: true, c4: false, c5: false }, critical_claims: ["c2", "c4"] },
    };
  },
  extraction(g, i, lang) {
    const vi = lang === "vi";
    const name = company(g);
    const sector = g.pick(SECTOR_KEYS);
    const founded = g.int(2016, 2025);
    const staff = g.int(2, 60);
    const hasRev = g.r() > 0.35;
    const hasFund = g.r() > 0.35;
    const hasStaff = g.r() > 0.2;
    const rev = g.int(1, 40) * 50_000;
    const fund = g.int(1, 60) * 25_000;
    const parts = [];
    if (vi) {
      parts.push(`${name} Pty Ltd là một công ty ${sector} được thành lập năm ${founded}, chuyên về ${SECTORS[sector].vi}.`);
      if (hasStaff) parts.push(`Công ty hiện có ${staff} nhân viên.`);
      if (hasRev) parts.push(`Doanh thu năm tài chính 2026 đạt A$${fmt(rev)}.`);
      if (hasFund) parts.push(`Tổng vốn đã huy động là A$${fmt(fund)}.`);
      parts.push("Nhà sáng lập đang tìm kiếm đối tác phân phối tại Queensland.");
    } else {
      parts.push(`${name} Pty Ltd is a ${sector} company founded in ${founded}, building ${SECTORS[sector].en}.`);
      if (hasStaff) parts.push(`It employs ${staff} people.`);
      if (hasRev) parts.push(`FY2026 revenue was A$${fmt(rev)}.`);
      if (hasFund) parts.push(`It has raised A$${fmt(fund)} in total.`);
      parts.push("The founders are looking for distribution partners in Queensland.");
    }
    return {
      section: "fields",
      input: { document: parts.join(" ") },
      expected: {
        fields: {
          company_name: name,
          founded_year: founded,
          employees: hasStaff ? staff : null,
          revenue_aud: hasRev ? rev : null,
          funding_raised_aud: hasFund ? fund : null,
          sector,
        },
      },
    };
  },
  classify(g, i, lang) {
    const vi = lang === "vi";
    const sector = SECTOR_KEYS[i % SECTOR_KEYS.length];
    const stage = ["idea", "pre_seed", "seed", "series_a"][Math.floor(i / SECTOR_KEYS.length) % 4];
    const name = company(g);
    const stageText = {
      idea: vi ? "Nhóm mới có ý tưởng và bản thiết kế, chưa có sản phẩm." : "The team has a concept and mock-ups but no product yet.",
      pre_seed: vi ? `Sản phẩm đã ra mắt với ${g.int(3, 30)} khách hàng thử nghiệm; vốn chỉ từ nhà sáng lập và bạn bè.` : `The product is live with ${g.int(3, 30)} pilot customers; funded by the founders and friends only.`,
      seed: vi ? `Vừa hoàn tất vòng gọi vốn hạt giống đầu tiên trị giá A$${fmt(g.int(6, 25) * 100_000)} từ một quỹ đầu tư mạo hiểm.` : `It just closed its first institutional seed round of A$${fmt(g.int(6, 25) * 100_000)} from a venture fund.`,
      series_a: vi ? `Đã hoàn tất vòng Series A có định giá, huy động A$${g.int(6, 20)} triệu.` : `It has closed a priced Series A round of A$${g.int(6, 20)} million.`,
    }[stage];
    const text = vi ? `${name} xây dựng ${SECTORS[sector].vi}. ${stageText}` : `${name} builds ${SECTORS[sector].en}. ${stageText}`;
    return { section: sector, input: { text }, expected: { label: { sector, stage } } };
  },
  translation(g, i, lang) {
    // lang = TARGET language of the case.
    const ev = evidenceSet(g, lang === "vi" ? "en" : "vi", true);
    const f = ev.facts;
    const src = lang === "vi" ? "en" : "vi";
    const mrr = `A$${fmt(f.mrr)}`;
    const margin = `${f.margin}%`;
    const text = src === "en"
      ? `BlockID's SVI review found monthly recurring revenue of ${mrr} [ev:e1] and a gross margin of ${margin} [ev:e3]. The main risk is customer concentration; the next step is to sign two more distribution partners.`
      : `Đánh giá SVI của BlockID cho thấy doanh thu định kỳ hàng tháng đạt ${mrr} [ev:e1] và biên lợi nhuận gộp ${margin} [ev:e3]. Rủi ro chính là sự tập trung khách hàng; bước tiếp theo là ký thêm hai đối tác phân phối.`;
    return {
      section: `${src}->${lang}`,
      input: { source_lang: src, target_lang: lang, text },
      expected: {
        must_keep: [mrr, margin, "[ev:e1]", "[ev:e3]", "BlockID", "SVI"],
        must_mention_any: lang === "vi" ? ["doanh thu", "biên lợi nhuận"] : ["revenue", "margin"],
      },
    };
  },
  chat(g, i, lang) {
    const vi = lang === "vi";
    const topics = [
      {
        key: "esic",
        context: "Public summary (ATO): an Early Stage Innovation Company (ESIC) must, in the income year before the investment, have total expenses of A$1 million or less and assessable income of A$200,000 or less, and must have been incorporated in Australia within the last three income years. Eligible investors may get a 20% non-refundable carry-forward tax offset.",
        q: vi ? "Giới hạn chi phí để đủ điều kiện ESIC là bao nhiêu?" : "What is the expense limit to qualify as an ESIC?",
        keep: ["A$1 million"],
        any: vi ? ["1 million", "1 triệu"] : ["1 million"],
      },
      {
        key: "esic-offset",
        context: "Public summary (ATO): eligible investors in a qualifying Early Stage Innovation Company may receive a 20% non-refundable carry-forward tax offset on the amount invested, capped at A$200,000 per investor and their affiliates combined in an income year.",
        q: vi ? "Ưu đãi thuế cho nhà đầu tư ESIC là bao nhiêu phần trăm?" : "What tax offset percentage can ESIC investors get?",
        keep: ["20%"],
        any: ["20%"],
      },
      {
        key: "rdti",
        context: "Public summary (business.gov.au): the R&D Tax Incentive gives companies with aggregated annual turnover below A$20 million a refundable tax offset equal to their corporate tax rate plus an 18.5% premium. Activities must be registered with AusIndustry within 10 months of the end of the income year.",
        q: vi ? "Hạn đăng ký hoạt động R&D với AusIndustry là bao lâu?" : "What is the deadline to register R&D activities with AusIndustry?",
        keep: ["10 months"],
        any: vi ? ["10 months", "10 tháng"] : ["10 months"],
      },
      {
        key: "unknown",
        context: "Public summary (business.gov.au): the R&D Tax Incentive gives companies with aggregated annual turnover below A$20 million a refundable tax offset.",
        q: vi ? "Công ty của tôi sẽ được định giá bao nhiêu sau vòng gọi vốn tiếp theo?" : "What valuation will my company get in its next round?",
        keep: [],
        any: vi ? ["không", "not", "cannot", "can't"] : ["not", "cannot", "can't", "doesn't", "does not"],
      },
    ];
    const t = topics[i % topics.length];
    return {
      section: t.key,
      input: { context: t.context, question: t.q },
      expected: { must_keep: t.keep, must_mention_any: t.any, must_not_mention: ["guaranteed return", "you should invest", "lợi nhuận đảm bảo"] },
    };
  },
  vision(g, i, lang) {
    const vi = lang === "vi";
    const quarters = g.r() > 0.5;
    const n = g.int(3, 6);
    const start = quarters ? 0 : g.int(0, 12 - n);
    const labels = Array.from({ length: n }, (_, k) => (quarters ? `Q${k + 1}` : vi ? `T${start + k + 1}` : MONTHS_EN[start + k]));
    const values = labels.map(() => g.int(5, 120) + (g.r() > 0.6 ? g.int(1, 9) / 10 : 0));
    const title = vi ? `Doanh thu ${quarters ? "theo quý" : "hàng tháng"} 2026 (nghìn A$)` : `${quarters ? "Quarterly" : "Monthly"} revenue 2026 (A$k)`;
    return {
      section: quarters ? "quarterly" : "monthly",
      input: { image: `img/${lang}-${i}.png`, question: vi ? "Đọc giá trị của từng cột." : "Read the value of every bar." },
      expected: { values: labels.map((label, k) => ({ label, value: Math.round(values[k] * 10) / 10, tol: 0.05 })) },
      chart: { title, labels, values: values.map((v) => Math.round(v * 10) / 10) },
    };
  },
};

function chartSvg({ title, labels, values }) {
  const W = 480, H = 280, left = 40, base = 236, top = 60;
  const max = Math.max(...values);
  const bw = Math.floor((W - left - 20) / labels.length) - 14;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const bars = labels.map((l, k) => {
    const h = Math.max(4, Math.round(((base - top) * values[k]) / max));
    const x = left + k * (bw + 14);
    return `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" fill="#1e3a8a"/><text x="${x + bw / 2}" y="${base - h - 6}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#0f172a">${values[k]}</text><text x="${x + bw / 2}" y="${base + 18}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#334155">${esc(l)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#ffffff"/><text x="20" y="30" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#0f172a">${esc(title)}</text><line x1="${left - 6}" y1="${base}" x2="${W - 10}" y2="${base}" stroke="#94a3b8"/>${bars}</svg>`;
}

// ── Build ─────────────────────────────────────────────────────────────
let changed = 0;
function emit(file, content) {
  const prev = existsSync(file) ? readFileSync(file) : null;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (prev && Buffer.compare(prev, buf) === 0) return;
  changed += 1;
  if (CHECK) {
    console.error(`would change: ${path.relative(OUT, file)}`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

const pngJobs = [];
for (const [task, [nDev, nHeld]] of Object.entries(COUNTS)) {
  for (const [split, n] of [["dev", nDev], ["heldout", nHeld]]) {
    const g = mk(task, split);
    const cases = [];
    for (let i = 0; i < n; i += 1) {
      const lang = i % 2 === 0 ? "en" : "vi";
      const built = builders[task](g, i, lang);
      const id = `${task}-${split}-${String(i + 1).padStart(3, "0")}-${lang}`;
      if (task === "vision") {
        built.input.image = `img/${split}-${i + 1}-${lang}.png`;
        pngJobs.push({ file: path.join(OUT, task, built.input.image), chart: built.chart });
        delete built.chart;
      }
      cases.push({ id, lang, section: built.section, input: built.input, expected: built.expected });
    }
    emit(path.join(OUT, task, `${split}.json`), `${JSON.stringify({ task, split, version: VERSION, source: SOURCE, cases }, null, 1)}\n`);
  }
}

if (pngJobs.length) {
  const { default: sharp } = await import("sharp");
  for (const job of pngJobs) {
    const png = await sharp(Buffer.from(chartSvg(job.chart))).png({ compressionLevel: 9, palette: true }).toBuffer();
    emit(job.file, png);
  }
}

console.log(`${CHECK ? "check" : "build"}: ${changed} file(s) ${CHECK ? "differ" : "written"} (${OUT})`);
if (CHECK && changed > 0) process.exit(1);
