import { cookies } from "next/headers";

export type Locale = "en" | "vi";

/**
 * Read the preferred locale from the `blockid_lang` cookie (server-side).
 * Falls back to "en" when the cookie is absent or invalid.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get("blockid_lang")?.value;
  return raw === "vi" ? "vi" : "en";
}
