# BlockID.au Professional Data Room Structure Guide
**Version:** 1.0  
**Date:** 2026-06-13  
**For:** BlockID.au + Platform Users

---

## Executive Summary

A **data room** is a centralized, secure repository of company documents that founders share with investors during due diligence. This guide provides:

1. **BlockID.au's data room structure** (for Antler + Series A investors)
2. **Data room checklist** (what investors expect)
3. **Best practices** (organization, naming, security)
4. **Template for platform users** (reusable data room framework)

---

## Part 1: BlockID.au Data Room Structure

### Directory Hierarchy

```
/blockid-au-dataroom-2026
│
├── 1_COMPANY_FORMATION
│   ├── ACN_Certificate.pdf
│   ├── ABN_Confirmation_Letter.pdf
│   ├── Constitution_v1.pdf
│   ├── ASIC_Registration_Screenshot.pdf
│   └── Company_Search_Report.pdf
│
├── 2_FOUNDER_TEAM
│   ├── Do_Van_Long_CV.pdf
│   ├── Do_Van_Long_LinkedIn.pdf
│   ├── Board_Resolution_Appointment.pdf
│   └── Advisor_Bios/ (when added)
│       ├── Advisor_1_Bio.pdf
│       └── Advisor_1_LinkedIn.pdf
│
├── 3_EQUITY_CAP_TABLE
│   ├── Cap_Table_v1.xlsx (core document)
│   ├── Cap_Table_Fully_Diluted.xlsx
│   ├── Share_Certificate_Founder.pdf
│   ├── ESOP_Pool_Design_Doc.md
│   ├── ESOP_Plan_Deed.pdf (once finalized)
│   ├── Founder_Vesting_Confirmation_Deed.pdf
│   ├── Shareholders_Agreement_Template.pdf
│   └── IP_Assignment_Deed.pdf
│
├── 4_FINANCIAL_STATEMENTS
│   ├── Financial_Model_3Year.xlsx
│   ├── Unit_Economics_Analysis.xlsx
│   ├── Burn_Rate_Analysis.xlsx
│   ├── Tax_Return_FY2025.pdf (once filed, Oct 2025)
│   ├── Bank_Statements_Recent_6M.pdf
│   ├── Superannuation_Account.pdf (once hires added)
│   └── GST_Status_Letter.pdf (if registered)
│
├── 5_PRODUCT_TECHNOLOGY
│   ├── Product_Roadmap_v1.pdf
│   ├── Technical_Architecture_Diagram.pdf
│   ├── GitHub_Codebase_Access.txt (link + credentials for investors)
│   ├── Security_Audit_Report.pdf (if available)
│   ├── Data_Privacy_Policy.pdf
│   ├── API_Documentation.pdf
│   ├── SVI_Algorithm_Whitepaper.pdf
│   ├── Performance_Benchmarks.xlsx
│   └── Customer_Testimonials.pdf
│
├── 6_MARKET_COMPETITIVE
│   ├── Market_Size_Research.pdf (TAM/SAM/SOM)
│   ├── Competitive_Analysis_Matrix.xlsx
│   ├── SWOT_Analysis.pdf
│   ├── Target_Customer_Personas.pdf
│   ├── Market_Validation_Research.pdf
│   ├── Press_Coverage.pdf (links to articles)
│   └── Benchmarking_Data.xlsx (AU startup metrics)
│
├── 7_CUSTOMER_TRACTION
│   ├── Customer_List_Anonymized.xlsx (names + MRR + churn)
│   ├── Customer_Cohort_Analysis.xlsx
│   ├── Customer_Testimonials_Video.mp4 (optional)
│   ├── Case_Studies/ (2–3 detailed case studies)
│   │   ├── Case_Study_1.pdf
│   │   ├── Case_Study_2.pdf
│   │   └── Case_Study_3.pdf
│   ├── NPS_Survey_Results.pdf
│   ├── Product_Analytics_Dashboard_Screenshot.pdf
│   └── Monthly_Metrics_Tracking.xlsx
│
├── 8_LEGAL_COMPLIANCE
│   ├── Constitution.pdf (finalized)
│   ├── Privacy_Policy.pdf
│   ├── Terms_of_Service.pdf
│   ├── Data_Processing_Agreement.pdf
│   ├── Employment_Agreement_Template.pdf
│   ├── Contractor_Agreement_Template.pdf
│   ├── IP_Assignment_Deed.pdf (once signed)
│   ├── Insurance_Policies.pdf (public liability, D&O if applicable)
│   ├── Regulatory_Compliance_Checklist.xlsx
│   ├── ASIC_Letter_Ruling.pdf (if available, regarding options/ESOP)
│   └── Tax_Advice_Letter_on_ESOP.pdf (once finalized with advisor)
│
├── 9_AGREEMENTS_CONTRACTS
│   ├── Partner_Agreements/ (if any)
│   │   ├── Stripe_Agreement.pdf
│   │   ├── Supabase_Agreement.pdf
│   │   └── Other_Key_Partnerships.pdf
│   ├── Vendor_Contracts/ (ongoing)
│   │   ├── Cloud_Hosting_Agreement.pdf
│   │   └── Domain_Registration.pdf
│   ├── Customer_Contracts/ (if any major deals)
│   │   ├── Enterprise_Customer_1_Contract.pdf
│   │   └── SLA_Template.pdf
│   └── Loan_Agreements/ (if any debt)
│
├── 10_PITCH_MATERIALS
│   ├── Pitch_Deck_v5.pdf (final version for investor)
│   ├── Executive_Summary.pdf (1-page teaser)
│   ├── Antler_Application_Response.pdf
│   ├── Investor_FAQ.pdf
│   ├── One_Pager.pdf
│   └── Demo_Video_Link.txt (link to product demo)
│
├── 11_INTELLECTUAL_PROPERTY
│   ├── Trademark_Application_SVI.pdf (if filed)
│   ├── Patent_Search_Report.pdf (if applicable)
│   ├── GitHub_Repo_Link.txt (private repo access)
│   ├── Domain_Registration_Certificate.pdf
│   ├── Logo_Ownership_Letter.pdf
│   └── Third_Party_License_List.txt (open source compliance)
│
├── 12_OPERATIONS_SUPPORTING_DOCS
│   ├── Organization_Chart.pdf
│   ├── Key_Metrics_Dashboard.pdf (weekly/monthly snapshot)
│   ├── Board_Meeting_Minutes.pdf (if any formal meetings)
│   ├── Advisory_Board_Minutes.pdf
│   ├── Hiring_Plan.pdf (next 12 months)
│   ├── Office_Lease_Agreement.pdf (if any physical space)
│   ├── Insurance_Certificates.pdf
│   ├── Workplace_Policies.pdf (safety, conduct, etc.)
│   └── Employee_Handbook.pdf
│
└── 13_ANTLER_SPECIFIC_DOCS
    ├── Antler_Term_Sheet_Draft.pdf (if provided)
    ├── Antler_Portfolio_Cohort_Details.pdf
    ├── Antler_Mentorship_Plan.pdf
    └── Post_Antler_Roadmap.pdf
```

