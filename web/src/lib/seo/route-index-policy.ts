/** Shared discovery exclusions, not authorization. Public profile publishers
 * still decide visibility in their database-backed sitemap loaders. */
export const PRIVATE_PAGE_ROBOTS = { index: false, follow: false } as const;
const PRIVATE_ROOTS = new Set(["auth", "onboarding", "admin", "workspace", "dashboard", "checkout", "reseller", "apply", "invites", "unsubscribe", "nps", "s", "verify", "compliance", "innovator"]);
export const PUBLIC_DEMO_ROBOTS_ALLOW = ["/tbr/demo$", "/tbr/demo?", "/tbr/demo/"];
export function isPrivateDiscoveryPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  const parts = pathname.split("/").filter(Boolean);
  if (["vi", "es", "ja"].includes(parts[0])) parts.shift();
  if (PRIVATE_ROOTS.has(parts[0])) return true;
  if (parts[0] === "analyze" && parts.length > 1) return true;
  if (parts[0] === "tbr") return parts[1] !== "demo";
  if (parts[0] === "funding" && parts[1] === "report" && parts.length > 2) return parts[2] !== "demo";
  return false;
}
/** Omit unknown timestamps rather than claiming every request modified content. */
export function recordedModifiedAt(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
