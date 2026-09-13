// Colocated vitest for lib/investor-drips/templates — the S26-A data-room
// follow-up render. Pins: subject and greeting, the section count only when
// it is worth mentioning, the founder's sign-off, the passed-in footer
// (unsubFooter HTML, rendered by the caller), HTML escaping of every
// caller-supplied string, and a plain-text twin.

import { describe, expect, it } from "vitest";
import { renderDataRoomFollowUp } from "./templates";

const base = {
  founderName: "Sam Founder",
  startupName: "Acme <Pty>",
  investorName: "Jane",
  roomUrl: "https://blockid.au/s/dr/abc",
  sectionsViewed: 3,
  footerHtml: "<footer>UNSUB</footer>",
};

describe("renderDataRoomFollowUp", () => {
  it("renders subject, greeting, section count, sign-off, footer and a text twin", () => {
    const r = renderDataRoomFollowUp(base);
    expect(r.subject).toBe("Following up on the Acme <Pty> data room");
    expect(r.html).toContain("Hi Jane,");
    expect(r.html).toContain("opened 3 sections");
    expect(r.html).toContain("Sam Founder<br>Acme &lt;Pty&gt;");
    expect(r.html).toContain("<footer>UNSUB</footer>");
    expect(r.html).toContain('href="https://blockid.au/s/dr/abc"');
    expect(r.html).not.toContain("Acme <Pty>");
    expect(r.text).toContain("https://blockid.au/s/dr/abc");
    expect(r.text).toContain("Sam Founder");
  });

  it("omits the section count below two and greets neutrally without a name", () => {
    const r = renderDataRoomFollowUp({ ...base, investorName: null, sectionsViewed: 1 });
    expect(r.html).toContain("Hi,");
    expect(r.html).not.toContain("sections");
    expect(r.html).toContain("Thanks for opening");
  });

  it("says it is the only follow-up for the link", () => {
    expect(renderDataRoomFollowUp(base).html).toContain("This is the only follow-up for that link");
  });
});