### Document Descriptions & Checklist

#### 1. COMPANY FORMATION

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **ACN Certificate** | Proof of registration with ASIC | ✓ Available | N/A |
| **ABN Confirmation** | Business registration proof, tax purposes | ✓ Available | N/A |
| **Constitution** | Corporate bylaws, shareholder rights | ⚠️ Basic template | Update before Series A |
| **ASIC Search Report** | Third-party verification of company status | [ ] Create | Before investor meetings |

#### 2. FOUNDER & TEAM

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Founder CV** | Professional background, experience | [ ] Create detailed | Before Antler (Jun 30) |
| **LinkedIn Profile** | Professional verification | ✓ Maintain updated | N/A |
| **Board Resolution** | Formal appointment of director/founder | [ ] Document | Before Series A |
| **Advisor Bios** | Credibility, domain expertise | [ ] Add (pending advisors) | Before Antler pitch |

#### 3. EQUITY & CAP TABLE

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Cap Table (current)** | Share structure, ownership %, dilution analysis | ⚠️ Needs ESOP update | Before Antler (Jun 30) |
| **Fully Diluted** | Post-investor cap table projection | [ ] Create | Before Antler |
| **Share Certificate** | Founder ownership proof | [ ] Create | Before Series A |
| **ESOP Plan Deed** | Terms of option grants | [ ] Finalize with lawyer | Before first hire (Sep 2026) |
| **Vesting Confirmation** | Founder retroactive vesting terms | [ ] Draft (template ready) | Before Antler |
| **Shareholders Agreement** | Rights, restrictions, tag-along/drag-along | [ ] Customize + sign | Before Series A |
| **IP Assignment** | Founder assigns IP to company | [ ] Get signed | Before investor meetings |

