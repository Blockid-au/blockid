import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "About BlockID — AI-Powered Startup Ownership Platform",
  description:
    "BlockID helps Australian founders build, protect, and grow their companies with AI-powered ownership, valuation, and fundraising tools.",
};

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900">
            About BlockID
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            BlockID is an Australian-native platform built to help founders
            move from idea to investable business — with clarity, confidence,
            and control over their ownership story.
          </p>

          <section className="mt-12">
            <h2 className="text-2xl font-semibold text-ink-800">Our Mission</h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              We believe every Australian founder deserves institutional-grade
              tools to build, protect, and grow their company. Too many startups
              lose momentum — and equity — because cap tables live in
              spreadsheets, valuations are guesswork, and fundraising readiness
              is an afterthought. BlockID exists to change that.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-ink-800">
              Bridging the Gap
            </h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              The distance between a great idea and an investable business is
              filled with legal complexity, financial modelling, and investor
              expectations that most first-time founders have never navigated.
              BlockID bridges that gap with AI-powered tools that score your
              readiness, structure your cap table, generate term sheets, and
              prepare you for due diligence — all in one place.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-ink-800">
              Our Vision
            </h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              We are building the operating system for startup ownership in
              Australia. A single platform where founders track equity, model
              dilution, share data rooms, and grow their Startup Viability
              Index — so that when the right investor comes along, they are
              ready.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-ink-800">
              Australian-Native
            </h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              Auschain Pty Ltd (ACN 659 615 111, ABN 79 659 615 111) is
              headquartered in Sydney, NSW, Australia. Our data is hosted with
              Australian residency, our compliance frameworks are built for
              ASIC and ATO requirements, and our tools speak the language of
              Australian founders — from ESOP structures to SAFE notes under
              local law.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-ink-800">
              The Team
            </h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              We are a team of engineers, product builders, and startup
              operators who have lived the founder journey ourselves. We have
              raised capital, negotiated term sheets, and built cap tables from
              scratch — and we built BlockID so the next generation of
              Australian founders does not have to do it alone.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
