import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
            Score link not found
          </p>
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-slate-50">
            This score link has expired or moved
          </h1>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
            Investor View Links can be revoked by the founder at any time. If
            you were expecting to see a score here, ask the founder for a
            fresh link, or generate your own to see how the format works.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/score" className="inline-flex">
              <Button variant="primary">Get your free score</Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
