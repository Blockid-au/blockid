import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";

export const metadata = {
  title: "BlockID.au — The Agentic AI Valuation Platform | Valuation. Ownership. Execution. Growth.",
  description:
    "The agentic AI valuation platform for business growth from day one. Index valuation, ownership, and execution milestones from idea to scale.",
};

export default function HomePage() {
  return (
    <Suspense>
      <SVIEntrance />
    </Suspense>
  );
}
