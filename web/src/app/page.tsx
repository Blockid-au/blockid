import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";

export const metadata = {
  title: "BlockID.au — The Ownership & Growth Execution Platform",
  description:
    "Turn your AI-built idea into a valuable, investable business. BlockID.au helps AI-native founders, startups, and private companies structure ownership, manage valuation, execute growth, and become investor-ready from day one.",
  alternates: {
    canonical: "https://blockid.au",
  },
};

export default function HomePage() {
  return (
    <Suspense>
      <SVIEntrance />
    </Suspense>
  );
}
