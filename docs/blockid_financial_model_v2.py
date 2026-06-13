#!/usr/bin/env python3
"""
BlockID.au — Professional Financial Model v2.0 (ENHANCED)
==========================================================
Generates a comprehensive Excel workbook with:
  Sheet 1:  Overview & Assumptions
  Sheet 2:  Revenue Projections (3 scenarios × 36 months)
  Sheet 3:  Monthly P&L (Base Scenario)
  Sheet 4:  Break-Even Analysis & Unit Economics
  Sheet 5:  Valuation Models (6 methods + blended)
  Sheet 6:  Investor Summary (1-pager)
  Sheet 7:  C-Level Valuation Template (reusable)
  Sheet 8:  Sensitivity Analysis (2-way tables)
  Sheet 9:  Monte Carlo Simulation (1,000 runs)
  Sheet 10: Fundraising & Dilution Scenarios
  Sheet 11: Risk Factor Summation + First Chicago Method
  Sheet 12: Action Plan & Milestones (90-day)
  Sheet 13: SVI Benchmark Table (for other startups)

Usage: python3 blockid_financial_model_v2.py
Output: blockid_valuation_2026_v2.xlsx
"""

import xlsxwriter
from datetime import datetime, date
import math
import random
import statistics

random.seed(42)

OUTPUT  = "/home/dovanlong/blockid.au/docs/blockid_valuation_2026_v2.xlsx"
TODAY   = date(2026, 6, 13)
COMPANY = "BlockID.au"
EMAIL   = "admin@blockid.au"
VERSION = "v2.0.0"

# ─── COLOUR PALETTE ──────────────────────────────────────────────────────────
C = {
    "navy":   "#0F172A", "blue":   "#2563EB", "sky":    "#38BDF8",
    "green":  "#10B981", "amber":  "#F59E0B", "red":    "#EF4444",
    "purple": "#7C3AED", "gray":   "#64748B", "light":  "#F1F5F9",
    "white":  "#FFFFFF", "border": "#CBD5E1", "gold":   "#D97706",
    "teal":   "#0D9488", "pink":   "#EC4899", "indigo": "#4F46E5",
    "yellow": "#FEFCE8",
}

wb = xlsxwriter.Workbook(OUTPUT)

def fmt(bold=False, color=None, bg=None, size=10, align="left", num=None,
        border=0, italic=False, wrap=False, font="Calibri"):
    f = {"font_name": font, "font_size": size, "bold": bold, "italic": italic,
         "align": align, "valign": "vcenter", "text_wrap": wrap, "border": border}
    if color: f["font_color"] = color
    if bg:    f["bg_color"]   = bg
    if num:   f["num_format"] = num
    return wb.add_format(f)

F = {
    "title":     fmt(bold=True, size=18, color=C["white"],  bg=C["navy"]),
    "subtitle":  fmt(size=11,   color=C["gray"]),
    "section":   fmt(bold=True, size=11, color=C["white"],  bg=C["blue"]),
    "section2":  fmt(bold=True, size=11, color=C["white"],  bg=C["indigo"]),
    "label":     fmt(bold=True, size=10, color=C["navy"]),
    "value":     fmt(size=10,   color=C["navy"]),
    "num":       fmt(size=10,   num='#,##0',         color=C["navy"]),
    "aud":       fmt(size=10,   num='"A$"#,##0',     color=C["navy"]),
    "aud_b":     fmt(bold=True, size=10, num='"A$"#,##0', color=C["navy"]),
    "pct":       fmt(size=10,   num='0.0%',          color=C["navy"]),
    "pct_b":     fmt(bold=True, size=10, num='0.0%', color=C["navy"]),
    "h_blue":    fmt(bold=True, size=10, color=C["white"], bg=C["blue"],   align="center"),
    "h_navy":    fmt(bold=True, size=10, color=C["white"], bg=C["navy"],   align="center"),
    "h_green":   fmt(bold=True, size=10, color=C["white"], bg=C["green"],  align="center"),
    "h_amber":   fmt(bold=True, size=10, color=C["white"], bg=C["amber"],  align="center"),
    "h_red":     fmt(bold=True, size=10, color=C["white"], bg=C["red"],    align="center"),
    "h_purple":  fmt(bold=True, size=10, color=C["white"], bg=C["purple"], align="center"),
    "h_teal":    fmt(bold=True, size=10, color=C["white"], bg=C["teal"],   align="center"),
    "h_indigo":  fmt(bold=True, size=10, color=C["white"], bg=C["indigo"], align="center"),
    "row_light": fmt(size=10, bg=C["light"]),
    "row_white": fmt(size=10, bg=C["white"]),
    "aud_light": fmt(size=10, num='"A$"#,##0', bg=C["light"]),
    "aud_white": fmt(size=10, num='"A$"#,##0', bg=C["white"]),
    "pct_light": fmt(size=10, num='0.0%',      bg=C["light"]),
    "pct_white": fmt(size=10, num='0.0%',      bg=C["white"]),
    "green_v":   fmt(bold=True, size=10, color=C["green"],  num='"A$"#,##0'),
    "red_v":     fmt(bold=True, size=10, color=C["red"],    num='"A$"#,##0'),
    "total":     fmt(bold=True, size=10, color=C["navy"],   bg=C["light"], num='"A$"#,##0', border=1),
    "total_big": fmt(bold=True, size=12, color=C["navy"],   bg=C["light"], num='"A$"#,##0', border=2),
    "note":      fmt(size=9,  color=C["gray"], italic=True),
    "input":     fmt(size=10, bg=C["yellow"],  border=1, bold=True, color=C["navy"]),
    "input_aud": fmt(size=10, bg=C["yellow"],  border=1, bold=True, color=C["navy"], num='"A$"#,##0'),
    "input_pct": fmt(size=10, bg=C["yellow"],  border=1, bold=True, color=C["navy"], num='0.0%'),
    "aud_green": fmt(bold=True, size=10, num='"A$"#,##0', color=C["green"]),
    "aud_red":   fmt(bold=True, size=10, num='"A$"#,##0', color=C["red"]),
    "center":    fmt(align="center", size=10),
    "big_num":   fmt(bold=True, size=16, color=C["blue"], align="center", num='"A$"#,##0'),
    "big_pct":   fmt(bold=True, size=14, color=C["green"], align="center", num='0.0%'),
    "heat_low":  fmt(size=9, bg="#BBF7D0", align="center", num='"A$"#,##0'),
    "heat_mid":  fmt(size=9, bg="#FEF08A", align="center", num='"A$"#,##0'),
    "heat_high": fmt(size=9, bg="#FCA5A5", align="center", num='"A$"#,##0'),
}

# ─── PRICING ──────────────────────────────────────────────────────────────────
PLANS = {
    "free":       {"price": 0,    "name": "Free",          "credits": 5},
    "founding50": {"price": 49,   "name": "Founding 50",   "credits": 100, "max": 50},
    "growth":     {"price": 99,   "name": "Growth Monthly","type": "monthly"},
    "growth_ann": {"price": 950,  "name": "Growth Annual", "type": "annual"},
}

# ─── SVI INPUTS ────────────────────────────────────────────────────────────────
SVI = {
    "score": 156, "stage": 3,
    "ftv": 68, "mpc": 82, "ptd": 91, "tre": 52,
    "cgh": 45, "iri": 78, "lco": 63, "svm": 74,
    "weights": {"ftv":0.15,"mpc":0.18,"ptd":0.12,"tre":0.20,"cgh":0.12,"iri":0.10,"lco":0.08,"svm":0.05},
}

MARKET = {
    "TAM_aud":   4_000_000_000,
    "SAM_aud":     400_000_000,
    "SOM_aud":      40_000_000,
    "au_startups":  60_000,
    "addressable":  15_000,
}

SCENARIOS = {
    "Conservative": {"color":C["red"],    "start_customers":5,  "monthly_growth":0.08, "churn":0.07, "arpu":65, "cac":120, "gross_margin":0.72},
    "Base":         {"color":C["blue"],   "start_customers":12, "monthly_growth":0.15, "churn":0.05, "arpu":75, "cac":90,  "gross_margin":0.78},
    "Optimistic":   {"color":C["green"],  "start_customers":20, "monthly_growth":0.25, "churn":0.03, "arpu":82, "cac":60,  "gross_margin":0.84},
}

COSTS = {
    "Supabase (Pro)":         25,
    "Vercel/Hosting":         40,
    "Anthropic Claude API":  150,
    "Stripe fees (est.)":     45,
    "Google Cloud":           20,
    "Domain & SSL":            5,
    "SMTP/Email (Resend)":    15,
    "Redis/Cache":            30,
    "Monitoring/Sentry":      26,
}
FIXED_MONTHLY    = sum(COSTS.values())   # 356
MARKETING_MONTHLY = 500
LEGAL_MONTHLY     = 200
TOTAL_MONTHLY_BURN = FIXED_MONTHLY + MARKETING_MONTHLY + LEGAL_MONTHLY  # 1056

def compute_projection(scenario, months=36):
    s = SCENARIOS[scenario]
    rows, customers, mrr = [], s["start_customers"], s["start_customers"] * s["arpu"]
    cum_rev = cum_cost = 0
    for i in range(months):
        mo = (TODAY.month - 1 + i) % 12 + 1
        yr = TODAY.year + (TODAY.month - 1 + i) // 12
        variable_cost = mrr * (1 - s["gross_margin"])
        total_cost    = TOTAL_MONTHLY_BURN + variable_cost
        profit        = mrr - total_cost
        cum_rev  += mrr
        cum_cost += total_cost
        rows.append({
            "month": i+1, "label": f"{yr}-{mo:02d}", "customers": int(customers),
            "mrr": mrr, "revenue": mrr, "fixed": TOTAL_MONTHLY_BURN,
            "variable": variable_cost, "total_cost": total_cost,
            "profit": profit, "cum_rev": cum_rev, "cum_cost": cum_cost,
            "cum_profit": cum_rev - cum_cost,
        })
        customers = max(0, customers + customers*s["monthly_growth"] - customers*s["churn"])
        mrr = customers * s["arpu"]
    be = next((r["month"] for r in rows if r["cum_profit"] >= 0), None)
    return rows, be

