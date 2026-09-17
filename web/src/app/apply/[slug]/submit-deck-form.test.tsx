// SSR render test for the /apply/[slug] form (G14 S35). Pins: the consent
// card prints the approved data-ownership sentence verbatim next to the
// checkbox, the honeypot is aria-hidden / tabIndex -1 / named as the API
// expects, the deck input only accepts PDF / DOCX, and errorCopy maps API
// codes + 404 / 429 to catalogue lines.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { HONEYPOT_FIELD as RUNNER_HONEYPOT } from "@/lib/intake/submission-runner";
import { DECK_ACCEPT, HONEYPOT_FIELD, SubmitDeckForm, errorCopy, type SubmitDeckCopy } from "./submit-deck-form";

const COPY: SubmitDeckCopy = {
  startupName: "Startup name",
  founderName: "Your name",
  founderEmail: "Your email",
  website: "Website (optional)",
  deck: "Pitch deck",
  deckHint: "PDF or DOCX, up to 25 MB.",
  consentSentence: DATA_PRINCIPLE_SENTENCE,
  consentLabel: "I agree.",
  submit: "Send application",
  submitting: "Sending…",
  successTitle: "Received",
  successBody: "We emailed {email}.",
  successHint: "hint",
  privacy: "private",
  errors: {
    duplicate: "dup",
    deck_required: "need deck",
    deck_too_large: "too big",
    deck_type: "type",
    deck_infected: "infected",
    scanner_unavailable: "scanner",
    consent_required: "consent",
    invalid_input: "invalid",
    rate_limited: "slow down",
    closed: "closed",
    generic: "generic",
  },
};

describe("SubmitDeckForm", () => {
  const out = renderToStaticMarkup(<SubmitDeckForm slug="demo-program-abcdefgh" copy={COPY} />);

  it("prints the data-ownership sentence verbatim beside the consent checkbox", () => {
    expect(out).toContain(`data-testid="apply-data-principle">${DATA_PRINCIPLE_SENTENCE}</p>`);
    expect(out).toMatch(/<input type="checkbox"[^>]*data-testid="apply-consent" name="consent"\/>/);
  });

  it("honeypot: same field name as the runner, aria-hidden, tabIndex -1, empty", () => {
    expect(HONEYPOT_FIELD).toBe(RUNNER_HONEYPOT);
    expect(out).toMatch(new RegExp(`<div class="absolute[^"]*" aria-hidden="true"><label[^>]*>[^<]*</label><input id="[^"]+" type="text" tabindex="-1" autoComplete="off" name="${HONEYPOT_FIELD}" value=""`));
  });

  it("deck input is required and accepts PDF / DOCX only; multipart form; posts to the slug", () => {
    expect(out).toMatch(/<input id="[^"]+" type="file" required="" accept="[^"]+" class="[^"]*" name="deck"\/>/);
    expect(DECK_ACCEPT).toContain("application/pdf");
    expect(DECK_ACCEPT).not.toContain("pptx");
    expect(out).toContain('encType="multipart/form-data"');
    expect(out).toContain('data-testid="apply-submit"');
    expect(out).not.toContain('data-testid="apply-success"');
  });

  it("errorCopy: 429 → rate_limited, 404 → closed, known code → its line, unknown → generic", () => {
    expect(errorCopy(COPY, "duplicate", 409)).toBe("dup");
    expect(errorCopy(COPY, "anything", 429)).toBe("slow down");
    expect(errorCopy(COPY, "not_found", 404)).toBe("closed");
    expect(errorCopy(COPY, "deck_too_large", 413)).toBe("too big");
    expect(errorCopy(COPY, "weird", 500)).toBe("generic");
    expect(errorCopy(COPY, undefined, 502)).toBe("generic");
  });
});
