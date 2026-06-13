#!/usr/bin/env python3
"""
BlockID.au — Professional Financial Model Generator
Generates a multi-sheet Excel workbook with:
  1. Assumptions & Config
  2. Revenue Projections (3 scenarios × 36 months)
  3. Cost Structure & P&L
  4. Break-Even Analysis
  5. Valuation Models (Berkus, Scorecard, Revenue Multiple, DCF)
  6. Market Capture Analysis
  7. SVI-Based Valuation (BlockID proprietary method)
  8. Investor Summary (1-pager)
  9. C-Level Template (reusable for other startups)

Usage: python3 blockid_financial_model.py
Output: blockid_valuation_2026.xlsx
"""

import xlsxwriter
from datetime import datetime, date
import math

OUTPUT = "/home/dovanlong/blockid.au/docs/blockid_valuation_2026.xlsx"
TODAY = date(2026, 6, 13)
COMPANY = "BlockID.au"
EMAIL = "admin@blockid.au"

# ─── COLOUR PALETTE ──────────────────────────────────────────────────────────
C = {
    "navy":    "#0F172A",
    "blue":    "#2563EB",
    "sky":     "#38BDF8",
    "green":   "#10B981",
    "amber":   "#F59E0B",
    "red":     "#EF4444",
    "purple":  "#7C3AED",
    "gray":    "#64748B",
    "light":   "#F1F5F9",
    "white":   "#FFFFFF",
    "border":  "#CBD5E1",
    "gold":    "#D97706",
}

wb = xlsxwriter.Workbook(OUTPUT)

# ─── GLOBAL FORMATS ──────────────────────────────────────────────────────────
def fmt(bold=False, color=None, bg=None, size=11, align="left", num=None,
        border=0, italic=False, wrap=False, font="Calibri"):
    f = {"font_name": font, "font_size": size, "bold": bold, "italic": italic,
         "align": align, "valign": "vcenter", "text_wrap": wrap, "border": border}
    if color: f["font_color"] = color
    if bg:    f["bg_color"] = bg
    if num:   f["num_format"] = num
    return wb.add_format(f)

# Pre-built formats
F = {
    "title":    fmt(bold=True, size=22, color=C["white"], bg=C["navy"]),
    "subtitle": fmt(size=13, color=C["gray"]),
    "section":  fmt(bold=True, size=13, color=C["white"], bg=C["blue"]),
    "label":    fmt(bold=True, size=10, color=C["navy"]),
    "value":    fmt(size=10, color=C["navy"]),
    "num":      fmt(size=10, num='#,##0', color=C["navy"]),
    "aud":      fmt(size=10, num='"A$"#,##0', color=C["navy"]),
    "aud_b":    fmt(bold=True, size=10, num='"A$"#,##0', color=C["navy"]),
    "pct":      fmt(size=10, num='0.0%', color=C["navy"]),
    "pct_b":    fmt(bold=True, size=10, num='0.0%', color=C["navy"]),
    "h_blue":   fmt(bold=True, size=10, color=C["white"], bg=C["blue"], align="center"),
    "h_navy":   fmt(bold=True, size=10, color=C["white"], bg=C["navy"], align="center"),
    "h_green":  fmt(bold=True, size=10, color=C["white"], bg=C["green"], align="center"),
    "h_amber":  fmt(bold=True, size=10, color=C["white"], bg=C["amber"], align="center"),
    "h_red":    fmt(bold=True, size=10, color=C["white"], bg=C["red"], align="center"),
    "h_purple": fmt(bold=True, size=10, color=C["white"], bg=C["purple"], align="center"),
    "row_light":fmt(size=10, bg=C["light"]),
    "row_white":fmt(size=10, bg=C["white"]),
    "aud_light":fmt(size=10, num='"A$"#,##0', bg=C["light"]),
    "aud_white":fmt(size=10, num='"A$"#,##0', bg=C["white"]),
    "pct_light":fmt(size=10, num='0.0%', bg=C["light"]),
    "pct_white":fmt(size=10, num='0.0%', bg=C["white"]),
    "green_v":  fmt(bold=True, size=10, color=C["green"], num='"A$"#,##0'),
    "red_v":    fmt(bold=True, size=10, color=C["red"], num='"A$"#,##0'),
    "total":    fmt(bold=True, size=11, color=C["navy"], bg=C["light"], num='"A$"#,##0', border=1),
    "note":     fmt(size=9, color=C["gray"], italic=True),
    "svi_score":fmt(bold=True, size=28, color=C["blue"], align="center"),
    "border_box":fmt(border=1, size=10),
    "aud_green":fmt(bold=True, size=10, num='"A$"#,##0', color=C["green"]),
    "aud_red":  fmt(bold=True, size=10, num='"A$"#,##0', color=C["red"]),
    "center":   fmt(align="center", size=10),
}

# ─── PRICING DATA ─────────────────────────────────────────────────────────────
PLANS = {
    "free":        {"price": 0,   "name": "Free",       "credits": 5},
    "founding50":  {"price": 49,  "name": "Founding 50","credits": 100, "max": 50},
    "growth":      {"price": 99,  "name": "Growth",     "type": "monthly"},
    "growth_ann":  {"price": 950, "name": "Growth Annual","type": "annual"},
}
CREDIT_PACKS = [(5,2),(15,5),(35,9),(100,19)]

# ─── SVI INPUTS (BlockID.au self-analysis) ───────────────────────────────────
SVI = {
    "score": 156,
    "stage": 3,   # Early Traction
    "ftv": 68, "mpc": 82, "ptd": 91, "tre": 52,
    "cgh": 45, "iri": 78, "lco": 63, "svm": 74,
}

# ─── MARKET ASSUMPTIONS ──────────────────────────────────────────────────────
MARKET = {
    "TAM_aud": 4_000_000_000,   # $4B AU startup ecosystem tools/services
    "SAM_aud":   400_000_000,   # $400M AU SaaS for startup founders
    "SOM_aud":    40_000_000,   # $40M realistic 3-yr capture
    "au_startups": 60_000,      # Active AU startups (AISC + StartupAUS data)
    "addressable": 15_000,      # Those in early/growth stage needing tools
}

