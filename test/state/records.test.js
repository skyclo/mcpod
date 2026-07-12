import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import {
    deleteRecord,
    deriveServerName,
    listRecords,
    loadRecord,
    mcpodHome,
    saveRecord,
} from "../../cli/src/state/records.js"

describe("state records", () => {
    let home

    before(async () => {
        home = await mkdtemp(join(tmpdir(), "mcpod-test-"))
        process.env.MCPOD_HOME = home
    })

    after(async () => {
        delete process.env.MCPOD_HOME
        await rm(home, { recursive: true, force: true })
    })

    it("honors the MCPOD_HOME override", () => {
        assert.equal(mcpodHome(), home)
    })

    it("round-trips an install record", async () => {
        const path = await saveRecord("srv", { config: { image: "alpine:latest" } })
        assert.ok(path.startsWith(home))
        const record = await loadRecord("srv")
        assert.equal(record.name, "srv")
        assert.equal(record.config.image, "alpine:latest")
    })

    it("returns null for servers that are not installed", async () => {
        assert.equal(await loadRecord("ghost"), null)
    })

    it("lists installed servers", async () => {
        await saveRecord("other", { config: {} })
        assert.deepEqual((await listRecords()).sort(), ["other", "srv"])
    })

    it("deletes records and reports whether one existed", async () => {
        assert.equal(await deleteRecord("other"), true)
        assert.equal(await deleteRecord("other"), false)
        assert.deepEqual(await listRecords(), ["srv"])
    })

    it("rejects names that could escape the servers directory", async () => {
        await assert.rejects(loadRecord("../evil"), /Invalid server name/)
        await assert.rejects(saveRecord("a/b", { config: {} }), /Invalid server name/)
    })

    it("derives a server name from install targets", () => {
        // Bare marketplace names pass through unchanged.
        assert.equal(deriveServerName("playwright-mcp"), "playwright-mcp")
        // GitHub URLs, with or without .git / trailing slash.
        assert.equal(
            deriveServerName("https://github.com/microsoft/playwright-mcp"),
            "playwright-mcp"
        )
        assert.equal(
            deriveServerName("https://github.com/microsoft/playwright-mcp.git/"),
            "playwright-mcp"
        )
        // SSH remotes and shorthand owner/repo.
        assert.equal(deriveServerName("git@github.com:microsoft/playwright-mcp.git"), "playwright-mcp")
        assert.equal(deriveServerName("microsoft/playwright-mcp"), "playwright-mcp")
        // Local paths use the final directory segment.
        assert.equal(deriveServerName("./servers/my-thing/"), "my-thing")
    })

    it("throws when no valid name can be derived", () => {
        assert.throws(() => deriveServerName(""), /Could not derive a server name/)
        assert.throws(() => deriveServerName("/"), /Could not derive a server name/)
        // Last segment must start with an alphanumeric.
        assert.throws(() => deriveServerName("owner/@scope"), /Could not derive a server name/)
    })
})
