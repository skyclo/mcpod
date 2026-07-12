import "server-only";

/**
 * Server-side client for the mcpod marketplace registry (see ../marketplace).
 *
 * Everything here runs on the Next.js server, never in the browser, so the
 * registry URL stays private and we sidestep CORS entirely — the browser only
 * ever talks to this Next app.
 */

const BASE_URL = (process.env.MARKETPLACE_URL || "http://localhost:4000").replace(/\/$/, "");

/**
 * @typedef {object} ServerMeta
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} version
 * @property {string} author
 * @property {string} gitUrl
 * @property {string[]} tags
 */

/**
 * @typedef {object} ServerPage
 * @property {ServerMeta[]} servers
 * @property {number} page
 * @property {number} pageSize
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} unreachable  true when the registry could not be contacted
 */

async function request(path, { revalidate = 30 } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    next: { revalidate },
  });
  return res;
}

/**
 * List servers with optional search + pagination.
 * @returns {Promise<ServerPage>}
 */
export async function listServers({ page = 1, pageSize = 60, search = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set("search", search);

  try {
    const res = await request(`/servers?${params.toString()}`);
    if (!res.ok) throw new Error(`registry responded ${res.status}`);
    const data = await res.json();
    return { unreachable: false, ...data };
  } catch {
    return { servers: [], page, pageSize, total: 0, totalPages: 1, unreachable: true };
  }
}

/**
 * Fetch a single server's metadata.
 * @returns {Promise<ServerMeta | null>}
 */
export async function getServer(name) {
  try {
    const res = await request(`/servers/${encodeURIComponent(name)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`registry responded ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch a server's raw config.mcpod YAML text.
 * @returns {Promise<string | null>}
 */
export async function getServerConfig(name) {
  try {
    const res = await fetch(`${BASE_URL}/servers/${encodeURIComponent(name)}/config.mcpod`, {
      headers: { accept: "text/yaml" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Whether the registry is currently reachable. */
export async function registryReachable() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { next: { revalidate: 5 } });
    return res.ok;
  } catch {
    return false;
  }
}
