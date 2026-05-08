import {
  Activity,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  CheckSquare,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  Heart,
  Info,
  Landmark,
  Lightbulb,
  Link2,
  LockKeyhole,
  Network,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Smile,
  Target,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const whyItems = [
  [Users, "Investors need trust. We help startups prove they're ready."],
  [
    Target,
    "We remove fundraising friction by making data clear, verified and easy to share.",
  ],
  [ShieldCheck, "We show you what investors care about — before they ask."],
  [BarChart3, "Stronger readiness. More trust. Faster raises."],
] as const;

const howItems = [
  [Bot, "AI collects and verifies your data"],
  [FolderOpen, "Auto-organize documents"],
  [CheckSquare, "Smart checklists & guidance"],
  [RefreshCcw, "Always up-to-date"],
  [Link2, "One click to share securely"],
  [Users, "Investors get what they need"],
] as const;

const whatItems = [
  [Gauge, "Investor-Ready Score"],
  [FileText, "AI Term Sheet Analysis"],
  [Scale, "Dilution Simulator"],
  [FolderOpen, "Dataroom Automation"],
  [FileCheck2, "Document Management"],
  [ShieldCheck, "Smart Checklists"],
  [Link2, "Investor Share Links"],
  [Activity, "Activity Tracking"],
  [ShieldCheck, "Proof & Verification"],
] as const;

const audienceItems = [
  "Australian startups",
  "SMEs",
  "Founders",
  "Accelerators",
  "Startup lawyers",
  "Accountants",
  "Investors",
] as const;

const problemItems = [
  [
    FolderOpen,
    "Disconnected fundraising files",
    "Spreadsheets, PDFs, emails and siloed tools make fundraising preparation slow and hard to trust.",
  ],
  [
    Scale,
    "Messy cap tables and weak governance",
    "Unclear share records and missing governance documents create risk during investor diligence.",
  ],
  [
    Clock3,
    "Slow, stressful due diligence",
    "Founders lose weeks answering repeated investor questions instead of building the company.",
  ],
  [
    ShieldCheck,
    "Low investor confidence",
    "When data is hard to verify, investors move slower and ask for more proof.",
  ],
] as const;

const solutionItems = [
  "Automate the dataroom and fundraising readiness process with AI.",
  "Organize documents, manage shares and keep investor materials up to date.",
  "Analyze term sheets, track investor activity and generate proof-backed reports in minutes.",
] as const;

const valueItems = [
  [Info, "Information", "Clear insights and reports that show your true readiness.", "#6f45ff"],
  [Gauge, "Needs", "Faster fundraising and higher investor confidence.", "#2ac987"],
  [Smile, "Experiences", "Simple, professional and stress-free fundraising.", "#f2ad28"],
  [Zap, "Efficiency", "Save time with AI automation and smart tools.", "#2d75ff"],
  [ShieldCheck, "Risk", "Spot issues early and avoid costly mistakes.", "#ff4469"],
  [Heart, "Quality of Life", "Focus on building your company, not paperwork.", "#22bfa6"],
] as const;

const manageCards = [
  [
    LockKeyhole,
    "Smart Sharing",
    "Share the right information with the right people.",
    "#6f45ff",
  ],
  [
    Users,
    "Access Control",
    "Set permissions, expiry dates and access levels.",
    "#4a35f5",
  ],
  [
    Users,
    "Team Workspace",
    "Invite your team, assign tasks and collaborate.",
    "#25c878",
  ],
  [
    Activity,
    "Activity Tracking",
    "See who viewed, what they opened and when.",
    "#6f45ff",
  ],
  [
    Folder,
    "Central Dataroom",
    "All your documents, reports and data in one secure place.",
    "#4a35f5",
  ],
] as const;

const collaboratorItems = [
  [UserRound, "Founder"],
  [CircleDollarSign, "CFO"],
  [Scale, "Legal"],
  [BriefcaseBusiness, "Advisor"],
] as const;

const investorItems = [
  [Building2, "VC Firm"],
  [UserRound, "Angel Investor"],
  [Landmark, "Bank"],
  [Network, "Partner"],
] as const;

const trustItems = [
  [
    Clock3,
    "Investor-ready in minutes",
    "Less time preparing, more time building.",
  ],
  [
    ShieldCheck,
    "Proof you can trust",
    "Tamper-evident reports and verified data.",
  ],
  [
    BarChart3,
    "Raise with confidence",
    "Show investors you're ready to grow.",
  ],
] as const;

const logos = [
  ["aws", "#232f3e"],
  ["stripe", "#635bff"],
  ["xero", "#13b5ea"],
  ["Google Cloud", "#4b5563"],
  ["HubSpot", "#203445"],
] as const;

export function WhyHowWhat() {
  return (
    <section className="bg-[#f8faff] pb-10 pt-28 text-[#070d3d] sm:pb-14 sm:pt-32">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-9">
        <div className="grid gap-7 md:grid-cols-[0.75fr_1.25fr] md:items-start">
          <div className="flex items-center gap-4">
            <BrandMark className="h-16 w-16" />
            <span className="text-4xl font-semibold tracking-tight sm:text-5xl">
              BlockID<span className="text-[#4a35f5]">.au</span>
            </span>
          </div>
          <div className="text-left md:text-right">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              The trust layer for{" "}
              <span className="text-[#4a35f5]">fundraising.</span>
            </h2>
            <p className="mt-4 text-base font-medium leading-relaxed text-[#192052] sm:text-lg">
              AI-powered investor readiness, proof-backed diligence and
              fundraising intelligence
              <span className="hidden md:inline">
                <br />
              </span>{" "}
              for Australian startups.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[0.86fr_1fr_1.2fr]">
          <Panel
            icon={Heart}
            title="WHY?"
            gradient="from-[#5b24f0] to-[#4f33ea]"
          >
            <h3 className="max-w-sm text-2xl font-semibold leading-tight sm:text-3xl">
              We help startups raise capital with trust and confidence.
            </h3>
            <Divider />
            <ul className="mt-7 space-y-7">
              {whyItems.map(([Icon, body]) => (
                <FeatureLine key={body} icon={Icon}>
                  {body}
                </FeatureLine>
              ))}
            </ul>
          </Panel>

          <Panel
            icon={Lightbulb}
            title="HOW?"
            gradient="from-[#1e6ceb] to-[#1165e7]"
          >
            <h3 className="text-2xl font-semibold leading-tight sm:text-3xl">
              We automate the dataroom.
            </h3>
            <p className="mt-4 text-base font-medium leading-relaxed text-[#192052] sm:text-lg">
              BlockID.au collects, organizes and prepares everything investors
              need.
            </p>
            <ul className="mt-8 space-y-7">
              {howItems.map(([Icon, label]) => (
                <FeatureLine key={label} icon={Icon}>
                  {label}
                </FeatureLine>
              ))}
            </ul>
          </Panel>

          <Panel
            icon={FolderOpen}
            title="WHAT?"
            gradient="from-[#7640f2] to-[#8352ee]"
          >
            <h3 className="max-w-xl text-2xl font-semibold leading-tight sm:text-3xl">
              Features that automate your dataroom and investor readiness.
            </h3>
            <div className="mt-8 grid grid-cols-2 border-[#dfe4f6] sm:grid-cols-3">
              {whatItems.map(([Icon, title], index) => (
                <div
                  key={title}
                  className={`min-h-32 border-[#dfe4f6] p-4 text-center ${
                    index % 3 !== 2 ? "sm:border-r" : ""
                  } ${index < 6 ? "border-b" : ""} ${
                    index % 2 === 0 ? "border-r sm:border-r" : "sm:border-r-0"
                  }`}
                >
                  <Icon
                    strokeWidth={1.75}
                    className="mx-auto h-10 w-10 text-[#4a35f5]"
                  />
                  <p className="mx-auto mt-4 max-w-28 text-sm font-semibold leading-tight text-[#070d3d]">
                    {title}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dfe4f2] bg-white shadow-[0_14px_46px_rgba(20,31,80,0.06)]">
          <div className="grid gap-8 p-6 lg:grid-cols-[0.92fr_1.08fr] xl:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4a35f5]">
                Built for fundraising teams
              </p>
              <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#070d3d] sm:text-4xl">
                For the people preparing, advising and investing in Australian
                companies.
              </h3>
              <p className="mt-5 text-base font-medium leading-relaxed text-[#192052] sm:text-lg">
                BlockID.au helps Australian startups, SMEs, founders,
                accelerators, startup lawyers, accountants and investors prepare
                for fundraising and due diligence with clarity and confidence.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {audienceItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#dfe4f2] bg-[#f8faff] px-4 py-2 text-sm font-semibold text-[#070d3d]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {problemItems.map(([Icon, title, body]) => (
                <div
                  key={title}
                  className="rounded-xl border border-[#dfe4f2] bg-[#fbfcff] p-5"
                >
                  <Icon
                    strokeWidth={1.75}
                    className="h-8 w-8 text-[#4a35f5]"
                  />
                  <h4 className="mt-4 text-base font-semibold text-[#070d3d]">
                    {title}
                  </h4>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[#192052]">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[#dfe4f2] bg-[#f7f9ff] p-6 xl:p-8">
            <div className="grid gap-7 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4a35f5]">
                  How BlockID.au helps
                </p>
                <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#070d3d] sm:text-3xl">
                  From scattered files to trusted investor-ready reports in
                  minutes.
                </h3>
              </div>
              <div className="grid gap-3">
                {solutionItems.map((item) => (
                  <div key={item} className="flex gap-4">
                    <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4a35f5] text-white">
                      <CheckSquare strokeWidth={2} className="h-4 w-4" />
                    </span>
                    <p className="text-base font-medium leading-relaxed text-[#192052]">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-7 rounded-2xl border border-[#dfe4f2] bg-white p-6 shadow-[0_12px_36px_rgba(20,31,80,0.05)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4a35f5]">
                The short version
              </p>
              <p className="mt-4 text-xl font-semibold leading-relaxed text-[#070d3d]">
                Startups waste weeks preparing fundraising documents, managing
                cap tables and answering investor due diligence questions.
                BlockID.au automates the dataroom and investor readiness
                process with AI — organizing documents, managing shares,
                analyzing term sheets and generating trusted investor-ready
                reports in minutes.
              </p>
              <p className="mt-4 text-lg font-semibold leading-relaxed text-[#4a35f5]">
                The trust layer for fundraising, helping Australian startups
                raise capital faster, with more confidence and less friction.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dfe4f2] bg-white shadow-[0_14px_46px_rgba(20,31,80,0.06)]">
          <div className="grid items-center gap-8 p-6 lg:grid-cols-[1fr_440px] xl:grid-cols-[1fr_520px]">
            <div>
              <h3 className="text-2xl font-semibold uppercase tracking-tight text-[#070d3d]">
                What value are we creating?
              </h3>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {valueItems.map(([Icon, title, body, color], index) => (
                  <div
                    key={title}
                    className={`px-3 text-center ${
                      index > 0 ? "xl:border-l xl:border-[#dfe4f2]" : ""
                    }`}
                  >
                    <span
                      className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border"
                      style={{
                        color,
                        backgroundColor: `${color}14`,
                        borderColor: `${color}32`,
                      }}
                    >
                      <Icon strokeWidth={1.75} className="h-7 w-7" />
                    </span>
                    <p className="mt-4 text-sm font-semibold">{title}</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#192052]">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <InvestorLaptop />
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dfe4f2] bg-white shadow-[0_14px_46px_rgba(20,31,80,0.06)]">
          <div className="grid items-center gap-8 p-6 lg:grid-cols-[1fr_0.98fr]">
            <div>
              <h3 className="text-2xl font-semibold uppercase tracking-tight text-[#070d3d]">
                Share & manage easily
              </h3>
              <p className="mt-3 max-w-xl text-base font-medium leading-relaxed text-[#192052]">
                Control who sees what. Work together with your team. Stay
                organized.
              </p>
              <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {manageCards.map(([Icon, title, body, color]) => (
                  <div
                    key={title}
                    className="rounded-xl border border-[#dfe4f2] bg-[#fbfcff] p-4 shadow-[0_8px_26px_rgba(20,31,80,0.04)]"
                  >
                    <Icon
                      strokeWidth={1.75}
                      className="h-9 w-9"
                      style={{ color }}
                    />
                    <h4 className="mt-4 text-sm font-semibold">{title}</h4>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-[#192052]">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <ShareDiagram />
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dfe4f2] bg-white px-6 py-5 shadow-[0_14px_46px_rgba(20,31,80,0.05)]">
          <div className="grid items-center gap-6 lg:grid-cols-[1.18fr_1fr]">
            <div className="grid gap-5 sm:grid-cols-3">
              {trustItems.map(([Icon, title, body], index) => (
                <div
                  key={title}
                  className={`flex items-start gap-4 ${
                    index > 0 ? "sm:border-l sm:border-[#dfe4f2] sm:pl-7" : ""
                  }`}
                >
                  <Icon
                    strokeWidth={1.75}
                    className="h-11 w-11 shrink-0 text-[#4a35f5]"
                  />
                  <span>
                    <span className="block text-sm font-semibold leading-tight">
                      {title}
                    </span>
                    <span className="mt-1 block text-xs font-medium leading-relaxed text-[#192052]">
                      {body}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="lg:border-l lg:border-[#dfe4f2] lg:pl-10">
              <p className="text-base font-medium text-[#070d3d]">
                Trusted by founders, advisors & investors
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-9 gap-y-4">
                {logos.map(([logo, color]) => (
                  <span
                    key={logo}
                    className="text-2xl font-semibold tracking-tight sm:text-3xl"
                    style={{ color }}
                  >
                    {logo}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function Panel({
  icon: Icon,
  title,
  gradient,
  children,
}: {
  icon: LucideIcon;
  title: string;
  gradient: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#dfe4f2] bg-white shadow-[0_20px_58px_rgba(20,31,80,0.08)]">
      <div
        className={`flex items-center gap-5 bg-gradient-to-r ${gradient} px-7 py-4 text-white`}
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-[#4a35f5]">
          <Icon strokeWidth={1.75} className="h-8 w-8" />
        </span>
        <h3 className="text-2xl font-semibold uppercase tracking-wide sm:text-3xl">
          {title}
        </h3>
      </div>
      <div className="p-7 sm:p-8">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="mt-7 h-px bg-[#d8dcf0]" />;
}

function FeatureLine({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-5">
      <Icon
        strokeWidth={1.75}
        className="mt-1 h-9 w-9 shrink-0 text-[#4a35f5]"
      />
      <p className="text-base font-semibold leading-relaxed text-[#070d3d]">
        {children}
      </p>
    </li>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center text-[#4a35f5] ${className ?? ""}`}
      aria-hidden
    >
      <svg viewBox="0 0 72 72" className="h-full w-full">
        <path
          d="M36 4 64 20v32L36 68 8 52V20L36 4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
        />
        <path
          d="M36 14 55 25v22L36 58 17 47V25l19-11Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
        />
        <path
          d="M30 22h12c6 0 10 3 10 8 0 3-2 6-5 7 4 1 7 4 7 9 0 6-5 10-13 10H30V22Zm9 13c3 0 5-1 5-4s-2-4-5-4h-3v8h3Zm1 15c4 0 6-2 6-5s-2-5-6-5h-4v10h4Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

function InvestorLaptop() {
  return (
    <div className="flex min-h-[210px] items-end justify-center rounded-2xl bg-[#f3f6ff] p-5">
      <div className="relative flex items-end gap-5">
        <div>
          <div className="rounded-t-xl border-8 border-[#152055] bg-white p-4 shadow-[0_18px_42px_rgba(20,31,80,0.12)]">
            <div className="grid min-h-36 w-72 gap-3 sm:w-80">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 rounded-full bg-[conic-gradient(#4a35f5_0_86%,#e2e7f6_86%_100%)] p-2">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-2xl font-semibold">
                    86
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="block h-3 w-24 rounded-full bg-[#4a35f5]" />
                  <span className="block h-3 w-32 rounded-full bg-[#dce3f6]" />
                  <span className="block h-3 w-20 rounded-full bg-[#dce3f6]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[58, 76, 48].map((height) => (
                  <div key={height} className="rounded-lg bg-[#f0f3ff] p-2">
                    <span
                      className="mt-auto block rounded bg-[#4a35f5]"
                      style={{ height }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mx-auto h-4 w-[340px] rounded-b-2xl bg-[#152055] sm:w-[380px]" />
        </div>
        <div className="hidden sm:block">
          <div className="h-28 w-24 rounded-t-full bg-[#101b55]" />
          <div className="h-28 w-32 rounded-t-[2rem] bg-[#5b35ee]" />
          <div className="-mt-8 h-20 w-28 rounded-xl bg-[#334155]" />
        </div>
      </div>
    </div>
  );
}

function ShareDiagram() {
  return (
    <div className="rounded-2xl bg-[#f2f5ff] p-5 sm:p-7">
      <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
        <RoleColumn
          title="Your Startup"
          titleClassName="bg-[#7653ee] text-white"
          items={collaboratorItems}
        />
        <div className="flex flex-col items-center">
          <div className="relative flex h-28 w-28 items-center justify-center">
            <span className="absolute inset-0 rounded-[2rem] bg-[#4a35f5]/10 blur-xl" />
            <BrandMark className="relative h-28 w-28 drop-shadow-[0_18px_30px_rgba(74,53,245,0.26)]" />
          </div>
          <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#d6dcf4] bg-white text-[#4a35f5]">
            <LockKeyhole strokeWidth={1.75} className="h-6 w-6" />
          </div>
        </div>
        <RoleColumn
          title="Shared with Investors"
          titleClassName="bg-[#25c878] text-white"
          items={investorItems}
        />
      </div>
      <p className="mt-6 text-center text-base font-semibold text-[#070d3d]">
        You control access.
        <br />
        Always secure.
      </p>
    </div>
  );
}

function RoleColumn({
  title,
  titleClassName,
  items,
}: {
  title: string;
  titleClassName: string;
  items: readonly (readonly [LucideIcon, string])[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dfe4f2] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <h4 className={`px-4 py-3 text-center text-sm font-semibold ${titleClassName}`}>
        {title}
      </h4>
      <div className="grid gap-1 p-3">
        {items.map(([Icon, label]) => (
          <div key={label} className="flex items-center gap-3 px-2 py-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef3ff] text-[#4a35f5]">
              <Icon strokeWidth={1.75} className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-[#070d3d]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