scenario_data = {n: dict(zip(["rows","be"], compute_projection(n))) for n in SCENARIOS}

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 1 — OVERVIEW & ASSUMPTIONS
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet1():
    ws = wb.add_worksheet("1. Overview & Assumptions")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 32); ws.set_column("B:B", 24)
    ws.set_column("C:C", 20); ws.set_column("D:D", 24); ws.set_column("E:E", 18)
    ws.set_row(0, 44); ws.set_row(1, 20)

    ws.merge_range("A1:E1", f"{COMPANY} — Financial Model & Valuation v2.0", F["title"])
    ws.merge_range("A2:E2", f"Generated: {TODAY.strftime('%d %B %Y')} | {EMAIL} | SVI {VERSION} | CONFIDENTIAL", F["subtitle"])

    ws.write("A4", "COMPANY PROFILE", F["section"]); ws.merge_range("B4:E4", "", F["section"])
    profile = [
        ("Company","BlockID.au","Website","blockid.au"),
        ("Email",EMAIL,"GitHub","Blockid-au/blockid"),
        ("Stack","Next.js 16 + Supabase + Claude AI","Version",VERSION),
        ("Stage","Early Traction (Stage 3)","SVI Score","156 (Outstanding, p75+)"),
        ("Team","1 Founder + 1 Contributor","Deploy","Live — 10/10 gates"),
        ("Tasks Completed","83+ (T0001–T0083)","Commits","471 total"),
        ("API Routes","70","DB Migrations","63"),
        ("AI Agents","8 (7 active)","Pages","42 routes"),
        ("Unit Tests","62","Gross Margin","78% (Base)"),
    ]
    for i,(k1,v1,k2,v2) in enumerate(profile):
        r,bg = 5+i, F["row_light"] if i%2==0 else F["row_white"]
        ws.write(r,0,k1,F["label"]); ws.write(r,1,v1,bg)
        ws.write(r,2,k2,F["label"]); ws.write(r,3,v2,bg)

    ws.write("A16","PRICING TIERS",F["section"]); ws.merge_range("B16:E16","",F["section"])
    hdrs = ["Plan","Price (AUD)","Billing","Target Segment","Key Feature"]
    for j,h in enumerate(hdrs): ws.write(16,j,h,F["h_navy"])
    tiers = [
        ("Free","A$0","Free forever","Curious founders","5 SVI analyses, basic tools"),
        ("Founding 50","A$49","One-off lifetime","Early adopters (max 50)","100 analyses, PDF export, history"),
        ("Growth Monthly","A$99/mo","Monthly","Active startups","Unlimited, all features"),
        ("Growth Annual","A$950/yr","Annual (20% off)","Committed founders","Same + priority + account mgr"),
        ("Credit Packs","A$2–$19","One-off add-on","Occasional users","5–100 extra credits"),
    ]
    for i,row in enumerate(tiers):
        bg = F["row_light"] if i%2==0 else F["row_white"]
        for j,v in enumerate(row): ws.write(17+i,j,v,bg)

    ws.write("A24","MARKET SIZING (AUD)",F["section"]); ws.merge_range("B24:E24","",F["section"])
    for j,h in enumerate(["Market","Size (AUD)","Description","% Capture Y3","SOM Y3"]): ws.write(24,j,h,F["h_navy"])
    for i,(nm,sz,desc,pct,som) in enumerate([
        ("TAM",MARKET["TAM_aud"],"AU startup ecosystem tools",  "1.0%",MARKET["TAM_aud"]*0.01),
        ("SAM",MARKET["SAM_aud"],"AU SaaS for founders",       "10.0%",MARKET["SAM_aud"]*0.10),
        ("SOM",MARKET["SOM_aud"],"Realistic 3-yr capture",     "100%", MARKET["SOM_aud"]),
    ]):
        bg = F["row_light"] if i%2==0 else F["row_white"]
        ws.write(25+i,0,nm,F["label"]); ws.write(25+i,1,sz,F["aud_light"] if i%2==0 else F["aud_white"])
        ws.write(25+i,2,desc,bg); ws.write(25+i,3,pct,bg)
        ws.write(25+i,4,som,F["aud_light"] if i%2==0 else F["aud_white"])

    ws.write("A30","AU BENCHMARKS (Seed Stage)",F["section"]); ws.merge_range("B30:E30","",F["section"])
    for j,h in enumerate(["Company","Stage","Valuation","MRR/ARR","Multiple"]): ws.write(30,j,h,F["h_navy"])
    for i,row in enumerate([
        ("Linktree","Growth","A$1.3B","N/A","~30x ARR"),
        ("Deputy","Scale","A$600M","~A$50M ARR","12x ARR"),
        ("Startmate portfolio","Seed","A$4M–$8M","A$5k–$50k MRR","8–15x ARR"),
        ("AU pre-seed median","MVP","A$2M–$5M","Pre-revenue","Berkus-based"),
        ("BlockID.au (this model)","Early Traction","A$2.4M–$4.2M","Building","SVI+Berkus+Scorecard"),
    ]):
        bg = F["row_light"] if i%2==0 else F["row_white"]
        for j,v in enumerate(row): ws.write(31+i,j,v,bg)
    ws.write(37,0,"Source: AVCAL 2025, Cut Through Venture, Startmate, AISC Startup Ecosystem Report 2026",F["note"])
    return ws

ws1 = build_sheet1()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 2 — REVENUE PROJECTIONS
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet2():
    ws = wb.add_worksheet("2. Revenue Projections")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 10); ws.set_column("B:B", 11)
    ws.set_row(0, 40)
    ws.merge_range("A1:O1", f"{COMPANY} — 36-Month Revenue Projections (3 Scenarios)", F["title"])

    sc_cols = {"Conservative":1, "Base":7, "Optimistic":13}
    for sc_name, start_col in sc_cols.items():
        s = SCENARIOS[sc_name]
        rows = scenario_data[sc_name]["rows"]
        be   = scenario_data[sc_name]["be"]
        sc_fmt = wb.add_format({"bold":True,"font_size":11,"font_color":C["white"],"bg_color":s["color"],"align":"center"})
        aud_fmt = wb.add_format({"font_size":9,"num_format":'"A$"#,##0',"bg_color":C["light"]})
        num_fmt = wb.add_format({"font_size":9,"num_format":'#,##0'})
        pos_fmt = wb.add_format({"font_size":9,"num_format":'"A$"#,##0',"font_color":C["green"]})
        neg_fmt = wb.add_format({"font_size":9,"num_format":'"A$"#,##0',"font_color":C["red"]})

        ws.merge_range(1, start_col, 1, start_col+4, sc_name, sc_fmt)
        for j,h in enumerate(["Month","Customers","MRR","Revenue","Cum. Profit"]):
            ws.write(2, start_col+j, h, F["h_blue"])
        for i,row in enumerate(rows):
            r = 3+i
            ws.write(r, start_col,   row["label"],     F["row_light"] if i%2==0 else F["row_white"])
            ws.write(r, start_col+1, row["customers"],  num_fmt)
            ws.write(r, start_col+2, row["mrr"],        aud_fmt)
            ws.write(r, start_col+3, row["revenue"],    aud_fmt)
            ws.write(r, start_col+4, row["cum_profit"], pos_fmt if row["cum_profit"]>=0 else neg_fmt)

        sr = 3 + len(rows)
        ws.write(sr,   start_col, "ARR Yr1",    F["label"]); ws.write(sr,   start_col+2, rows[11]["mrr"]*12, aud_fmt)
        ws.write(sr+1, start_col, "ARR Yr3",    F["label"]); ws.write(sr+1, start_col+2, rows[35]["mrr"]*12, aud_fmt)
        ws.write(sr+2, start_col, "Break-even", F["label"]); ws.write(sr+2, start_col+2, f"Month {be}" if be else ">36", F["value"])
        ws.write(sr+3, start_col, "Growth/mo",  F["label"]); ws.write(sr+3, start_col+2, f"{s['monthly_growth']*100:.0f}%", F["value"])
    return ws

ws2 = build_sheet2()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 3 — P&L (Base)
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet3():
    ws = wb.add_worksheet("3. P&L (Base Scenario)")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 28)
    for c in range(1,25): ws.set_column(c,c,12)
    ws.set_row(0, 40)
    ws.merge_range("A1:Y1", f"{COMPANY} — Monthly P&L | Base Scenario | 36 Months", F["title"])

    rows_base = scenario_data["Base"]["rows"]
    ws.write(2,0,"Line Item",F["h_navy"])
    for i,row in enumerate(rows_base[:24]): ws.write(2,i+1,row["label"],F["h_blue"])

    pl_items = [
        ("REVENUE",                    None,        "section"),
        ("  Subscription Revenue",     "revenue",   "aud"),
        ("  Monthly Recurring Revenue","mrr",       "aud"),
        ("COSTS",                      None,        "section"),
        ("  Fixed Costs (Infra+Mktg)", "fixed",     "aud"),
        ("  Variable Costs (Stripe/AI)","variable", "aud"),
        ("  Total COGS",               "total_cost","aud"),
        ("GROSS PROFIT",               "profit",    "profit"),
        ("  Gross Margin %",           None,        "margin"),
        ("CUMULATIVE",                 None,        "section"),
        ("  Cumulative Revenue",       "cum_rev",   "aud"),
        ("  Cumulative Costs",         "cum_cost",  "aud"),
        ("  Cumulative P/L",           "cum_profit","profit"),
    ]
    for row_i,(label,key,typ) in enumerate(pl_items):
        r = 3+row_i
        if typ=="section":
            ws.write(r,0,label,F["section"])
            for c in range(1,25): ws.write(r,c,"",F["section"])
        else:
            ws.write(r,0,label,F["label"])
            for i,dr in enumerate(rows_base[:24]):
                if typ=="aud":
                    ws.write(r,i+1,dr.get(key,0),F["aud_light"] if i%2==0 else F["aud_white"])
                elif typ=="profit":
                    v=dr.get(key,0)
                    ws.write(r,i+1,v,F["green_v"] if v>=0 else F["red_v"])
                elif typ=="margin":
                    rev=dr.get("revenue",1); p=dr.get("profit",0)
                    ws.write(r,i+1,p/rev if rev>0 else 0,F["pct"])
    return ws

