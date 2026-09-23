import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareVisualImage, VISUAL_IMAGE_LIMITS } from "./visual-image";

const image = () => sharp({ create: { width: 40, height: 20, channels: 3, background: "white" } });

describe("bounded local visual image preparation", () => {
  it.each(["png", "jpeg", "webp"] as const)("decodes real %s bytes and preserves coordinate dimensions", async format => {
    const input = await image().toFormat(format).toBuffer();
    const prepared = await prepareVisualImage(input);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error("fixture failed");
    expect(prepared).toMatchObject({ width: 40, height: 20, mimeType: "image/png", transformVersion: "upright-png-v1" });
    expect((await sharp(prepared.bytes).metadata()).format).toBe("png");
    expect((await prepareVisualImage(input))).toEqual(prepared);
  });
  it("applies orientation before coordinates and strips EXIF", async () => {
    const input = await image().withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const prepared = await prepareVisualImage(input);
    if (!prepared.ok) throw new Error("fixture failed");
    expect(prepared).toMatchObject({ width: 20, height: 40 });
    const meta = await sharp(prepared.bytes).metadata();
    expect(meta.exif).toBeUndefined(); expect(meta.orientation).toBeUndefined();
  });
  it("rejects non-images, SVG and truncated image bytes", async () => {
    for (const bytes of [Buffer.from("not a file"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')]) expect(await prepareVisualImage(bytes)).toEqual({ ok: false, reason: "unsupported_image" });
    const png = await image().png().toBuffer();
    expect(await prepareVisualImage(png.subarray(0, 40))).toEqual({ ok: false, reason: "invalid_image" });
  });
  it("enforces compressed byte and decoded edge limits", async () => {
    expect(await prepareVisualImage(Buffer.alloc(VISUAL_IMAGE_LIMITS.bytes + 1))).toEqual({ ok: false, reason: "image_too_large" });
    const wide = await sharp({ create: { width: VISUAL_IMAGE_LIMITS.edge + 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    expect(await prepareVisualImage(wide)).toEqual({ ok: false, reason: "image_too_large" });
  });
});
