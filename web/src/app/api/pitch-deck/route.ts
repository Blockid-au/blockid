// GET /api/pitch-deck — Generate and download the BlockID Antler pitch deck PDF
//
// Returns a landscape A4 PDF with 12 professional slides.
// No auth required (public endpoint for investor distribution).

import { renderToBuffer } from "@react-pdf/renderer";
import { PitchDeckPDF } from "@/lib/pdf/pitch-deck-pdf";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pdfBuffer = await renderToBuffer(PitchDeckPDF());

    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="BlockID-Pitch-Deck-Antler-2026.pdf"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[pitch-deck] PDF generation failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to generate pitch deck" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
