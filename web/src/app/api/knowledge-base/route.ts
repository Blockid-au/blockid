import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

const KB_DIR = "/home/dovanlong/blockid.au/.claude/knowledge-base";

interface KBModule {
  name: string;
  category: string;
  path: string;
  content: string;
  size: number;
}

function loadModule(filePath: string, category: string): KBModule | null {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return {
      name: path.basename(filePath, ".md"),
      category,
      path: filePath.replace(KB_DIR + "/", ""),
      content,
      size: content.length,
    };
  } catch {
    return null;
  }
}

function getAllModules(): KBModule[] {
  const modules: KBModule[] = [];
  try {
    const categories = fs.readdirSync(KB_DIR);
    for (const cat of categories) {
      const catPath = path.join(KB_DIR, cat);
      if (!fs.statSync(catPath).isDirectory()) continue;
      const files = fs.readdirSync(catPath).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const mod = loadModule(path.join(catPath, file), cat);
        if (mod) modules.push(mod);
      }
    }
  } catch {
    return [];
  }
  return modules;
}

// GET /api/knowledge-base — list all modules or search
// GET /api/knowledge-base?category=esop — filter by category
// GET /api/knowledge-base?q=ESOP+pool — search content
// GET /api/knowledge-base?module=esop/esop-expertise — full content
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const query = searchParams.get("q");
  const modulePath = searchParams.get("module");

  const modules = getAllModules();

  if (modulePath) {
    const mod = modules.find(m => m.path === modulePath + ".md" || m.path === modulePath);
    if (!mod) {
      return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, module: mod });
  }

  let filtered = modules;
  if (category) {
    filtered = filtered.filter(m => m.category === category);
  }
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    ok: true,
    modules: filtered.map(m => ({
      name: m.name,
      category: m.category,
      path: m.path,
      size: m.size,
      preview: m.content.slice(0, 300),
    })),
    total: filtered.length,
  });
}
