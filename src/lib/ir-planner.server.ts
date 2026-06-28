// B2 — Planner+Critic loop. Server-only: holds the LOVABLE_API_KEY call and prompt text.
import { IrSchema, lintIr, type Ir, EMPTY_IR } from "./ir.shared";

const SYSTEM_PROMPT = `You are Foundry Planner, an expert software architect.
Produce a strict JSON document describing a website/app as an "IR" (intermediate representation).
Allowed top-level keys: version (always 1), name, description, theme, pages, models, integrations, i18n.
- pages[i].route must start with "/"; one page must be route "/".
- models[i].name PascalCase; fields[].type ∈ string|number|boolean|datetime|json|uuid|ref.
- For type "ref" set refModel to another model's name.
- Choose sensible component blocks: Hero, FeatureGrid, Pricing, CTA, Form, Gallery, Footer.
- Output ONLY valid JSON. Do not wrap in markdown.`;

const CRITIC_PROMPT = `You are Foundry Critic. The Planner produced an IR JSON document that failed validation.
Errors are listed below. Re-emit the FULL corrected IR JSON. Fix every error. Output ONLY JSON.`;

type CallOpts = { apiKey: string; model: string; prompt: string; system: string };

async function callGateway({ apiKey, model, prompt, system }: CallOpts) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway ${res.status}: ${text.slice(0, 240)}`);
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  return { content, tokensIn: json.usage?.prompt_tokens ?? 0, tokensOut: json.usage?.completion_tokens ?? 0 };
}

function safeParse(content: string): { ok: true; ir: Ir } | { ok: false; raw: string; error: string } {
  let raw = content.trim();
  // Strip code fences just in case.
  if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const obj = JSON.parse(raw);
    const ir = IrSchema.parse(obj);
    return { ok: true, ir };
  } catch (e) {
    return { ok: false, raw, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function planIr(prompt: string, model = "google/gemini-2.5-flash") {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

  const errors: Array<{ attempt: number; message: string }> = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let lastSpec: Ir | null = null;
  const maxAttempts = 3;

  let userPrompt = `User request:\n${prompt}\n\nReturn the IR JSON now.`;
  let system = SYSTEM_PROMPT;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await callGateway({ apiKey, model, prompt: userPrompt, system });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut;

    const parsed = safeParse(r.content);
    if (!parsed.ok) {
      errors.push({ attempt, message: `parse: ${parsed.error}` });
      system = CRITIC_PROMPT;
      userPrompt = `Original request: ${prompt}\n\nLast raw output (invalid JSON): ${parsed.raw.slice(0, 4000)}\n\nFix and re-emit JSON.`;
      continue;
    }
    lastSpec = parsed.ir;
    const issues = lintIr(parsed.ir).filter((i) => i.severity === "error");
    if (issues.length === 0) {
      return { ok: true as const, ir: parsed.ir, attempts: attempt, errors, tokensIn, tokensOut, model };
    }
    errors.push(...issues.map((i) => ({ attempt, message: `${i.path}: ${i.message}` })));
    system = CRITIC_PROMPT;
    userPrompt = `Original request: ${prompt}\n\nPrevious IR (invalid):\n${JSON.stringify(parsed.ir, null, 2)}\n\nErrors:\n${issues.map((i) => "- " + i.path + ": " + i.message).join("\n")}\n\nReturn corrected full IR JSON.`;
  }

  return { ok: false as const, ir: lastSpec ?? EMPTY_IR, attempts: maxAttempts, errors, tokensIn, tokensOut, model };
}
