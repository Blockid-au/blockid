import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ApiDocs } from "./api-docs";

const TITLE = "API Documentation — BlockID Developer Platform | BlockID.au";
const DESCRIPTION =
  "Integrate startup intelligence into your workflow with the BlockID API. SVI analysis, investor-ready scoring, term sheet analysis, and credit management endpoints.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "BlockID API",
    "startup API australia",
    "SVI API",
    "investor ready score API",
    "startup intelligence API",
    "term sheet analysis API",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/developers",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/developers",
  },
};

export default function DevelopersPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <ApiDocs />
      </main>
      <Footer />
    </>
  );
}