ws3 = build_sheet3()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 4 — BREAK-EVEN ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet4():
    ws = wb.add_worksheet("4. Break-Even Analysis")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 32); ws.set_column("B:H", 18)
    ws.set_row(0, 40)
    ws.merge_range("A1:H1", f"{COMPANY} — Break-Even Analysis & Unit Economics", F["title"])

    ws.write("A3","BREAK-EVEN SUMMARY",F["section"]); ws.merge_range("B3:H3","",F["section"])
    hdrs = ["Scenario","Break-Even Month","Customers at B/E","MRR at B/E","ARR at B/E","Total Burn","LTV:CAC"]
    for j,h in enumerate(hdrs): ws.write(4,j,h,F["h_navy"])
    for i,sc_name in enumerate(SCENARIOS):
        rows=scenario_data[sc_name]["rows"]; be=scenario_data[sc_name]["be"]; s=SCENARIOS[sc_name]
        be_row = rows[be-1] if be and be<=len(rows) else None
        sc_fmt = wb.add_format({"font_size":10,"font_color":C["white"],"bg_color":s["color"],"bold":True})
        ltv = s["arpu"] / s["churn"] if s["churn"]>0 else 0
        ltv_cac = ltv/s["cac"] if s["cac"]>0 else 0
        ws.write(5+i,0,sc_name,sc_fmt)
        ws.write(5+i,1,f"Month {be}" if be else ">36m",F["value"])
        ws.write(5+i,2,be_row["customers"] if be_row else "N/A",F["num"])
        ws.write(5+i,3,be_row["mrr"] if be_row else 0,F["aud"])
        ws.write(5+i,4,(be_row["mrr"]*12) if be_row else 0,F["aud"])
        ws.write(5+i,5,abs(min(r["cum_profit"] for r in rows)),F["aud"])
        ws.write(5+i,6,f"{ltv_cac:.1f}x",F["value"])

    ws.write("A10","UNIT ECONOMICS COMPARISON",F["section"]); ws.merge_range("B10:H10","",F["section"])
    for j,h in enumerate(["Metric","Conservative","Base","Optimistic","Industry Benchmark"]): ws.write(11,j,h,F["h_navy"])
    unit_items = [
        ("ARPU (Monthly AUD)","arpu","aud","A$40–A$120"),
        ("Monthly Churn Rate","churn","pct","5–8% (SaaS)"),
        ("CAC (AUD)","cac","aud","A$60–A$200"),
        ("LTV (ARPU/Churn)","ltv","aud","≥3× CAC"),
        ("LTV:CAC Ratio","ltv_cac","x","≥3.0x healthy"),
        ("Gross Margin","gross_margin","pct","70–85% SaaS"),
    ]
    for i,(label,key,typ,bench) in enumerate(unit_items):
        r=12+i; ws.write(r,0,label,F["label"])
        for j,sc_name in enumerate(SCENARIOS):
            s=SCENARIOS[sc_name]
            ltv=s["arpu"]/s["churn"] if s["churn"]>0 else 0
            vals = {"arpu":s["arpu"],"churn":s["churn"],"cac":s["cac"],
                    "ltv":ltv,"ltv_cac":ltv/s["cac"] if s["cac"]>0 else 0,"gross_margin":s["gross_margin"]}
            v=vals[key]; bg=C["light"] if i%2==0 else C["white"]
            if typ=="aud":   ws.write(r,j+1,v,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
            elif typ=="pct": ws.write(r,j+1,v,wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))
            else:            ws.write(r,j+1,f"{v:.1f}x",wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(r,4,bench,F["note"])

    ws.write("A21","MONTHLY COST BREAKDOWN",F["section"]); ws.merge_range("B21:H21","",F["section"])
    for j,h in enumerate(["Item","Monthly (AUD)","Annual (AUD)","Category"]): ws.write(21,j,h,F["h_navy"])
    cost_rows = list(COSTS.items()) + [("Marketing Budget",MARKETING_MONTHLY),("Legal/Compliance",LEGAL_MONTHLY)]
    cat_map = {"Supabase (Pro)":"Infra","Vercel/Hosting":"Infra","Anthropic Claude API":"AI",
               "Stripe fees (est.)":"Payments","Google Cloud":"Infra","Domain & SSL":"Infra",
               "SMTP/Email (Resend)":"Comm","Redis/Cache":"Infra","Monitoring/Sentry":"DevOps",
               "Marketing Budget":"Marketing","Legal/Compliance":"Legal"}
    for i,(item,monthly) in enumerate(cost_rows):
        r=22+i; bg=C["light"] if i%2==0 else C["white"]
        aud_bg=wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg})
        txt_bg=wb.add_format({"font_size":10,"bg_color":bg})
        ws.write(r,0,item,txt_bg); ws.write(r,1,monthly,aud_bg)
        ws.write(r,2,monthly*12,aud_bg); ws.write(r,3,cat_map.get(item,"Other"),txt_bg)
    tr=22+len(cost_rows)
    ws.write(tr,0,"TOTAL MONTHLY BURN",F["label"])
    ws.write(tr,1,TOTAL_MONTHLY_BURN,F["total"]); ws.write(tr,2,TOTAL_MONTHLY_BURN*12,F["total"])
    return ws

