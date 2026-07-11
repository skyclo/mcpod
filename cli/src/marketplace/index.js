import { parseConfig } from "../config/index.js"

// Registry client. Talks to the marketplace server over HTTP to browse the
// index and fetch config.mcpod files. The base URL comes from
// MCPOD_MARKETPLACE_URL so tests (and self-hosters) can point it elsewhere.

const DEFAULT_URL = "http://localhost:4000"

export function marketplaceUrl() {
    return (process.env.MCPOD_MARKETPLACE_URL || DEFAULT_URL).replace(/\/+$/, "")
}

async function request(path) {
    const url = `${marketplaceUrl()}${path}`
    try {
        return await fetch(url)
    } catch (err) {
        throw new Error(
            `Could not reach the marketplace at ${marketplaceUrl()} (${err.message}). ` +
                "Is the marketplace server running?"
        )
    }
}

async function getJson(path) {
    const res = await request(path)
    if (!res.ok) {
        throw new Error(`Marketplace request to ${path} failed (${res.status} ${res.statusText})`)
    }
    return res.json()
}

/**
 * A page of server metadata: `{ servers, page, pageSize, total, totalPages }`.
 * `search` filters by keyword across name/description/author/tags.
 */
export function listServers({ page = 1, pageSize = 50, search } = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) params.set("search", search)
    return getJson(`/servers?${params}`)
}

export function searchServers(query, opts = {}) {
    return listServers({ ...opts, search: query })
}

/** Detailed metadata for one server, or null when it is not in the registry. */
export async function getServerInfo(name) {
    const res = await request(`/servers/${encodeURIComponent(name)}`)
    if (res.status === 404) return null
    if (!res.ok) {
        throw new Error(`Marketplace request for ${name} failed (${res.status} ${res.statusText})`)
    }
    return res.json()
}

/** The raw config.mcpod YAML text for a server. Throws if it is not found. */
export async function fetchConfigText(name) {
    const res = await request(`/servers/${encodeURIComponent(name)}/config.mcpod`)
    if (res.status === 404) {
        throw new Error(`No server named "${name}" in the marketplace.`)
    }
    if (!res.ok) {
        throw new Error(
            `Marketplace request for ${name} config failed (${res.status} ${res.statusText})`
        )
    }
    return res.text()
}

/** Fetch and validate a server's config.mcpod into a normalized config. */
export async function resolveConfig(name) {
    const text = await fetchConfigText(name)
    return parseConfig(text, { source: `${name} config.mcpod` })
}