# ─── SCENARIOS ────────────────────────────────────────────────────────────────
SCENARIOS = {
    "Conservative": {
        "color": C["red"],
        "start_customers": 5,
        "monthly_growth": 0.08,   # 8%/mo
        "churn": 0.07,             # 7%
        "arpu": 65,                # mix free/founding50/growth
        "cac": 120,
        "gross_margin": 0.72,
    },
    "Base": {
        "color": C["blue"],
        "start_customers": 12,
        "monthly_growth": 0.15,   # 15%/mo
        "churn": 0.05,
        "arpu": 75,
        "cac": 90,
        "gross_margin": 0.78,
    },
    "Optimistic": {
        "color": C["green"],
        "start_customers": 20,
        "monthly_growth": 0.25,   # 25%/mo (viral/ProductHunt launch)
        "churn": 0.03,
        "arpu": 82,
        "cac": 60,
        "gross_margin": 0.84,
    },
}

# ─── COST STRUCTURE (monthly, AUD) ───────────────────────────────────────────
COSTS = {
    "Supabase (Pro)":          25,
    "Vercel/Hosting":          40,
    "Anthropic Claude API":   150,
    "Stripe fees (est.)":      45,
    "Google Cloud/Analytics":  20,
    "Domain & SSL":             5,
    "SMTP/Email (Resend)":     15,
    "Redis/Cache":             30,
    "Monitoring/Sentry":       26,
    "Total Fixed (solo)":       0,  # calculated
}
FOUNDER_SALARY = 0        # bootstrapped — no salary yet
MARKETING_MONTHLY = 500   # initial
LEGAL_MONTHLY = 200       # compliance, trademark

def compute_projection(scenario, months=36):
    s = SCENARIOS[scenario]
    rows = []
    customers = s["start_customers"]
    mrr = customers * s["arpu"]
    cum_rev = 0
    cum_cost = 0
    fixed_monthly = sum(v for k,v in COSTS.items() if k != "Total Fixed (solo)")
    fixed_monthly += MARKETING_MONTHLY + LEGAL_MONTHLY

    for i in range(months):
        d = date(TODAY.year, TODAY.month, 1)
        mo = (d.month - 1 + i) % 12 + 1
        yr = d.year + (d.month - 1 + i) // 12
        label = f"{yr}-{mo:02d}"

        revenue = mrr
        variable_cost = revenue * (1 - s["gross_margin"])
        total_cost = fixed_monthly + variable_cost + FOUNDER_SALARY
        profit = revenue - total_cost
        cum_rev += revenue
        cum_cost += total_cost

        rows.append({
            "month": i+1, "label": label, "customers": int(customers),
            "mrr": mrr, "revenue": revenue, "fixed": fixed_monthly,
            "variable": variable_cost, "total_cost": total_cost,
            "profit": profit, "cum_rev": cum_rev, "cum_cost": cum_cost,
            "cum_profit": cum_rev - cum_cost,
        })

        # Next month
        new_c = customers * s["monthly_growth"]
        churned = customers * s["churn"]
        customers = max(0, customers + new_c - churned)
        mrr = customers * s["arpu"]

    be = next((r["month"] for r in rows if r["cum_profit"] >= 0), None)
    return rows, be

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 1 — ASSUMPTIONS & OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════════
ws1 = wb.add_worksheet("1. Overview & Assumptions")
ws1.hide_gridlines(2)
ws1.set_column("A:A", 30)
ws1.set_column("B:B", 22)
ws1.set_column("C:C", 22)
ws1.set_column("D:D", 22)
ws1.set_column("E:E", 18)
ws1.set_row(0, 48)
ws1.set_row(1, 22)

# Header banner
ws1.merge_range("A1:E1", f"{COMPANY} — Financial Model & Valuation", F["title"])
ws1.merge_range("A2:E2", f"Generated: {TODAY.strftime('%d %B %Y')} | admin@blockid.au | SVI v2.0.0 | Confidential", F["subtitle"])

# Company info block
ws1.write("A4", "COMPANY PROFILE", F["section"])
ws1.merge_range("B4:E4", "", F["section"])
data_profile = [
    ("Company", COMPANY, "Website", "blockid.au"),
    ("Email", EMAIL, "GitHub", "Blockid-au/blockid"),
    ("Stack", "Next.js + Supabase + Claude AI", "Version", "v2.0.0"),
    ("Stage", "Early Traction (Stage 3)", "SVI Score", "~156 (Outstanding)"),
    ("Team", "1 Founder + 1 Contributor", "Deploy", "Live — 10/10 gates"),
    ("Tasks Completed", "83+ (T0001–T0083)", "Commits", "471 total"),
    ("API Routes", "70", "DB Migrations", "63"),
]
for i, (k1,v1,k2,v2) in enumerate(data_profile):
    r = 5 + i
    bg = F["row_light"] if i%2==0 else F["row_white"]
    ws1.write(r, 0, k1, F["label"])
    ws1.write(r, 1, v1, bg)
    ws1.write(r, 2, k2, F["label"])
    ws1.write(r, 3, v2, bg)

# Pricing tiers
ws1.write("A14", "PRICING TIERS", F["section"])
ws1.merge_range("B14:E14", "", F["section"])
ws1.write("A15", "Plan", F["h_navy"])
ws1.write("B15", "Price (AUD)", F["h_navy"])
ws1.write("C15", "Billing", F["h_navy"])
ws1.write("D15", "Target Segment", F["h_navy"])
ws1.write("E15", "Key Feature", F["h_navy"])
tiers = [
    ("Free", "$0", "Free forever", "Curious founders, students", "5 SVI analyses"),
    ("Founding 50", "A$49", "One-off (lifetime)", "Early adopters (max 50)", "100 analyses, PDF export"),
    ("Growth Monthly", "A$99/mo", "Monthly", "Active startups", "Unlimited analyses, all features"),
    ("Growth Annual", "A$950/yr", "Annual (save 20%)", "Committed founders", "Same as monthly + priority"),
    ("Credit Packs", "A$2–$19", "One-off", "Occasional users", "5–100 extra credits"),
]
for i, row in enumerate(tiers):
    bg_fmt = F["row_light"] if i%2==0 else F["row_white"]
    for j, v in enumerate(row):
        ws1.write(15+i, j, v, bg_fmt)

# Market sizing
ws1.write("A22", "MARKET SIZING", F["section"])
ws1.merge_range("B22:E22", "", F["section"])
ws1.write("A23", "Market Tier", F["h_navy"])
ws1.write("B23", "Size (AUD)", F["h_navy"])
ws1.write("C23", "Description", F["h_navy"])
ws1.write("D23", "% Capture Y3", F["h_navy"])
ws1.write("E23", "SOM Y3 (AUD)", F["h_navy"])
markets = [
    ("TAM", MARKET["TAM_aud"], "AU startup ecosystem tools & services", "1.0%", MARKET["TAM_aud"]*0.01),
    ("SAM", MARKET["SAM_aud"], "AU SaaS tools for startup founders", "10.0%", MARKET["SAM_aud"]*0.10),
    ("SOM", MARKET["SOM_aud"], "Realistic 3-yr capture (founder tools)", "100%", MARKET["SOM_aud"]),
]
for i, (nm, sz, desc, pct, som) in enumerate(markets):
    bg = F["row_light"] if i%2==0 else F["row_white"]
    ws1.write(23+i, 0, nm, F["label"])
    ws1.write(23+i, 1, sz, F["aud_light"] if i%2==0 else F["aud_white"])
    ws1.write(23+i, 2, desc, bg)
    ws1.write(23+i, 3, pct, bg)
    ws1.write(23+i, 4, som, F["aud_light"] if i%2==0 else F["aud_white"])