ws4 = build_sheet4()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 5 — VALUATION MODELS (6 methods)
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet5():
    ws = wb.add_worksheet("5. Valuation Models")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 34); ws.set_column("B:G", 20)
    ws.set_row(0, 40)
    ws.merge_range("A1:G1", f"{COMPANY} — Professional Valuation Models (6 Methods + Blended)", F["title"])
    ws.merge_range("A2:G2","Methods: Berkus | Scorecard | DCF | VC Method | SVI-Based | Revenue Multiple",F["subtitle"])

    # ── Berkus ────────────────────────────────────────────────────────────────
    ws.write("A4","METHOD 1: BERKUS METHOD (AU-Adjusted)",F["section"]); ws.merge_range("B4:G4","Max A$750K per pillar",F["section"])
    for j,h in enumerate(["Pillar","SVI Dim","Score (0-100)","Max Value","Allocated","Weight"]): ws.write(4,j,h,F["h_navy"])
    pillars = [
        ("Sound Idea / Market Clarity","MPC",SVI["mpc"],750_000),
        ("Prototype / Product Built",  "PTD",SVI["ptd"],750_000),
        ("Quality Team",               "FTV",SVI["ftv"],750_000),
        ("Strategic Moat & Relationships","IRI+SVM",(SVI["iri"]+SVI["svm"])//2,750_000),
        ("Product Rollout / Traction", "TRE",SVI["tre"],750_000),
    ]
    berkus_total=0
    for i,(pillar,dim,score,cap) in enumerate(pillars):
        val=int(score/100*cap); berkus_total+=val; bg=C["light"] if i%2==0 else C["white"]
        ws.write(5+i,0,pillar,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(5+i,1,dim,  wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(5+i,2,score,wb.add_format({"font_size":10,"num_format":'#,##0',"bg_color":bg}))
        ws.write(5+i,3,cap,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(5+i,4,val,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(5+i,5,score/100,wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))
    ws.write(10,0,"BERKUS TOTAL",F["label"]); ws.write(10,4,berkus_total,F["total"])

    # ── Scorecard ─────────────────────────────────────────────────────────────
    ws.write("A12","METHOD 2: SCORECARD (AU Seed Median A$3M base)",F["section"]); ws.merge_range("B12:G12","",F["section"])
    for j,h in enumerate(["Factor","Weight","Score","Multiplier","Adjustment","Impact"]): ws.write(12,j,h,F["h_navy"])
    BASE_V=3_000_000
    sc_factors=[
        ("Management Team (FTV)", 0.30, SVI["ftv"]),
        ("Market Size (MPC)",     0.25, SVI["mpc"]),
        ("Product / Tech (PTD)",  0.15, SVI["ptd"]),
        ("Competition (SVM)",     0.10, SVI["svm"]),
        ("Traction (TRE)",        0.10, SVI["tre"]),
        ("Funding Need (IRI)",    0.05, SVI["iri"]),
        ("Legal (LCO)",           0.05, SVI["lco"]),
    ]
    sc_adj=0
    for i,(factor,weight,score) in enumerate(sc_factors):
        adj=(score/100-0.5)*2*weight; sc_adj+=adj; impact=BASE_V*adj
        bg=C["light"] if i%2==0 else C["white"]
        ws.write(13+i,0,factor,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(13+i,1,weight,wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))
        ws.write(13+i,2,score, wb.add_format({"font_size":10,"num_format":'#,##0',"bg_color":bg}))
        ws.write(13+i,3,1+adj, wb.add_format({"font_size":10,"num_format":'0.00',"bg_color":bg}))
        ws.write(13+i,4,adj,   wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))
        ws.write(13+i,5,impact,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,
                                               "font_color":C["green"] if impact>=0 else C["red"]}))
    scorecard_val=int(BASE_V*max(1+sc_adj,0.1))
    ws.write(20,0,"SCORECARD TOTAL",F["label"]); ws.write(20,3,f"A$3M × {1+sc_adj:.2f}",F["value"]); ws.write(20,5,scorecard_val,F["total"])

    # ── DCF ───────────────────────────────────────────────────────────────────
    ws.write("A22","METHOD 3: DCF (5-Year | WACC 35% | Terminal Growth 3%)",F["section"]); ws.merge_range("B22:G22","",F["section"])
    for j,h in enumerate(["Year","Proj. Revenue","EBIT Margin","Free Cash Flow","Discount Factor","PV of FCF"]): ws.write(22,j,h,F["h_navy"])
    WACC=0.35; tg=0.03; base_rows=scenario_data["Base"]["rows"]
    year_fcfs=[]
    ebit_margins=[-0.60,-0.20,0.05,0.18,0.28]
    for yr in range(1,6):
        rev = base_rows[min(yr*12-1,35)]["revenue"]*12
        if yr==1: rev=base_rows[11]["cum_rev"]
        ebit=rev*ebit_margins[yr-1]; fcf=ebit*0.85
        disc=(1+WACC)**-yr; pv=fcf*disc; year_fcfs.append((yr,rev,ebit_margins[yr-1],fcf,disc,pv))
        bg=C["light"] if yr%2==0 else C["white"]
        ws.write(23+yr-1,0,f"Year {yr}",F["value"])
        ws.write(23+yr-1,1,rev, wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(23+yr-1,2,ebit_margins[yr-1],wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))
        ws.write(23+yr-1,3,fcf, wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,"font_color":C["green"] if fcf>=0 else C["red"]}))
        ws.write(23+yr-1,4,disc,wb.add_format({"font_size":10,"num_format":'0.000',"bg_color":bg}))
        ws.write(23+yr-1,5,pv,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,"font_color":C["green"] if pv>=0 else C["red"]}))
    sum_pv=sum(r[5] for r in year_fcfs)
    tv=year_fcfs[-1][3]*(1+tg)/(WACC-tg)*(1+WACC)**-5
    dcf_val=int(sum_pv+tv)
    ws.write(28,0,"Sum PV (FCF)",F["label"]); ws.write(28,5,sum_pv,F["total"])
    ws.write(29,0,"Terminal Value (PV)",F["label"]); ws.write(29,5,tv,F["total"])
    ws.write(30,0,"DCF ENTERPRISE VALUE",F["label"]); ws.write(30,5,dcf_val,F["total"])

    # ── VC Method ─────────────────────────────────────────────────────────────
    ws.write("A32","METHOD 4: VC METHOD (10x return | 5yr exit)",F["section"]); ws.merge_range("B32:G32","",F["section"])
    arr_y5=base_rows[35]["mrr"]*12; exit_v=arr_y5*8
    post_m=exit_v/10; pre_m=max(post_m-500_000,0)
    for j,h in enumerate(["Item","Value"]): ws.write(32,j,h,F["h_navy"])
    for i,(k,v) in enumerate([("ARR Year 5",arr_y5),("Exit Multiple","8× ARR"),("Exit Value",exit_v),
                               ("Target Return","10×"),("Post-Money",post_m),("Pre-Money (raise A$500K)",pre_m)]):
        ws.write(33+i,0,k,F["label"])
        if isinstance(v,str): ws.write(33+i,1,v,F["value"])
        else: ws.write(33+i,1,v,F["aud"])

    # ── Revenue Multiple ───────────────────────────────────────────────────────
    ws.write("A41","METHOD 5: REVENUE MULTIPLE (ARR-based)",F["section"]); ws.merge_range("B41:G41","",F["section"])
    for j,h in enumerate(["Period","ARR","Multiple","Valuation Low","Valuation Mid","Valuation High"]): ws.write(41,j,h,F["h_navy"])
    arr_y1=base_rows[11]["mrr"]*12; arr_y2=base_rows[23]["mrr"]*12; arr_y3=base_rows[35]["mrr"]*12
    for i,(period,arr,mult_low,mult_mid,mult_high) in enumerate([
        ("ARR Year 1",arr_y1,5,8,12),("ARR Year 2",arr_y2,5,8,12),("ARR Year 3",arr_y3,6,10,15)]):
        bg=C["light"] if i%2==0 else C["white"]
        ws.write(42+i,0,period,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(42+i,1,arr,   wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(42+i,2,f"{mult_mid}× ARR",wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(42+i,3,arr*mult_low,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,"font_color":C["red"]}))
        ws.write(42+i,4,arr*mult_mid,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(42+i,5,arr*mult_high, wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,"font_color":C["green"]}))
    rev_mult_val=int(arr_y1*8)

    # ── SVI-Based ─────────────────────────────────────────────────────────────
    ws.write("A47","METHOD 6: BlockID SVI-BASED (Proprietary)",F["section"]); ws.merge_range("B47:G47","BlockID Startup Index™ | Stage 3 | SVI 156",F["section"])
    stage_bases={0:300_000,1:750_000,2:2_000_000,3:3_500_000,4:6_000_000,5:12_000_000}
    svi_base=stage_bases[SVI["stage"]]; svi_prem=(SVI["score"]-100)/100
    svi_low=int(svi_base*(1+svi_prem*0.7)); svi_mid=int(svi_base*(1+svi_prem)); svi_high=int(svi_base*(1+svi_prem*1.4))
    for i,(k,v) in enumerate([("Stage 3 Base",svi_base),("SVI Score",SVI["score"]),
                               ("Premium above baseline",svi_prem),
                               ("SVI Low",svi_low),("SVI Mid",svi_mid),("SVI High",svi_high)]):
        ws.write(48+i,0,k,F["label"])
        if k=="SVI Score": ws.write(48+i,1,v,F["value"])
        elif isinstance(v,float): ws.write(48+i,1,v,F["pct"])
        else: ws.write(48+i,1,v,F["aud"])

    # ── Blended Summary ────────────────────────────────────────────────────────
    ws.write("A56","BLENDED VALUATION SUMMARY",F["section"]); ws.merge_range("B56:G56","",F["section"])
    for j,h in enumerate(["Method","Low (AUD)","Mid (AUD)","High (AUD)","Confidence","Best For"]): ws.write(56,j,h,F["h_navy"])
    methods=[
        ("Berkus Method",            int(berkus_total*0.7), berkus_total,       int(berkus_total*1.3),  "Medium",       "Pre-revenue startups"),
        ("Scorecard Method",         int(scorecard_val*0.8),scorecard_val,       int(scorecard_val*1.25),"Medium-High",  "Seed benchmarking"),
        ("DCF (5yr)",                int(max(dcf_val*0.6,0)),max(dcf_val,0),     int(max(dcf_val*1.5,0)),"Low",          "Revenue-generating"),
        ("VC Method",                int(pre_m*0.7),        int(pre_m),           int(pre_m*1.4),         "Medium",       "Fundraising context"),
        ("Revenue Multiple (8×ARR)", int(rev_mult_val*0.6), rev_mult_val,         int(rev_mult_val*1.4),  "Low-Medium",   "ARR-stage startups"),
        ("SVI-Based (BSI-AU)",       svi_low,               svi_mid,              svi_high,               "High",         "BlockID platform"),
    ]
    weights=[0.15,0.25,0.08,0.22,0.05,0.25]
    for i,(method,low,mid,high,conf,best) in enumerate(methods):
        r=57+i; bg=C["light"] if i%2==0 else C["white"]
        for j,v in enumerate([method,low,mid,high,conf,best]):
            if j in (1,2,3): ws.write(r,j,v,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
            else: ws.write(r,j,v,wb.add_format({"font_size":10,"bg_color":bg}))

    bl=int(sum(w*m[1] for w,m in zip(weights,methods)))
    bm=int(sum(w*m[2] for w,m in zip(weights,methods)))
    bh=int(sum(w*m[3] for w,m in zip(weights,methods)))
    ws.write(63,0,"BLENDED (WEIGHTED)",F["label"])
    ws.write(63,1,bl,F["total"]); ws.write(63,2,bm,F["total"]); ws.write(63,3,bh,F["total"])
    ws.write(63,4,"Weights: 15/25/8/22/5/25",F["note"])
    ws.write(65,0,f"→ RECOMMENDED VALUATION RANGE: A${bl:,} – A${bm:,} – A${bh:,}",
             wb.add_format({"bold":True,"font_size":12,"font_color":C["blue"],"bg_color":C["yellow"],"border":2}))
    return ws, methods, (bl,bm,bh)

ws5, valuation_methods, blended = build_sheet5()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 6 — INVESTOR SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet6():
    ws = wb.add_worksheet("6. Investor Summary")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 30); ws.set_column("B:D", 24)
    ws.set_row(0, 52)
    ws.merge_range("A1:D1",f"  {COMPANY}  |  Investor One-Pager  |  {TODAY.strftime('%B %Y')}",F["title"])

    ws.merge_range("A3:D3","THE OPPORTUNITY",F["section"])
    ws.merge_range("A4:D6","BlockID.au is Australia's first Startup Value Index™ (SVI) platform. "
        "We combine AI-powered founder intelligence, cap table management, investor-ready scoring, "
        "and a proprietary market index into a single execution platform for AU founders. "
        "Our data flywheel creates compounding competitive advantages that grow with every user.",F["value"])

    ws.merge_range("A8:D8","TRACTION & PRODUCT METRICS",F["section"])
    kpis=[
        ("SVI Score",f"~{SVI['score']} (Outstanding, Stage 3 p75+)"),
        ("Features Delivered","83+ tasks | T0001–T0083"),
        ("API Routes","70 production endpoints"),
        ("DB Migrations","63 (production-grade schema)"),
        ("Deploy Pipeline","10/10 gates — live at blockid.au"),
        ("Stack","Next.js 16 + Supabase + Claude AI + Stripe"),
        ("Pricing Live","Free | A$49 Founding50 | A$99/mo | A$950/yr"),
        ("Response Time","P50: 0.155s | P95: <200ms"),
        ("AI Agents","8 autonomous agents (7 active)"),
        ("Unit Tests","62 tests | CI/CD pipeline"),
    ]
    for i,(k,v) in enumerate(kpis):
        ws.write(8+i,0,k,F["label"]); ws.write(8+i,1,v,F["row_light"] if i%2==0 else F["row_white"])

    ws.merge_range("A20:D20","VALUATION RANGE (BLENDED — 6 METHODS)",F["section"])
    bl,bm,bh=blended
    for label,val,hdr in [("Conservative",bl,F["h_red"]),("Base Case",bm,F["h_blue"]),("Optimistic",bh,F["h_green"])]:
        ws.write(20+[bl,bm,bh].index(val),0,label,hdr); ws.write(20+[bl,bm,bh].index(val),1,val,F["total"])

    ws.merge_range("A24:D24","FINANCIAL PROJECTIONS (BASE SCENARIO)",F["section"])
    base_r=scenario_data["Base"]["rows"]
    for i,(k,v) in enumerate([
        ("ARR Month 12",      base_r[11]["mrr"]*12),
        ("ARR Month 24",      base_r[23]["mrr"]*12),
        ("ARR Month 36",      base_r[35]["mrr"]*12),
        ("Break-Even Month",  scenario_data["Base"]["be"]),
        ("Gross Margin",      SCENARIOS["Base"]["gross_margin"]),
        ("Monthly Growth",    SCENARIOS["Base"]["monthly_growth"]),
        ("LTV:CAC (Base)",    (SCENARIOS["Base"]["arpu"]/SCENARIOS["Base"]["churn"])/SCENARIOS["Base"]["cac"]),
    ]):
        ws.write(24+i,0,k,F["label"])
        if isinstance(v,float) and v<1: ws.write(24+i,1,v,F["pct"])
        elif k=="Break-Even Month": ws.write(24+i,1,f"Month {v}" if v else "TBD",F["value"])
        else: ws.write(24+i,1,v,F["aud"])

    ws.merge_range("A33:D33","COMPETITIVE MOAT — BlockID Startup Index™",F["section"])
    moat=[
        "1. DATA FLYWHEEL — Every SVI analysis enriches the benchmark dataset",
        "2. PROPRIETARY ALGORITHM — SVI v2.0: 8 dimensions, 6 evidence tiers, confidence weighting",
        "3. NETWORK EFFECTS — Index value compounds with participant growth",
        "4. SWITCHING COST — Founders accumulate history, snapshots, evidence vault over time",
        "5. B2B EXTENSION — VCs/accelerators pay for index API access & deal flow intelligence",
        "6. TRADEMARK — BlockID Startup Index™ (filing in progress, AU Trade Marks Office)",
        "7. FIRST MOVER — No direct AU-native SVI competitor; international alternatives lack local context",
    ]
    for i,item in enumerate(moat): ws.write(33+i,0,item,F["value"] if i%2==0 else F["row_light"])
    ws.write(41,0,f"Contact: {EMAIL}  |  blockid.au  |  github.com/Blockid-au/blockid",F["note"])
    return ws

