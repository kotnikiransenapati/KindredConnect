/**
 * Curated catalog of models exposed by the Lovable AI Gateway.
 * Cost is USD per 1M tokens (input/output) — used by the multi-model
 * router to honor per-task cost caps.
 */
export type TaskKind = "chat" | "code" | "reasoning" | "cheap" | "vision" | "embedding";
export type QualityTier = "low" | "balanced" | "high";

export interface ModelMeta {
  id: string;
  label: string;
  vendor: "google" | "openai" | "anthropic";
  contextTokens: number;
  inputCostPerMTokens: number;
  outputCostPerMTokens: number;
  quality: QualityTier;
  goodFor: TaskKind[];
  supportsVision?: boolean;
  supportsTools?: boolean;
}

export const MODEL_CATALOG: ModelMeta[] = [
  // Google — Lovable default tier (free / heavily subsidized through 2025-10-13)
  { id: "google/gemini-3-pro-preview",      label: "Gemini 3 Pro",        vendor: "google",   contextTokens: 1_000_000, inputCostPerMTokens: 1.25,  outputCostPerMTokens: 5.00, quality: "high",     goodFor: ["chat","code","reasoning","vision"], supportsVision: true,  supportsTools: true },
  { id: "google/gemini-3-flash-preview",    label: "Gemini 3 Flash",      vendor: "google",   contextTokens: 1_000_000, inputCostPerMTokens: 0.10,  outputCostPerMTokens: 0.40, quality: "balanced", goodFor: ["chat","code","cheap","vision"],     supportsVision: true,  supportsTools: true },
  { id: "google/gemini-2.5-flash-lite",     label: "Gemini 2.5 Flash Lite", vendor: "google", contextTokens: 1_000_000, inputCostPerMTokens: 0.05,  outputCostPerMTokens: 0.20, quality: "low",      goodFor: ["cheap","chat"],                     supportsVision: true },

  // OpenAI
  { id: "openai/gpt-5",                     label: "GPT-5",               vendor: "openai",   contextTokens: 400_000,   inputCostPerMTokens: 5.00,  outputCostPerMTokens: 20.00, quality: "high",    goodFor: ["chat","code","reasoning","vision"], supportsVision: true,  supportsTools: true },
  { id: "openai/gpt-5-mini",                label: "GPT-5 Mini",          vendor: "openai",   contextTokens: 400_000,   inputCostPerMTokens: 0.25,  outputCostPerMTokens: 1.00,  quality: "balanced",goodFor: ["chat","code","cheap"],              supportsTools: true },
  { id: "openai/gpt-5-nano",                label: "GPT-5 Nano",          vendor: "openai",   contextTokens: 400_000,   inputCostPerMTokens: 0.05,  outputCostPerMTokens: 0.20,  quality: "low",     goodFor: ["cheap","chat"] },

  // Embeddings
  { id: "openai/text-embedding-3-small",    label: "Embed 3 Small",       vendor: "openai",   contextTokens: 8_192,     inputCostPerMTokens: 0.02,  outputCostPerMTokens: 0,     quality: "balanced",goodFor: ["embedding"] },
];

export const DEFAULT_ROUTE: Record<TaskKind, string> = {
  chat:      "google/gemini-3-flash-preview",
  code:      "google/gemini-3-pro-preview",
  reasoning: "google/gemini-3-pro-preview",
  cheap:     "google/gemini-2.5-flash-lite",
  vision:    "google/gemini-3-flash-preview",
  embedding: "openai/text-embedding-3-small",
};

/**
 * Pure model picker. Given a task kind, quality cap, cost cap and an optional
 * blocklist, return the cheapest model that satisfies the constraints, or null.
 */
export function pickModelFromCatalog(opts: {
  kind: TaskKind;
  minQuality?: QualityTier;
  maxCostPerMTokens?: number;
  exclude?: string[];
}): ModelMeta | null {
  const tierRank: Record<QualityTier, number> = { low: 0, balanced: 1, high: 2 };
  const minRank = tierRank[opts.minQuality ?? "low"];
  const exclude = new Set(opts.exclude ?? []);
  const candidates = MODEL_CATALOG
    .filter((m) => m.goodFor.includes(opts.kind))
    .filter((m) => tierRank[m.quality] >= minRank)
    .filter((m) => !exclude.has(m.id))
    .filter((m) => opts.maxCostPerMTokens == null || (m.inputCostPerMTokens + m.outputCostPerMTokens) <= opts.maxCostPerMTokens);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.inputCostPerMTokens + a.outputCostPerMTokens) - (b.inputCostPerMTokens + b.outputCostPerMTokens));
  return candidates[0];
}