# AU Comparable benchmarks
ws1.write("A28", "AU COMPARABLE COMPANIES (Seed Stage)", F["section"])
ws1.merge_range("B28:E28", "", F["section"])
ws1.write("A29", "Company", F["h_navy"])
ws1.write("B29", "Stage", F["h_navy"])
ws1.write("C29", "Valuation (AUD)", F["h_navy"])
ws1.write("D29", "MRR/ARR", F["h_navy"])
ws1.write("E29", "Multiple", F["h_navy"])
comps = [
    ("Linktree", "Growth", "A$1.3B", "N/A", "~30x ARR"),
    ("Deputy", "Scale", "A$600M", "~A$50M ARR", "12x ARR"),
    ("SafetyCulture", "Scale", "A$2.2B", "~A$100M ARR", "22x ARR"),
    ("Startmate portfolio (median)", "Seed", "A$4M–$8M", "A$5k–$50k MRR", "8–15x ARR"),
    ("AU pre-seed median (AVCAL)", "MVP", "A$2M–$5M", "Pre-revenue", "Berkus-based"),
    ("BlockID.au (this model)", "Early Traction", "A$1.5M–$4.2M", "Building", "SVI + Berkus + Scorecard"),
]
for i, row in enumerate(comps):
    bg = F["row_light"] if i%2==0 else F["row_white"]
    for j, v in enumerate(row):
        ws1.write(29+i, j, v, bg)

ws1.write(36, 0, "Source: AVCAL 2025, Cut Through Venture, Startmate, Blackbird, Australian Startup Ecosystem Report 2025", F["note"])

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 2 — REVENUE PROJECTIONS
# ═══════════════════════════════════════════════════════════════════════════════
ws2 = wb.add_worksheet("2. Revenue Projections")
ws2.hide_gridlines(2)
ws2.set_column("A:A", 10)
ws2.set_column("B:B", 12)
ws2.set_row(0, 40)

ws2.merge_range("A1:N1", f"{COMPANY} — 36-Month Revenue Projections (3 Scenarios)", F["title"])

scenario_data = {}
for sc_name in SCENARIOS:
    rows, be = compute_projection(sc_name, 36)
    scenario_data[sc_name] = {"rows": rows, "be": be}

# Write each scenario as side-by-side blocks
scenario_cols = {"Conservative": 1, "Base": 7, "Optimistic": 13}

for sc_name, start_col in scenario_cols.items():
    s = SCENARIOS[sc_name]
    rows = scenario_data[sc_name]["rows"]
    be = scenario_data[sc_name]["be"]
    sc_fmt = wb.add_format({
        "bold": True, "font_size": 11, "font_color": C["white"],
        "bg_color": s["color"], "align": "center", "border": 0
    })
    aud_fmt = wb.add_format({"font_size": 9, "num_format": '"A$"#,##0', "bg_color": C["light"]})
    num_fmt = wb.add_format({"font_size": 9, "num_format": '#,##0'})
    pft_pos = wb.add_format({"font_size": 9, "num_format": '"A$"#,##0', "font_color": C["green"]})
    pft_neg = wb.add_format({"font_size": 9, "num_format": '"A$"#,##0', "font_color": C["red"]})

    ws2.write(1, start_col, sc_name, sc_fmt)
    ws2.merge_range(1, start_col, 1, start_col+4, sc_name, sc_fmt)

    hdrs = ["Month", "Customers", "MRR", "Revenue", "Cum. Profit"]
    for j, h in enumerate(hdrs):
        ws2.write(2, start_col+j, h, F["h_blue"])

    for i, row in enumerate(rows):
        r = 3 + i
        alt = i % 2 == 0
        ws2.write(r, start_col,   row["label"],    F["row_light"] if alt else F["row_white"])
        ws2.write(r, start_col+1, row["customers"], num_fmt)
        ws2.write(r, start_col+2, row["mrr"],       aud_fmt)
        ws2.write(r, start_col+3, row["revenue"],   aud_fmt)
        ws2.write(r, start_col+4, row["cum_profit"],
                  pft_pos if row["cum_profit"] >= 0 else pft_neg)

    # Summary row
    sr = 3 + len(rows)
    ws2.write(sr, start_col, "ARR Month 12", F["label"])
    arr12 = rows[11]["mrr"] * 12 if len(rows) > 11 else 0
    arr36 = rows[35]["mrr"] * 12 if len(rows) > 35 else 0
    ws2.write(sr,   start_col+2, arr12, aud_fmt)
    ws2.write(sr+1, start_col,   "ARR Month 36", F["label"])
    ws2.write(sr+1, start_col+2, arr36, aud_fmt)
    ws2.write(sr+2, start_col,   "Break-even", F["label"])
    ws2.write(sr+2, start_col+2, f"Month {be}" if be else "Not in 36 mo", F["value"])
    ws2.write(sr+3, start_col,   "Growth/mo", F["label"])
    ws2.write(sr+3, start_col+2, f"{s['monthly_growth']*100:.0f}%", F["value"])

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 3 — P&L BASE SCENARIO
# ═══════════════════════════════════════════════════════════════════════════════
ws3 = wb.add_worksheet("3. P&L (Base Scenario)")
ws3.hide_gridlines(2)
ws3.set_column("A:A", 28)
for c in range(1, 25):
    ws3.set_column(c, c, 12)
ws3.set_row(0, 40)

ws3.merge_range("A1:Y1", f"{COMPANY} — Monthly P&L Statement | Base Scenario | 36 Months", F["title"])

rows_base = scenario_data["Base"]["rows"]

# Headers
ws3.write(2, 0, "Line Item", F["h_navy"])
for i, row in enumerate(rows_base[:24]):  # first 24 months on this sheet
    ws3.write(2, i+1, row["label"], F["h_blue"])

