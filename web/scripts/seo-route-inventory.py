#!/usr/bin/env python3
"""Static route/metadata declarations only; no live URLs or private DB rows."""
from pathlib import Path
import json,re
base=Path(__file__).resolve().parents[1]/'src/app'
rows=[]
for page in sorted(base.rglob('page.*')):
 if page.name not in ('page.tsx','page.ts','page.mdx'):continue
 parts=page.relative_to(base).parts[:-1]
 route='/'+'/'.join(p for p in parts if not p.startswith(('(','@')))
 source=page.read_text()
 rows.append({'route':route,'source':str(page.relative_to(base)),
  'authenticatedGroup':'(app)' in parts,
  'localMetadataDeclaration':bool(re.search(r'export (?:const metadata|async function generateMetadata|function generateMetadata)',source)),
  'localNoindexDeclaration':bool(re.search(r'index:\s*false',source)),
  'sharedMetadataHelper':'pageMetadata(' in source,
  'localCanonicalDeclaration':'canonical:' in source,
  'dynamicSegments':'[' in route})
print(json.dumps({'scope':'source declarations, not computed inheritance or live indexability','pageCount':len(rows),'authenticatedGroupCount':sum(r['authenticatedGroup'] for r in rows),'routes':rows},indent=2))
