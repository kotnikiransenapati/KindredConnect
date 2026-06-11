import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-4">
        <div>
          <div className="font-display text-lg font-semibold">Foundry</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ship real software by talking to it.
          </p>
        </div>
        <FooterCol title="Product">
          <Link to="/pricing">Pricing</Link>
          <Link to="/" hash="features">Features</Link>
        </FooterCol>
        <FooterCol title="Company">
          <a href="#">About</a>
          <a href="#">Changelog</a>
        </FooterCol>
        <FooterCol title="Legal">
          <a href="#">Terms</a>
          <a href="#">Privacy</a>
        </FooterCol>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Foundry Labs. All rights reserved.
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-2 text-sm [&_a]:text-foreground/80 [&_a:hover]:text-foreground">
        {Array.isArray(children) ? children.map((c, i) => <li key={i}>{c}</li>) : <li>{children}</li>}
      </ul>
    </div>
  );
}