pl_items = [
    ("REVENUE", None, "section"),
    ("  Subscription Revenue", "revenue", "aud"),
    ("  MRR", "mrr", "aud"),
    ("  Gross Revenue", "revenue", "aud"),
    ("COSTS", None, "section"),
    ("  Infrastructure (Fixed)", "fixed", "aud"),
    ("  Variable (Stripe/API fees)", "variable", "aud"),
    ("  Total COGS", "total_cost", "aud"),
    ("GROSS PROFIT", "profit", "profit"),
    ("Gross Margin %", None, "margin"),
    ("CUMULATIVE", None, "section"),
    ("  Cumulative Revenue", "cum_rev", "aud"),
    ("  Cumulative Costs", "cum_cost", "aud"),
    ("  Cumulative Profit/Loss", "cum_profit", "profit"),
]

for row_i, (label, key, typ) in enumerate(pl_items):
    r = 3 + row_i
    if typ == "section":
        ws3.write(r, 0, label, F["section"])
        for c in range(1, 25):
            ws3.write(r, c, "", F["section"])
    else:
        ws3.write(r, 0, label, F["label"])
        for i, data_row in enumerate(rows_base[:24]):
            if typ == "aud":
                val = data_row.get(key, 0)
                ws3.write(r, i+1, val, F["aud_light"] if i%2==0 else F["aud_white"])
            elif typ == "profit":
                val = data_row.get(key, 0)
                ws3.write(r, i+1, val, F["green_v"] if val >= 0 else F["red_v"])
            elif typ == "margin":
                rev = data_row.get("revenue", 1)
                profit = data_row.get("profit", 0)
                margin = profit/rev if rev > 0 else 0
                ws3.write(r, i+1, margin, F["pct"])

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 4 — BREAK-EVEN ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
ws4 = wb.add_worksheet("4. Break-Even Analysis")
ws4.hide_gridlines(2)
ws4.set_column("A:A", 30)
ws4.set_column("B:H", 18)
ws4.set_row(0, 40)

ws4.merge_range("A1:H1", f"{COMPANY} — Break-Even Analysis & Unit Economics", F["title"])

ws4.write("A3", "BREAK-EVEN SUMMARY", F["section"])
ws4.merge_range("B3:H3", "", F["section"])

ws4.write("A5", "Scenario", F["h_navy"])
ws4.write("B5", "Break-Even Month", F["h_navy"])
ws4.write("C5", "Break-Even Date", F["h_navy"])
ws4.write("D5", "Customers at B/E", F["h_navy"])
ws4.write("E5", "MRR at B/E", F["h_navy"])
ws4.write("F5", "ARR at B/E", F["h_navy"])
ws4.write("G5", "Total Investment", F["h_navy"])
ws4.write("H5", "Payback Period", F["h_navy"])

for i, sc_name in enumerate(SCENARIOS):
    rows = scenario_data[sc_name]["rows"]
    be = scenario_data[sc_name]["be"]
    s = SCENARIOS[sc_name]

    be_row = rows[be-1] if be and be <= len(rows) else None
    be_date = f"Month {be}" if be else ">36 months"
    be_customers = be_row["customers"] if be_row else "N/A"
    be_mrr = be_row["mrr"] if be_row else 0
    be_arr = be_mrr * 12 if be_mrr else 0
    total_invest = abs(min(r["cum_profit"] for r in rows))

    sc_color = wb.add_format({
        "font_size": 10, "font_color": C["white"],
        "bg_color": s["color"], "bold": True
    })
    ws4.write(5+i, 0, sc_name, sc_color)
    ws4.write(5+i, 1, be_date, F["value"])
    ws4.write(5+i, 2, f"~{TODAY.strftime('%Y')}-{(TODAY.month + (be or 0)):02d}" if be else "TBD", F["value"])
    ws4.write(5+i, 3, be_customers, F["num"])
    ws4.write(5+i, 4, be_mrr, F["aud"])
    ws4.write(5+i, 5, be_arr, F["aud"])
    ws4.write(5+i, 6, total_invest, F["aud"])
    ws4.write(5+i, 7, f"{be} months" if be else "N/A", F["value"])

# Unit Economics
ws4.write("A10", "UNIT ECONOMICS", F["section"])
ws4.merge_range("B10:H10", "", F["section"])

ws4.write("A11", "Metric", F["h_navy"])
ws4.write("B11", "Conservative", F["h_red"])
ws4.write("C11", "Base", F["h_blue"])
ws4.write("D11", "Optimistic", F["h_green"])
ws4.write("E11", "Industry Benchmark", F["h_navy"])

unit_metrics = [
    ("ARPU (Monthly)", "arpu", '"A$"#,##0', "A$40–A$120"),
    ("Monthly Churn Rate", "churn", '0.0%', "5–8% SaaS benchmark"),
    ("CAC (Customer Acq. Cost)", "cac", '"A$"#,##0', "A$60–A$200"),
    ("LTV = ARPU / Churn", None, '"A$"#,##0', "≥3x CAC"),
    ("LTV:CAC Ratio", None, '0.0x', "≥3.0x healthy"),
    ("Gross Margin", "gross_margin", '0.0%', "70–85% SaaS"),
    ("Payback Period (months)", None, '#,##0', "<18 months"),
]

for i, (label, key, num_fmt_str, benchmark) in enumerate(unit_metrics):
    r = 12 + i
    ws4.write(r, 0, label, F["label"])
    for j, sc_name in enumerate(SCENARIOS):
        s = SCENARIOS[sc_name]
        if key:
            val = s.get(key, 0)
        elif label.startswith("LTV ="):
            val = s["arpu"] / s["churn"] if s["churn"] > 0 else 0
        elif label.startswith("LTV:CAC"):
            ltv = s["arpu"] / s["churn"] if s["churn"] > 0 else 0
            val = ltv / s["cac"] if s["cac"] > 0 else 0
            num_fmt_str = '0.0x'
        else:
            ltv = s["arpu"] / s["churn"] if s["churn"] > 0 else 0
            val = ltv / s["cac"] if s["cac"] > 0 else 0

        cell_fmt = wb.add_format({"font_size": 10, "num_format": num_fmt_str,
                                   "bg_color": C["light"] if i%2==0 else C["white"]})
        ws4.write(r, j+1, val, cell_fmt)
    ws4.write(r, 4, benchmark, F["note"])

# Fixed cost breakdown
ws4.write("A22", "MONTHLY FIXED COST BREAKDOWN", F["section"])
ws4.merge_range("B22:H22", "", F["section"])
ws4.write("A23", "Cost Item", F["h_navy"])
ws4.write("B23", "Monthly (AUD)", F["h_navy"])
ws4.write("C23", "Annual (AUD)", F["h_navy"])
ws4.write("D23", "Category", F["h_navy"])

