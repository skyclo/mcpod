import { NextResponse } from "next/server";
import { listServers } from "@/lib/marketplace";

/**
 * Thin proxy so the Browse page can search the registry from the client
 * without exposing MARKETPLACE_URL or hitting CORS. All the real work lives in
 * the server-side marketplace client.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const result = await listServers({ page, pageSize: 100, search });
  return NextResponse.json(result);
}