ws6 = build_sheet6()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 7 — C-LEVEL TEMPLATE
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet7():
    ws = wb.add_worksheet("7. C-Level Template")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 32); ws.set_column("B:D", 24)
    ws.set_row(0, 40)
    ws.merge_range("A1:D1","BlockID SVI — C-Level Startup Valuation Template (Reusable)",F["title"])
    ws.merge_range("A2:D2","Fill yellow cells. Based on BlockID Startup Index™ methodology.",F["subtitle"])

    ws.write("A4","STARTUP INPUTS (fill yellow cells)",F["section"]); ws.merge_range("B4:D4","",F["section"])
    inputs=[
        ("Company Name","YOUR STARTUP PTY LTD","text"),
        ("Stage (0=Concept to 5=Growth)",2,"num"),
        ("SVI Score (from BlockID)",110,"num"),
        ("Current MRR (AUD)",0,"aud"),
        ("Monthly Revenue Growth Rate",0.15,"pct"),
        ("Monthly Churn Rate",0.05,"pct"),
        ("ARPU (AUD/month)",75,"aud"),
        ("Monthly Burn Rate (AUD)",1057,"aud"),
        ("Runway (months remaining)",18,"num"),
        ("Team Size (FTEs)",1,"num"),
        ("Has Co-Founder? (1=Yes)",0,"num"),
        ("External Funding Raised? (1=Yes)",0,"num"),
        ("Sector","SaaS / FinTech","text"),
        ("TAM (AUD)",1_000_000_000,"aud"),
        ("SAM (AUD)",100_000_000,"aud"),
    ]
    for i,(label,default,typ) in enumerate(inputs):
        r=5+i; ws.write(r,0,label,F["label"])
        if typ=="aud":   ws.write(r,1,default,F["input_aud"])
        elif typ=="pct": ws.write(r,1,default,F["input_pct"])
        else:            ws.write(r,1,default,F["input"])
        ws.write(r,2,"◄ Edit this cell",F["note"])

    ws.write("A22","SVI DIMENSION SCORES (0–100)",F["section"]); ws.merge_range("B22:D22","",F["section"])
    dims=[
        ("FTV — Founding Team Velocity",65),
        ("MPC — Market Potential & Competition",70),
        ("PTD — Product-Technology Development",60),
        ("TRE — Traction & Revenue Evidence",40),
        ("CGH — Capital & Growth History",50),
        ("IRI — Investor Readiness Index",55),
        ("LCO — Legal & Compliance Operations",60),
        ("SVM — Startup Viability Multiplier",65),
    ]
    for i,(d,score) in enumerate(dims):
        ws.write(22+i,0,d,F["label"]); ws.write(22+i,1,score,F["input"]); ws.write(22+i,2,"◄ Edit (0-100)",F["note"])

    ws.write("A32","AUTO-CALCULATED OUTPUTS",F["section"]); ws.merge_range("B32:D32","",F["section"])
    ws.write("A33","Output",F["h_navy"]); ws.write("B33","Value",F["h_navy"]); ws.write("C33","Benchmark",F["h_navy"])
    ws.write(33,0,"NOTE: Connect to SVI API for live calculations.",F["note"])
    ws.write(34,0,"API: POST /api/svi → auto-populates all outputs.",F["note"])
    ws.write(35,0,"Live tool: blockid.au/workspace/svi",F["note"])
    outputs=[
        ("Berkus Valuation (Low–High)","→ Based on dimension scores","A$500K–A$2M (pre-seed AU)"),
        ("Scorecard Valuation","→ Stage-adjusted mid","Seed: A$3M–A$7.5M"),
        ("Projected ARR Month 12","→ MRR × growth × 12","Seed target: A$100K+"),
        ("Break-Even Month","→ Revenue = fixed costs","Target: <24 months"),
        ("LTV","→ ARPU / Churn","Target: >3× CAC"),
        ("LTV:CAC Ratio","→ See unit economics","≥3.0× healthy"),
        ("Recommended Valuation","→ Blended model output","Stage-appropriate range"),
    ]
    for i,(out,val,bench) in enumerate(outputs):
        r=36+i; ws.write(r,0,out,F["label"])
        ws.write(r,1,val,F["row_light"] if i%2==0 else F["row_white"])
        ws.write(r,2,bench,F["note"])
    ws.write(44,0,"BlockID Startup Index™ — blockid.au | Confidential",F["note"])
    return ws

ws7 = build_sheet7()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 8 — SENSITIVITY ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet8():
    ws = wb.add_worksheet("8. Sensitivity Analysis")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 22); ws.set_column("B:K", 16)
    ws.set_row(0, 40)
    ws.merge_range("A1:K1",f"{COMPANY} — 2-Way Sensitivity Analysis",F["title"])
    ws.merge_range("A2:K2","How valuation & ARR change across key input combinations",F["subtitle"])

    def sens_mrr(growth, churn, months=12):
        c=12; m=12*75
        for _ in range(months):
            c=max(0,c+c*growth-c*churn); m=c*75
        return m*12

    def sens_valuation(growth, churn):
        arr=sens_mrr(growth,churn)
        svi_base=3_500_000; svi_val=int(svi_base*(1+(SVI["score"]-100)/100))
        return int(arr*8*0.4 + svi_val*0.6)

    # Table 1: ARR @ Month 12 — Growth Rate vs Churn Rate
    ws.write("A4","TABLE 1: ARR Month 12 (A$) — Monthly Growth Rate vs Churn Rate",F["section"])
    ws.merge_range("B4:K4","",F["section"])
    growth_rates=[0.05,0.08,0.10,0.12,0.15,0.18,0.20,0.25,0.30,0.35]
    churn_rates= [0.02,0.03,0.04,0.05,0.06,0.07,0.08,0.10,0.12,0.15]
    ws.write(5,0,"Churn \\ Growth →",F["h_navy"])
    for j,g in enumerate(growth_rates): ws.write(5,j+1,f"{g*100:.0f}%",F["h_blue"])
    for i,ch in enumerate(churn_rates):
        ws.write(6+i,0,f"{ch*100:.0f}% churn",F["label"])
        for j,g in enumerate(growth_rates):
            arr=sens_mrr(g,ch)
            # color: green=good, yellow=mid, red=low
            if arr>500_000: cell_fmt=F["heat_low"]
            elif arr>100_000: cell_fmt=F["heat_mid"]
            else: cell_fmt=F["heat_high"]
            ws.write(6+i,j+1,int(arr),cell_fmt)
    ws.write(17,0,"Green: ARR >A$500K | Yellow: A$100K–A$500K | Red: <A$100K at Month 12",F["note"])

    # Table 2: Blended Valuation — SVI Score vs Stage
    ws.write("A20","TABLE 2: SVI-Based Valuation (A$) — SVI Score vs Stage",F["section"])
    ws.merge_range("B20:K20","",F["section"])
    stage_bases_v={0:300_000,1:750_000,2:2_000_000,3:3_500_000,4:6_000_000,5:12_000_000}
    svi_scores=[80,100,110,120,130,140,150,160,180,200]
    stages=[0,1,2,3,4,5]
    stage_names={0:"Concept",1:"MVP",2:"PMF",3:"Traction",4:"Scale",5:"Growth"}
    ws.write(20,0,"Stage \\ SVI →",F["h_navy"])
    for j,sv in enumerate(svi_scores): ws.write(20,j+1,str(sv),F["h_blue"])
    for i,st in enumerate(stages):
        ws.write(21+i,0,f"S{st}: {stage_names[st]}",F["label"])
        for j,sv in enumerate(svi_scores):
            base=stage_bases_v[st]; prem=(sv-100)/100
            val=int(base*(1+prem))
            if val>5_000_000: cell_fmt=F["heat_low"]
            elif val>2_000_000: cell_fmt=F["heat_mid"]
            else: cell_fmt=F["heat_high"]
            ws.write(21+i,j+1,val,cell_fmt)
    ws.write(28,0,"Green: >A$5M | Yellow: A$2M–A$5M | Red: <A$2M valuation",F["note"])

    # Table 3: ARPU × Customers → MRR sensitivity
    ws.write("A31","TABLE 3: MRR Sensitivity — ARPU vs Customer Count",F["section"])
    ws.merge_range("B31:K31","",F["section"])
    arpus   =[30,49,65,75,82,99,120,149,199,249]
    customer_counts=[5,10,20,30,50,75,100,150,200,300]
    ws.write(31,0,"Customers \\ ARPU →",F["h_navy"])
    for j,a in enumerate(arpus): ws.write(31,j+1,f"A${a}",F["h_teal"])
    for i,cust in enumerate(customer_counts):
        ws.write(32+i,0,f"{cust} customers",F["label"])
        for j,a in enumerate(arpus):
            mrr=cust*a
            if mrr>TOTAL_MONTHLY_BURN*2: cell_fmt=F["heat_low"]
            elif mrr>TOTAL_MONTHLY_BURN: cell_fmt=F["heat_mid"]
            else: cell_fmt=F["heat_high"]
            ws.write(32+i,j+1,mrr,wb.add_format({"font_size":9,"bg_color":
                "#BBF7D0" if mrr>TOTAL_MONTHLY_BURN*2 else ("#FEF08A" if mrr>TOTAL_MONTHLY_BURN else "#FCA5A5"),
                "num_format":'"A$"#,##0',"align":"center"}))
    ws.write(43,0,f"Green: MRR > 2× burn (A${TOTAL_MONTHLY_BURN*2:,}) | Yellow: covers burn | Red: below burn rate",F["note"])
    return ws

