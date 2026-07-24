#!/usr/bin/env python3
"""Build 10 minimal-but-valid OOXML stub templates in web/public/templates/.

Each file contains a prominent "REPLACE ME — NOT LEGAL ADVICE" banner and a
short scaffold. The files are intentionally < 200 KB so the CI size cap holds.
Regenerate by re-running this script.
"""
from __future__ import annotations
import zipfile, io, os, textwrap

OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'public', 'templates')
os.makedirs(OUT, exist_ok=True)

def docx_bytes(title: str, body_lines: list[str]) -> bytes:
    """Return a minimal valid .docx (WordProcessingML) as bytes."""
    def esc(s: str) -> str:
        return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
    paragraphs = []
    # Title
    paragraphs.append(
        f'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
        f'<w:r><w:rPr><w:b/><w:sz w:val="40"/></w:rPr><w:t>{esc(title)}</w:t></w:r></w:p>'
    )
    # Banner
    banner = 'REPLACE ME — NOT LEGAL ADVICE. Have your lawyer review this template before use.'
    paragraphs.append(
        f'<w:p><w:r><w:rPr><w:b/><w:color w:val="C00000"/></w:rPr>'
        f'<w:t xml:space="preserve">{esc(banner)}</w:t></w:r></w:p>'
    )
    for line in body_lines:
        paragraphs.append(
            f'<w:p><w:r><w:t xml:space="preserve">{esc(line)}</w:t></w:r></w:p>'
        )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body>' + ''.join(paragraphs) + '</w:body></w:document>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('word/document.xml', document)
    return buf.getvalue()

def xlsx_bytes(sheets: list[tuple[str, list[list[str]]]]) -> bytes:
    """Return a minimal valid .xlsx as bytes.

    sheets: list of (sheet_name, rows_of_cells) — all cells written as
    inlineStr for zero-lookup simplicity.
    """
    def esc(s: str) -> str:
        return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
    # Content types
    ct_overrides = ''.join(
        f'<Override PartName="/xl/worksheets/sheet{i+1}.xml" '
        f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for i in range(len(sheets))
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + ct_overrides + '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/></Relationships>'
    )
    wb_sheets_xml = ''.join(
        f'<sheet name="{esc(name)}" sheetId="{i+1}" r:id="rId{i+1}"/>'
        for i, (name, _) in enumerate(sheets)
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{wb_sheets_xml}</sheets></workbook>'
    )
    wb_rels_parts = ''.join(
        f'<Relationship Id="rId{i+1}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet{i+1}.xml"/>'
        for i in range(len(sheets))
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + wb_rels_parts + '</Relationships>'
    )
    def col_letter(n: int) -> str:
        s = ''
        while n >= 0:
            s = chr(65 + (n % 26)) + s
            n = n // 26 - 1
        return s
    def sheet_xml(rows: list[list[str]]) -> str:
        row_xml = []
        for ri, row in enumerate(rows, start=1):
            cells = []
            for ci, val in enumerate(row):
                ref = f'{col_letter(ci)}{ri}'
                cells.append(
                    f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{esc(str(val))}</t></is></c>'
                )
            row_xml.append(f'<row r="{ri}">{"".join(cells)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(row_xml)}</sheetData></worksheet>'
        )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('xl/workbook.xml', workbook)
        z.writestr('xl/_rels/workbook.xml.rels', workbook_rels)
        for i, (_, rows) in enumerate(sheets):
            z.writestr(f'xl/worksheets/sheet{i+1}.xml', sheet_xml(rows))
    return buf.getvalue()

