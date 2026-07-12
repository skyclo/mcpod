import { mkdir, readFile, writeFile, readdir, rm } from "fs/promises"
import { homedir } from "os"
import { join } from "path"

const VALID_NAME = /^[a-z0-9][a-z0-9._-]*$/i

/** Resolved lazily so tests can point MCPOD_HOME at a temp directory. */
export function mcpodHome() {
    return process.env.MCPOD_HOME || join(homedir(), ".mcpod")
}

function serversDir() {
    return join(mcpodHome(), "servers")
}

/**
 * mcpod's own user settings from ~/.mcpod/config.json, e.g.
 * `{ "defaultClients": ["claude-code:global"] }` used by non-interactive
 * installs when no --client flag is given. Missing file means no settings.
 */
export async function loadSettings() {
    try {
        return JSON.parse(await readFile(join(mcpodHome(), "config.json"), "utf8"))
    } catch (err) {
        if (err.code === "ENOENT") return {}
        throw new Error(`Could not read mcpod settings: ${err.message}`)
    }
}

function recordPath(name) {
    if (!VALID_NAME.test(name)) {
        throw new Error(`Invalid server name: ${JSON.stringify(name)}`)
    }
    return join(serversDir(), `${name}.json`)
}

/**
 * Turn an install argument — a marketplace name, a local path, or a Git repo
 * URL — into the server name used for its record and client registration. A
 * bare marketplace name passes through unchanged; for paths and URLs we take
 * the final repo/directory segment, dropping any `.git` suffix or trailing
 * slash (e.g. `https://github.com/microsoft/playwright-mcp` -> `playwright-mcp`).
 * Throws if nothing usable can be derived, since the result becomes a filename
 * under ~/.mcpod/servers.
 */
export function deriveServerName(target) {
    const segment = String(target)
        .trim()
        .replace(/\/+$/, "")
        .replace(/\.git$/i, "")
        .split(/[/:]/)
        .pop()
        ?.trim()
    if (segment && VALID_NAME.test(segment)) return segment
    throw new Error(
        `Could not derive a server name from ${JSON.stringify(target)}. ` +
            "Expected a marketplace name, a local path, or a Git repo URL."
    )
}

/**
 * Persist an install record. State lives in ~/.mcpod/, never in the
 * container — removing a container must not lose the install record.
 * @param {string} name installed-server name
 * @param {{config: object, installedAt?: string}} record
 */
export async function saveRecord(name, record) {
    await mkdir(serversDir(), { recursive: true })
    const path = recordPath(name)
    await writeFile(path, `${JSON.stringify({ name, ...record }, null, 2)}\n`)
    return path
}

/** @returns {Promise<object|null>} the record, or null when not installed */
export async function loadRecord(name) {
    try {
        return JSON.parse(await readFile(recordPath(name), "utf8"))
    } catch (err) {
        if (err.code === "ENOENT") return null
        throw err
    }
}

/** @returns {Promise<string[]>} names of all installed servers */
export async function listRecords() {
    try {
        const files = await readdir(serversDir())
        return files.filter(f => f.endsWith(".json")).map(f => f.slice(0, -".json".length))
    } catch (err) {
        if (err.code === "ENOENT") return []
        throw err
    }
}

/** @returns {Promise<boolean>} whether a record existed and was removed */
export async function deleteRecord(name) {
    const existing = await loadRecord(name)
    if (!existing) return false
    await rm(recordPath(name))
    return true
}