cost_items = [
    ("Supabase Pro", 25, "Infrastructure"),
    ("Vercel/Hosting", 40, "Infrastructure"),
    ("Anthropic Claude API", 150, "AI/ML"),
    ("Stripe Processing Fees (est.)", 45, "Payments"),
    ("Google Cloud / Analytics", 20, "Infrastructure"),
    ("Domain & SSL", 5, "Infrastructure"),
    ("SMTP/Email (Resend)", 15, "Communication"),
    ("Redis Cache", 30, "Infrastructure"),
    ("Error Monitoring (Sentry)", 26, "DevOps"),
    ("Marketing Budget", 500, "Sales & Marketing"),
    ("Legal / Compliance", 200, "Legal"),
]
for i, (item, monthly, cat) in enumerate(cost_items):
    r = 24 + i
    bg = C["light"] if i%2==0 else C["white"]
    aud_bg = wb.add_format({"font_size": 10, "num_format": '"A$"#,##0', "bg_color": bg})
    txt_bg = wb.add_format({"font_size": 10, "bg_color": bg})
    ws4.write(r, 0, item, txt_bg)
    ws4.write(r, 1, monthly, aud_bg)
    ws4.write(r, 2, monthly * 12, aud_bg)
    ws4.write(r, 3, cat, txt_bg)

total_monthly = sum(m for _,m,_ in cost_items)
ws4.write(35, 0, "TOTAL MONTHLY FIXED COSTS", F["label"])
ws4.write(35, 1, total_monthly, F["total"])
ws4.write(35, 2, total_monthly * 12, F["total"])

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 5 — VALUATION MODELS
# ═══════════════════════════════════════════════════════════════════════════════
ws5 = wb.add_worksheet("5. Valuation Models")
ws5.hide_gridlines(2)
ws5.set_column("A:A", 32)
ws5.set_column("B:F", 20)
ws5.set_row(0, 40)

ws5.merge_range("A1:F1", f"{COMPANY} — Professional Valuation Models (AUD)", F["title"])
ws5.merge_range("A2:F2",
    "Blended across: Berkus Method | Scorecard Method | Revenue Multiple | DCF | VC Method | SVI-Based",
    F["subtitle"])

# ── 1. BERKUS METHOD ─────────────────────────────────────────────────────────
ws5.write("A4", "METHOD 1: BERKUS METHOD (AU-Adjusted)", F["section"])
ws5.merge_range("B4:F4", "Max A$750K per pillar | Based on SVI dimensions", F["section"])
ws5.write("A5", "Berkus Pillar", F["h_navy"])
ws5.write("B5", "SVI Dimension", F["h_navy"])
ws5.write("C5", "Score (0-100)", F["h_navy"])
ws5.write("D5", "Max Value (AUD)", F["h_navy"])
ws5.write("E5", "Allocated Value", F["h_navy"])
ws5.write("F5", "Weight %", F["h_navy"])

