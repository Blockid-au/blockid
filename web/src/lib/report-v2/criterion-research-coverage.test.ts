import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { demoReportV2 } from "./fixtures";
import { criterionResearchCoverage, withCriterionResearchCoverage } from "./criterion-research-coverage";
import { projectBusinessFindings } from "./business-findings";
import { BusinessFindings } from "@/components/analyze/business-findings";
import { isReportV2 } from "./schema";
const fixture = () => {
 const report=demoReportV2();
 report.appendix.publicResearch={version:"public-sources-v1",task:{criterion:"market",question:"Which alternatives serve these buyers?",businessScope:{name:"Fixture",projectId:null}},status:"found",discovery:{status:"not_run",reason:"No discovery"},sources:[{id:"public-fixture",url:"https://example.com/product",title:"Product",role:"market_or_alternative",status:"found",reason:"Retrieved",fetchedAt:"2026-09-22",publishedAt:null,contentSha256:"a".repeat(64),excerpt:"Publisher product description",relevance:"not_assessed",citable:false}],limits:{requested:1,attempted:1,maxSources:5,targetAlternatives:5,verifiedAlternatives:0},instruction:"Source statements only"};
 return report;
};
it("old reports and deck citations do not imply external research",()=>{
 const report=demoReportV2();delete report.appendix.publicResearch;
 expect(criterionResearchCoverage({key:"market"},report).status).toBe("not_recorded");expect(isReportV2(report)).toBe(true);
});
it("writer records market retrieval only on matching criterion without a verified comparison",()=>{
 const report=fixture();
 expect(criterionResearchCoverage({key:"market"},report)).toMatchObject({status:"sources_retrieved",retrievedSourceIds:["public-fixture"],comparison:"not_assessed",businessImplication:"not_recorded"});
 expect(criterionResearchCoverage({key:"team"},report).status).toBe("not_recorded");
 const projected=withCriterionResearchCoverage(report);expect(isReportV2(projected)).toBe(true);expect(projected.dimensions.flatMap(d=>d.criteria).every(c=>c.researchCoverage)).toBe(true);
});
it("found summary without usable source is not retrieval proof",()=>{
 const report=fixture();report.appendix.publicResearch!.sources[0].excerpt="";
 expect(criterionResearchCoverage({key:"market"},report).status).toBe("not_recorded");
 report.appendix.publicResearch!.status="blocked";expect(criterionResearchCoverage({key:"market"},report).status).toBe("blocked");
});
it("reader discloses recorded coverage and missing implications in both locales",()=>{
 const report=fixture();const english=renderToStaticMarkup(createElement(BusinessFindings,{findings:projectBusinessFindings({report})}));
 expect(english).toContain('data-criterion-research="sources_retrieved"');expect(english).toContain("not verified conclusions");expect(english).toContain("A business-specific implication");expect(english).toContain("Investor relevance — diligence guidance");
 const vi=renderToStaticMarkup(createElement(BusinessFindings,{locale:"vi",findings:projectBusinessFindings({report,locale:"vi"})}));expect(vi).toContain("Phạm vi nghiên cứu đã ghi nhận");expect(vi).toContain("chưa phải kết luận đã kiểm chứng");
});

it("reader reprojects evidence instead of trusting stale optional coverage",()=>{
 const report=withCriterionResearchCoverage(fixture());delete report.appendix.publicResearch;
 const market=projectBusinessFindings({report}).flatMap(f=>f.criteria).find(c=>c.id==="market");
 expect(market?.researchCoverage?.status).toBe("not_recorded");
});
