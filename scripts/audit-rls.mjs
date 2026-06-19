import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

const REVIEW_MARKER = /SECURITY_REVIEWED:\s*anon-public-access/i;
const LEGACY_REVIEWED_ANON_MIGRATIONS = new Set([
  "20260611055007_af3bdce8-7079-4ab2-a95b-a230efb0cd6b.sql", // public profile display for shared projects/authors
  "20260611060044_d05d9c12-db77-4fb3-84bf-6e01f17e1164.sql", // read-only public project sharing
  "20260611070618_1fe0e781-e950-465c-b162-db5d68e06f3d.sql", // read-only pricing plan catalog
  "20260611070645_7fdf4250-40a0-48f8-8ca1-af7c2c79382e.sql", // explicit deny policy for server-only payment events
  "20260619182234_f14656b8-870e-4086-9006-80045cf9e6e5.sql", // read-only public deployment snapshots
  "20260619183357_3bae5e35-21ec-4a21-94ed-a82e0ab53bb8.sql", // read-only public marketplace templates/ratings
]);
const CREATE_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][\w]*)/gi;
const ENABLE_RLS_RE = (table) => new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
const GRANT_RE = (table) => new RegExp(`grant\\s+[^;]+\\s+on\\s+public\\.${table}\\s+to\\s+[^;]+;`, "i");
const POLICY_RE = (table) => new RegExp(`create\\s+policy\\s+[\\s\\S]+?on\\s+public\\.${table}\\b`, "i");
const ANON_ACCESS_RE = /\b(to\s+anon|grant\s+(select|insert|update|delete|all)[^;]+\s+to\s+[^;]*\banon\b|using\s*\(\s*true\s*\))/i;
const MUTATING_ANON_POLICY_RE = /create\s+policy[\s\S]+?for\s+(all|insert|update|delete)\s+to\s+anon\b[\s\S]+?;/gi;
const DENY_ALL_RE = /using\s*\(\s*false\s*\)(?:\s*with\s+check\s*\(\s*false\s*\))?/i;

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

  if (ANON_ACCESS_RE.test(normalized) && !REVIEW_MARKER.test(sql) && !LEGACY_REVIEWED_ANON_MIGRATIONS.has(filename)) {
    failures.push(`${filename}: anon/public access requires '-- SECURITY_REVIEWED: anon-public-access <reason>'`);
  }

  for (const policy of normalized.matchAll(MUTATING_ANON_POLICY_RE)) {
    if (!DENY_ALL_RE.test(policy[0])) {
      failures.push(`${filename}: mutating policies for anon are forbidden unless they explicitly deny access with USING (false)`);
    }
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