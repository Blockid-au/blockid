import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/landing/hero";
import { IdeaTools } from "@/components/landing/idea-tools";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { OwnershipVisibility } from "@/components/landing/ownership-visibility";
import { Bento } from "@/components/landing/bento";
import { CompsWall } from "@/components/landing/comps-wall";
import { Compliance } from "@/components/landing/compliance";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { CtaStrip } from "@/components/landing/cta-strip";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <Hero />
        <IdeaTools />
        <LogoCloud />
        <OwnershipVisibility />
        <Bento />
        <CompsWall />
        <Compliance />
        <Pricing />
        <FAQ />
        <CtaStrip />
      </main>
      <Footer />
    </>
  );
}
