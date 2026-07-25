**TEMPLATE ONLY — NOT LEGAL ADVICE. NOT TO BE USED WITHOUT AUSTRALIAN LEGAL REVIEW.** This Founder Agreement is provided by BlockID.au (operated by Auschain Pty Ltd, ACN 659 615 111) as a Chapter-1 starting point for co-founders who have just registered a proprietary company limited by shares. It is a **contract** between the founders about how they will work together — the binding cap-table sits in the Company constitution, the Shareholders Agreement, and each Founder's IP Assignment Deed (all of which BlockID.au ships as separate templates and which are referenced in this document). Have this reviewed by an Australian-qualified lawyer before adoption. BlockID does not hold an Australian Financial Services Licence (AFSL) and cannot provide personal legal, financial, or tax advice.

---

# Founder Agreement — Australia

**Effective Date:** {{effective_date}}
**Version:** 1.0 (BlockID.au AU Founder Agreement — Round 5.8)

## Parties

**Company:** {{company_name}} Pty Ltd
ACN {{acn}}
Registered office: {{registered_office_address}}
(the **Company**)

**Founders:**
1. {{founder_1_name}} of {{founder_1_address}} (**Founder 1**)
2. {{founder_2_name}} of {{founder_2_address}} (**Founder 2**){{#has_third_founder}}
3. {{founder_3_name}} of {{founder_3_address}} (**Founder 3**){{/has_third_founder}}

Each a **Founder** and together the **Founders**.

## Recitals

A. The Founders have incorporated the Company under the *Corporations Act 2001* (Cth) to carry on the business described as: {{company_business_description}} (the **Business**).

B. The Founders wish to record their agreement about equity split, vesting, roles, decision-making, confidentiality, and separation, in a form suitable for disclosure to investors during an Australian venture capital raise, before they execute any Shareholders Agreement with third-party investors.

C. This Agreement operates alongside — and does not replace — the Company's constitution, any Shareholders Agreement, and each Founder's separate IP Assignment Deed. In the event of inconsistency, the constitution and any executed Shareholders Agreement prevail.

## 1. Equity split and issue of Founder Shares

### 1.1 Initial equity split
On the Effective Date, or as soon as reasonably practicable thereafter, the Company will issue fully-paid ordinary shares to each Founder in the following proportions (the **Founder Shares**):

| Founder | Ordinary shares | Percentage of issued capital on the Effective Date |
|---------|-----------------|---------------------------------------------------|
| {{founder_1_name}} | {{founder_1_shares}} | {{founder_1_pct}}% |
| {{founder_2_name}} | {{founder_2_shares}} | {{founder_2_pct}}% |{{#has_third_founder}}
| {{founder_3_name}} | {{founder_3_shares}} | {{founder_3_pct}}% |{{/has_third_founder}}

### 1.2 Consideration and issue mechanics
The issue price for each Founder Share is A${{issue_price_per_share_aud}} per share, paid or credited as paid by the Founder in cash or (where the Board so resolves) by the transfer to the Company of pre-incorporation intellectual property under a separate IP Assignment Deed. The Company will update its Register of Members under **s 168 Corporations Act 2001 (Cth)** and lodge a Form 484 with ASIC as required.

### 1.3 No hidden splits
Each Founder warrants that they have not agreed with any other person to hold any of their Founder Shares on trust, or to share the economic benefit of those shares (including future dividends, sale proceeds, or voting rights), except as expressly disclosed in Annexure A.

## 2. Founder vesting (reverse-vesting)

### 2.1 Vesting schedule
Each Founder's Founder Shares are subject to reverse-vesting over a period of **{{vesting_total_months}} months** from the Effective Date, with a **{{vesting_cliff_months}}-month cliff**. Reverse-vesting means the Founder holds legal title from issue but the Company retains a contractual right to buy back **Unvested Shares** on the terms in this section if the Founder ceases to be actively engaged in the Business before the end of the vesting period.

### 2.2 Cliff and monthly accrual
If a Founder ceases to be actively engaged in the Business (other than as a Good Leaver under section 4.2 or by reason of death or Permanent Incapacity) before the end of the cliff period, none of that Founder's Founder Shares are Vested Shares. After the cliff, Vested Shares accrue at the rate of **1/{{vesting_total_months}}** of the Founder's Founder Shares per full calendar month of continued active engagement, up to and including the last month of the vesting period.

### 2.3 Company buy-back of Unvested Shares
The Company has the right (but not the obligation), exercisable by written notice within **60 days** after the date the Founder ceases to be actively engaged, to buy back that Founder's Unvested Shares for A$**{{unvested_buyback_price_aud}}** per Unvested Share (the **Buy-back Price**). The Buy-back Price is intentionally a nominal amount because Unvested Shares have not been earned. The buy-back is executed under **Part 2J.1 Corporations Act 2001 (Cth)** and is subject to the solvency test in **s 254T** of that Act.

### 2.4 Acceleration on a Change of Control
On a Change of Control (as defined in section 8) which occurs within **12 months** after a Founder ceases to be actively engaged as a Good Leaver, that Founder's then-Unvested Shares vest immediately in full. This is a **double-trigger** acceleration and is the pattern Blackbird / AirTree / Square Peg term sheets typically permit.

### 2.5 Interaction with ESOP
Nothing in this section limits the Company's right to grant options to a Founder under a separate Employee Share Option Plan (ESOP) subject to **Division 83A** of the *Income Tax Assessment Act 1997* (Cth) — see BlockID.au's separate `au-esop-scheme-rules` template. Any ESOP grant to a Founder is in addition to, and does not amend, the Founder Shares recorded in section 1.1.

## 3. Roles, commitment, and remuneration

### 3.1 Initial roles
| Founder | Role | Initial commitment |
|---------|------|--------------------|
| {{founder_1_name}} | {{founder_1_role}} | {{founder_1_commitment}} |
| {{founder_2_name}} | {{founder_2_role}} | {{founder_2_commitment}} |{{#has_third_founder}}
| {{founder_3_name}} | {{founder_3_role}} | {{founder_3_commitment}} |{{/has_third_founder}}

### 3.2 Full-time / exclusive engagement
Each Founder engaged **full-time** under section 3.1 must devote substantially the whole of their working time to the Business and must not, without the prior written consent of the other Founders, engage in any other paid activity that could reasonably be expected to interfere with that engagement. Board memberships, angel investments, teaching, mentoring, and open-source contributions of less than **{{permitted_other_hours_per_week}} hours per week** are permitted without consent.

### 3.3 Founder remuneration
Until the Company completes its first priced equity raise of at least A${{first_priced_raise_aud}}, each full-time Founder is entitled to a **founder stipend** of A${{founder_stipend_aud_per_month}} per month (paid monthly, GST-exclusive where the Founder is registered for GST). After that raise, remuneration will be set by the Board (or, if there is one, the Compensation Committee) against market data supplied by an independent adviser.

### 3.4 Superannuation and PAYG withholding
Where a Founder is engaged as an employee of the Company (not as a director-only office-holder), the Company will pay superannuation at the statutory rate under the *Superannuation Guarantee (Administration) Act 1992* (Cth) and withhold PAYG under the *Taxation Administration Act 1953* (Cth) Schedule 1.

## 4. Separation — Good Leaver / Bad Leaver

### 4.1 Definitions
A Founder is a **Good Leaver** if that Founder ceases to be actively engaged in the Business for any of the following reasons:

1. death or Permanent Incapacity;
2. termination by the Company other than for cause;
3. resignation with the written consent of a majority of the other Founders; or
4. any other reason the Board, acting reasonably, categorises as Good Leaver.

A Founder is a **Bad Leaver** if that Founder ceases to be actively engaged in the Business for any other reason, including:

1. resignation without the consent required in section 4.1(3);
2. termination by the Company for material breach, gross misconduct, or dishonesty; or
3. breach of section 5 (Confidentiality), section 6 (IP), or section 7 (Restraints).

### 4.2 Treatment of Vested Shares
A **Good Leaver** retains all Vested Shares (subject only to the pre-emptive rights in the constitution or Shareholders Agreement). A **Bad Leaver** may be required by the Company (acting by ordinary Board resolution) to sell their Vested Shares to the Company or the continuing Founders (in proportion to their then-existing shareholdings) at the lower of (i) A${{bad_leaver_price_aud}} per share, and (ii) the fair market value determined by an independent valuer under section 4.4.

### 4.3 Treatment of Unvested Shares
On any Founder ceasing to be actively engaged, Unvested Shares are subject to the buy-back right in section 2.3 regardless of Good Leaver / Bad Leaver status.

### 4.4 Independent valuation
Where fair market value is required under section 4.2, it is determined by an independent chartered accountant nominated by agreement of the parties, or failing agreement within 14 days, by the President for the time being of Chartered Accountants Australia and New Zealand, using a discounted cash flow methodology and having regard to the most recent priced equity raise (if any within the preceding 12 months).

## 5. Confidentiality

### 5.1 Founder obligations
Each Founder must, both during and after their engagement with the Business:

1. keep confidential all Confidential Information of the Company, whether or not marked confidential;
2. use Confidential Information only for the benefit of the Business;
3. not disclose Confidential Information to any third party without the prior written consent of the Board, except as required by law or a regulatory authority (in which case the Founder must give the Company reasonable prior written notice); and
4. on ceasing to be actively engaged, promptly return or destroy all Confidential Information in their possession.

### 5.2 Definition
**Confidential Information** means all non-public information relating to the Company or the Business (including customer lists, financial information, technical information, source code, business plans, and investor communications) disclosed to or acquired by a Founder in the course of their engagement, other than information that is or becomes publicly known through no breach of this Agreement.

## 6. Intellectual property

### 6.1 Separate deed for pre-existing and future IP
Each Founder acknowledges and agrees that all Intellectual Property Rights that the Founder created, acquired, or contributed to the Business (whether before or after the Effective Date) are, or will be, assigned to the Company under a separate **Founder IP Assignment Deed** substantially in the form of BlockID.au's `au-ip-assignment-deed-founder` template. Each Founder must execute that deed contemporaneously with this Agreement.

### 6.2 Moral rights consent
To the extent permitted by the *Copyright Act 1968* (Cth), Part IX (**s 195AW** and **s 195AWA**), each Founder consents to all acts or omissions by the Company (and any successor or licensee of the Company) in relation to the Founder's works that would otherwise infringe the Founder's moral rights of attribution, integrity, and false attribution. This consent is given in relation to all works, in all media, and for the maximum period permitted at law.

### 6.3 No independent IP retained
Except as expressly disclosed in Annexure A, no Founder retains any Intellectual Property Rights used by the Business.

## 7. Restraints

### 7.1 Non-compete
For the **Restraint Period** and within the **Restraint Area**, each Founder covenants that they will not, whether alone or with others, be engaged, concerned, or interested (directly or indirectly, whether as principal, agent, employee, director, contractor, or shareholder holding more than 5% of any class of shares) in any business that materially competes with the Business.

### 7.2 Restraint scope, cascading periods and geography
The **Restraint Period** is each of the following periods, in descending order (each successive period being read down if the previous is held unenforceable):

1. {{restraint_period_1_months}} months from the date the Founder ceases to be actively engaged;
2. {{restraint_period_2_months}} months from the date the Founder ceases to be actively engaged;
3. {{restraint_period_3_months}} months from the date the Founder ceases to be actively engaged.

The **Restraint Area** is each of the following areas, in descending order (each successive area being read down if the previous is held unenforceable):

1. {{restraint_area_1}};
2. {{restraint_area_2}};
3. {{restraint_area_3}}.

### 7.3 Non-solicitation of employees and contractors
For **12 months** from the date the Founder ceases to be actively engaged, each Founder covenants that they will not directly or indirectly solicit, induce, or encourage any employee, contractor, or director of the Company to terminate their engagement with the Company.

### 7.4 Non-solicitation of customers and suppliers
For **12 months** from the date the Founder ceases to be actively engaged, each Founder covenants that they will not directly or indirectly solicit, canvass, or approach any customer, supplier, or business partner of the Company with whom the Founder had material dealings in the 12 months before ceasing engagement, for the purpose of competing with the Business.

### 7.5 New South Wales Restraints of Trade Act 1976
Where this Agreement is governed by the law of New South Wales, section 4 of the *Restraints of Trade Act 1976* (NSW) applies and enables a court to read down (but not rewrite) any restraint under this section 7 to the extent necessary to make it enforceable. Where this Agreement is governed by the law of another Australian State or Territory, the cascading structure in sections 7.1–7.2 gives effect to the same intent.

### 7.6 Acknowledgement
Each Founder acknowledges that (a) the restraints in this section 7 are no more than is reasonably necessary to protect the legitimate interests of the Company, and (b) the consideration for these restraints is the issue of Founder Shares under section 1.

## 8. Decision-making, deadlock, and Change of Control

### 8.1 Ordinary decisions
Day-to-day decisions in the Business are made by the Founder holding the relevant role under section 3.1, subject to the Board.

### 8.2 Reserved Matters
The following matters (**Reserved Matters**) require the unanimous written consent of all Founders (or, once a Shareholders Agreement is executed with third-party investors, the majority set out in that agreement — which prevails to the extent of any inconsistency):

1. approval of the annual budget;
2. any capital raise or issue of shares (other than under an ESOP the Board has already approved);
3. any dividend, share buy-back, or return of capital (in each case subject to **s 254T Corporations Act 2001 (Cth)** solvency test);
4. any transaction with a related party of a Founder valued at more than A$**{{related_party_threshold_aud}}** in aggregate in any 12-month period;
5. any incurring of debt in excess of A$**{{debt_threshold_aud}}** in aggregate;
6. any acquisition or disposal of assets outside the ordinary course, or of any business or subsidiary;
7. commencement or settlement of any material litigation;
8. adoption or amendment of the ESOP or the reserve pool percentage;
9. amendment of the Company constitution or this Agreement;
10. any Change of Control (as defined in section 8.4).

### 8.3 Deadlock
If the Founders cannot resolve a Reserved Matter within **30 days** of the matter being tabled for decision, the deadlock will be referred first to mediation under the Australian Disputes Centre Guidelines for Commercial Mediation. If mediation does not resolve the deadlock within a further **30 days**, either Founder may then trigger the buy-sell process in section 8.5 (**Russian Roulette**).

### 8.4 Change of Control
A **Change of Control** occurs when a single person (or a group of associated persons under **s 12 Corporations Act 2001 (Cth)**) acquires more than 50% of the issued voting share capital of the Company, or the Company sells substantially all its assets, or the Company merges or amalgamates in a transaction that results in the pre-transaction shareholders holding less than 50% of the resulting entity's voting share capital.

### 8.5 Russian Roulette buy-sell (deadlock resolution of last resort)
Where a deadlock persists after section 8.3, either Founder (the **Initiating Founder**) may serve a written notice on the other Founder(s) (the **Recipient(s)**) specifying a price per share (the **Nominated Price**). The Recipient(s) must, within **30 days**, elect to either (a) sell all of their shares to the Initiating Founder at the Nominated Price, or (b) buy all of the Initiating Founder's shares at the Nominated Price. Silence for 30 days is deemed an election under (a). This mechanic is included as a last-resort exit and should not be triggered without independent legal advice.

## 9. Dispute resolution and governing law

### 9.1 Mediation first
The parties agree to submit any dispute arising out of or in connection with this Agreement first to mediation under the Australian Disputes Centre Guidelines for Commercial Mediation before commencing any court proceedings, except where urgent injunctive relief is required.

### 9.2 Governing law and jurisdiction
This Agreement is governed by the laws of **{{governing_state}}, Australia**, and the parties submit to the non-exclusive jurisdiction of the courts of that State.

## 10. General

### 10.1 Entire agreement
This Agreement, together with the Company's constitution, any Shareholders Agreement, and each Founder's IP Assignment Deed, constitutes the entire agreement between the parties on its subject matter and supersedes all prior negotiations, understandings, or arrangements.

### 10.2 Variation
No variation of this Agreement is effective unless it is in writing and signed by all Founders and the Company.

### 10.3 Assignment
No Founder may assign or transfer any right or obligation under this Agreement without the prior written consent of the other Founders.

### 10.4 Counterparts and electronic signature
This Agreement may be executed in any number of counterparts, each of which is an original and all of which together constitute one and the same instrument. The parties consent to the use of electronic signatures under the *Electronic Transactions Act 1999* (Cth) and its State and Territory equivalents.

### 10.5 Severance
If any provision of this Agreement is or becomes unenforceable, the provision is severed to the extent necessary and the remainder continues in full force and effect.

---

## Execution

**EXECUTED as an agreement.**

**Signed for and on behalf of {{company_name}} Pty Ltd** ACN {{acn}} in accordance with **section 127 of the *Corporations Act 2001* (Cth)**:

Signature of Director: ____________________________
Name: {{director_name}}
Date: ____________________________

**Signed by {{founder_1_name}}** as a Founder in the presence of:

Signature of Founder: ____________________________
Signature of Witness: ____________________________
Name of Witness: ____________________________
Date: ____________________________

**Signed by {{founder_2_name}}** as a Founder in the presence of:

Signature of Founder: ____________________________
Signature of Witness: ____________________________
Name of Witness: ____________________________
Date: ____________________________
{{#has_third_founder}}
**Signed by {{founder_3_name}}** as a Founder in the presence of:

Signature of Founder: ____________________________
Signature of Witness: ____________________________
Name of Witness: ____________________________
Date: ____________________________
{{/has_third_founder}}

---

## Annexure A — Pre-existing IP and disclosed side arrangements

{{annexure_a_disclosures}}

*If nothing is disclosed above, the Founders confirm that no Founder retains any pre-existing IP used by the Business and no Founder is party to any side arrangement affecting the Founder Shares.*

---

*Revision: {{revision_date}} · BlockID.au — Auschain Pty Ltd ACN 659 615 111*
