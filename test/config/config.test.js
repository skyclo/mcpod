import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ConfigError, describePermissions, parseConfig } from "../../cli/src/config/index.js"

const VALID = `
metadata:
  name: demo
  description: A demo server.
  version: 1.2.3
  author: someone
image: node:22-alpine
command: ["npx", "-y", "demo-mcp"]
transport: stdio
environment:
  LOG_LEVEL: info
  API_KEY:
    secret: true
    required: true
    description: key for the API
permissions:
  network:
    outbound: true
    allow:
      - registry.npmjs.org
  filesystem:
    - "/etc/demo/config.json:/data/config.json:ro"
  compute:
    cpus: 2
    memory: 1g
restart: on-failure
`

describe("parseConfig", () => {
    it("parses and normalizes a full config", () => {
        const config = parseConfig(VALID)
        assert.equal(config.metadata.name, "demo")
        assert.equal(config.metadata.version, "1.2.3")
        assert.equal(config.image, "node:22-alpine")
        assert.deepEqual(config.command, ["npx", "-y", "demo-mcp"])
        assert.equal(config.transport, "stdio")
        assert.equal(config.restart, "on-failure")
        assert.equal(config.permissions.network.outbound, true)
        assert.deepEqual(config.permissions.network.allow, ["registry.npmjs.org"])
        assert.deepEqual(config.permissions.filesystem, [
            "/etc/demo/config.json:/data/config.json:ro",
        ])
        assert.equal(config.permissions.compute.cpus, 2)
        assert.equal(config.environment.LOG_LEVEL, "info")
        assert.deepEqual(config.environment.API_KEY, {
            secret: true,
            required: true,
            description: "key for the API",
        })
    })

    it("defaults transport, restart, version, and permissions", () => {
        const config = parseConfig("metadata:\n  name: bare\nimage: alpine:latest\n")
        assert.equal(config.transport, "stdio")
        assert.equal(config.restart, "no")
        assert.equal(config.metadata.version, "0.0.0")
        assert.deepEqual(config.permissions, { network: { outbound: false }, filesystem: [] })
        assert.deepEqual(config.environment, {})
    })

    it("accepts a boolean network as outbound shorthand", () => {
        const config = parseConfig(
            "metadata:\n  name: n\nimage: alpine\npermissions:\n  network: true\n"
        )
        assert.deepEqual(config.permissions.network, { outbound: true })
    })

    it("rejects non-mapping documents", () => {
        assert.throws(() => parseConfig("- just\n- a\n- list\n"), ConfigError)
        assert.throws(() => parseConfig("42"), ConfigError)
    })

    it("requires metadata.name", () => {
        assert.throws(() => parseConfig("image: alpine\n"), /metadata is required/)
        assert.throws(
            () => parseConfig("metadata:\n  name: bad name\nimage: alpine\n"),
            /metadata.name/
        )
    })

    it("requires an image", () => {
        assert.throws(() => parseConfig("metadata:\n  name: x\n"), /must set `image`/)
    })

    it("rejects a build-only config until builds are supported", () => {
        assert.throws(
            () => parseConfig("metadata:\n  name: x\nbuild: ./Dockerfile\n"),
            /building from a Dockerfile is not supported/
        )
    })

    it("validates enum fields", () => {
        assert.throws(
            () => parseConfig("metadata:\n  name: x\nimage: a\ntransport: carrier-pigeon\n"),
            /transport must be one of/
        )
        assert.throws(
            () => parseConfig("metadata:\n  name: x\nimage: a\nrestart: sometimes\n"),
            /restart must be one of/
        )
    })

    it("rejects a non-array command", () => {
        assert.throws(
            () => parseConfig("metadata:\n  name: x\nimage: a\ncommand: node index.js\n"),
            /command must be an array/
        )
    })
})

describe("describePermissions", () => {
    it("summarizes an isolated config", () => {
        const config = parseConfig("metadata:\n  name: x\nimage: a\n")
        const perms = describePermissions(config)
        assert.match(perms.network, /fully isolated/)
        assert.equal(perms.filesystem, "none")
        assert.equal(perms.compute, "default limits")
    })

    it("summarizes granted permissions", () => {
        const perms = describePermissions(parseConfig(VALID))
        assert.match(perms.network, /outbound allowed/)
        assert.match(perms.network, /registry\.npmjs\.org/)
        assert.match(perms.compute, /2 cpus/)
    })
})
