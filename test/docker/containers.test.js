import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
    buildContainerSpec,
    createProtocolRouter,
    makeContainerName,
    parseFilesystemGrant,
    parseMemory,
} from "../../cli/src/docker/containers.js"

function collector() {
    return {
        lines: [],
        write(chunk) {
            this.lines.push(String(chunk))
        },
    }
}

const baseConfig = {
    metadata: { name: "srv", version: "1.0.0" },
    image: "alpine:latest",
    command: ["cat"],
    transport: "stdio",
    environment: { LOG_LEVEL: "info" },
    permissions: { network: { outbound: false }, filesystem: [] },
    restart: "no",
}

describe("makeContainerName", () => {
    it("encodes more than the server name and varies by cwd and time", () => {
        const a = makeContainerName("srv", "/a", 1)
        const b = makeContainerName("srv", "/b", 1)
        const c = makeContainerName("srv", "/a", 2)
        assert.match(a, /^mcpod-srv-[0-9a-f]{8}$/)
        assert.notEqual(a, b)
        assert.notEqual(a, c)
    })
})

describe("parseMemory", () => {
    it("parses unit suffixes", () => {
        assert.equal(parseMemory("512m"), 512 * 1024 ** 2)
        assert.equal(parseMemory("1g"), 1024 ** 3)
        assert.equal(parseMemory("10k"), 10 * 1024)
        assert.equal(parseMemory("1024"), 1024)
        assert.equal(parseMemory(2048), 2048)
    })

    it("rejects garbage", () => {
        assert.throws(() => parseMemory("lots"), /Invalid memory limit/)
    })
})

describe("parseFilesystemGrant", () => {
    it("defaults to read-only", () => {
        assert.equal(parseFilesystemGrant("/etc/foo:/data/foo"), "/etc/foo:/data/foo:ro")
    })

    it("honors an explicit rw mode", () => {
        assert.equal(parseFilesystemGrant("/etc/foo:/data/foo:rw"), "/etc/foo:/data/foo:rw")
    })

    it("rejects relative paths, bad modes, and a root mount", () => {
        assert.throws(() => parseFilesystemGrant("etc/foo:/data"), /absolute/)
        assert.throws(() => parseFilesystemGrant("/etc/foo:data"), /absolute/)
        assert.throws(() => parseFilesystemGrant("/etc/foo:/data:rwx"), /ro or rw/)
        assert.throws(() => parseFilesystemGrant("/:/host"), /root/)
        assert.throws(() => parseFilesystemGrant("/lone-path"), /Invalid filesystem grant/)
    })
})

describe("buildContainerSpec", () => {
    it("isolates by default: no network, no binds, all caps dropped", () => {
        const spec = buildContainerSpec(baseConfig, { name: "mcpod-srv-1" })
        assert.equal(spec.HostConfig.NetworkMode, "none")
        assert.deepEqual(spec.HostConfig.Binds, [])
        assert.deepEqual(spec.HostConfig.CapDrop, ["ALL"])
        assert.deepEqual(spec.HostConfig.SecurityOpt, ["no-new-privileges"])
    })

    it("enables bridge networking only when the config grants outbound", () => {
        const config = { ...baseConfig, permissions: { network: { outbound: true } } }
        assert.equal(buildContainerSpec(config, { name: "n" }).HostConfig.NetworkMode, "bridge")
    })

    it("mounts filesystem grants and the cwd scope", () => {
        const config = {
            ...baseConfig,
            permissions: { ...baseConfig.permissions, filesystem: ["/etc/foo:/data/foo"] },
        }
        const spec = buildContainerSpec(config, { name: "n", cwd: "/home/user/project" })
        assert.deepEqual(spec.HostConfig.Binds, [
            "/etc/foo:/data/foo:ro",
            "/home/user/project:/workspace:rw",
        ])
        assert.equal(spec.WorkingDir, "/workspace")
        assert.equal(spec.Labels["mcpod.cwd"], "/home/user/project")
    })

    it("refuses to scope a run to the filesystem root", () => {
        assert.throws(() => buildContainerSpec(baseConfig, { name: "n", cwd: "/" }), /root/)
    })

    it("auto-removes one-shot runs but keeps containers with a restart policy", () => {
        const oneShot = buildContainerSpec(baseConfig, { name: "n" })
        assert.equal(oneShot.HostConfig.AutoRemove, true)
        assert.equal(oneShot.HostConfig.RestartPolicy, undefined)

        const restarting = buildContainerSpec(
            { ...baseConfig, restart: "on-failure" },
            { name: "n" }
        )
        assert.equal(restarting.HostConfig.AutoRemove, undefined)
        assert.deepEqual(restarting.HostConfig.RestartPolicy, {
            Name: "on-failure",
            MaximumRetryCount: 3,
        })
    })

    it("applies compute limits from permissions", () => {
        const config = {
            ...baseConfig,
            permissions: { ...baseConfig.permissions, compute: { cpus: 2, memory: "256m" } },
        }
        const spec = buildContainerSpec(config, { name: "n" })
        assert.equal(spec.HostConfig.NanoCpus, 2e9)
        assert.equal(spec.HostConfig.Memory, 256 * 1024 ** 2)
    })

    it("formats environment and wires stdio attachment", () => {
        const spec = buildContainerSpec(baseConfig, { name: "n" })
        assert.deepEqual(spec.Env, ["LOG_LEVEL=info"])
        assert.equal(spec.OpenStdin, true)
        assert.equal(spec.StdinOnce, true)
        assert.equal(spec.AttachStdin, true)
        assert.equal(spec.Tty, false)
    })

    it("does not open stdin for http transport", () => {
        const spec = buildContainerSpec({ ...baseConfig, transport: "http" }, { name: "n" })
        assert.equal(spec.OpenStdin, false)
        assert.equal(spec.AttachStdin, false)
    })
})

describe("createProtocolRouter", () => {
    it("forwards JSON messages to the protocol stream and logs to the log stream", () => {
        const protocol = collector()
        const log = collector()
        const router = createProtocolRouter(protocol, log)
        router.write('{"jsonrpc":"2.0","id":1,"result":{}}\nnpm notice new version!\n')
        assert.deepEqual(protocol.lines, ['{"jsonrpc":"2.0","id":1,"result":{}}\n'])
        assert.deepEqual(log.lines, ["npm notice new version!\n"])
    })

    it("reassembles messages split across chunks", () => {
        const protocol = collector()
        const log = collector()
        const router = createProtocolRouter(protocol, log)
        router.write('{"jsonrpc":"2.0",')
        router.write('"id":2}\n')
        assert.deepEqual(protocol.lines, ['{"jsonrpc":"2.0","id":2}\n'])
        assert.deepEqual(log.lines, [])
    })

    it("treats non-object JSON and blank lines as logs, not messages", () => {
        const protocol = collector()
        const log = collector()
        const router = createProtocolRouter(protocol, log)
        router.write("42\ntrue\n\n\n")
        assert.deepEqual(protocol.lines, [])
        assert.deepEqual(log.lines, ["42\n", "true\n"])
    })

    it("strips carriage returns and flushes a trailing partial line on end", async () => {
        const protocol = collector()
        const log = collector()
        const router = createProtocolRouter(protocol, log)
        router.write('{"id":3}\r\nlast words without newline')
        await new Promise(resolve => router.end(resolve))
        assert.deepEqual(protocol.lines, ['{"id":3}\n'])
        assert.deepEqual(log.lines, ["last words without newline\n"])
    })
})
