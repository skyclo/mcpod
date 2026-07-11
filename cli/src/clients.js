import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { homedir } from "os"
import { dirname, join } from "path"

// MCP clients that mcpod can register installed servers with. Each entry in
// the client's config file points back at `mcpod run <name>`, so the client
// transparently talks to the containerized server over stdio.
//
// `entryKey` is the JSON key holding the server map ("mcpServers" for the
// Claude family and Cursor, "servers" for VS Code's mcp.json).

function claudeDesktopDir() {
    return process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "Claude")
        : join(homedir(), ".config", "Claude")
}

function vscodeUserDir() {
    return process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "Code", "User")
        : join(homedir(), ".config", "Code", "User")
}

export const SUPPORTED_CLIENTS = {
    "claude-code": {
        label: "Claude Code",
        entryKey: "mcpServers",
        scopes: {
            project: cwd => join(cwd, ".mcp.json"),
            global: () => join(homedir(), ".claude.json"),
        },
    },
    "claude-desktop": {
        label: "Claude Desktop",
        entryKey: "mcpServers",
        scopes: {
            global: () => join(claudeDesktopDir(), "claude_desktop_config.json"),
        },
    },
    vscode: {
        label: "VS Code",
        entryKey: "servers",
        scopes: {
            project: cwd => join(cwd, ".vscode", "mcp.json"),
            global: () => join(vscodeUserDir(), "mcp.json"),
        },
    },
    cursor: {
        label: "Cursor",
        entryKey: "mcpServers",
        scopes: {
            project: cwd => join(cwd, ".cursor", "mcp.json"),
            global: () => join(homedir(), ".cursor", "mcp.json"),
        },
    },
    "lm-studio": {
        label: "LM Studio",
        entryKey: "mcpServers",
        scopes: {
            global: () => join(homedir(), ".lmstudio", "mcp.json"),
        },
    },
}

/** All valid "client:scope" spec strings, e.g. "claude-code:project". */
export function allClientSpecs() {
    return Object.entries(SUPPORTED_CLIENTS).flatMap(([client, def]) =>
        Object.keys(def.scopes).map(scope => `${client}:${scope}`)
    )
}

/**
 * Parse and validate a "client:scope" spec string.
 * @returns {{client: string, scope: string}}
 */
export function parseClientSpec(spec) {
    const [client, scope, ...rest] = String(spec).split(":")
    const def = SUPPORTED_CLIENTS[client]
    if (!def || !scope || rest.length > 0 || !def.scopes[scope]) {
        throw new Error(
            `Unknown client spec ${JSON.stringify(spec)}. Supported: ${allClientSpecs().join(", ")}`
        )
    }
    return { client, scope }
}

/** Path of the client's MCP config file for a scope. */
export function clientConfigPath(client, scope, cwd = process.cwd()) {
    return SUPPORTED_CLIENTS[client].scopes[scope](cwd)
}

/** The JSON entry registered for a server: `mcpod run <name>` over stdio. */
export function serverEntry(client, name) {
    return {
        ...(client === "vscode" && { type: "stdio" }),
        command: "mcpod",
        args: ["run", name],
    }
}

/**
 * Choices for the interactive client picker. A client is marked detected
 * when its config file (or the directory it lives in) already exists.
 */
export function clientChoices(cwd = process.cwd()) {
    return Object.entries(SUPPORTED_CLIENTS).flatMap(([client, def]) =>
        Object.keys(def.scopes).map(scope => {
            const path = clientConfigPath(client, scope, cwd)
            const detected = existsSync(path) || existsSync(dirname(path))
            const where = scope === "project" ? "this project" : "global"
            return {
                value: `${client}:${scope}`,
                name: `${def.label} — ${where} (${path})${detected ? " ✔ detected" : ""}`,
                checked: false,
            }
        })
    )
}

/**
 * Register a server in each client config. Reads the existing JSON, merges
 * the entry under the client's server map, and writes it back. A file that
 * exists but does not parse is reported and left untouched — mcpod never
 * clobbers a config it cannot read.
 *
 * @param {string} name installed-server name
 * @param {string[]} specs "client:scope" strings
 * @returns {Promise<Array<{spec: string, path: string, error?: string}>>}
 */
export async function registerServer(name, specs, cwd = process.cwd()) {
    const results = []
    for (const spec of specs) {
        const { client, scope } = parseClientSpec(spec)
        const path = clientConfigPath(client, scope, cwd)
        const { entryKey } = SUPPORTED_CLIENTS[client]
        try {
            let config = {}
            try {
                config = JSON.parse(await readFile(path, "utf8"))
            } catch (err) {
                if (err.code !== "ENOENT") {
                    throw new Error(`${path} exists but is not valid JSON, refusing to overwrite`)
                }
            }
            if (typeof config !== "object" || config === null || Array.isArray(config)) {
                throw new Error(`${path} is not a JSON object, refusing to overwrite`)
            }
            config[entryKey] = { ...config[entryKey], [name]: serverEntry(client, name) }
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
            results.push({ spec, path })
        } catch (err) {
            results.push({ spec, path, error: err.message })
        }
    }
    return results
}
