import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const SITE_NAME = "BlockID — Trust Infrastructure for Private Capital";
const SITE_DESCRIPTION =
  "BlockID is the AI valuation and investor-ready platform built for Australian founders raising their next round. Get your Investor-Ready Score in 5 minutes — free.";
const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: "%s | BlockID",
  },
  description: SITE_DESCRIPTION,
  applicationName: "BlockID",
  keywords: [
    "Investor-Ready Score",
    "Cap Table",
    "Australian startup",
    "AU SAFE",
    "Carta alternative",
    "ASIC",
    "ESIC",
    "Dilution calculator Australia",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "BlockID",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink-950 text-slate-50 font-sans flex flex-col">
        {children}
      </body>
    </html>
  );
}