#### 4. FINANCIAL STATEMENTS

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **3-Year Financial Model** | Revenue, expense, profitability projections | ✓ Complete (this task) | N/A |
| **Unit Economics** | CAC, LTV, payback period, churn analysis | ✓ Complete (this task) | N/A |
| **Burn Rate Analysis** | Cash runway, burn rate, break-even timeline | ✓ Complete (this task) | N/A |
| **Tax Return (FY2025)** | ATO filing (likely A$0 revenue) | [ ] File by Oct 31, 2025 | Oct 31, 2025 |
| **Bank Statements (6M)** | Proof of pre-seed funding deposit + spending | [ ] Export from bank | Before investor meetings |

#### 5. PRODUCT & TECHNOLOGY

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Product Roadmap** | Upcoming features, milestones, vision | ⚠️ Outlined in GOALS.md | Format as PDF for investors |
| **Tech Architecture** | System design, scalability, infrastructure | [ ] Create diagram | Before investors ask |
| **GitHub Repo Access** | Codebase review, code quality proof | ✓ Private repo ready | Share credentials with NDA |
| **Security Audit** | Third-party security review | [ ] Not urgent, can be post-Series A | Post-Series A |
| **Privacy Policy** | Data handling, GDPR/Privacy Act compliance | ⚠️ Template in place | Update with legal review |
| **API Documentation** | API specs, endpoints, authentication | [ ] Auto-generate from code | Before partner/enterprise deals |
| **SVI Algorithm Whitepaper** | Proprietary scoring methodology | [ ] Create 5-10 page document | Before Series A (IP protection) |
| **Performance Benchmarks** | Uptime, latency, load capacity | [ ] Generate from monitoring | Before enterprise customers |

#### 6. MARKET & COMPETITIVE

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Market Size (TAM/SAM/SOM)** | Total addressable market analysis | ✓ Complete (SVI analysis doc) | Reformat for investors |
| **Competitive Matrix** | Competitive landscape, differentiation | ⚠️ Outlined in SVI analysis | Create comparison table for investors |
| **SWOT Analysis** | Strengths, weaknesses, opportunities, threats | ⚠️ Implicit in analysis | Format as one-pager |
| **Customer Personas** | ICP description, buying signals, objections | [ ] Create detailed personas | Before Series A |
| **Market Validation** | Customer interviews, validation data | [ ] Synthesize 10+ interviews | Before Series A (de-risk market) |

#### 7. CUSTOMER TRACTION

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Customer List (Anonymized)** | Names, signup dates, MRR, churn status | [ ] Create & maintain monthly | Before investor meetings |
| **Cohort Analysis** | Retention curves, LTV by cohort, churn rates | ✓ Template in financial model | Update monthly |
| **Customer Testimonials** | Quotes, use cases, satisfaction | [ ] Collect from 5+ users | Before Antler |
| **Case Studies** | In-depth customer success stories (2–3) | [ ] Document early wins | Before Series A |
| **NPS Results** | Net Promoter Score, customer satisfaction | [ ] Conduct survey when >20 customers | Q3 2026 |
| **Analytics Dashboard** | Signups, engagement, conversion metrics | [ ] Screenshot for investors | Update quarterly |

#### 8. LEGAL & COMPLIANCE

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Constitution** | Corporate bylaws, meeting procedures | ⚠️ Template, not finalized | Update before Series A |
| **Privacy Policy** | Data collection, processing, user rights | ⚠️ Standard template | Legal review needed |
| **Terms of Service** | User agreement, liability, dispute resolution | ⚠️ Standard template | Legal review needed |
| **Data Processing Agreement** | GDPR/Privacy Act compliance, data processor terms | [ ] Create if storing PII | Before enterprise customers |
| **Employment Agreement** | Offer letter template, terms, IP assignment | [ ] Create template | Before first hire (Q3 2026) |
| **IP Assignment** | Founder assigns all IP to company | [ ] Get signed | Before investor meetings |
| **Insurance** | Public liability, D&O, cyber insurance | [ ] Get quotes | Before Series A (optional pre-Series A) |
| **ASIC Ruling** | Letter ruling on ESOP structure compliance | [ ] Apply if needed | Not urgent (post-Series A) |

#### 9. AGREEMENTS & CONTRACTS

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Stripe Agreement** | Payment processor terms | ✓ Standard SaaS agreement | No action needed |
| **Supabase Agreement** | Database/hosting terms | ✓ Standard SaaS agreement | No action needed |
| **Customer Contracts** | Enterprise agreements, SLAs | [ ] Create template SLA | Before enterprise deals |
| **Vendor Agreements** | Hosting, software, services | [ ] Compile relevant ones | Before Series A |

#### 10. PITCH MATERIALS