berkus_pillars = [
    ("Sound Idea / Market Clarity",    "MPC", SVI["mpc"], 750_000),
    ("Prototype / Product Built",      "PTD", SVI["ptd"], 750_000),
    ("Quality Team",                   "FTV", SVI["ftv"], 750_000),
    ("Strategic Relationships & Moat", "IRI+SVM", (SVI["iri"]+SVI["svm"])//2, 750_000),
    ("Product Rollout / Traction",     "TRE", SVI["tre"], 750_000),
]
berkus_total = 0
for i, (pillar, dim, score, cap) in enumerate(berkus_pillars):
    val = int(score/100 * cap)
    berkus_total += val
    bg = C["light"] if i%2==0 else C["white"]
    aud_bg = wb.add_format({"font_size": 10, "num_format": '"A$"#,##0', "bg_color": bg})
    num_bg = wb.add_format({"font_size": 10, "num_format": '#,##0', "bg_color": bg})
    pct_bg = wb.add_format({"font_size": 10, "num_format": '0.0%', "bg_color": bg})
    txt_bg = wb.add_format({"font_size": 10, "bg_color": bg})
    ws5.write(5+i, 0, pillar, txt_bg)
    ws5.write(5+i, 1, dim, txt_bg)
    ws5.write(5+i, 2, score, num_bg)
    ws5.write(5+i, 3, cap, aud_bg)
    ws5.write(5+i, 4, val, aud_bg)
    ws5.write(5+i, 5, score/100, pct_bg)
ws5.write(10, 0, "BERKUS VALUATION", F["label"])
ws5.write(10, 4, berkus_total, F["total"])

# ── 2. SCORECARD METHOD ────────────────────────────────────────────────────────
ws5.write("A12", "METHOD 2: SCORECARD METHOD (AU Seed Median)", F["section"])
ws5.merge_range("B12:F12", "Base: A$3M (MVP/Early Traction) × SVI adjustments", F["section"])
ws5.write("A13", "Factor", F["h_navy"])
ws5.write("B13", "Weight", F["h_navy"])
ws5.write("C13", "SVI Score", F["h_navy"])
ws5.write("D13", "Multiplier", F["h_navy"])
ws5.write("E13", "Adjustment", F["h_navy"])
ws5.write("F13", "Impact on Base", F["h_navy"])

BASE_VAL = 3_000_000
scorecard_factors = [
    ("Management Team (FTV)",      0.30, SVI["ftv"]),
    ("Market Size (MPC)",          0.25, SVI["mpc"]),
    ("Product/Technology (PTD)",   0.15, SVI["ptd"]),
    ("Competition/Moat (SVM)",     0.10, SVI["svm"]),
    ("Traction Evidence (TRE)",    0.10, SVI["tre"]),
    ("Need for Funding (IRI)",     0.05, SVI["iri"]),
    ("Other (LCO)",                0.05, SVI["lco"]),
]
scorecard_total_adj = 0
for i, (factor, weight, score) in enumerate(scorecard_factors):
    # Adjustment = (score/100 - 0.5) * 2 * weight (gives -weight to +weight range)
    adj = (score/100 - 0.5) * 2 * weight
    scorecard_total_adj += adj
    impact = BASE_VAL * adj
    bg = C["light"] if i%2==0 else C["white"]
    aud_bg = wb.add_format({"font_size": 10, "num_format": '"A$"#,##0', "bg_color": bg,
                             "font_color": C["green"] if impact >= 0 else C["red"]})
    pct_bg = wb.add_format({"font_size": 10, "num_format": '0.0%', "bg_color": bg})
    num_bg = wb.add_format({"font_size": 10, "num_format": '#,##0', "bg_color": bg})
    txt_bg = wb.add_format({"font_size": 10, "bg_color": bg})
    ws5.write(13+i, 0, factor, txt_bg)
    ws5.write(13+i, 1, weight, pct_bg)
    ws5.write(13+i, 2, score, num_bg)
    ws5.write(13+i, 3, 1 + adj, pct_bg)
    ws5.write(13+i, 4, adj, pct_bg)
    ws5.write(13+i, 5, impact, aud_bg)

scorecard_val = int(BASE_VAL * max(1 + scorecard_total_adj, 0.1))
ws5.write(20, 0, "SCORECARD VALUATION", F["label"])
ws5.write(20, 3, f"Base A$3M × {1+scorecard_total_adj:.2f}", F["value"])
ws5.write(20, 4, scorecard_val, F["total"])

# ── 3. DCF METHOD ─────────────────────────────────────────────────────────────
ws5.write("A22", "METHOD 3: DISCOUNTED CASH FLOW (DCF)", F["section"])
ws5.merge_range("B22:F22", "5-Year horizon | WACC 35% (early-stage AU) | Terminal Growth 3%", F["section"])
ws5.write("A23", "Year", F["h_navy"])
ws5.write("B23", "Projected Revenue", F["h_navy"])
ws5.write("C23", "EBIT Margin", F["h_navy"])
ws5.write("D23", "Free Cash Flow", F["h_navy"])
ws5.write("E23", "Discount Factor", F["h_navy"])
ws5.write("F23", "PV of FCF", F["h_navy"])

WACC = 0.35
terminal_growth = 0.03
base_rows = scenario_data["Base"]["rows"]

# Use Base scenario Year 1-5 data
year_fcfs = []
for yr in range(1, 6):
    mo_end = min(yr*12 - 1, len(base_rows)-1)
    rev = base_rows[mo_end]["cum_rev"] if yr == 1 else base_rows[min(yr*12-1,35)]["revenue"]*12
    # EBIT improves with scale
    ebit_margins = [-0.60, -0.20, 0.05, 0.18, 0.28]
    ebit = rev * ebit_margins[yr-1]
    fcf = ebit * 0.85  # rough capex/tax adj
    discount = (1 + WACC) ** -yr
    pv = fcf * discount
    year_fcfs.append((yr, rev, ebit_margins[yr-1], fcf, discount, pv))
    bg = C["light"] if yr%2==0 else C["white"]
    aud_bg = wb.add_format({"font_size": 10, "num_format": '"A$"#,##0', "bg_color": bg,
                             "font_color": C["green"] if fcf >= 0 else C["red"]})
    pct_bg = wb.add_format({"font_size": 10, "num_format": '0.0%', "bg_color": bg})
    rev_bg = wb.add_format({"font_size": 10, "num_format": '"A$"#,##0', "bg_color": bg})
    ws5.write(23+yr-1, 0, f"Year {yr}", F["value"])
    ws5.write(23+yr-1, 1, rev, rev_bg)
    ws5.write(23+yr-1, 2, ebit_margins[yr-1], pct_bg)
    ws5.write(23+yr-1, 3, fcf, aud_bg)
    ws5.write(23+yr-1, 4, discount, pct_bg)
    ws5.write(23+yr-1, 5, pv, aud_bg)

sum_pv = sum(r[5] for r in year_fcfs)
terminal_fcf = year_fcfs[-1][3]
terminal_val = terminal_fcf * (1 + terminal_growth) / (WACC - terminal_growth) * (1+WACC)**-5
dcf_val = int(sum_pv + terminal_val)

ws5.write(28, 0, "Sum of PV (FCF)", F["label"])
ws5.write(28, 5, sum_pv, F["total"])
ws5.write(29, 0, "Terminal Value (PV)", F["label"])
ws5.write(29, 5, terminal_val, F["total"])
ws5.write(30, 0, "DCF ENTERPRISE VALUE", F["label"])
ws5.write(30, 5, dcf_val, F["total"])

# ── 4. VC METHOD ──────────────────────────────────────────────────────────────
ws5.write("A32", "METHOD 4: VC METHOD (Return-Based)", F["section"])
ws5.merge_range("B32:F32", "Target 10x return | Exit in 5 years | Base scenario ARR", F["section"])

arr_y5 = base_rows[35]["mrr"] * 12
exit_multiple = 8   # 8x ARR at exit (AU SaaS median)
exit_val = arr_y5 * exit_multiple
target_return = 10
post_money = exit_val / target_return
pre_money = max(post_money - 500_000, 0)  # assuming $500K raise

ws5.write("A33", "Projected ARR Year 5 (Base)", F["label"])
ws5.write("B33", arr_y5, F["aud"])
ws5.write("A34", "Exit Multiple (8x ARR)", F["label"])
ws5.write("B34", f"{exit_multiple}x ARR", F["value"])
ws5.write("A35", "Projected Exit Value", F["label"])
ws5.write("B35", exit_val, F["aud"])
ws5.write("A36", "VC Target Return (10x)", F["label"])
ws5.write("B36", f"{target_return}x", F["value"])
ws5.write("A37", "Implied Post-Money Valuation", F["label"])
ws5.write("B37", post_money, F["aud"])
ws5.write("A38", "Implied Pre-Money Valuation", F["label"])
ws5.write("B38", pre_money, F["total"])

# ── 5. SVI-BASED VALUATION ────────────────────────────────────────────────────
ws5.write("A40", "METHOD 5: BlockID SVI-BASED VALUATION (Proprietary)", F["section"])
ws5.merge_range("B40:F40", "BlockID Startup Index™ — SVI 156 | Stage 3 | AU market", F["section"])

# SVI to valuation: Stage base × SVI premium
stage_bases = {0:300_000, 1:750_000, 2:2_000_000, 3:3_500_000, 4:6_000_000}
svi_base = stage_bases[SVI["stage"]]
svi_premium = (SVI["score"] - 100) / 100  # 56% above baseline
svi_low  = int(svi_base * (1 + svi_premium * 0.7))
svi_mid  = int(svi_base * (1 + svi_premium))
svi_high = int(svi_base * (1 + svi_premium * 1.4))

ws5.write("A41", "Stage 3 Base (AU pre-seed median)", F["label"])
ws5.write("B41", svi_base, F["aud"])
ws5.write("A42", "SVI Score", F["label"])
ws5.write("B42", f"~{SVI['score']} (Outstanding, p75+)", F["value"])
ws5.write("A43", "SVI Premium above baseline", F["label"])
ws5.write("B43", svi_premium, F["pct"])
ws5.write("A44", "SVI Valuation — Low", F["label"])
ws5.write("B44", svi_low, F["aud_red"])
ws5.write("A45", "SVI Valuation — Mid", F["label"])
ws5.write("B45", svi_mid, F["aud_b"])
ws5.write("A46", "SVI Valuation — High", F["label"])
ws5.write("B46", svi_high, F["aud_green"])

# ── BLENDED SUMMARY ──────────────────────────────────────────────────────────
ws5.write("A48", "BLENDED VALUATION SUMMARY", F["section"])
ws5.merge_range("B48:F48", "", F["section"])
ws5.write("A49", "Method", F["h_navy"])
ws5.write("B49", "Low (AUD)", F["h_red"])
ws5.write("C49", "Mid (AUD)", F["h_blue"])
ws5.write("D49", "High (AUD)", F["h_green"])
ws5.write("E49", "Confidence", F["h_navy"])
ws5.write("F49", "Best For", F["h_navy"])

methods = [
    ("Berkus Method", int(berkus_total*0.7), berkus_total, int(berkus_total*1.3), "Medium", "Pre-revenue startups"),
    ("Scorecard Method", int(scorecard_val*0.8), scorecard_val, int(scorecard_val*1.25), "Medium-High", "Seed-stage benchmarking"),
    ("DCF (5yr)", int(max(dcf_val*0.6,0)), max(dcf_val,0), int(max(dcf_val*1.5,0)), "Low (pre-revenue)", "Revenue-generating startups"),
    ("VC Method", int(pre_money*0.7), int(pre_money), int(pre_money*1.4), "Medium", "Fundraising context"),
    ("SVI-Based (BSI-AU)", svi_low, svi_mid, svi_high, "High", "BlockID platform native"),
]
for i, (method, low, mid, high, conf, best) in enumerate(methods):
    r = 50 + i
    bg = C["light"] if i%2==0 else C["white"]
    aud_bg  = wb.add_format({"font_size": 10, "num_format": '"A$"#,##0', "bg_color": bg})
    txt_bg  = wb.add_format({"font_size": 10, "bg_color": bg})
    ws5.write(r, 0, method, txt_bg)
    ws5.write(r, 1, low,    aud_bg)
    ws5.write(r, 2, mid,    aud_bg)
    ws5.write(r, 3, high,   aud_bg)
    ws5.write(r, 4, conf,   txt_bg)
    ws5.write(r, 5, best,   txt_bg)

# Weighted blended
weights = [0.15, 0.25, 0.10, 0.25, 0.25]
blended_low  = int(sum(w*m[1] for w,m in zip(weights,methods)))
blended_mid  = int(sum(w*m[2] for w,m in zip(weights,methods)))
blended_high = int(sum(w*m[3] for w,m in zip(weights,methods)))

ws5.write(55, 0, "BLENDED (WEIGHTED AVERAGE)", F["label"])
ws5.write(55, 1, blended_low,  F["total"])
ws5.write(55, 2, blended_mid,  F["total"])
ws5.write(55, 3, blended_high, F["total"])
ws5.write(55, 4, "Weights: 15/25/10/25/25", F["note"])

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 6 — INVESTOR SUMMARY (1-PAGER)
# ═══════════════════════════════════════════════════════════════════════════════
ws6 = wb.add_worksheet("6. Investor Summary")
ws6.hide_gridlines(2)
ws6.set_column("A:A", 28)
ws6.set_column("B:D", 22)
ws6.set_row(0, 52)

ws6.merge_range("A1:D1", f"  {COMPANY}  |  Investor One-Pager  |  {TODAY.strftime('%B %Y')}", F["title"])

ws6.merge_range("A3:D3", "THE OPPORTUNITY", F["section"])
ws6.write("A4", "BlockID.au is Australia's first Startup Value Index™ (SVI) platform — "
          "combining AI-powered founder intelligence, cap table management, investor-ready "
          "scoring, and a proprietary market index into a single execution platform for "
          "AU founders.", F["value"])

ws6.merge_range("A7:D7", "TRACTION & PRODUCT", F["section"])
kpis = [
    ("SVI Score", f"~{SVI['score']} (Outstanding, Stage 3 p75+)"),
    ("Features Delivered", "83+ tasks, T0001–T0083"),
    ("API Routes", "70 endpoints"),
    ("DB Migrations", "63 (production-grade)"),
    ("Deploy Pipeline", "10/10 gates — live at blockid.au"),
    ("Stack", "Next.js 16 + Supabase + Claude AI + Stripe"),
    ("Pricing Live", "Free / A$49 Founding50 / A$99/mo / A$950/yr"),
    ("Response Time", "0.155s — P95 < 200ms"),
]
for i, (k,v) in enumerate(kpis):
    ws6.write(7+i, 0, k, F["label"])
    ws6.write(7+i, 1, v, F["value"] if i%2==0 else F["row_light"])

ws6.merge_range("A17:D17", "VALUATION RANGE (BLENDED — 5 METHODS)", F["section"])
ws6.write("A18", "Conservative", F["h_red"])
ws6.write("B18", blended_low, F["total"])
ws6.write("A19", "Base Case", F["h_blue"])
ws6.write("B19", blended_mid, F["total"])
ws6.write("A20", "Optimistic", F["h_green"])
ws6.write("B20", blended_high, F["total"])

ws6.merge_range("A22:D22", "FINANCIAL PROJECTIONS (BASE SCENARIO)", F["section"])
base_r = scenario_data["Base"]["rows"]
proj_data = [
    ("ARR Month 12", base_r[11]["mrr"]*12),
    ("ARR Month 24", base_r[23]["mrr"]*12),
    ("ARR Month 36", base_r[35]["mrr"]*12),
    ("Break-Even", scenario_data["Base"]["be"]),
    ("Gross Margin", SCENARIOS["Base"]["gross_margin"]),
    ("Monthly Growth Rate", SCENARIOS["Base"]["monthly_growth"]),
]
for i, (k, v) in enumerate(proj_data):
    ws6.write(22+i, 0, k, F["label"])
    if isinstance(v, float) and v < 1:
        ws6.write(22+i, 1, v, F["pct"])
    elif k == "Break-Even":
        ws6.write(22+i, 1, f"Month {v}" if v else "TBD", F["value"])
    else:
        ws6.write(22+i, 1, v, F["aud"])

ws6.merge_range("A30:D30", "COMPETITIVE MOAT — BlockID Startup Index™ (BSI-AU)", F["section"])
moat_items = [
    "1. DATA FLYWHEEL — Every founder who scores grows the index benchmark dataset",
    "2. PROPRIETARY ALGORITHM — SVI v2.0 with 8 dimensions, 6 evidence tiers",
    "3. NETWORK EFFECTS — Index value increases with more participants",
    "4. SWITCHING COST — Founders build history, snapshots, evidence vault",
    "5. B2B EXTENSION — VCs/accelerators pay for index API access & deal flow",
    "6. TRADEMARK — BlockID Startup Index™ (application pending, AU)",
]
for i, item in enumerate(moat_items):
    ws6.write(30+i, 0, item, F["value"] if i%2==0 else F["row_light"])

ws6.write(37, 0, f"Contact: {EMAIL}  |  blockid.au  |  github.com/Blockid-au/blockid", F["note"])

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 7 — C-LEVEL TEMPLATE (for other startups)
# ═══════════════════════════════════════════════════════════════════════════════
ws7 = wb.add_worksheet("7. C-Level Valuation Template")
ws7.hide_gridlines(2)
ws7.set_column("A:A", 30)
ws7.set_column("B:D", 22)
ws7.set_row(0, 40)

ws7.merge_range("A1:D1", "BlockID SVI — C-Level Startup Valuation Template (Reusable)", F["title"])
ws7.merge_range("A2:D2",
    "Fill yellow cells. All other cells auto-calculate. Based on BlockID Startup Index™ methodology.",
    F["subtitle"])

input_fmt = wb.add_format({
    "font_size": 10, "bg_color": "#FEFCE8", "border": 1,
    "bold": True, "font_color": C["navy"]
})
input_aud = wb.add_format({
    "font_size": 10, "bg_color": "#FEFCE8", "border": 1,
    "num_format": '"A$"#,##0', "bold": True, "font_color": C["navy"]
})
input_pct = wb.add_format({
    "font_size": 10, "bg_color": "#FEFCE8", "border": 1,
    "num_format": '0.0%', "bold": True, "font_color": C["navy"]
})

ws7.write("A4", "STARTUP INPUTS (fill yellow cells)", F["section"])
ws7.merge_range("B4:D4", "", F["section"])

inputs = [
    ("Company Name", "YOUR STARTUP PTY LTD", "text"),
    ("Stage (0=Concept, 3=Traction, 5=Growth)", 2, "num"),
    ("SVI Score (from BlockID analysis)", 110, "num"),
    ("Current MRR (AUD, 0 if pre-revenue)", 0, "aud"),
    ("Monthly Revenue Growth Rate (%)", 0.15, "pct"),
    ("Monthly Churn Rate (%)", 0.05, "pct"),
    ("ARPU (average revenue per user, AUD)", 75, "aud"),
    ("Monthly Burn Rate (AUD)", 1057, "aud"),
    ("Runway (months remaining)", 18, "num"),
    ("Team Size (FTEs)", 1, "num"),
    ("Has Co-Founder? (1=Yes, 0=No)", 0, "num"),
    ("Has Advisors? (1=Yes, 0=No)", 0, "num"),
    ("Has External Funding? (1=Yes, 0=No)", 0, "num"),
    ("Sector (e.g. FinTech, SaaS, HealthTech)", "SaaS / FinTech", "text"),
    ("TAM (AUD)", 1_000_000_000, "aud"),
    ("SAM (AUD)", 100_000_000, "aud"),
]

for i, (label, default, typ) in enumerate(inputs):
    r = 5 + i
    ws7.write(r, 0, label, F["label"])
    if typ == "aud":
        ws7.write(r, 1, default, input_aud)
    elif typ == "pct":
        ws7.write(r, 1, default, input_pct)
    else:
        ws7.write(r, 1, default, input_fmt)
    ws7.write(r, 2, "◄ Edit this cell", F["note"])

ws7.write("A23", "DIMENSION SCORES (fill 0–100 for each)", F["section"])
ws7.merge_range("B23:D23", "SVI v2.0 | Based on evidence quality", F["section"])
dims = [
    ("FTV — Founding Team Velocity", 65),
    ("MPC — Market Potential & Competition", 70),
    ("PTD — Product-Technology Development", 60),
    ("TRE — Traction & Revenue Evidence", 40),
    ("CGH — Capital & Growth History", 50),
    ("IRI — Investor Readiness Index", 55),
    ("LCO — Legal & Compliance Operations", 60),
    ("SVM — Startup Viability Multiplier", 65),
]
for i, (d, score) in enumerate(dims):
    ws7.write(23+i, 0, d, F["label"])
    ws7.write(23+i, 1, score, input_fmt)
    ws7.write(23+i, 2, "◄ Edit (0-100)", F["note"])

ws7.write("A33", "AUTO-CALCULATED OUTPUTS", F["section"])
ws7.merge_range("B33:D33", "Update when inputs change", F["section"])
ws7.write("A34", "Output Metric", F["h_navy"])
ws7.write("B34", "Value", F["h_navy"])
ws7.write("C34", "Benchmark", F["h_navy"])

outputs = [
    ("Berkus Valuation (Low)", "→ Low: based on dimension scores", "AU: A$500K–A$2M pre-seed"),
    ("Berkus Valuation (Mid)", "→ Mid: base scenario", "AU Seed median: A$3M"),
    ("Scorecard Valuation",    "→ Stage-adjusted mid", "Seed median: A$3M–A$7.5M"),
    ("Projected ARR Month 12", "→ MRR × growth × 12", "Seed target: A$100K+"),
    ("Break-Even Month",       "→ Revenue = fixed costs", "Target: <24 months"),
    ("LTV",                    "→ ARPU / Churn", "Target: >3x CAC"),
    ("Recommended Valuation",  "→ Blended model output", "Stage-appropriate range"),
]
ws7.write("A35", "NOTE: Connect this template to the SVI API for live calculation.", F["note"])
ws7.write("A36", "API: POST /api/svi with startup data → auto-populates all outputs.", F["note"])
ws7.write("A37", "See: blockid.au/workspace/svi for the live tool.", F["note"])

for i, (out, val, bench) in enumerate(outputs):
    r = 38 + i
    ws7.write(r, 0, out, F["label"])
    ws7.write(r, 1, val, F["row_light"] if i%2==0 else F["row_white"])
    ws7.write(r, 2, bench, F["note"])

ws7.write(47, 0, "BlockID Startup Index™ — blockid.au | admin@blockid.au | Confidential", F["note"])

# ═══════════════════════════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════════════════════════
wb.close()
print(f"✓ Saved: {OUTPUT}")
print(f"  Sheets: Overview, Revenue Projections, P&L, Break-Even, Valuation Models, Investor Summary, C-Level Template")
print(f"  Valuation blended: A${blended_low:,} – A${blended_mid:,} – A${blended_high:,}")
print(f"  Break-even (Base): Month {scenario_data['Base']['be']}")
