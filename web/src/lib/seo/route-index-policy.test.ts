import { expect, it } from "vitest";
import { isPrivateDiscoveryPath, recordedModifiedAt, PUBLIC_DEMO_ROBOTS_ALLOW } from "./route-index-policy";
import { pageMetadata } from "./page-meta";
it("keeps credential/private routes out of discovery without hiding public profiles", () => {
 for (const path of ["/workspace", "/admin/a", "/vi/dashboard", "/es/workspace/a", "/auth/login?next=/", "/analyze/private-id", "/tbr/token", "/funding/report/private-id", "/apply/token", "/invites/token", "/s/dr/token", "/s/p/slug", "/verify/proof", "/compliance/esic", "/innovator/watchlist"]) {
  expect(isPrivateDiscoveryPath(path),path).toBe(true);
  expect(pageMetadata({path,title:"Fixture",description:"Fixture",index:true}).robots).toEqual({index:false,follow:false});
 }
 for (const path of ["/", "/pricing", "/analyze", "/id/public", "/reports/PUBLIC", "/listings/published", "/tbr/demo", "/tbr/demo?band=A", "/tbr/demo/band/A", "/funding/report/demo", "/dashboard-guide"]) expect(isPrivateDiscoveryPath(path),path).toBe(false);
});
it("demo crawl exception never opens another token",()=>{
 expect(PUBLIC_DEMO_ROBOTS_ALLOW).toEqual(["/tbr/demo$","/tbr/demo?","/tbr/demo/"]);
 expect(PUBLIC_DEMO_ROBOTS_ALLOW).not.toContain("/tbr/");
});
it("only real stored dates provide modification evidence",()=>{
 expect(recordedModifiedAt(undefined)).toBeUndefined();expect(recordedModifiedAt("bad")).toBeUndefined();
 expect(recordedModifiedAt("2026-09-20")?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
});
