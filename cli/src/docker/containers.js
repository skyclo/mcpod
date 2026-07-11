import { createHash } from "crypto"
import { isAbsolute, resolve } from "path"
import { Writable } from "stream"
import { getDocker } from "./client.js"

const CWD_MOUNT_POINT = "/workspace"

/**
 * Container names must encode more than the server name: the same server can
 * run scoped to different directories at different times.
 */
export function makeContainerName(serverName, cwd = "", now = Date.now()) {
    const scope = createHash("sha1").update(`${cwd}:${now}`).digest("hex").slice(0, 8)
    return `mcpod-${serverName}-${scope}`
}

/** Parse sizes like "512m" / "1g" / "100k" / "1073741824" into bytes. */
export function parseMemory(value) {
    if (typeof value === "number") return value
    const match = /^(\d+(?:\.\d+)?)([kmg]?)$/i.exec(String(value).trim())
    if (!match) throw new Error(`Invalid memory limit in config: ${JSON.stringify(value)}`)
    const units = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }
    return Math.round(Number(match[1]) * units[match[2].toLowerCase()])
}

/**
 * Turn a `permissions.filesystem` entry ("host:container[:mode]") into a
 * Docker bind string. Read-only unless the config explicitly asks for rw.
 * Anything malformed or overly broad is rejected — bind mounts come only
 * from validated config.
 */
export function parseFilesystemGrant(entry) {
    const parts = String(entry).split(":")
    if (parts.length < 2 || parts.length > 3) {
        throw new Error(`Invalid filesystem grant: ${JSON.stringify(entry)}`)
    }
    const [host, container, mode = "ro"] = parts
    if (!isAbsolute(host) || !isAbsolute(container)) {
        throw new Error(`Filesystem grant paths must be absolute: ${JSON.stringify(entry)}`)
    }
    if (!["ro", "rw"].includes(mode)) {
        throw new Error(`Filesystem grant mode must be ro or rw: ${JSON.stringify(entry)}`)
    }
    const resolvedHost = resolve(host)
    if (resolvedHost === "/") {
        throw new Error("Refusing to bind-mount the host filesystem root")
    }
    return `${resolvedHost}:${container}:${mode}`
}

/**
 * Build the dockerode createContainer options for a server config.
 * Isolation is the default: no network and no mounts unless the config
 * grants them, all capabilities dropped, no privilege escalation.
 *
 * @param {object} config parsed config.mcpod contents
 * @param {{ name: string, cwd?: string }} opts container name and optional
 *   directory the run is scoped to (mounted rw at /workspace)
 */
export function buildContainerSpec(config, { name, cwd } = {}) {
    const binds = (config.permissions?.filesystem ?? []).map(parseFilesystemGrant)
    if (cwd) {
        const resolvedCwd = resolve(cwd)
        if (resolvedCwd === "/") throw new Error("Refusing to scope a run to the filesystem root")
        binds.push(`${resolvedCwd}:${CWD_MOUNT_POINT}:rw`)
    }

    const outbound = config.permissions?.network?.outbound === true
    const restart = config.restart && config.restart !== "no" ? config.restart : null
    const stdio = (config.transport ?? "stdio") === "stdio"

    const hostConfig = {
        NetworkMode: outbound ? "bridge" : "none",
        Binds: binds,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        // AutoRemove conflicts with a restart policy; a restarting server keeps
        // its container around, a one-shot run cleans up after itself.
        ...(restart
            ? {
                  RestartPolicy: {
                      Name: restart,
                      ...(restart === "on-failure" && { MaximumRetryCount: 3 }),
                  },
              }
            : { AutoRemove: true }),
    }
    if (config.permissions?.compute?.cpus) {
        hostConfig.NanoCpus = Math.round(Number(config.permissions.compute.cpus) * 1e9)
    }
    if (config.permissions?.compute?.memory) {
        hostConfig.Memory = parseMemory(config.permissions.compute.memory)
    }

    return {
        name,
        Image: config.image,
        ...(config.command && { Cmd: config.command }),
        Env: Object.entries(config.environment ?? {}).map(([key, value]) => `${key}=${value}`),
        Labels: {
            "mcpod.server": config.metadata?.name ?? "",
            "mcpod.cwd": cwd ? resolve(cwd) : "",
        },
        ...(cwd && { WorkingDir: CWD_MOUNT_POINT }),
        OpenStdin: stdio,
        // Close container stdin when the attached client's stdin ends, so a
        // stdio server shuts down like a normal child process would on EOF.
        StdinOnce: stdio,
        AttachStdin: stdio,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        HostConfig: hostConfig,
    }
}

/** Create the container for a server run. Returns the dockerode container. */
export async function createServerContainer(config, opts, docker = getDocker()) {
    return docker.createContainer(buildContainerSpec(config, opts))
}

/**
 * Route the container's stdout line by line: valid MCP messages (JSON
 * objects) go to the protocol stream, anything else goes to the log stream.
 * The MCP spec forbids a stdio server from writing anything to stdout that
 * is not a valid MCP message — stray output (npm notices, debug prints)
 * would crash or freeze the client's JSON-RPC parser, so mcpod diverts it.
 */
export function createProtocolRouter(protocolOut, logOut) {
    let buffer = ""
    const route = line => {
        const text = line.replace(/\r$/, "")
        if (text === "") return
        try {
            const message = JSON.parse(text)
            if (message === null || typeof message !== "object") throw new Error("not a message")
            protocolOut.write(`${text}\n`)
        } catch {
            logOut.write(`${text}\n`)
        }
    }
    return new Writable({
        write(chunk, _encoding, callback) {
            buffer += chunk.toString("utf8")
            const lines = buffer.split("\n")
            buffer = lines.pop()
            for (const line of lines) route(line)
            callback()
        },
        final(callback) {
            if (buffer !== "") route(buffer)
            callback()
        },
    })
}

/**
 * Attach the current process's stdio to a stdio-transport container.
 * Must be called before start so no early server output is lost. Container
 * stdout passes through the protocol router (MCP messages only — the rest
 * joins container stderr on our stderr). Returns the hijacked duplex stream.
 */
export async function attachStdio(container) {
    const stream = await container.attach({
        stream: true,
        hijack: true,
        stdin: true,
        stdout: true,
        stderr: true,
    })
    const router = createProtocolRouter(process.stdout, process.stderr)
    container.modem.demuxStream(stream, router, process.stderr)
    stream.on("close", () => router.end())
    process.stdin.pipe(stream)
    return stream
}
