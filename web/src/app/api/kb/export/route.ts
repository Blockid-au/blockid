// POST /api/kb/export — admin-only. Serialises full KB to a Markdown file in
// web/content/reports/ and returns a download URL. Also logs the export.
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const supabase = getSupabaseAdmin()!;
  const [{ data: articles }, { data: methodologies }] = await Promise.all([
    supabase.from("kb_articles").select("*").order("category").order("title"),
    supabase.from("kb_methodologies").select("*").order("type").order("name"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`---`);
  lines.push(`title: "BlockID Knowledge Base Export"`);
  lines.push(`date: "${today}"`);
  lines.push(`exported_by: "${user.email}"`);
  lines.push(`article_count: ${articles?.length ?? 0}`);
  lines.push(`methodology_count: ${methodologies?.length ?? 0}`);
  lines.push(`---`);
  lines.push("");
  lines.push(`# BlockID Knowledge Base — Export ${today}`);
  lines.push("");
  lines.push("BlockID Startup Index™ proprietary knowledge base. Confidential.");
  lines.push("");

  lines.push(`## Methodologies (${methodologies?.length ?? 0})`);
  lines.push("");
  for (const m of methodologies ?? []) {
    lines.push(`### ${m.name} _(${m.type})_`);
    lines.push("");
    lines.push(m.description);
    lines.push("");
    if (m.formula) {
      lines.push("**Formula:** " + m.formula);
      lines.push("");
    }
    if (m.formula_code) {
      lines.push("```ts");
      lines.push(m.formula_code);
      lines.push("```");
      lines.push("");
    }
    if (Array.isArray(m.inputs) && m.inputs.length > 0) {
      lines.push("**Inputs:**");
      for (const i of m.inputs as Array<{ name: string; type: string; description: string; required?: boolean }>) {
        lines.push(`- \`${i.name}\` (${i.type})${i.required ? " *required*" : ""} — ${i.description}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push(`## Articles (${articles?.length ?? 0})`);
  lines.push("");
  const byCategory = new Map<string, typeof articles>();
  for (const a of articles ?? []) {
    if (!byCategory.has(a.category)) byCategory.set(a.category, [] as typeof articles);
    byCategory.get(a.category)!.push(a);
  }
  for (const [cat, items] of byCategory) {
    lines.push(`### Category: ${cat}`);
    lines.push("");
    for (const a of items ?? []) {
      lines.push(`#### ${a.title}`);
      lines.push(`_by ${a.author} · slug: \`${a.slug}\` · v${a.version}_`);
      lines.push("");
      lines.push(a.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  lines.push(`*BlockID Startup Index™ — Proprietary Knowledge Base — Confidential — ${today}*`);

  const filename = `kb-export-${today}.md`;
  const relPath = `content/reports/${filename}`;
  const absPath = resolve(process.cwd(), relPath);
  await mkdir(resolve(process.cwd(), "content/reports"), { recursive: true });
  await writeFile(absPath, lines.join("\n"), "utf8");

  await supabase.from("kb_exports").insert({
    exported_by: user.email,
    export_type: "full",
    file_path: relPath,
    article_count: articles?.length ?? 0,
  });

  return NextResponse.json({
    ok: true,
    url: `/api/kb/export/${filename}`,
    article_count: articles?.length ?? 0,
    methodology_count: methodologies?.length ?? 0,
  });
}
