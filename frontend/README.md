# mcpod frontend

Web UI for the mcpod marketplace — browse the registry of sandboxed MCP servers,
inspect each server's `config.mcpod` permission manifest, and copy install/config
snippets. Built with **Next.js 16** (App Router, Turbopack) and **Tailwind CSS 4**.

It ties directly into the marketplace registry in [`../marketplace`](../marketplace):

- `GET /servers` → the browse grid + landing "popular pods"
- `GET /servers/:name` → server detail metadata
- `GET /servers/:name/config.mcpod` → parsed into the **Permissions** tab and sidebar stats

All registry calls happen **server-side** (see [`lib/marketplace.js`](lib/marketplace.js)),
so `MARKETPLACE_URL` stays private and there's no CORS to configure — the browser
only ever talks to this Next app. Client-side live search goes through the
[`/api/servers`](app/api/servers/route.js) proxy.

## Run it

Start the registry first (in another terminal):

```bash
cd ../marketplace && npm install && npm start   # serves on :4000
```

Then the frontend:

```bash
cd frontend
npm install
cp .env.example .env.local        # optional; defaults to http://localhost:4000
npm run dev                        # http://localhost:3000
```

If the registry is unreachable the pages render a clear notice instead of an
empty grid.

## Layout

```
app/
  page.js                 landing (hero, how-it-works, featured pods)
  browse/                 catalogue with live search, tag filters, sort
  servers/[name]/         server detail — Overview / Permissions / config.mcpod tabs
  api/servers/route.js    server-side search proxy to the registry
lib/
  marketplace.js          server-only registry client
  config.js               config.mcpod YAML → permission manifest + runtime facts
components/                Header, Footer, ServerCard, CopyButton, TerminalDemo…
```

## Notes

The registry exposes real fields — name, description, version, author, tags,
and the full `config.mcpod`. The UI renders those directly and derives the
permission manifest from the YAML; it does **not** invent popularity metrics
(pulls/stars) that the registry doesn't track.
