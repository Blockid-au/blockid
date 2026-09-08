// Colocated tests for the A$3 guest checkout island. Uses
// renderToStaticMarkup (this workspace has no @testing-library/react) for the
// markup assertions, and a stubbed global fetch for the request-shape
// assertions — the contract must stay byte-identical to one-click-form.tsx,
// because that shape is what /api/guest-analysis/create-order validates.

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GuestPaidCheckout, startGuestCheckout } from "./guest-paid-checkout";

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuestPaidCheckout render", () => {
  it("renders nothing when closed", () => {
    expect(
      html(
        <GuestPaidCheckout
          open={false}
          onClose={() => {}}
          inputType="website_url"
          url="https://example.com"
        />,
      ),
    ).toBe("");
  });

  it("renders the price CTA and email field when open", () => {
    const out = html(
      <GuestPaidCheckout
        open
        onClose={() => {}}
        inputType="website_url"
        url="https://example.com"
      />,
    );
    expect(out).toContain("guest-paid-checkout");
    expect(out).toContain("guest-paid-email");
    expect(out).toContain("A$3");
  });
});

describe("startGuestCheckout request contract", () => {
  it("posts website_url orders straight to create-order", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return {
          ok: true,
          json: async () => ({ checkoutUrl: "https://checkout.stripe.com/x" }),
        } as unknown as Response;
      }),
    );

    const out = await startGuestCheckout({
      email: "Founder@Example.com ",
      inputType: "website_url",
      url: " https://example.com ",
    });

    expect(out).toBe("https://checkout.stripe.com/x");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("/api/guest-analysis/create-order");
    const body = JSON.parse(String(calls[0][1]?.body));
    expect(body).toMatchObject({
      email: "founder@example.com",
      inputType: "website_url",
      inputValue: "https://example.com",
    });
  });

  it("uploads the pitch first, then creates the order with the returned path", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(url);
        if (url === "/api/guest-analysis/upload-pitch") {
          return {
            ok: true,
            json: async () => ({
              inputValue: "guest/abc.pdf",
              filename: "deck.pdf",
            }),
          } as unknown as Response;
        }
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          inputType: "pitch_file",
          inputValue: "guest/abc.pdf",
          inputFilename: "deck.pdf",
        });
        return {
          ok: true,
          json: async () => ({ checkoutUrl: "https://checkout.stripe.com/y" }),
        } as unknown as Response;
      }),
    );

    const file = new File(["x"], "deck.pdf", { type: "application/pdf" });
    const out = await startGuestCheckout({
      email: "a@b.com",
      inputType: "pitch_file",
      file,
    });
    expect(out).toBe("https://checkout.stripe.com/y");
    expect(urls).toEqual([
      "/api/guest-analysis/upload-pitch",
      "/api/guest-analysis/create-order",
    ]);
  });

  it("surfaces the server error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: false,
          json: async () => ({ error: "Invalid email" }),
        }) as unknown as Response,
      ),
    );
    await expect(
      startGuestCheckout({
        email: "a@b.com",
        inputType: "website_url",
        url: "https://example.com",
      }),
    ).rejects.toThrow("Invalid email");
  });
});
