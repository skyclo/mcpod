import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import {
    allClientSpecs,
    clientConfigPath,
    parseClientSpec,
    registerServer,
    serverEntry,
} from "../cli/src/clients.js"

describe("parseClientSpec", () => {
    it("accepts every advertised spec", () => {
        for (const spec of allClientSpecs()) {
            const { client, scope } = parseClientSpec(spec)
            assert.equal(`${client}:${scope}`, spec)
        }
    })

    it("rejects unknown clients, scopes, and malformed specs", () => {
        assert.throws(() => parseClientSpec("emacs:project"), /Unknown client spec/)
        assert.throws(() => parseClientSpec("vscode:workspace"), /Unknown client spec/)
        assert.throws(() => parseClientSpec("claude-desktop:project"), /Unknown client spec/)
        assert.throws(() => parseClientSpec("vscode"), /Unknown client spec/)
        assert.throws(() => parseClientSpec("vscode:project:extra"), /Unknown client spec/)
    })
})

describe("clientConfigPath", () => {
    it("puts project scopes under the given directory", () => {
        assert.equal(clientConfigPath("claude-code", "project", "/proj"), "/proj/.mcp.json")
        assert.equal(clientConfigPath("vscode", "project", "/proj"), "/proj/.vscode/mcp.json")
        assert.equal(clientConfigPath("cursor", "project", "/proj"), "/proj/.cursor/mcp.json")
    })

    it("puts global scopes under the home directory", () => {
        assert.match(clientConfigPath("claude-code", "global"), /\.claude\.json$/)
        assert.match(clientConfigPath("claude-desktop", "global"), /claude_desktop_config\.json$/)
        assert.match(clientConfigPath("lm-studio", "global"), /\.lmstudio[/\\]mcp\.json$/)
    })
})

describe("serverEntry", () => {
    it("points the client at mcpod run", () => {
        assert.deepEqual(serverEntry("claude-code", "context7"), {
            command: "mcpod",
            args: ["run", "context7"],
        })
    })

    it("adds the stdio type marker for VS Code", () => {
        assert.deepEqual(serverEntry("vscode", "context7"), {
            type: "stdio",
            command: "mcpod",
            args: ["run", "context7"],
        })
    })
})

describe("registerServer", () => {
    let cwd

    before(async () => {
        cwd = await mkdtemp(join(tmpdir(), "mcpod-clients-"))
    })

    after(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    it("creates a fresh config file with the server entry", async () => {
        const results = await registerServer("context7", ["vscode:project"], cwd)
        assert.equal(results[0].error, undefined)
        const config = JSON.parse(await readFile(join(cwd, ".vscode", "mcp.json"), "utf8"))
        assert.deepEqual(config, {
            servers: {
                context7: { type: "stdio", command: "mcpod", args: ["run", "context7"] },
            },
        })
    })

    it("merges into an existing config without touching other keys", async () => {
        await writeFile(
            join(cwd, ".mcp.json"),
            JSON.stringify({ mcpServers: { other: { command: "x" } }, unrelated: true })
        )
        await registerServer("context7", ["claude-code:project"], cwd)
        const config = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"))
        assert.equal(config.unrelated, true)
        assert.deepEqual(config.mcpServers.other, { command: "x" })
        assert.deepEqual(config.mcpServers.context7, {
            command: "mcpod",
            args: ["run", "context7"],
        })
    })

    it("refuses to overwrite a config it cannot parse", async () => {
        await mkdir(join(cwd, ".cursor"), { recursive: true })
        await writeFile(join(cwd, ".cursor", "mcp.json"), "{ not json !!")
        const results = await registerServer("context7", ["cursor:project"], cwd)
        assert.match(results[0].error, /not valid JSON/)
        assert.equal(await readFile(join(cwd, ".cursor", "mcp.json"), "utf8"), "{ not json !!")
    })

    it("reports per-spec results so one failure does not block the rest", async () => {
        const results = await registerServer("context7", ["cursor:project", "vscode:project"], cwd)
        assert.equal(results.length, 2)
        assert.match(results[0].error, /not valid JSON/)
        assert.equal(results[1].error, undefined)
    })
})
