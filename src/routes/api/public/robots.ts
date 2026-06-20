import { createFileRoute } from "@tanstack/react-router";

const ORIGIN = "https://kindred-flame-lab.lovable.app";

export const Route = createFileRoute("/api/public/robots")({
  server: {
    handlers: {
      GET: async () => {
        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /_authenticated/

Sitemap: ${ORIGIN}/api/public/sitemap
`;
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