| Document | Purpose | Status | Deadline |
|----------|---------|--------|----------|
| **Pitch Deck** | 15–20 slide presentation for investors | ⚠️ Outline exists, needs refinement | Before Antler (Jun 30) |
| **Executive Summary** | 1-page teaser, problem/solution/ask | ⚠️ Drafted | Before investor outreach |
| **One-Pager** | 1-page overview with logo, key metrics | [ ] Create | Before investor meetings |
| **FAQ** | Anticipated investor questions + answers | [ ] Compile | Before fundraising (Aug 2026) |

---

## Part 2: Data Room Best Practices

### 2.1 Organization & Naming Conventions

**Folder Naming:**
- Use numbered prefixes (1_, 2_, 3_) for consistent ordering
- Use CamelCase or underscores (avoid spaces or special characters)
- Example: `3_EQUITY_CAP_TABLE` vs `Equity and Capital Table` (worse)

**File Naming:**
- Include version number: `Cap_Table_v2.xlsx`, `Pitch_Deck_v5.pdf`
- Include date for time-sensitive docs: `Financial_Projections_2026-06.xlsx`
- Use descriptive names, not generic: `ESOP_Plan_Deed_FINAL.pdf` vs `doc123.pdf`
- Avoid company abbreviations in file names (easier for external parties to read)

**Example Good Naming:**
```
✓ 3_EQUITY_CAP_TABLE/Cap_Table_Fully_Diluted_v2.xlsx
✓ 4_FINANCIAL_STATEMENTS/Financial_Model_36M_v3.xlsx
✓ 6_MARKET_COMPETITIVE/TAM_SAM_SOM_Analysis_2026-06.pdf

✗ CT_FD_v2.xlsx (unclear abbreviations)
✗ finances.xlsx (not descriptive)
✗ Equity and capital table & dilution analysis.xlsx (special characters, spaces)
```

### 2.2 Access Control & Security

**For BlockID.au Data Room:**
1. **Secure hosting:** Use Supabase + VPN (or Dropbox Business / Box with password)
2. **NDA requirement:** All investors sign NDA before access
3. **Access logs:** Track who accessed what and when
4. **Version control:** Keep old versions archived but clearly marked as outdated

**Recommended Tools:**
- **VirginDocs:** Specialized data room for startups (AU-friendly, free trial)
- **Dropbox Business:** Simple, familiar, password-protected folders
- **Box:** Enterprise-grade, audit trails, advanced permissions
- **Google Drive:** Free, but less secure (recommend only for shared drafts, not final data room)

**Best Practice:**
- Create read-only PDFs for sensitive financial docs (prevent editing)
- Use watermarking: "Confidential — Investor Use Only"
- Password-protect Excel files (especially cap table)

### 2.3 Document Currency & Updates

**Update Schedule:**
- **Monthly:** Financial metrics, customer traction, roadmap progress
- **Quarterly:** Cap table (post-option grants), fundraising status, team updates
- **As-needed:** Legal docs, IP assignments, new customer contracts

