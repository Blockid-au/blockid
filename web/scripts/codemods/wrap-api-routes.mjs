#!/usr/bin/env node
// S20-A — codemod: wrap every mutating API route handler with `apiRoute()`.
//
//   node scripts/codemods/wrap-api-routes.mjs            # dry run (default)
//   node scripts/codemods/wrap-api-routes.mjs --write    # rewrite files
//   node scripts/codemods/wrap-api-routes.mjs --write --catalogue
//                                                        # also regenerate
//                                                        # src/lib/audit/catalogue.generated.ts
//
// What it does, per `src/app/api/**/route.ts` that is not allow-listed
// (src/lib/audit/allowlist.json):
//
//   export async function POST(req: Request) { … }      →  async function POST_handler(req: Request) { … }
//   export const PATCH = patchHandler(CFG);              →  const PATCH_handler = patchHandler(CFG);
//
//   + `import { apiRoute } from "@/lib/audit/api-route";` after the last import
//   + `export const POST = apiRoute({ route: "api/…/route.ts", method: "POST" }, POST_handler);`
//     appended at the end of the file (one line per method).
//
// GET / HEAD / OPTIONS are never touched. `export { POST as GET }` keeps
// working because `POST` is still an exported binding. The transform is
// idempotent: a method that is already `export const X = apiRoute(` is
// skipped, so re-running on a wrapped file is a no-op.
//
// `transformSource()` is pure and exported for the colocated test.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const IMPORT_LINE = 'import { apiRoute } from "@/lib/audit/api-route";';
const MARKER = "// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.";

// ---------------------------------------------------------------------------
// Allow-list
// ---------------------------------------------------------------------------