# ─── 8 .docx stubs ────────────────────────────────────────────────────────
DOCX_STUBS = {
    'pitch-deck.docx': ('Pitch Deck — [[COMPANY_NAME]]', [
        'Slide 1 — Problem: [[Describe the pain]]',
        'Slide 2 — Solution: [[Describe your approach]]',
        'Slide 3 — Market: [[TAM / SAM / SOM]]',
        'Slide 4 — Product: [[Screenshots / demo]]',
        'Slide 5 — Traction: [[MRR / users / logos]]',
        'Slide 6 — Business Model: [[Pricing / unit economics]]',
        'Slide 7 — Competition: [[Positioning matrix]]',
        'Slide 8 — Team: [[Founders + advisors]]',
        'Slide 9 — Financials: [[3-yr projection headline]]',
        'Slide 10 — Ask: [[Round size, use of funds]]',
        'Slide 11 — Timeline: [[12-month plan]]',
        'Slide 12 — Appendix: [[Backup slides]]',
    ]),
    'term-sheet.docx': ('Seed Term Sheet — AU (Non-binding)', [
        'Company: [[COMPANY_NAME]] Pty Ltd (ACN [[ACN]])',
        'Round size: A$[[AMOUNT]] on pre-money valuation A$[[VALUATION]]',
        'Instrument: Preference shares (or SAFE — see /safe.docx)',
        'Board: 1 investor seat, 2 founder seats, 1 independent to be agreed',
        'Liquidation preference: 1x non-participating',
        'Anti-dilution: Broad-based weighted average',
        'Pre-emptive rights, drag-along, tag-along per AU market practice',
        'Founder vesting: 4 years, 1-year cliff (retroactive if applicable)',
        'ESOP: [[10]]% of post-money fully diluted',
        'Conditions precedent: DD, board consent, executed SHA',
        'Governing law: New South Wales, Australia',
        'Exclusivity: 45 days from signing',
    ]),
    'safe.docx': ('SAFE — Simple Agreement for Future Equity (AU-adapted)', [
        'Post-money valuation cap: A$[[CAP]]',
        'Discount: [[20]]%',
        'Most-favoured nation: [[Yes/No]]',
        'Investor: [[INVESTOR_NAME]]',
        'Purchase amount: A$[[AMOUNT]]',
        'Company: [[COMPANY_NAME]] Pty Ltd (ACN [[ACN]])',
        'Conversion triggers: Equity financing, liquidity event, dissolution',
        'Governing law: New South Wales, Australia',
        'NOTE: The YC SAFE was drafted for Delaware — this AU adaptation aligns',
        'with the Corporations Act 2001 (Cth) and standard Sydney seed practice.',
    ]),
    'sha.docx': ("Shareholders' Agreement — AU Pty Ltd", [
        '1. Definitions and Interpretation',
        '2. Business of the Company — [[COMPANY_NAME]] Pty Ltd',
        '3. Board Composition and Reserved Matters',
        '4. Shareholder Reserved Matters (super-majority)',
        '5. Issue of new shares — pre-emptive rights',
        '6. Transfer restrictions — right of first refusal',
        '7. Drag-along (75% threshold)',
        '8. Tag-along (co-sale rights)',
        '9. Founder vesting and leaver provisions (good/bad leaver)',
        '10. Anti-dilution protection',
        '11. Information rights (monthly management accounts, annual audited)',
        '12. Non-compete and non-solicit (12 months post-exit)',
        '13. IP assignment (see /ip-assignment.docx)',
        '14. Dispute resolution (mediation → AU arbitration)',
        '15. Governing law: New South Wales, Australia',
        'Schedule A: Cap table snapshot (link to /cap-table.xlsx)',
    ]),
    'esop-plan.docx': ('Employee Share Option Plan (ESOP) — AU', [
        'Company: [[COMPANY_NAME]] Pty Ltd (ACN [[ACN]])',
        'Plan type: Start-up concessions per Division 83A ITAA 1997',
        'Eligible participants: Full-time employees, contractors on 12-month',
        'engagement (subject to ATO integrity rules)',
        'Vesting: 4 years, 1-year cliff, monthly thereafter',
        'Exercise price: At market value as at grant date (valuation attached)',
        'Exercise window: 90 days post good-leaver termination, 7 years max',
        'Governing law: NSW, Australia',
        'ATO reporting: Employer must lodge ESS statement by 14 July annually',
    ]),
    'ip-assignment.docx': ('IP Assignment Deed — Founder & Employee (AU)', [
        'Assignor: [[NAME]] (Founder / Employee)',
        'Assignee: [[COMPANY_NAME]] Pty Ltd (ACN [[ACN]])',
        'Consideration: Employment / founding shares (see /cap-table.xlsx)',
        '1. Assignment of all past, present and future IP created in the course',
        '   of engagement, including moral rights consent per Copyright Act 1968',
        '2. Warranty: No third-party IP infringed',
        '3. Further assurances: Execute all documents to perfect the assignment',
        '4. Governing law: NSW, Australia',
    ]),
    'employment-contract.docx': ('Full-time Employment Contract — AU', [
        'Employer: [[COMPANY_NAME]] Pty Ltd (ACN [[ACN]])',
        'Employee: [[NAME]]',
        'Position: [[ROLE]] reporting to [[MANAGER]]',
        'Commencement date: [[DATE]]',
        'Base salary: A$[[AMOUNT]] p.a. + 11.5% superannuation',
        'Standard hours: 38/week + reasonable additional hours',
        'Leave: 20 days annual, 10 days personal (Fair Work Act 2009)',
        'Notice period: 4 weeks either way (after probation)',
        'Probation: 6 months',
        'Restraint: 12 months non-solicit, 6 months non-compete (cascading)',
        'IP: All work-product assigned per attached IP Assignment Deed',
        'ESOP: Grant of [[N]] options per ESOP Plan (see /esop-plan.docx)',
        'Governing law: NSW, Australia',
    ]),
    'board-consent.docx': ('Circular Resolution of Directors', [
        'Company: [[COMPANY_NAME]] Pty Ltd (ACN [[ACN]])',
        'Date: [[DATE]]',
        'Directors present (via written consent): [[LIST]]',
        'RESOLVED THAT:',
        '1. [[Resolution 1 — e.g. issue of X preference shares to Y]]',
        '2. [[Resolution 2 — e.g. adoption of ESOP plan]]',
        '3. [[Resolution 3 — e.g. approval of employment contract for [[NAME]]]]',
        'Signed by each director as a circular resolution per section 248A',
        'of the Corporations Act 2001 (Cth).',
        '____________________     ____________________',
        '[[DIRECTOR 1]]           [[DIRECTOR 2]]',
    ]),
}