**Version Control:**
- Date all documents: Include "Last Updated: 2026-06-13" in footer
- Archive old versions (don't delete)
- Use version numbers: v1, v2, v3 (not Draft, Final, Real Final, FINAL_FINAL)

**Checklist Before Investor Meetings:**
- [ ] All financial statements updated to current month
- [ ] Cap table reflects current ESOP pool + any recent grants
- [ ] Customer list anonymized but accurate (count, MRR, churn)
- [ ] Product roadmap current (remove outdated items)
- [ ] Pitch deck updated with latest metrics
- [ ] All PDFs are recent versions (check dates in documents)

---

## Part 3: Data Room Checklist (Investor Expectations)

### Standard Investor Due Diligence Request

**What investors expect to see in a well-organized data room:**

| Priority | Category | Documents | % Complete |
|----------|----------|-----------|------------|
| **CRITICAL** | Company Formation | ACN, ABN, Constitution | 50% (missing updated Constitution) |
| **CRITICAL** | Cap Table | Current cap table, ESOP pool, fully diluted | 25% (needs ESOP structure) |
| **CRITICAL** | Financials | 3-year projections, unit economics, burn rate | 100% ✓ (just completed) |
| **CRITICAL** | Product Roadmap | Upcoming features, technical architecture | 50% (roadmap outlined, missing architecture docs) |
| **HIGH** | Legal | IP assignment, employment agreement, privacy policy | 40% (basics in place, needs updates) |
| **HIGH** | Traction | Customer list, testimonials, analytics | 20% (too early for rich traction data) |
| **HIGH** | Market | TAM/SAM analysis, competitive landscape, validation | 70% (analysis complete, needs formatting) |
| **MEDIUM** | Team | Founder CV, advisors, hiring plan | 30% (advisor bios pending) |
| **MEDIUM** | Pitch Materials | Deck, executive summary, one-pager | 60% (deck draft exists) |

**Investor Score: 47% complete** (needs work, but acceptable for pre-seed stage)

### Timeline to Full Data Room Readiness

| Week | Action | Priority | Owner |
|------|--------|----------|-------|
| **Week 1 (by Jun 20)** | Format SVI analysis, financial model, data room structure as PDFs | CRITICAL | Founder + AI |
| **Week 2 (by Jun 27)** | Create cap table with ESOP pool, founder vesting deed | CRITICAL | Founder + Legal |
| **Week 3 (by Jul 4)** | Update pitch deck, executive summary, customer list | HIGH | Founder |
| **Week 4 (by Jul 11)** | Add advisor bios (once advisors confirmed), technical architecture | HIGH | Founder + Advisors |
| **Week 5 (by Jul 18)** | Legal review of privacy policy, terms, employment agreement | MEDIUM | Legal Advisor |
| **Week 6 (by Jul 25)** | Final data room review, investor NDA setup | FINAL | Founder |

**Target: READY FOR ANTLER PITCH (July 1) with 70%+ complete**

---

## Part 4: Template Data Room for Platform Users

### BlockID.au Data Room Product Feature

**For BlockID.au users (founders), we will offer a data room builder tool:**

**Features:**
1. **Pre-built templates** (auto-populated)
   - Automatically pull cap table from BlockID
   - Auto-generate financial model from SVI analysis
   - Template checklists for each stage (Idea → Seed → Series A)

2. **Guided workflow**
   - "What stage are you at?" (dropdown)
   - Automatically suggests relevant documents
   - Checklist with % completion

3. **Document upload** (drag-and-drop)
   - Store cap table, pitch deck, contracts, etc.
   - Organized by pre-built folder structure

4. **Shareable links** (with NDA)
   - Create password-protected data room
   - Investors sign digital NDA before access
   - Track who viewed what documents

5. **Export** (ZIP file)
   - Download entire data room for investor delivery
   - Or sync to cloud (Dropbox, Google Drive)

**Pricing:** Included in Growth plan; A$10/mo add-on for Free users

---

## Part 5: BlockID.au Data Room Action Plan

### Immediate (By Jun 30 — Antler Pitch)

- [x] SVI Analysis & Financial Model — **DONE (this task)**
- [ ] Cap Table with ESOP pool — **IN PROGRESS (Task 3)**
- [ ] Format pitch deck (refined from draft)
- [ ] Create executive summary (1-page)
- [ ] Founder bio/CV (detailed, professional)
- [ ] Technical architecture diagram (1-page)
- [ ] Competitive analysis table (vs. Carta, Cake, others)
- [ ] Customer testimonials (collect 3–5 from free users)
- [ ] Product demo video (link)

### Medium (By Sep 30 — Series A Preparation)

- [ ] Finalize cap table with ESOP grants (after first hire)
- [ ] Legal docs: Shareholders agreement, IP assignment, employment agreement
- [ ] Advisor bios (if advisors confirmed)
- [ ] Detailed case studies (2–3 customer successes)
- [ ] NPS survey results (if >20 customers)
- [ ] Tax advice letter on ESOP structure
- [ ] Updated financial model (with actual H1 2027 data)

### Long-term (By Dec 31 — Series A Pitch)

- [ ] Full data room (all 13 sections)
- [ ] Finalized legal agreements (signed)
- [ ] Updated cap table (post any new grants)
- [ ] Investor NDA + secure access setup
- [ ] Data room hosted on VirginDocs or equivalent

---

## Summary Checklist

**BlockID.au Data Room Readiness:**

| Section | Status | % Complete | Next Step |
|---------|--------|-----------|-----------|
| Company Formation | Ready | 50% | Update Constitution |
| Founder & Team | In Progress | 30% | Add advisor bios |
| Cap Table | In Progress | 25% | Add ESOP pool structure |
| Financials | Ready ✓ | 100% | Format for investors |
| Product | Partial | 50% | Create architecture doc |
| Market | Ready ✓ | 70% | Format for investors |
| Traction | Early | 20% | Collect testimonials |
| Legal | Basic | 40% | Engage lawyer for updates |
| Pitch | Draft | 60% | Refine for Antler |
| **OVERALL** | | **47%** | **On track for 70% by Jul 1** |

---

**Data Room prepared by:** AI Self-Analysis Engine  
**Status:** Ready for BlockID.au + Platform Feature Development  
**Next Review:** Post-Antler pitch (July 15, 2026)

