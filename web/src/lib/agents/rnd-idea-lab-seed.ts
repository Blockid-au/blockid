import "server-only";

// ---------------------------------------------------------------------------
// R&D Idea Lab — deterministic fallback seed data
// Used when the AI provider chain is unavailable, over-budget, or times out.
// Guarantees the /api/idea-lab endpoint always returns useful, on-brand
// Australian data — never a 500. Six sectors are hand-curated with real AU
// competitors, one-liner angles and non-obvious opportunities.
// ---------------------------------------------------------------------------

import type {
  StartupAngle,
  NonObviousOpportunity,
  CompetitorNote,
} from "./rnd-idea-lab";

export interface SectorSeed {
  angles: StartupAngle[];
  nonObvious: NonObviousOpportunity[];
  competitors: CompetitorNote[];
}

export const SEED_SECTORS: Record<string, SectorSeed> = {
  fintech: {
    angles: [
      { title: "SMB embedded payments", oneLiner: "Add card-not-present payments to any SMB scheduling app via a single Stripe-compatible SDK.", targetCustomer: "AU vertical SaaS founders serving trades, clinics, tutors", monetisation: "0.4% + $0.15 per successful charge, revenue share with the host SaaS", effortLevel: "medium" },
      { title: "Instant-payout freight escrow", oneLiner: "Escrow B2B freight invoices and release funds on GPS proof-of-delivery.", targetCustomer: "Owner-operator truckers and mid-sized freight brokers", monetisation: "1.2% escrow fee + $10 per instant payout", effortLevel: "high" },
      { title: "Super-fund switching co-pilot", oneLiner: "One-click superannuation comparison and switching with fee-forecast simulator.", targetCustomer: "Millennial employees changing jobs (400k/yr in AU)", monetisation: "Affiliate commission from super funds + $9/mo premium fee forecast", effortLevel: "medium" },
      { title: "Compliance-as-a-service for AFSL prep", oneLiner: "AI turns a fintech founder's product spec into a draft AFSL application pack.", targetCustomer: "Pre-launch fintech founders raising seed rounds", monetisation: "$1,500 upfront + $500/mo maintenance retainer", effortLevel: "medium" },
      { title: "Contractor tax micro-witholding", oneLiner: "Auto-withhold ATO tax + super each time an ABN contractor gets paid via connected banks.", targetCustomer: "Sole-trader tradies, freelancers, gig workers", monetisation: "$6/mo per active contractor, tiered", effortLevel: "medium" },
      { title: "SMSF crypto custody", oneLiner: "AUSTRAC-registered custody + tax reporting purpose-built for self-managed super funds holding digital assets.", targetCustomer: "SMSF trustees (600k+ funds in AU)", monetisation: "0.5% AUM + $99/mo per fund", effortLevel: "high" },
      { title: "Sub-$50 invoice factoring", oneLiner: "Advance small invoices instantly using open-banking cash-flow signals as the credit check.", targetCustomer: "Tradies, cleaners, mobile beauty", monetisation: "3% factor fee on each invoice", effortLevel: "medium" },
      { title: "Reg-tech for crypto exchanges", oneLiner: "Real-time travel-rule + suspicious-matter-report generator for AU digital-asset exchanges.", targetCustomer: "AUSTRAC-registered exchanges and OTC desks", monetisation: "$2,500/mo SaaS + per-report usage", effortLevel: "high" },
      { title: "Buy-now-pay-later for tradie invoices", oneLiner: "Consumer BNPL applied at the moment a home-owner receives a plumber/electrician invoice.", targetCustomer: "Homeowners paying $500-$5k trade invoices", monetisation: "3% merchant fee, split with the tradie SaaS", effortLevel: "medium" },
      { title: "Neo-broker for private markets", oneLiner: "Fractional access to AU private company shares + AU-listed unit trusts under one wholesale-investor account.", targetCustomer: "Wholesale-qualified investors ($250k+ income)", monetisation: "0.7% AUM + $30 per trade", effortLevel: "high" },
    ],
    nonObvious: [
      { title: "Church + club treasury tools", whyOverlooked: "Fintechs chase VC-fundable segments; not-for-profits are ignored despite 60k+ registered AU orgs.", hookForFounder: "Purpose-built book-keeping + card issuance for parish, sporting club and P&C treasurers." },
      { title: "Deceased-estate financial admin", whyOverlooked: "Death admin is emotionally hard to demo — but every year 170k Australians die and leave financial mess.", hookForFounder: "One dashboard consolidates all bank/super/utility accounts of a deceased person for the executor." },
      { title: "Rent-based credit history", whyOverlooked: "Australian bureaus historically ignore rent payments; tenants get no credit reward for paying on time.", hookForFounder: "Verify rent payments via open banking and push a positive tradeline to Equifax/illion/Experian." },
      { title: "Micro-forex for backpackers", whyOverlooked: "Wise/Revolut dominate mainstream FX; short-stay working-holiday makers are underserved.", hookForFounder: "Prepaid AUD wallet + tax-return-in-a-box aimed at the 130k/yr WHM visa holders." },
      { title: "Green-loan comparison at point of purchase", whyOverlooked: "Solar/EV installers are non-financial actors who never present financing options natively.", hookForFounder: "White-label green-loan comparison widget embedded in every installer quote." },
    ],
    competitors: [
      { name: "Airwallex", whatTheyDo: "Global business accounts, FX, and payments for SMBs and marketplaces.", angle: "Sits between banks and Stripe — cross-border payouts are their moat." },
      { name: "Zeller", whatTheyDo: "SMB card acceptance + business transaction account + expense cards.", angle: "Bundles POS + banking + cards; competes with big-four bank merchant offerings." },
      { name: "Judo Bank", whatTheyDo: "Relationship-led SME lending, term deposits, and business loans.", angle: "Old-school relationship banking rebuilt on modern infra; APRA-licensed." },
    ],
  },

  saas: {
    angles: [
      { title: "Vertical SaaS for AU allied health", oneLiner: "Bookings, Medicare rebates and clinical notes purpose-built for psychology, physio and podiatry clinics.", targetCustomer: "1-15 practitioner allied-health clinics", monetisation: "$79/mo per practitioner", effortLevel: "medium" },
      { title: "AI-native customer research", oneLiner: "Continuous voice-of-customer synthesis across Intercom, Gong, Zendesk and app-store reviews.", targetCustomer: "Series-A B2B product teams", monetisation: "$499/mo per workspace tiered by data volume", effortLevel: "medium" },
      { title: "SOC-2 in a box for AU SaaS", oneLiner: "Auto-collect evidence and manage annual audits with AU-based auditor marketplace built in.", targetCustomer: "Pre-Series-B AU SaaS selling enterprise", monetisation: "$1,500/mo + audit fee revenue share", effortLevel: "medium" },
      { title: "Field-service dispatch for utilities", oneLiner: "Route-optimised dispatch + safety-form tablet for gas, water, electrical field crews.", targetCustomer: "Regional utility contractors (50-500 crew)", monetisation: "$85/mo per field worker", effortLevel: "high" },
      { title: "Contract-lifecycle mgmt for AU councils", oneLiner: "Procurement-aware CLM tuned to LGA governance and probity rules.", targetCustomer: "Local government procurement and legal officers", monetisation: "$25k-$95k annual contract per council", effortLevel: "high" },
      { title: "PLG onboarding orchestration", oneLiner: "No-code funnels that adapt in real time to user-behaviour cohorts.", targetCustomer: "PLG SaaS founders past first 1k users", monetisation: "$299-$999/mo based on MAU", effortLevel: "medium" },
      { title: "Learning management for franchise networks", oneLiner: "Compliance training + operations playbooks shared across every franchisee.", targetCustomer: "Franchisors with 30+ AU locations", monetisation: "$12/mo per active learner", effortLevel: "medium" },
      { title: "Sales-tax + BAS automation for global SaaS", oneLiner: "Auto-compute AU GST + global sales tax across Stripe/Chargebee/Paddle.", targetCustomer: "SaaS founders selling in >3 countries", monetisation: "0.5% of tax processed, min $99/mo", effortLevel: "medium" },
      { title: "Async-standup ops OS", oneLiner: "Slack-native standups, retros and OKR check-ins with AI summary for founders.", targetCustomer: "Distributed startup teams 8-80 people", monetisation: "$8/mo per user", effortLevel: "low" },
      { title: "Vendor risk platform for regulated AU SMBs", oneLiner: "Automated vendor questionnaires and continuous monitoring for CPS 234 and Essential 8.", targetCustomer: "AU financial, health and gov-adjacent SMBs", monetisation: "$450/mo per organisation", effortLevel: "medium" },
    ],
    nonObvious: [
      { title: "SaaS for AU strata committees", whyOverlooked: "80k+ strata schemes but treated as low-margin; existing tools are 20-year-old desktop software.", hookForFounder: "Mobile-first strata portal with EGM voting, levy tracking, and AI minute-taker." },
      { title: "Post-mortem OS for medium teams", whyOverlooked: "Incident retros are a nice-to-have in AU mid-market; nobody has built a proper product.", hookForFounder: "Structured post-incident learning with cross-team pattern detection." },
      { title: "SaaS for AU regional tourism operators", whyOverlooked: "Fragmented, seasonal buyers ignored by global booking platforms.", hookForFounder: "All-in-one bookings + tours + retail POS for regional operators." },
      { title: "Purpose-built SaaS for accounting-firm partners", whyOverlooked: "Xero/MYOB serve small businesses, not the workflow between accounting partners.", hookForFounder: "Practice-management OS for AU accounting partnerships focused on capacity + partner economics." },
      { title: "Warranty automation for whitegoods retailers", whyOverlooked: "Warranty support burdens retailers with no real tooling.", hookForFounder: "Consumer-facing warranty portal + auto-diagnostics that deflects support tickets." },
    ],
    competitors: [
      { name: "Culture Amp", whatTheyDo: "Employee-engagement, performance and development SaaS for enterprise HR.", angle: "AU-born but globally scaled; category leader in people-analytics." },
      { name: "Employment Hero", whatTheyDo: "All-in-one HR, payroll and benefits SaaS for AU/NZ SMBs.", angle: "Bundled offer + reseller channel through accountants." },
      { name: "Deputy", whatTheyDo: "Shift-scheduling and workforce-management SaaS for hourly workforces.", angle: "Deep integrations with Xero, MYOB and POS systems." },
    ],
  },

  marketplace: {
    angles: [
      { title: "Trades → strata managers", oneLiner: "Verified tradies matched to strata managers for common-property repair jobs with warranty tracking.", targetCustomer: "Strata management companies (top 200 AU)", monetisation: "12% take rate on completed jobs", effortLevel: "medium" },
      { title: "On-demand paramedical checks", oneLiner: "Book a mobile blood-draw / ECG / vitals at home for insurers, telehealth and preventive-health startups.", targetCustomer: "Insurers, GPs and consumer health apps", monetisation: "$45 platform fee per visit", effortLevel: "medium" },
      { title: "Second-hand kids gear circular marketplace", oneLiner: "Verified, sanitised pram / cot / car-seat resale with delivery + collection.", targetCustomer: "Australian parents 25-40 with young children", monetisation: "18% commission + logistics fee", effortLevel: "medium" },
      { title: "Sub-contractor bidding for AU builders", oneLiner: "Builders post packages, verified subbies bid, escrow releases on milestone sign-off.", targetCustomer: "Mid-tier residential + commercial builders", monetisation: "4% platform fee on job value, escrow float", effortLevel: "high" },
      { title: "Bookable AU commercial kitchens", oneLiner: "Hourly commercial-kitchen bookings for ghost brands, meal-prep businesses and cottage food.", targetCustomer: "Micro food entrepreneurs in metro AU", monetisation: "20% commission + insurance add-on", effortLevel: "medium" },
      { title: "Vet-surgery capacity sharing", oneLiner: "Under-utilised regional vet surgery time offered to metro pet owners who travel for it.", targetCustomer: "Rural vets + cost-conscious pet owners", monetisation: "15% booking commission", effortLevel: "medium" },
      { title: "Freelance data engineers marketplace", oneLiner: "Vetted data engineers with pre-built dbt + Snowflake project templates.", targetCustomer: "Scaleups needing fractional data teams", monetisation: "18% take rate + $500 vetting fee", effortLevel: "medium" },
      { title: "AU professional-services voice-of-industry", oneLiner: "Anonymous salary + workload + culture data for lawyers, accountants, engineers.", targetCustomer: "Firm partners + candidates comparing offers", monetisation: "Freemium data access + $499/mo firm subscription", effortLevel: "low" },
      { title: "Marketplace for retired trades mentors", oneLiner: "Retired sparkies/plumbers coach apprentices remotely via video for compliance-critical decisions.", targetCustomer: "Apprentices + apprentice training bodies", monetisation: "$65/session, revenue share with training body", effortLevel: "low" },
      { title: "AU B2B waste + recycling marketplace", oneLiner: "Reverse-auction commercial waste and recycling jobs across regional operators.", targetCustomer: "SMB waste generators + regional waste operators", monetisation: "6% take rate + $120/mo listing fee for operators", effortLevel: "medium" },
    ],
    nonObvious: [
      { title: "AU regional trade-fair marketplace", whyOverlooked: "Regional trade shows are unglamorous but move billions; nobody has digitised the exhibitor experience.", hookForFounder: "Booth booking + lead-capture + post-show ROI dashboard for regional expo organisers." },
      { title: "Estate-sale marketplace with logistics", whyOverlooked: "Estate liquidation is a fragmented cottage industry; heirs need a done-for-you service.", hookForFounder: "Book valuers, cleaners, movers, resale channels from one dashboard." },
      { title: "Ex-military skilled-labour marketplace", whyOverlooked: "Veterans have real skills but no clean employer-facing marketplace.", hookForFounder: "Verified ADF-veteran talent marketplace focused on defence-industry primes." },
      { title: "AU sport-club sponsorship marketplace", whyOverlooked: "Local sport clubs desperately need sponsors but brokerage is manual.", hookForFounder: "Match local businesses to sport clubs based on postcode, spend and audience overlap." },
      { title: "Rural-property specialist-services marketplace", whyOverlooked: "Rural properties need specialised trades (fencing, dam building) with terrible discovery.", hookForFounder: "Vetted rural trades marketplace + weather-aware scheduling." },
    ],
    competitors: [
      { name: "Airtasker", whatTheyDo: "Consumer task and services marketplace across AU/NZ, UK and US.", angle: "Brand + liquidity leader for consumer service tasks; ASX-listed." },
      { name: "hipages", whatTheyDo: "Homeowner-to-tradie lead marketplace for AU residential trades.", angle: "Subscription lead model — tradies pay for job leads, not commission." },
      { name: "Mable", whatTheyDo: "Marketplace for NDIS and aged-care support workers.", angle: "Regulated marketplace with per-hour dispatch; NDIS-registered." },
    ],
  },

  healthtech: {
    angles: [
      { title: "AI scribe for AU GP clinics", oneLiner: "Ambient consult scribing that writes SOAP notes into Best Practice / Medical Director in seconds.", targetCustomer: "AU GP practice principals and clinic managers", monetisation: "$149/mo per practitioner", effortLevel: "medium" },
      { title: "Remote patient monitoring for CHF/COPD", oneLiner: "Home vitals streamed to hospital care teams with MBS-billable telehealth prompts.", targetCustomer: "Hospital in the Home programs, LHDs", monetisation: "$220/mo per enrolled patient", effortLevel: "high" },
      { title: "Fertility-cycle care navigator", oneLiner: "AI care-navigator guiding IVF patients through 90-day cycles + medication reminders.", targetCustomer: "IVF clinics and self-funded couples", monetisation: "$59/mo consumer app + clinic revenue share", effortLevel: "medium" },
      { title: "Chronic-disease group programs on Medicare", oneLiner: "Digital group care programs claiming under new MBS chronic disease items.", targetCustomer: "GPs + care coordinators managing type-2 diabetes cohorts", monetisation: "Per-participant MBS billing + clinic SaaS", effortLevel: "medium" },
      { title: "Ophthalmology triage in optometrist chairs", oneLiner: "AI reads retina + OCT scans at optometrist visit and flags urgent ophthalmology referrals.", targetCustomer: "Independent optometrist chains", monetisation: "$8 per scan flagged, volume tier", effortLevel: "high" },
      { title: "Aged-care staff scheduling under AN-ACC", oneLiner: "Rostering + care-minute compliance aligned to AN-ACC funding categories.", targetCustomer: "Residential aged-care providers", monetisation: "$3/mo per bed", effortLevel: "medium" },
      { title: "Mental-health stepped-care digital front door", oneLiner: "Triage tool routes patients to bibliotherapy, digital CBT, coach or clinician based on PHQ/GAD.", targetCustomer: "PHNs, EAP providers, universities", monetisation: "$18 per active user per month", effortLevel: "medium" },
      { title: "Pathology second-opinion marketplace", oneLiner: "AI + specialist second opinions on tricky histopathology cases within 24 hours.", targetCustomer: "Regional and rural pathology labs", monetisation: "$120 per case, subscription for volume", effortLevel: "high" },
      { title: "Post-surgical recovery app for orthopaedic", oneLiner: "Prescribed exercise, medication and outcome PROMs post total-knee or hip replacement.", targetCustomer: "Orthopaedic surgeons and private hospitals", monetisation: "$220 per surgical episode, bundled", effortLevel: "medium" },
      { title: "Real-world evidence marketplace for AU pharma", oneLiner: "De-identified real-world outcomes for pharma reimbursement submissions.", targetCustomer: "Pharma medical affairs and PBAC teams", monetisation: "$45k-$200k per dataset", effortLevel: "high" },
    ],
    nonObvious: [
      { title: "Menopause care employer benefit", whyOverlooked: "Corporates fund fertility but skip menopause; huge unaddressed workforce cohort.", hookForFounder: "Bundled menopause coaching + telehealth as an employer benefit." },
      { title: "Dental payment plans embedded in chair-side software", whyOverlooked: "Dental spend is high but tools sit outside the clinical workflow.", hookForFounder: "Chairside financing + treatment-plan sign off inside D4W / Praktika." },
      { title: "Hospital-to-community discharge orchestration", whyOverlooked: "Hospitals push, community fails to catch; discharge failures cost the system dearly.", hookForFounder: "Discharge workflow that pings home-care providers + GPs and tracks re-admissions." },
      { title: "Veterinary telehealth for rural pet owners", whyOverlooked: "Vet workforce shortage in regional AU; telehealth barely used.", hookForFounder: "Regulator-friendly telehealth vet consults + local logistics for medication delivery." },
      { title: "Sleep-clinic in-a-box for pharmacies", whyOverlooked: "Pharmacies want scope-of-practice growth; sleep testing is under-served regionally.", hookForFounder: "Home sleep-study kit + AI scoring managed by community pharmacies." },
    ],
    competitors: [
      { name: "Eucalyptus", whatTheyDo: "Direct-to-consumer telehealth brand house (Juniper, Pilot, Kin, Software).", angle: "Vertical brands with proprietary logistics and clinical governance." },
      { name: "Coviu", whatTheyDo: "Australian-built telehealth video platform used by clinicians and hospitals.", angle: "Deep MBS / Medicare workflow integrations." },
      { name: "Heidi Health", whatTheyDo: "AI medical scribe used by tens of thousands of AU clinicians.", angle: "Local-first AI documentation with EHR integrations." },
    ],
  },

  edtech: {
    angles: [
      { title: "NAPLAN prep for Years 3-9", oneLiner: "Adaptive practice tuned to ACARA descriptors with parent-facing progress reports.", targetCustomer: "Parents of primary and lower-secondary students", monetisation: "$29/mo per child", effortLevel: "medium" },
      { title: "Micro-credentials for trade apprentices", oneLiner: "Bite-sized micro-credentials mapped to AQF for trades: OH&S, electrical safety, refrigerant handling.", targetCustomer: "RTOs and apprentice employers", monetisation: "$45 per credential + platform SaaS", effortLevel: "medium" },
      { title: "AI writing coach for uni students", oneLiner: "Feedback engine that assesses arguments and structure without doing the writing.", targetCustomer: "AU university students, esp. international cohort", monetisation: "$19/mo per student", effortLevel: "medium" },
      { title: "TAFE-aligned career switcher path", oneLiner: "12-week guided TAFE + micro-cred paths for people leaving retail/hospitality post-40.", targetCustomer: "Adult career switchers 35-55", monetisation: "$800 program fee + government funding capture", effortLevel: "medium" },
      { title: "School operations copilot", oneLiner: "AI-driven admin assistant that drafts newsletters, permission forms and parent emails.", targetCustomer: "Independent and Catholic school administrators", monetisation: "$1,200/mo per school", effortLevel: "low" },
      { title: "STEM enrichment for regional families", oneLiner: "Live-tutored small-group coding, robotics and maths for regional/rural students via video.", targetCustomer: "Regional AU parents of 8-14 year olds", monetisation: "$65/wk per child, term subscription", effortLevel: "medium" },
      { title: "In-house L&D AI for large employers", oneLiner: "Turn Confluence/SharePoint content into role-specific micro-learning paths.", targetCustomer: "Enterprise learning teams (500+ FTE)", monetisation: "$18/mo per employee", effortLevel: "medium" },
      { title: "Compliance training marketplace", oneLiner: "Off-the-shelf compliance modules (privacy, WHS, code of conduct) via SCORM / LMS.", targetCustomer: "AU SMBs 50-500 employees", monetisation: "$390/yr per organisation flat + per-course add-ons", effortLevel: "low" },
      { title: "Financial literacy inside super apps", oneLiner: "White-label micro-lessons embedded into AU super fund and neobank apps.", targetCustomer: "Super funds and neobanks", monetisation: "$0.35 per active user per month, revenue share", effortLevel: "low" },
      { title: "Assessment cheating detection for AU unis", oneLiner: "AI-writing detection tuned for Australian assessment formats and academic integrity policies.", targetCustomer: "AU university teaching-and-learning teams", monetisation: "$150k+ annual enterprise licence", effortLevel: "medium" },
    ],
    nonObvious: [
      { title: "Board director upskilling", whyOverlooked: "AICD training is expensive and infrequent; board members need continuous learning.", hookForFounder: "Micro-CPD for AU non-exec directors delivered as podcast + quiz + attestation." },
      { title: "Migration-agent CPD marketplace", whyOverlooked: "MARA CPD is fragmented; migration agents need niche content.", hookForFounder: "MARA-approved CPD content library + attestation platform." },
      { title: "Kids financial-literacy inside banking apps", whyOverlooked: "Kids' bank accounts exist but never teach money concepts.", hookForFounder: "Chore-tracking + earned-money learning packaged for CBA/Westpac kids' apps." },
      { title: "Grant-writing training for NFPs", whyOverlooked: "NFPs spend hundreds of hours writing losing grants with no training market.", hookForFounder: "Grant-writing bootcamp + AI grant assistant for small AU charities." },
      { title: "Regional-based digital literacy for seniors", whyOverlooked: "Ageing regional Australians are excluded from digital services; no scaled solution.", hookForFounder: "Buddy-led group digital-literacy delivered via regional libraries + video." },
    ],
    competitors: [
      { name: "Go1", whatTheyDo: "Aggregator of workplace learning content sold to LMS platforms and enterprises.", angle: "AU unicorn, dominant in workplace-learning content aggregation." },
      { name: "Cluey Learning", whatTheyDo: "Live online tutoring for K-12 students across AU/NZ.", angle: "ASX-listed, structured live-tutor model." },
      { name: "Mathspace", whatTheyDo: "Adaptive maths platform used across AU schools.", angle: "Deep integration with Australian curriculum standards." },
    ],
  },

  deeptech: {
    angles: [
      { title: "Battery-second-life analytics", oneLiner: "Grade retired EV batteries for stationary reuse using cycle-history and cell-level telemetry.", targetCustomer: "Recyclers, energy retailers and grid operators", monetisation: "$15 per battery graded + software licence to recyclers", effortLevel: "high" },
      { title: "Autonomous mine-site scanning", oneLiner: "Multi-drone survey + LiDAR fleet with AI change detection for open-cut mines.", targetCustomer: "Tier-1 mining companies (BHP, Rio, FMG)", monetisation: "$450k-$1.5m per site per year", effortLevel: "high" },
      { title: "Precision-fermentation IP-licensing platform", oneLiner: "Small AU biotechs license strain IP into food + materials brands via a shared platform.", targetCustomer: "Alt-protein and cellular-ag startups", monetisation: "3-8% royalty + licensing platform SaaS", effortLevel: "high" },
      { title: "Ag-tech sensor mesh for orchards", oneLiner: "Low-power soil / canopy sensor mesh with satellite + drone fusion for growers.", targetCustomer: "AU tree-crop growers (almonds, avocados, citrus)", monetisation: "$45/ha annual subscription + hardware margin", effortLevel: "high" },
      { title: "Quantum-safe cryptography for critical infra", oneLiner: "Post-quantum key management for AU energy and telco operators.", targetCustomer: "Regulated critical infrastructure operators", monetisation: "$250k-$1m per site licence", effortLevel: "high" },
      { title: "Space-based bushfire early warning", oneLiner: "Cubesat + AI-detection service for early smoke plume detection over AU.", targetCustomer: "State fire authorities, DFES, RFS, CFA", monetisation: "$4-8m annual state contracts", effortLevel: "high" },
      { title: "Drone-swarm inspection for wind farms", oneLiner: "Auto-inspect wind-turbine blades and predict maintenance cycles.", targetCustomer: "Renewable operators and OEMs", monetisation: "$25k per turbine per year", effortLevel: "high" },
      { title: "Green-hydrogen sensor calibration", oneLiner: "Portable sensor calibration kit + software for hydrogen electrolyser sites.", targetCustomer: "Hydrogen project operators and EPC firms", monetisation: "$60k hardware + $25k/yr SaaS", effortLevel: "high" },
      { title: "Additive-manufacturing quality assurance", oneLiner: "In-process CT + AI defect detection for metal 3D printing.", targetCustomer: "Aerospace and medical device manufacturers", monetisation: "$180k per printer per year", effortLevel: "high" },
      { title: "Edge-AI cameras for retail loss prevention", oneLiner: "Privacy-safe on-camera analytics that detects shrinkage without sending video to cloud.", targetCustomer: "AU supermarket, convenience and liquor chains", monetisation: "$65/mo per camera", effortLevel: "medium" },
    ],
    nonObvious: [
      { title: "Air-tightness testing for AU new builds", whyOverlooked: "New NCC energy standards create demand nobody is scaling into.", hookForFounder: "Standardised blower-door + AI photo-report package sold to builders." },
      { title: "Rare-earth by-product recovery", whyOverlooked: "AU has massive mineral by-product streams; rare-earth recovery is a big geopolitical win.", hookForFounder: "Modular hydrometallurgy skid deployable on existing mine sites." },
      { title: "Radiation shielding for space payloads", whyOverlooked: "AU space payload market is small but growing; shielding is a real bottleneck.", hookForFounder: "Novel-composite radiation shielding sold to AU + NZ smallsat OEMs." },
      { title: "Underground water-leak acoustic sensing", whyOverlooked: "Water losses cost billions but tools are legacy hardware only.", hookForFounder: "Retrofit acoustic mesh with AI leak detection for AU water utilities." },
      { title: "Real-time embodied-carbon calc for construction", whyOverlooked: "Green Star + NABERS demand embodied-carbon but tooling is spreadsheet-era.", hookForFounder: "BIM-native embodied-carbon calculator with certified AU material EPDs." },
    ],
    competitors: [
      { name: "Cochlear", whatTheyDo: "Hearing implants and processors; ASX top-100 medical device company.", angle: "Global gold standard in implantable medical hardware from AU." },
      { name: "Advanced Navigation", whatTheyDo: "Inertial navigation, sonar and robotics platforms for defence and industry.", angle: "AU deeptech scaleup with government + defence customers." },
      { name: "SunDrive", whatTheyDo: "Solar cell manufacturing using copper metallisation instead of silver.", angle: "Sovereign-manufacturing thesis backed by Blackbird + Grok." },
    ],
  },
};

// ---------------------------------------------------------------------------
// getSeed — returns the sector seed for the given key, or a synthetic
// "generic" fallback so any unknown sector still gets 10 angles / 5 opps / 3
// competitors.
// ---------------------------------------------------------------------------

export function getSeed(sector: string): SectorSeed {
  const key = sector.toLowerCase();
  if (SEED_SECTORS[key]) return SEED_SECTORS[key];

  // Generic fallback — reuse SaaS as the most sector-neutral baseline but tweak
  // labels so the copy doesn't look sector-specific.
  const base = SEED_SECTORS.saas;
  return {
    angles: base.angles.map((a) => ({
      ...a,
      oneLiner: a.oneLiner.replace(/vertical SaaS|SaaS/gi, "software product"),
    })),
    nonObvious: base.nonObvious,
    competitors: base.competitors,
  };
}
