import BrowseClient from "./BrowseClient";
import { listServers } from "@/lib/marketplace";

export const metadata = {
  title: "Browse pods — mcpod",
  description: "Search the mcpod registry of sandboxed MCP servers.",
};

export default async function BrowsePage({ searchParams }) {
  const params = await searchParams;
  const query = typeof params?.q === "string" ? params.q : "";

  // Pull the whole catalog once for the category (tag) universe + total, and
  // the initial filtered slice for the current query. Both hit the real API.
  const [all, initial] = await Promise.all([
    listServers({ pageSize: 100 }),
    query ? listServers({ pageSize: 100, search: query }) : null,
  ]);

  const tagSet = new Set();
  for (const s of all.servers) for (const t of s.tags ?? []) tagSet.add(t);
  const categories = ["All", ...[...tagSet].sort()];

  return (
    <BrowseClient
      initialQuery={query}
      initialResults={(initial ?? all).servers}
      total={all.total}
      unreachable={all.unreachable}
      categories={categories}
    />
  );
}