for name, (title, body) in DOCX_STUBS.items():
    data = docx_bytes(title, body)
    path = os.path.join(OUT, name)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'wrote {name} ({len(data)} bytes)')

# ─── 2 .xlsx stubs ────────────────────────────────────────────────────────
CAP_TABLE = [
    ('Founders', [
        ['Name', 'Ordinary shares', '% (pre-money)', 'Vesting'],
        ['[[Founder A]]', '4,000,000', '40.0%', '4y / 1y cliff'],
        ['[[Founder B]]', '3,000,000', '30.0%', '4y / 1y cliff'],
        ['[[Founder C]]', '2,000,000', '20.0%', '4y / 1y cliff'],
        ['ESOP pool (unallocated)', '1,000,000', '10.0%', 'see ESOP plan'],
        ['TOTAL', '10,000,000', '100.0%', ''],
    ]),
    ('Employees', [
        ['Name', 'Options', 'Grant date', 'Vest start', 'Exercise price'],
        ['[[TBC]]', '', '', '', ''],
    ]),
    ('SAFE & Convertibles', [
        ['Investor', 'Instrument', 'Amount (A$)', 'Cap (A$)', 'Discount %'],
        ['[[TBC]]', 'SAFE', '', '', ''],
    ]),
    ('Fully diluted', [
        ['Class', 'Shares / options', '% fully diluted'],
        ['Ordinary — founders', '9,000,000', '90.0%'],
        ['ESOP pool', '1,000,000', '10.0%'],
        ['SAFE-implied (post conversion)', '0', '0.0%'],
        ['TOTAL', '10,000,000', '100.0%'],
    ]),
]
data = xlsx_bytes(CAP_TABLE)
with open(os.path.join(OUT, 'cap-table.xlsx'), 'wb') as f:
    f.write(data)
print(f'wrote cap-table.xlsx ({len(data)} bytes)')

FIN_MODEL = [
    ('Assumptions', [
        ['Assumption', 'Value'],
        ['Starting MRR (A$)', '10000'],
        ['Monthly growth rate', '0.15'],
        ['Gross margin', '0.80'],
        ['Starting headcount', '4'],
        ['Avg loaded cost / FTE / month (A$)', '12000'],
        ['Starting cash (A$)', '250000'],
    ]),
    ('P&L (Y1 monthly)', [
        ['Month', 'MRR', 'Revenue', 'COGS', 'Gross profit', 'Payroll', 'Other opex', 'EBITDA'],
        *[[str(m), '', '', '', '', '', '', ''] for m in range(1, 13)],
    ]),
    ('P&L (Y2-3 quarterly)', [
        ['Quarter', 'MRR', 'Revenue', 'Gross profit', 'EBITDA'],
        *[[f'Y{y}Q{q}', '', '', '', ''] for y in (2, 3) for q in (1, 2, 3, 4)],
    ]),
    ('Headcount plan', [
        ['Role', 'Y1', 'Y2', 'Y3'],
        ['Engineering', '2', '5', '10'],
        ['Sales / GTM', '1', '3', '6'],
        ['Ops / G&A', '1', '2', '3'],
        ['TOTAL', '4', '10', '19'],
    ]),
    ('Burn & runway', [
        ['Month', 'Cash in', 'Cash out', 'Net burn', 'Cash balance', 'Runway (months)'],
        *[[str(m), '', '', '', '', ''] for m in range(1, 25)],
    ]),
]
data = xlsx_bytes(FIN_MODEL)
with open(os.path.join(OUT, 'financial-model.xlsx'), 'wb') as f:
    f.write(data)
print(f'wrote financial-model.xlsx ({len(data)} bytes)')

# CI cap
for fn in os.listdir(OUT):
    if fn.endswith(('.docx', '.xlsx')):
        sz = os.path.getsize(os.path.join(OUT, fn))
        assert sz < 200_000, f'{fn} exceeds 200KB cap: {sz}'
        print(f'  {fn}: {sz} bytes OK')
