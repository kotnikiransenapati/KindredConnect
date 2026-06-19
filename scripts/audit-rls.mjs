import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

const REVIEW_MARKER = /SECURITY_REVIEWED:\s*anon-public-access/i;
const CREATE_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][\w]*)/gi;
const ENABLE_RLS_RE = (table) => new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
const GRANT_RE = (table) => new RegExp(`grant\\s+[^;]+\\s+on\\s+public\\.${table}\\s+to\\s+[^;]+;`, "i");
const POLICY_RE = (table) => new RegExp(`create\\s+policy\\s+[\\s\\S]+?on\\s+public\\.${table}\\b`, "i");
const ANON_ACCESS_RE = /\b(to\s+anon|grant\s+(select|insert|update|delete|all)[^;]+\s+to\s+[^;]*\banon\b|using\s*\(\s*true\s*\))/i;
const DANGEROUS_PUBLIC_POLICY_RE = /for\s+(all|insert|update|delete)\s+to\s+anon\b/i;

const failures = [];
const warnings = [];

for (const filename of readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()) {
  const path = join(migrationsDir, filename);
  const sql = readFileSync(path, "utf8");
  const normalized = sql.replace(/--.*$/gm, "");

  for (const match of sql.matchAll(CREATE_TABLE_RE)) {
    const table = match[1];
    if (!GRANT_RE(table).test(sql)) failures.push(`${filename}: public.${table} is created without an explicit GRANT block`);
    if (!ENABLE_RLS_RE(table).test(sql)) failures.push(`${filename}: public.${table} is created without ENABLE ROW LEVEL SECURITY`);
    if (!POLICY_RE(table).test(sql)) failures.push(`${filename}: public.${table} is created without at least one RLS policy`);
  }

  if (ANON_ACCESS_RE.test(normalized) && !REVIEW_MARKER.test(sql)) {
    failures.push(`${filename}: anon/public access requires '-- SECURITY_REVIEWED: anon-public-access <reason>'`);
  }

  if (DANGEROUS_PUBLIC_POLICY_RE.test(normalized)) {
    failures.push(`${filename}: mutating policies for anon are forbidden`);
  }

  if (/security\s+definer/i.test(normalized) && !/set\s+search_path\s*=/i.test(normalized)) {
    warnings.push(`${filename}: SECURITY DEFINER function should pin search_path`);
  }
}

if (warnings.length > 0) {
  console.warn(["RLS audit warnings:", ...warnings.map((warning) => `  - ${warning}`)].join("\n"));
}

if (failures.length > 0) {
  console.error(["RLS audit failed:", ...failures.map((failure) => `  - ${failure}`)].join("\n"));
  process.exit(1);
}

console.log("RLS audit passed.");