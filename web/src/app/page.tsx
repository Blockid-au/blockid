import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { WhyHowWhat } from "@/components/landing/why-how-what";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { Bento } from "@/components/landing/bento";
import { CompsWall } from "@/components/landing/comps-wall";
import { Compliance } from "@/components/landing/compliance";
import { Pricing } from "@/components/landing/pricing";
import { InvestorPack } from "@/components/landing/investor-pack";
import { FAQ } from "@/components/landing/faq";
import { CtaStrip } from "@/components/landing/cta-strip";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <WhyHowWhat />
        <LogoCloud />
        <Bento />
        <CompsWall />
        <Compliance />
        <Pricing />
        <InvestorPack />
        <FAQ />
        <CtaStrip />
      </main>
      <Footer />
    </>
  );
}
