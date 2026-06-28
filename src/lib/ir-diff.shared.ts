// B6 — Deterministic IR/file diff utilities. Pure, client-safe, and stable.
import type { GeneratedFile } from "./ir.shared";

export type PatchLine = {
  kind: "context" | "add" | "remove";
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

export type PatchFile = {
  path: string;
  language: string;
  status: "added" | "modified" | "removed" | "unchanged";
  before: string;
  after: string;
  linesAdded: number;
  linesRemoved: number;
  hunks: PatchLine[];
};

export type PatchStats = {
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
  linesAdded: number;
  linesRemoved: number;
};

export function languageForPath(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

export function diffGeneratedFiles(before: GeneratedFile[], after: GeneratedFile[]): { files: PatchFile[]; stats: PatchStats } {
  const beforeMap = new Map(before.map((file) => [file.path, file.content]));
  const afterMap = new Map(after.map((file) => [file.path, file.content]));
  const paths = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()])).sort((a, b) => a.localeCompare(b));

  const files = paths.map((path) => {
    const oldText = beforeMap.get(path) ?? "";
    const newText = afterMap.get(path) ?? "";
    const existsBefore = beforeMap.has(path);
    const existsAfter = afterMap.has(path);
    const status: PatchFile["status"] = !existsBefore ? "added" : !existsAfter ? "removed" : oldText === newText ? "unchanged" : "modified";
    const hunks = status === "unchanged" ? [] : lineDiff(oldText, newText);
    const linesAdded = hunks.filter((line) => line.kind === "add").length;
    const linesRemoved = hunks.filter((line) => line.kind === "remove").length;
    return { path, language: languageForPath(path), status, before: oldText, after: newText, linesAdded, linesRemoved, hunks };
  });

  const stats = files.reduce<PatchStats>((acc, file) => {
    acc[file.status] += 1;
    acc.linesAdded += file.linesAdded;
    acc.linesRemoved += file.linesRemoved;
    return acc;
  }, { added: 0, modified: 0, removed: 0, unchanged: 0, linesAdded: 0, linesRemoved: 0 });

  return { files, stats };
}

function lineDiff(before: string, after: string): PatchLine[] {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);

  if (oldLines.length === 0) return newLines.map((text, index) => ({ kind: "add", oldLine: null, newLine: index + 1, text }));
  if (newLines.length === 0) return oldLines.map((text, index) => ({ kind: "remove", oldLine: index + 1, newLine: null, text }));

  // Bound the LCS matrix so huge generated assets do not lock the UI or server worker.
  if (oldLines.length * newLines.length > 80_000) {
    return [
      ...oldLines.map((text, index) => ({ kind: "remove" as const, oldLine: index + 1, newLine: null, text })),
      ...newLines.map((text, index) => ({ kind: "add" as const, oldLine: null, newLine: index + 1, text })),
    ];
  }

  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: PatchLine[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      out.push({ kind: "context", oldLine: i + 1, newLine: j + 1, text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "remove", oldLine: i + 1, newLine: null, text: oldLines[i] });
      i += 1;
    } else {
      out.push({ kind: "add", oldLine: null, newLine: j + 1, text: newLines[j] });
      j += 1;
    }
  }
  while (i < oldLines.length) out.push({ kind: "remove", oldLine: i + 1, newLine: null, text: oldLines[i++] });
  while (j < newLines.length) out.push({ kind: "add", oldLine: null, newLine: j + 1, text: newLines[j++] });
  return compactContext(out);
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\n$/, "").split(/\r?\n/);
}

function compactContext(lines: PatchLine[]): PatchLine[] {
  const changed = new Set<number>();
  lines.forEach((line, index) => { if (line.kind !== "context") changed.add(index); });
  if (changed.size === 0) return [];
  return lines.filter((line, index) => line.kind !== "context" || [...changed].some((changedIndex) => Math.abs(changedIndex - index) <= 3));
}