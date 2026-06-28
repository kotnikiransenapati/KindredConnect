// B3 — Block runtime library. Used by generated pages AND the live page editor preview.
// Pure presentational components; no project-specific deps. Safe to import anywhere.
import type { ReactNode } from "react";

export type BlockKind =
  | "Hero" | "FeatureGrid" | "Pricing" | "CTA" | "Form" | "Gallery" | "Footer"
  | "Heading" | "Paragraph" | "Image" | "Spacer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockProps = Record<string, any>;

export const BLOCK_CATALOG: Array<{ kind: BlockKind; label: string; defaults: BlockProps; schema: Array<{ key: string; label: string; type: "text" | "textarea" | "number" | "url" | "list" }> }> = [
  { kind: "Hero", label: "Hero", defaults: { title: "Build faster", subtitle: "Ship production apps in minutes.", cta: "Get started", href: "/" }, schema: [
    { key: "title", label: "Title", type: "text" },
    { key: "subtitle", label: "Subtitle", type: "textarea" },
    { key: "cta", label: "CTA label", type: "text" },
    { key: "href", label: "CTA link", type: "url" },
  ]},
  { kind: "Heading", label: "Heading", defaults: { text: "Section title", level: 2 }, schema: [
    { key: "text", label: "Text", type: "text" },
    { key: "level", label: "Level (1–6)", type: "number" },
  ]},
  { kind: "Paragraph", label: "Paragraph", defaults: { text: "Tell your story." }, schema: [
    { key: "text", label: "Text", type: "textarea" },
  ]},
  { kind: "FeatureGrid", label: "Feature grid", defaults: { items: ["Fast", "Secure", "Beautiful"] }, schema: [
    { key: "items", label: "Items (one per line)", type: "list" },
  ]},
  { kind: "Pricing", label: "Pricing", defaults: { tiers: ["Hobby — $0", "Pro — $19", "Team — $49"] }, schema: [
    { key: "tiers", label: "Tiers (one per line)", type: "list" },
  ]},
  { kind: "CTA", label: "Call to action", defaults: { title: "Ready?", cta: "Start free", href: "/auth" }, schema: [
    { key: "title", label: "Title", type: "text" },
    { key: "cta", label: "CTA label", type: "text" },
    { key: "href", label: "CTA link", type: "url" },
  ]},
  { kind: "Form", label: "Form", defaults: { fields: ["name", "email", "message"], submit: "Send" }, schema: [
    { key: "fields", label: "Fields (one per line)", type: "list" },
    { key: "submit", label: "Submit label", type: "text" },
  ]},
  { kind: "Gallery", label: "Gallery", defaults: { images: [] }, schema: [
    { key: "images", label: "Image URLs (one per line)", type: "list" },
  ]},
  { kind: "Image", label: "Image", defaults: { src: "", alt: "" }, schema: [
    { key: "src", label: "Image URL", type: "url" },
    { key: "alt", label: "Alt text", type: "text" },
  ]},
  { kind: "Footer", label: "Footer", defaults: { text: "© 2026" }, schema: [
    { key: "text", label: "Text", type: "text" },
  ]},
  { kind: "Spacer", label: "Spacer", defaults: { size: 32 }, schema: [
    { key: "size", label: "Pixels", type: "number" },
  ]},
];

export function defaultsFor(kind: BlockKind): BlockProps {
  return BLOCK_CATALOG.find((b) => b.kind === kind)?.defaults ?? {};
}

function toLines(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return v.split(/\r?\n/).filter(Boolean);
  return [];
}

export function Block({ kind, props }: { kind: string; props: BlockProps }): ReactNode {
  switch (kind as BlockKind) {
    case "Hero":
      return (
        <section className="px-6 py-20 text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight md:text-6xl">{props.title ?? "Title"}</h1>
          {props.subtitle ? <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">{props.subtitle}</p> : null}
          {props.cta ? <a href={props.href ?? "#"} className="mt-8 inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">{props.cta}</a> : null}
        </section>
      );
    case "Heading": {
      const lvl = Math.min(6, Math.max(1, Number(props.level ?? 2)));
      const Tag = (`h${lvl}`) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag className="px-6 py-3 font-display text-2xl font-semibold">{props.text ?? ""}</Tag>;
    }
    case "Paragraph":
      return <p className="mx-auto max-w-2xl px-6 py-2 text-sm text-muted-foreground">{props.text ?? ""}</p>;
    case "FeatureGrid":
      return (
        <section className="grid gap-4 px-6 py-12 sm:grid-cols-2 md:grid-cols-3">
          {toLines(props.items).map((i, idx) => (
            <div key={idx} className="rounded-xl border border-border/60 bg-card/40 p-5">
              <p className="text-sm font-medium">{i}</p>
            </div>
          ))}
        </section>
      );
    case "Pricing":
      return (
        <section className="grid gap-4 px-6 py-12 md:grid-cols-3">
          {toLines(props.tiers).map((t, idx) => (
            <div key={idx} className="rounded-xl border border-border/60 bg-card/40 p-6 text-center">
              <p className="font-display text-lg">{t}</p>
            </div>
          ))}
        </section>
      );
    case "CTA":
      return (
        <section className="px-6 py-16 text-center">
          <h2 className="font-display text-3xl font-semibold">{props.title ?? ""}</h2>
          {props.cta ? <a href={props.href ?? "#"} className="mt-6 inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">{props.cta}</a> : null}
        </section>
      );
    case "Form":
      return (
        <form className="mx-auto grid max-w-md gap-3 px-6 py-12">
          {toLines(props.fields).map((f) => (
            <label key={f} className="grid gap-1 text-xs">
              <span className="text-muted-foreground">{f}</span>
              <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" name={f} />
            </label>
          ))}
          <button type="button" className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{props.submit ?? "Submit"}</button>
        </form>
      );
    case "Gallery":
      return (
        <section className="grid gap-2 px-6 py-12 sm:grid-cols-2 md:grid-cols-3">
          {toLines(props.images).map((src, idx) => (
            <img key={idx} src={src} alt="" className="aspect-video w-full rounded-lg object-cover" loading="lazy" />
          ))}
        </section>
      );
    case "Image":
      return props.src ? <img src={props.src} alt={props.alt ?? ""} className="mx-auto block max-w-full rounded-lg" loading="lazy" /> : null;
    case "Footer":
      return <footer className="border-t border-border/60 px-6 py-8 text-center text-xs text-muted-foreground">{props.text ?? ""}</footer>;
    case "Spacer":
      return <div style={{ height: Number(props.size ?? 24) }} aria-hidden />;
    default:
      return (
        <div className="m-2 rounded border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Unknown block: <code>{kind}</code>
        </div>
      );
  }
}