/** `api/cron/**` → regex; `**` = any depth, `*` = one segment. */
export function patternToRegex(pattern) {
  const esc = pattern
    .split("**")
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${esc}$`);
}

export function isAllowListed(routeRel, entries) {
  return entries.find((e) => patternToRegex(e.pattern).test(routeRel)) ?? null;
}

// ---------------------------------------------------------------------------
// Source transform (pure)
// ---------------------------------------------------------------------------

const FN_RE = /^export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(/gm;
const CONST_RE = /^export\s+(const|let)\s+(POST|PUT|PATCH|DELETE)\b(\s*:[^=]+)?\s*=/gm;
const WRAPPED_RE = /^export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=\s*apiRoute\s*\(/gm;

export function wrappedMethods(src) {
  const out = new Set();
  for (const m of src.matchAll(WRAPPED_RE)) out.add(m[1]);
  return out;
}

/** Mutating methods a route file exports (any export form). */
export function exportedMutationMethods(src) {
  const out = new Set();
  for (const m of src.matchAll(FN_RE)) out.add(m[2]);
  for (const m of src.matchAll(CONST_RE)) out.add(m[2]);
  for (const m of src.matchAll(WRAPPED_RE)) out.add(m[1]);
  // export { GET as POST } / export { POST }
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const piece of m[1].split(",")) {
      const p = piece.trim();
      if (!p) continue;
      const as = p.match(/^\w+\s+as\s+(\w+)$/);
      const name = as ? as[1] : p;
      if (MUTATION_METHODS.includes(name)) out.add(name);
    }
  }
  return out;
}

function lastImportEnd(src) {
  let end = -1;
  const re = /^import\s[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$|^import\s+["'][^"']+["'];?[ \t]*$/gm;
  for (const m of src.matchAll(re)) {
    const e = m.index + m[0].length;
    if (e > end) end = e;
  }
  return end;
}

/**
 * Returns `{ changed, src, methods }` — `methods` are the ones wrapped by
 * this pass (empty when nothing to do). Never touches GET.
 */
export function transformSource(src, routeRel) {
  const already = wrappedMethods(src);
  const todo = [];
  let out = src;

  out = out.replace(FN_RE, (whole, asyncKw, method) => {
    if (already.has(method)) return whole;
    todo.push(method);
    return `${asyncKw ?? ""}function ${method}_handler(`;
  });
  out = out.replace(CONST_RE, (whole, kw, method, typeAnn) => {
    if (already.has(method) || todo.includes(method)) return whole;
    todo.push(method);
    return `${kw} ${method}_handler${typeAnn ?? ""} =`;
  });

  if (todo.length === 0) return { changed: false, src, methods: [] };

  if (!out.includes(IMPORT_LINE)) {
    const at = lastImportEnd(out);
    out = at >= 0 ? out.slice(0, at) + "\n" + IMPORT_LINE + out.slice(at) : IMPORT_LINE + "\n" + out;
  }

  const lines = todo
    .sort((a, b) => MUTATION_METHODS.indexOf(a) - MUTATION_METHODS.indexOf(b))
    .map(
      (m) =>
        `export const ${m} = apiRoute({ route: ${JSON.stringify(routeRel)}, method: "${m}" }, ${m}_handler);`,
    );
  const tail = (out.includes(MARKER) ? "" : "\n" + MARKER + "\n") + lines.join("\n") + "\n";
  out = out.replace(/\s*$/, "\n") + tail;
  return { changed: true, src: out, methods: todo };
}

// ---------------------------------------------------------------------------
// Catalogue (src/lib/audit/catalogue.generated.ts)
// ---------------------------------------------------------------------------

export function routeFamily(route) {
  return (
    route
      .replace(/^api\//, "")
      .replace(/\/?route\.tsx?$/, "")
      .split("/")
      .filter((s) => s && !s.startsWith("[") && !s.startsWith("("))
      .map((s) => s.replace(/[^a-z0-9_-]/gi, "").toLowerCase())
      .filter(Boolean)
      .join(".") || "root"
  );
}

export function renderCatalogue(rows) {
  const sorted = [...rows].sort((a, b) => a.route.localeCompare(b.route));
  const body = sorted
    .map(
      (r) =>
        `  { route: ${JSON.stringify(r.route)}, family: ${JSON.stringify(r.family)}, methods: ${JSON.stringify(r.methods)} },`,
    )
    .join("\n");
  return [
    "// GENERATED by scripts/codemods/wrap-api-routes.mjs --catalogue — do not edit.",
    "// S20-A audit catalogue: every mutating API route wrapped with apiRoute(),",
    "// its route family and the mutation methods it exports. `coverage.test.ts`",
    "// fails when this drifts from the route tree.",
    "",
    "export interface AuditCatalogueRow {",
    "  route: string;",
    "  family: string;",
    '  methods: readonly ("POST" | "PUT" | "PATCH" | "DELETE")[];',
    "}",
    "",
    "export const AUDIT_ROUTE_CATALOGUE: readonly AuditCatalogueRow[] = Object.freeze([",
    body,
    "]);",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Walk + CLI
// ---------------------------------------------------------------------------

export function walkRoutes(root, out = []) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const name of entries) {
    const abs = join(root, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkRoutes(abs, out);
    else if (st.isFile() && name === "route.ts") out.push(abs);
  }
  return out;
}

export function runCodemod({ webRoot, write = false, catalogue = false, log = console.log }) {
  const appRoot = join(webRoot, "src", "app");
  const apiRoot = join(appRoot, "api");
  const allow = JSON.parse(readFileSync(join(webRoot, "src", "lib", "audit", "allowlist.json"), "utf8")).entries;

  const files = walkRoutes(apiRoot).sort();
  const summary = { scanned: 0, mutating: 0, allowListed: 0, alreadyWrapped: 0, wrapped: 0, changedFiles: [], catalogue: [] };

  for (const abs of files) {
    const rel = relative(appRoot, abs).replace(/\\/g, "/");
    const src = readFileSync(abs, "utf8");
    summary.scanned++;
    const methods = exportedMutationMethods(src);
    if (methods.size === 0) continue;
    summary.mutating++;
    if (isAllowListed(rel, allow)) {
      summary.allowListed++;
      continue;
    }
    const res = transformSource(src, rel);
    const wrappedNow = exportedMutationMethods(res.src);
    summary.catalogue.push({ route: rel, family: routeFamily(rel), methods: [...wrappedNow].sort((a, b) => MUTATION_METHODS.indexOf(a) - MUTATION_METHODS.indexOf(b)) });
    if (!res.changed) {
      summary.alreadyWrapped++;
      continue;
    }
    summary.wrapped++;
    summary.changedFiles.push(rel);
    if (write) writeFileSync(abs, res.src);
    log(`${write ? "wrote " : "would wrap"} ${rel} [${res.methods.join(",")}]`);
  }

  if (catalogue && write) {
    writeFileSync(join(webRoot, "src", "lib", "audit", "catalogue.generated.ts"), renderCatalogue(summary.catalogue));
    log(`catalogue: ${summary.catalogue.length} routes`);
  }
  return summary;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const s = runCodemod({ webRoot, write: args.has("--write"), catalogue: args.has("--catalogue") });
  console.log(
    `scanned=${s.scanned} mutating=${s.mutating} allowListed=${s.allowListed} alreadyWrapped=${s.alreadyWrapped} ${args.has("--write") ? "wrapped" : "wouldWrap"}=${s.wrapped}`,
  );
}
