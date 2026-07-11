import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createApp } from "../../marketplace/src/app.js"
import { MarketplaceStore } from "../../marketplace/src/store.js"
import { parseConfig } from "../../cli/src/config/index.js"
import {
    fetchConfigText,
    getServerInfo,
    listServers,
    resolveConfig,
    searchServers,
} from "../../cli/src/marketplace/index.js"

// Boots the real marketplace server against the shipped seed data and drives
// the CLI's marketplace client against it — an end-to-end check that the two
// sides agree on the wire format.
describe("marketplace client ↔ server", () => {
    const dataPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../marketplace/data/servers.json"
    )
    let server
    let previousUrl

    before(async () => {
        const app = createApp(new MarketplaceStore(dataPath))
        server = app.listen(0)
        await new Promise(resolve => server.once("listening", resolve))
        previousUrl = process.env.MCPOD_MARKETPLACE_URL
        process.env.MCPOD_MARKETPLACE_URL = `http://127.0.0.1:${server.address().port}`
    })

    after(async () => {
        if (previousUrl === undefined) delete process.env.MCPOD_MARKETPLACE_URL
        else process.env.MCPOD_MARKETPLACE_URL = previousUrl
        await new Promise(resolve => server.close(resolve))
    })

    it("lists the seeded servers", async () => {
        const page = await listServers()
        assert.ok(page.total >= 5)
        const names = page.servers.map(s => s.name)
        assert.ok(names.includes("context7"))
        assert.ok(names.includes("filesystem"))
    })

    it("searches by keyword", async () => {
        const page = await searchServers("filesystem")
        assert.equal(page.total, 1)
        assert.equal(page.servers[0].name, "filesystem")
    })

    it("returns detailed info, or null when absent", async () => {
        const info = await getServerInfo("memory")
        assert.equal(info.name, "memory")
        assert.equal(info.author, "Anthropic, PBC")
        assert.equal(info.configMcpod, undefined)
        assert.equal(await getServerInfo("does-not-exist"), null)
    })

    it("fetches raw config.mcpod text", async () => {
        const text = await fetchConfigText("context7")
        assert.match(text, /name: context7/)
        await assert.rejects(fetchConfigText("does-not-exist"), /No server named/)
    })

    it("resolves a config into a validated, normalized object", async () => {
        const config = await resolveConfig("filesystem")
        assert.equal(config.image, "node:22-alpine")
        assert.equal(config.transport, "stdio")
        assert.equal(config.permissions.network.outbound, true)
    })

    it("every shipped config.mcpod parses", async () => {
        const page = await listServers()
        for (const { name } of page.servers) {
            const config = await resolveConfig(name)
            assert.equal(config.metadata.name, name)
            assert.ok(config.image, `${name} has an image`)
            assert.equal(parseConfig(await fetchConfigText(name)).metadata.name, name)
        }
    })
})
