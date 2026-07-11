import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
    collectRepositoryContext,
    extractYaml,
    interpretRepositoryToConfig,
} from "../../cli/src/interpret/gemini.js"

describe("gemini interpreter", () => {
    let dir
    let originalKey

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcpod-interpret-"))
        await mkdir(join(dir, "docs"))
        await mkdir(join(dir, "node_modules"))
        await writeFile(join(dir, "README.md"), "# Demo server\n")
        await writeFile(join(dir, "docs", "install.md"), "Install with npm\n")
        await writeFile(join(dir, "node_modules", "ignored.md"), "skip\n")
        await writeFile(join(dir, "asset.png"), Buffer.from([0, 1, 2, 3]))
        originalKey = process.env.GEMINI_API_KEY
    })

    after(async () => {
        if (originalKey === undefined) delete process.env.GEMINI_API_KEY
        else process.env.GEMINI_API_KEY = originalKey
        await rm(dir, { recursive: true, force: true })
    })

    it("collects text files from the repository and skips ignored directories", async () => {
        const context = await collectRepositoryContext(dir)
        assert.deepEqual(
            context.docs.map(file => file.path).sort(),
            ["README.md", "docs/install.md"]
        )
    })

    it("extracts yaml from fenced model output", () => {
        const yaml = extractYaml("```yaml\nmetadata:\n  name: demo\n```")
        assert.equal(yaml, "metadata:\n  name: demo")
    })

    it("interprets repository content through Gemini and returns parsed config", async () => {
        process.env.GEMINI_API_KEY = "test-key"
        let prompt = ""
        const config = await interpretRepositoryToConfig({
            target: dir,
            name: "demo",
            generateContent: async ({ contents }) => {
                prompt = contents
                return {
                    text: `\`\`\`yaml
metadata:
  name: demo
  description: Demo
  version: 1.0.0
image: node:22-alpine
command:
  - node
  - server.js
transport: stdio
environment: {}
permissions:
  network:
    outbound: false
  filesystem: []
  compute:
    cpus: 1
    memory: 512m
restart: no
\`\`\``,
                }
            },
        })

        assert.ok(prompt.includes("README.md"))
        assert.equal(config.metadata.name, "demo")
        assert.equal(config.image, "node:22-alpine")
    })

    it("requires GEMINI_API_KEY for interpret-unsafe", async () => {
        delete process.env.GEMINI_API_KEY
        await assert.rejects(() => interpretRepositoryToConfig({ target: dir }), /GEMINI_API_KEY/)
    })
})
