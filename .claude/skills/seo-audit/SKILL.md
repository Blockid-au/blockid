---
name: seo-audit
description: "Run a comprehensive SEO audit on blockid.au — meta tags, sitemap, structured data, page speed, mobile, indexing. Use when user says 'seo audit', 'check seo', or 'search optimization'."
---

# SEO Audit — BlockID.au

Run a full SEO audit on the live site and codebase.

## Steps

1. **Meta Tags Audit**
   - Check every page in `src/app/` for `export const metadata` or `generateMetadata`
   - Verify: title (< 60 chars), description (< 155 chars), OG image, Twitter card
   - Flag any pages missing metadata

2. **Sitemap Check**
   - Fetch `https://blockid.au/sitemap.xml`
   - Count URLs, verify all public pages are included
   - Check for any 404 URLs in sitemap

3. **Structured Data**
   - Check for JSON-LD in layout.tsx (Organization, SoftwareApplication)
   - Verify schema.org markup is valid

4. **Page Speed**
   - Check response times: `curl -s -o /dev/null -w "%{time_total}" https://blockid.au/`
   - Check for large images without optimization
   - Verify Next.js Image component usage

5. **Mobile & Accessibility**
   - Check viewport meta tag
   - Check for responsive classes (Tailwind)
   - Verify aria labels on interactive elements

6. **Google Search Console**
   - Verify GSC verification file exists
   - Check robots.txt allows crawling
   - Submit sitemap if not done

7. **Content Audit**
   - Count /insights articles
   - Check for missing alt tags on images
   - Verify internal linking (CTAs point to tools/score)

**Output:** Report with PASS/FAIL/WARN for each check, with specific fix recommendations.