ws8 = build_sheet8()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 9 — MONTE CARLO SIMULATION
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet9():
    ws = wb.add_worksheet("9. Monte Carlo Simulation")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 30); ws.set_column("B:H", 18)
    ws.set_row(0, 40)
    ws.merge_range("A1:H1",f"{COMPANY} — Monte Carlo Simulation (1,000 Iterations)",F["title"])
    ws.merge_range("A2:H2","Stochastic model: randomise growth, churn, ARPU across 1,000 scenarios → distribution of outcomes",F["subtitle"])

    N=1_000
    results_arr12=[]
    results_arr36=[]
    results_val=[]
    results_be=[]
    for _ in range(N):
        g  = random.gauss(0.15, 0.05);  g=max(0.01,min(0.40,g))
        ch = random.gauss(0.05, 0.02);  ch=max(0.01,min(0.15,ch))
        arpu=random.gauss(75,  15);      arpu=max(20,min(200,arpu))
        gm  = random.gauss(0.78, 0.05); gm=max(0.50,min(0.92,gm))
        start_c=random.randint(5,20)
        c=start_c; mrr=c*arpu; cum_profit=0; be_mo=None
        for mo in range(36):
            vc=mrr*(1-gm); tc=TOTAL_MONTHLY_BURN+vc; profit=mrr-tc
            cum_profit+=profit
            if be_mo is None and cum_profit>=0: be_mo=mo+1
            c=max(0,c+c*g-c*ch); mrr=c*arpu
            if mo==11: arr12=mrr*12
        arr36=mrr*12
        svi_v=int(3_500_000*(1+(SVI["score"]-100)/100))
        val=int(arr12*8*0.4+svi_v*0.6)
        results_arr12.append(arr12); results_arr36.append(arr36)
        results_val.append(val); results_be.append(be_mo if be_mo else 37)

    def pct(data,p): data_sorted=sorted(data); idx=int(len(data_sorted)*p/100); return data_sorted[idx]

    ws.write("A4","MONTE CARLO SUMMARY STATISTICS",F["section"]); ws.merge_range("B4:H4","",F["section"])
    for j,h in enumerate(["Metric","P10","P25","Median (P50)","Mean","P75","P90"]): ws.write(4,j,h,F["h_navy"])
    mc_data=[
        ("ARR Month 12 (AUD)",results_arr12,"aud"),
        ("ARR Month 36 (AUD)",results_arr36,"aud"),
        ("Implied Valuation (AUD)",results_val,"aud"),
        ("Break-Even Month",results_be,"num"),
    ]
    for i,(label,data,typ) in enumerate(mc_data):
        r=5+i; ws.write(r,0,label,F["label"])
        num_fmt='"A$"#,##0' if typ=="aud" else '#,##0'
        stats=[pct(data,10),pct(data,25),pct(data,50),statistics.mean(data),pct(data,75),pct(data,90)]
        for j,v in enumerate(stats):
            ws.write(r,j+1,int(v),wb.add_format({"font_size":10,"num_format":num_fmt,
                "bg_color":C["light"] if i%2==0 else C["white"]}))

    ws.write("A11","PROBABILITY DISTRIBUTION — ARR Month 12",F["section"]); ws.merge_range("B11:H11","",F["section"])
    buckets=[(0,50_000),(50_000,100_000),(100_000,250_000),(250_000,500_000),(500_000,1_000_000),(1_000_000,2_000_000),(2_000_000,float("inf"))]
    for j,h in enumerate(["ARR Range","Scenarios (n)","Probability","Cumulative Prob"]): ws.write(11,j,h,F["h_navy"])
    cum=0
    for i,(lo,hi) in enumerate(buckets):
        count=sum(1 for v in results_arr12 if lo<=v<hi); prob=count/N; cum+=prob
        label=f"A${lo//1000:,}K – {'∞' if hi==float('inf') else f'A${hi//1000:,}K'}"
        bg=C["light"] if i%2==0 else C["white"]
        ws.write(12+i,0,label,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(12+i,1,count,wb.add_format({"font_size":10,"num_format":'#,##0',"bg_color":bg}))
        ws.write(12+i,2,prob, wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg,"font_color":C["green"] if prob>0.2 else C["navy"]}))
        ws.write(12+i,3,cum,  wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))

    ws.write("A21","KEY INSIGHTS",F["section"]); ws.merge_range("B21:H21","",F["section"])
    p50_v=int(pct(results_val,50)); p10_v=int(pct(results_val,10)); p90_v=int(pct(results_val,90))
    insights=[
        f"50% probability valuation exceeds A${p50_v:,}",
        f"10% downside scenario: valuation ~A${p10_v:,} (P10)",
        f"10% upside scenario: valuation ~A${p90_v:,} (P90)",
        f"Break-even achieved in {int(statistics.mean(results_be))} months on average (mean)",
        f"ARR Month 12 median: A${int(pct(results_arr12,50)):,}",
        f"Probability ARR>A$500K at Month 12: {sum(1 for v in results_arr12 if v>500_000)/N*100:.0f}%",
        f"Probability ARR>A$1M at Month 12: {sum(1 for v in results_arr12 if v>1_000_000)/N*100:.0f}%",
    ]
    for i,ins in enumerate(insights):
        ws.write(22+i,0,ins,F["value"] if i%2==0 else F["row_light"])
    ws.write(30,0,"Model: gaussian randomisation of growth/churn/ARPU | N=1,000 | Seed=42 for reproducibility",F["note"])
    return ws

ws9 = build_sheet9()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 10 — FUNDRAISING & DILUTION
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet10():
    ws = wb.add_worksheet("10. Fundraising & Dilution")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 34); ws.set_column("B:G", 18)
    ws.set_row(0, 40)
    ws.merge_range("A1:G1",f"{COMPANY} — Fundraising Scenarios & Founder Dilution",F["title"])

    ws.write("A3","FUNDRAISING SCENARIOS",F["section"]); ws.merge_range("B3:G3","",F["section"])
    for j,h in enumerate(["Round","Raise (AUD)","Pre-Money","Post-Money","Dilution %","Founder Equity After"]): ws.write(3,j,h,F["h_navy"])
    bl,bm,bh=blended
    scenarios_raise=[
        ("Pre-Seed (Angel)",     200_000, bm*0.5),
        ("Pre-Seed (Startmate)", 300_000, bm*0.75),
        ("Seed (SAFE A$1M note)",500_000, bm),
        ("Seed (Priced round)",  750_000, bm*1.2),
        ("Seed+ (A round lead)", 1_500_000, bm*2),
        ("Series A target",      3_000_000, bm*4),
    ]
    founder_eq=1.0
    for i,(round_name,raise_amt,pre_money) in enumerate(scenarios_raise):
        post_money=pre_money+raise_amt; dilution=raise_amt/post_money; founder_eq_after=founder_eq*(1-dilution)
        bg=C["light"] if i%2==0 else C["white"]
        ws.write(4+i,0,round_name,wb.add_format({"font_size":10,"bg_color":bg,"bold":True}))
        ws.write(4+i,1,raise_amt,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(4+i,2,pre_money,  wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(4+i,3,post_money, wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(4+i,4,dilution,   wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg,
                                                    "font_color":C["red"] if dilution>0.25 else C["navy"]}))
        ws.write(4+i,5,founder_eq_after,wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg,
                                                         "font_color":C["green"] if founder_eq_after>0.70 else C["amber"]}))

    ws.write("A12","RUNWAY ANALYSIS",F["section"]); ws.merge_range("B12:G12","",F["section"])
    for j,h in enumerate(["Raise Amount","Monthly Burn","Runway (months)","Runway End","MRR at Runway End","Action Required"]): ws.write(12,j,h,F["h_navy"])
    for i,raise_amt in enumerate([0,200_000,300_000,500_000,750_000,1_500_000]):
        base_r=scenario_data["Base"]["rows"]
        runway_mo=raise_amt/TOTAL_MONTHLY_BURN if raise_amt>0 else 0
        mrr_at_end=base_r[min(int(runway_mo),35)]["mrr"] if runway_mo>0 else base_r[0]["mrr"]
        action="Profitable from ops" if raise_amt==0 else ("Bootstrap" if runway_mo<12 else ("Raise next round" if runway_mo<24 else "Comfortable runway"))
        bg=C["light"] if i%2==0 else C["white"]
        ws.write(13+i,0,raise_amt,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(13+i,1,TOTAL_MONTHLY_BURN,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(13+i,2,runway_mo,wb.add_format({"font_size":10,"num_format":'0.0',"bg_color":bg}))
        ws.write(13+i,3,f"~{int(runway_mo)} months post-close" if raise_amt>0 else "N/A",wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(13+i,4,mrr_at_end,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(13+i,5,action,wb.add_format({"font_size":10,"bg_color":bg}))

    ws.write("A21","CAP TABLE SNAPSHOT (PRE-MONEY)",F["section"]); ws.merge_range("B21:G21","",F["section"])
    for j,h in enumerate(["Shareholder","Shares","Ownership %","Value (Blended Mid)","Notes"]): ws.write(21,j,h,F["h_navy"])
    cap_table=[
        ("Founder (dovanlong)",       8_500_000, 0.85, bm*0.85, "Subject to vesting 4yr/1yr cliff"),
        ("Contributor",                 500_000, 0.05, bm*0.05, "Advisor/contractor equity"),
        ("Option Pool (ESOP)",          750_000, 0.075,bm*0.075,"Reserved for future hires"),
        ("Founding 50 Warrants",         250_000, 0.025,bm*0.025,"A$49 × 50 subscribers"),
        ("TOTAL (Pre-Raise)",         10_000_000, 1.00, bm,      "10M shares issued"),
    ]
    for i,(name,shares,pct_own,val,notes) in enumerate(cap_table):
        r=22+i; bg=C["light"] if i%2==0 else C["white"]
        bold=i==len(cap_table)-1
        ws.write(r,0,name,wb.add_format({"font_size":10,"bg_color":bg,"bold":bold}))
        ws.write(r,1,shares,wb.add_format({"font_size":10,"num_format":'#,##0',"bg_color":bg,"bold":bold}))
        ws.write(r,2,pct_own,wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg,"bold":bold}))
        ws.write(r,3,val,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,"bold":bold}))
        ws.write(r,4,notes,wb.add_format({"font_size":10,"bg_color":bg,"italic":True,"font_color":C["gray"]}))
    ws.write(28,0,"Note: Cap table is illustrative. Shares/ownership to be confirmed with legal counsel.",F["note"])
    return ws

ws10 = build_sheet10()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 11 — RISK FACTOR + FIRST CHICAGO METHOD
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet11():
    ws = wb.add_worksheet("11. Risk Factor + First Chicago")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 34); ws.set_column("B:G", 20)
    ws.set_row(0, 40)
    ws.merge_range("A1:G1",f"{COMPANY} — Risk Factor Summation & First Chicago Method",F["title"])

    ws.write("A3","RISK FACTOR SUMMATION METHOD",F["section"])
    ws.merge_range("B3:G3","Base: A$3M (AU seed median) | Adjust +/- A$250K per factor",F["section"])
    for j,h in enumerate(["Risk Factor","Rating","Score (+/- A$250K)","Adjustment","Rationale"]): ws.write(3,j,h,F["h_navy"])
    risk_factors=[
        ("Management Risk",        +1, "Strong solo founder, tech depth",        "Strong team but single founder risk"),
        ("Stage of Business",      +1, "Early traction, live product",            "Past MVP, early customers"),
        ("Legislation/Political",   0, "Neutral — AU regulatory stable",          "No specific legislative risk"),
        ("Manufacturing Risk",     +2, "Pure SaaS — no physical production",      "Software only, fully automated"),
        ("Sales/Marketing Risk",   -1, "No dedicated sales team yet",             "Founder-led sales only"),
        ("Funding/Capital Risk",   -1, "Bootstrapped, limited runway",            "No external capital secured"),
        ("Competition Risk",        0, "First mover AU, global competition",      "International competitors (Visible, Crunchbase)"),
        ("Technology Risk",        +1, "Production stack, 70 APIs, CI/CD live",   "Proven Next.js+Supabase stack"),
        ("Litigation Risk",        +1, "Clean slate, trademark in progress",      "No active disputes"),
        ("International Risk",     +1, "AU-first, clear expansion path to NZ/UK", "Low initial international exposure"),
        ("Reputation Risk",         0, "Early stage, small brand footprint",      "Neutral — no major incidents"),
        ("Potential Lucrative Exit",+1, "B2B API + index data = acquisition target","Attractive to fintech/VC data platforms"),
    ]
    rfs_base=3_000_000; total_adj=0
    for i,(factor,rating,rationale,notes) in enumerate(risk_factors):
        adj=rating*250_000; total_adj+=adj; bg=C["light"] if i%2==0 else C["white"]
        ws.write(4+i,0,factor,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(4+i,1,"+"+str(rating) if rating>0 else str(rating),
                 wb.add_format({"font_size":10,"bg_color":bg,"bold":True,
                                 "font_color":C["green"] if rating>0 else (C["red"] if rating<0 else C["gray"]),"align":"center"}))
        ws.write(4+i,2,rationale,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(4+i,3,adj,wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,
                                            "font_color":C["green"] if adj>0 else (C["red"] if adj<0 else C["gray"])}))
        ws.write(4+i,4,notes,wb.add_format({"font_size":10,"bg_color":bg,"italic":True,"font_color":C["gray"]}))
    rfs_val=rfs_base+total_adj
    ws.write(16,0,"Base Valuation",F["label"]); ws.write(16,3,rfs_base,F["aud"])
    ws.write(17,0,"Total Risk Adjustment",F["label"]); ws.write(17,3,total_adj,F["aud_green"] if total_adj>=0 else F["aud_red"])
    ws.write(18,0,"RISK FACTOR SUMMATION TOTAL",F["label"]); ws.write(18,3,rfs_val,F["total"])

    # First Chicago Method
    ws.write("A21","FIRST CHICAGO METHOD (3-Case Scenario Weighting)",F["section"])
    ws.merge_range("B21:G21","Probability-weighted expected value across Success/Sideways/Failure",F["section"])
    for j,h in enumerate(["Case","Probability","Projected Value","Weighted Value","Key Assumptions"]): ws.write(21,j,h,F["h_navy"])
    base_r=scenario_data["Base"]["rows"]
    arr_y5=base_r[35]["mrr"]*12
    cases=[
        ("Success Case (IPO/M&A)",  0.25, arr_y5*15, "Acqui-hire or Series B exit at 15× ARR Y5"),
        ("Base Case (Profitable)",  0.50, arr_y5*8,  "Stable SaaS at 8× ARR; Seed or bootstrap exit"),
        ("Sideways Case (Pivot)",   0.15, 1_000_000, "Pivot to niche; partial recovery of IP value"),
        ("Failure Case",            0.10, 0,          "No traction; wind-down; zero recovery"),
    ]
    weighted_total=0
    for i,(case,prob,val,notes) in enumerate(cases):
        wv=prob*val; weighted_total+=wv; bg=C["light"] if i%2==0 else C["white"]
        ws.write(22+i,0,case,wb.add_format({"font_size":10,"bg_color":bg,"bold":True}))
        ws.write(22+i,1,prob,wb.add_format({"font_size":10,"num_format":'0.0%',"bg_color":bg}))
        ws.write(22+i,2,int(val),wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(22+i,3,int(wv), wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg,
                                                  "font_color":C["green"] if wv>500_000 else C["navy"]}))
        ws.write(22+i,4,notes,wb.add_format({"font_size":10,"bg_color":bg,"italic":True,"font_color":C["gray"]}))
    ws.write(26,0,"FIRST CHICAGO EXPECTED VALUE",F["label"]); ws.write(26,3,int(weighted_total),F["total"])

    ws.write("A29","VALUATION METHODS COMPARISON (ALL 8 METHODS)",F["section"]); ws.merge_range("B29:G29","",F["section"])
    for j,h in enumerate(["Method","Low","Mid","High","Category"]): ws.write(29,j,h,F["h_navy"])
    bl,bm,bh=blended
    all_methods = list(valuation_methods) + [
        ("Risk Factor Summation", int(rfs_val*0.8), rfs_val, int(rfs_val*1.2), "High", "Risk-adjusted"),
        ("First Chicago",         int(weighted_total*0.7), int(weighted_total), int(weighted_total*1.3), "High", "Probability-weighted"),
    ]
    for i,row in enumerate(all_methods):
        r=30+i; bg=C["light"] if i%2==0 else C["white"]
        ws.write(r,0,row[0],wb.add_format({"font_size":10,"bg_color":bg,"bold":True}))
        ws.write(r,1,row[1],wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(r,2,row[2],wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(r,3,row[3],wb.add_format({"font_size":10,"num_format":'"A$"#,##0',"bg_color":bg}))
        ws.write(r,4,row[5] if len(row)>5 else "—",wb.add_format({"font_size":10,"bg_color":bg}))
    return ws, rfs_val, int(weighted_total)

ws11, rfs_val, fc_val = build_sheet11()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 12 — ACTION PLAN & MILESTONES
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet12():
    ws = wb.add_worksheet("12. Action Plan & Milestones")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 32); ws.set_column("B:B", 18); ws.set_column("C:C", 14)
    ws.set_column("D:D", 22); ws.set_column("E:E", 20); ws.set_column("F:F", 18)
    ws.set_row(0, 40)
    ws.merge_range("A1:F1",f"{COMPANY} — 90-Day Action Plan & Strategic Milestones",F["title"])
    ws.merge_range("A2:F2",f"Based on SVI analysis | Generated: {TODAY.strftime('%d %B %Y')} | SVI Score: {SVI['score']}",F["subtitle"])

    ws.write("A4","90-DAY SPRINT PLAN",F["section"]); ws.merge_range("B4:F4","",F["section"])
    for j,h in enumerate(["Action","Deadline","Priority","Owner","Impact on SVI","Expected Outcome"]): ws.write(4,j,h,F["h_navy"])
    actions=[
        # Phase 1: Revenue (Month 1)
        ("Activate Founding50 campaign — 50 subscribers",   "2026-07-01","🔴 Critical","Founder","TRE +15pts","A$2,450 ARR instantly"),
        ("Publish SVI public leaderboard (index page)",     "2026-07-07","🔴 Critical","Dev","TRE +10pts","Social proof + SEO"),
        ("Launch ProductHunt — main product",               "2026-07-15","🔴 Critical","Founder","TRE +20pts","200–1K signups target"),
        ("SEO: publish 10 founder finance articles",        "2026-07-31","🟠 High","Content","MPC +5pts","Organic traffic"),
        # Phase 2: Capital (Month 2)
        ("Apply to Startmate S24 cohort",                   "2026-07-20","🔴 Critical","Founder","CGH +20pts","A$120K raise potential"),
        ("Submit to Antler AU Residency",                   "2026-07-31","🟠 High","Founder","CGH +15pts","Network + A$100K"),
        ("Angel outreach: 20 AU fintech angels",            "2026-08-15","🟠 High","Founder","CGH +10pts","A$200K–$500K raise"),
        ("Register BlockID Startup Index™ trademark",       "2026-07-10","🟠 High","Legal","LCO +15pts","IP protection, moat"),
        # Phase 3: Product (Month 3)
        ("Launch SVI API (B2B tier)",                       "2026-08-01","🟠 High","Dev","PTD +10pts","New revenue stream"),
        ("Add Google/LinkedIn OAuth",                       "2026-07-20","🟡 Medium","Dev","TRE +5pts","Reduce CAC"),
        ("Integrate Xero/QuickBooks for financial data",    "2026-08-31","🟡 Medium","Dev","PTD +8pts","Enterprise-ready signal"),
        ("Publish Antler pitch deck & data room",           "2026-07-15","🔴 Critical","Founder","IRI +20pts","Fundraising ready"),
        # Phase 4: Scaling
        ("Partner with 3 AU accelerators for SVI whitelabel","2026-09-01","🟡 Medium","BizDev","SVM +10pts","B2B pipeline"),
        ("Launch AU LinkedIn ads campaign",                 "2026-08-01","🟡 Medium","Marketing","TRE +5pts","Paid acquisition test"),
        ("Implement referral/affiliate program",            "2026-08-15","🟡 Medium","Dev","TRE +8pts","Viral growth loop"),
    ]
    for i,row in enumerate(actions):
        r=5+i; bg=C["light"] if i%2==0 else C["white"]
        for j,v in enumerate(row):
            ws.write(r,j,v,wb.add_format({"font_size":10,"bg_color":bg}))

    ws.write("A22","SVI IMPROVEMENT ROADMAP",F["section"]); ws.merge_range("B22:F22","",F["section"])
    for j,h in enumerate(["Dimension","Current Score","Target (90d)","Gap","Key Action","Score Impact"]): ws.write(22,j,h,F["h_navy"])
    svi_roadmap=[
        ("FTV — Founding Team",  SVI["ftv"], 78, "+10", "Add co-founder or key advisor with exits", "High"),
        ("MPC — Market Clarity", SVI["mpc"], 88, "+6",  "Publish market research report, media coverage","Medium"),
        ("PTD — Product/Tech",   SVI["ptd"], 91, "→91", "Already strong — maintain and document","Low"),
        ("TRE — Traction",       SVI["tre"], 72, "+20", "Paying customers, revenue data, testimonials","CRITICAL"),
        ("CGH — Capital History",SVI["cgh"], 65, "+20", "Raise pre-seed, register company properly","CRITICAL"),
        ("IRI — Investor Ready", SVI["iri"], 82, "+4",  "Complete data room, publish pitch deck","Medium"),
        ("LCO — Legal/Compliance",SVI["lco"],73, "+10", "Trademark, privacy policy, ASIC registration","High"),
        ("SVM — Strategic Moat", SVI["svm"], 80, "+6",  "Patent SVI algorithm, publish index methodology","Medium"),
    ]
    for i,(dim,curr,target,gap,action,impact) in enumerate(svi_roadmap):
        r=23+i; bg=C["light"] if i%2==0 else C["white"]
        ws.write(r,0,dim,wb.add_format({"font_size":10,"bg_color":bg,"bold":True}))
        ws.write(r,1,curr,wb.add_format({"font_size":10,"num_format":'#,##0',"bg_color":bg}))
        ws.write(r,2,target,wb.add_format({"font_size":10,"num_format":'#,##0',"bg_color":bg}))
        ws.write(r,3,gap,wb.add_format({"font_size":10,"bg_color":bg,"font_color":C["green"] if "+" in gap else C["gray"]}))
        ws.write(r,4,action,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(r,5,impact,wb.add_format({"font_size":10,"bg_color":bg,"bold":"CRITICAL" in impact,
                                            "font_color":C["red"] if "CRITICAL" in impact else (C["amber"] if "High" in impact else C["gray"])}))
    return ws

ws12 = build_sheet12()

# ═══════════════════════════════════════════════════════════════════════════════
# SHEET 13 — SVI BENCHMARK TABLE (for other startups)
# ═══════════════════════════════════════════════════════════════════════════════
def build_sheet13():
    ws = wb.add_worksheet("13. SVI Benchmark Table")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 24); ws.set_column("B:K", 16)
    ws.set_row(0, 40)
    ws.merge_range("A1:K1","BlockID SVI — Benchmark Table for Startup Valuation (Reusable KB)",F["title"])
    ws.merge_range("A2:K2","C-Level Knowledge Base: Apply SVI methodology to value any AU startup profile",F["subtitle"])

    ws.write("A4","SVI SCORE → VALUATION MAPPING BY STAGE",F["section"]); ws.merge_range("B4:K4","",F["section"])
    ws.write(4,0,"SVI Score →",F["h_navy"])
    svi_bands=[80,90,100,110,120,130,140,150,160,180]
    stage_names_v={0:"S0: Concept",1:"S1: MVP",2:"S2: PMF",3:"S3: Traction",4:"S4: Scale",5:"S5: Growth"}
    stage_bases_v={0:300_000,1:750_000,2:2_000_000,3:3_500_000,4:6_000_000,5:12_000_000}
    for j,sv in enumerate(svi_bands): ws.write(4,j+1,str(sv),F["h_blue"])
    for i,st in enumerate(range(6)):
        ws.write(5+i,0,stage_names_v[st],F["label"])
        for j,sv in enumerate(svi_bands):
            base=stage_bases_v[st]; prem=(sv-100)/100; val=int(base*(1+prem))
            if val<0: val=0
            if val>5_000_000: cell_bg="#BBF7D0"
            elif val>2_000_000: cell_bg="#FEF08A"
            elif val>500_000: cell_bg="#FED7AA"
            else: cell_bg="#FCA5A5"
            ws.write(5+i,j+1,val,wb.add_format({"font_size":9,"num_format":'"A$"#,##0',
                                                  "bg_color":cell_bg,"align":"center"}))

    ws.write("A13","SECTOR MULTIPLIER ADJUSTMENTS",F["section"]); ws.merge_range("B13:K13","",F["section"])
    for j,h in enumerate(["Sector","Multiplier","Rationale","AU Example"]): ws.write(13,j,h,F["h_navy"])
    sectors=[
        ("FinTech / RegTech",    "1.3×","High AU demand, regulatory moat","Airwallex, Frollo"),
        ("HealthTech / MedTech", "1.4×","IP-heavy, strong govt support","Eucalyptus, Hive Medical"),
        ("EdTech",               "0.9×","Competitive, lower ARPU","Kahoot AU, 3P Learning"),
        ("SaaS (B2B)",           "1.2×","Recurring revenue premium","MYOB, Xero, Ignition"),
        ("Marketplace",          "1.0×","Network effects, but harder path","Airtasker, Hipages"),
        ("Consumer App",         "0.8×","High CAC, low retention typically","Various"),
        ("DeepTech / AI",        "1.5×","IP/patent premium, global exits","Canva AI, Orca Security"),
        ("Infrastructure SaaS",  "1.3×","Mission-critical, sticky","Atlassian, Culture Amp"),
    ]
    for i,(sector,mult,rationale,example) in enumerate(sectors):
        r=14+i; bg=C["light"] if i%2==0 else C["white"]
        ws.write(r,0,sector,wb.add_format({"font_size":10,"bg_color":bg,"bold":True}))
        ws.write(r,1,mult,wb.add_format({"font_size":10,"bg_color":bg,"bold":True,"font_color":C["blue"]}))
        ws.write(r,2,rationale,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(r,3,example,wb.add_format({"font_size":10,"bg_color":bg,"font_color":C["gray"]}))

    ws.write("A24","EVIDENCE CONFIDENCE MULTIPLIERS (SVI v2.0)",F["section"]); ws.merge_range("B24:K24","",F["section"])
    for j,h in enumerate(["Evidence Tier","Multiplier","Description","Effect on SVI"]): ws.write(24,j,h,F["h_navy"])
    tiers=[
        ("T0: None",          0.20,"No supporting evidence","Very low confidence score"),
        ("T1: Self-declared", 0.40,"Founder's own claims only","Low, use with caution"),
        ("T2: Documented",    0.60,"Written records, screenshots","Moderate confidence"),
        ("T3: Third-party",   0.80,"Customer letters, partner MoUs","High confidence"),
        ("T4: Audited",       0.95,"Financial audit, legal docs","Very high confidence"),
        ("T5: Verified",      1.00,"Independent third-party verified","Full score applied"),
    ]
    for i,(tier,mult,desc,effect) in enumerate(tiers):
        r=25+i; bg=C["light"] if i%2==0 else C["white"]
        ws.write(r,0,tier,wb.add_format({"font_size":10,"bg_color":bg,"bold":True}))
        ws.write(r,1,mult,wb.add_format({"font_size":10,"num_format":'0.0',"bg_color":bg,"bold":True,
                                          "font_color":C["green"] if mult>=0.8 else (C["amber"] if mult>=0.5 else C["red"])}))
        ws.write(r,2,desc,wb.add_format({"font_size":10,"bg_color":bg}))
        ws.write(r,3,effect,wb.add_format({"font_size":10,"bg_color":bg,"font_color":C["gray"]}))

    ws.write("A33","HOW TO USE THIS TABLE FOR OTHER STARTUP PROFILES",F["section"]); ws.merge_range("B33:K33","",F["section"])
    steps=[
        "1. Run SVI analysis on the startup via blockid.au/workspace/svi",
        "2. Note the SVI Score and Stage (0–5)",
        "3. Read valuation from TABLE 1 above (Stage row, SVI column)",
        "4. Apply sector multiplier from TABLE 2",
        "5. Apply evidence confidence from TABLE 3 (reduce if evidence is self-declared)",
        "6. Run Berkus + Scorecard methods using dimension scores from SVI report",
        "7. Blend: 25% SVI-based + 25% Scorecard + 20% Berkus + 15% Risk Factor + 15% VC Method",
        "8. Produce report: use Sheet 7 (C-Level Template) as output format",
        "9. For fundraising: use Sheet 10 (Dilution) to model raise scenarios",
        "10. Store result in startup profile — snapshot SVI + date + valuation range",
    ]
    for i,step in enumerate(steps):
        ws.write(34+i,0,step,F["value"] if i%2==0 else F["row_light"])
    ws.write(45,0,"BlockID Startup Index™ — blockid.au | admin@blockid.au | Proprietary Methodology — Confidential",F["note"])
    return ws

ws13 = build_sheet13()

# ═══════════════════════════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════════════════════════
wb.close()

bl,bm,bh=blended
print(f"✅ Saved: {OUTPUT}")
print(f"   Sheets: 13 total")
print(f"   1. Overview & Assumptions")
print(f"   2. Revenue Projections (3 scenarios)")
print(f"   3. Monthly P&L (Base)")
print(f"   4. Break-Even & Unit Economics")
print(f"   5. Valuation Models (6 methods)")
print(f"   6. Investor Summary")
print(f"   7. C-Level Template (reusable)")
print(f"   8. Sensitivity Analysis (2-way)")
print(f"   9. Monte Carlo (1,000 iterations)")
print(f"  10. Fundraising & Dilution Scenarios")
print(f"  11. Risk Factor Summation + First Chicago")
print(f"  12. Action Plan & Milestones (90-day)")
print(f"  13. SVI Benchmark Table (KB for other startups)")
print()
print(f"   VALUATION (6-Method Blended, AUD):")
print(f"     Conservative:  A${bl:,}")
print(f"     Base Case:     A${bm:,}")
print(f"     Optimistic:    A${bh:,}")
print(f"   Risk Factor:     A${rfs_val:,}")
print(f"   First Chicago:   A${fc_val:,}")
print(f"   Break-even (Base): Month {scenario_data['Base']['be']}")
