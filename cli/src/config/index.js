import { parse as parseYaml } from "yaml"

// config.mcpod parsing, validation, and the permission model.
//
// Marketplace content is untrusted input: everything here validates a fetched
// (or local) config.mcpod against the schema before any other code acts on a
// field. Nothing in a config is ever eval'd or exec'd on the host — install
// steps run inside the container. Parsing failures throw ConfigError with a
// message that names what was wrong so the CLI can show it to the user.

export class ConfigError extends Error {
    constructor(message) {
        super(message)
        this.name = "ConfigError"
    }
}

const TRANSPORTS = ["stdio", "http"]
const RESTARTS = ["no", "on-failure", "always", "unless-stopped"]
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i

/**
 * Parse and validate a config.mcpod document.
 * @param {string} text raw YAML
 * @param {{ source?: string }} [opts] label used in error messages
 * @returns {object} the normalized config
 */
export function parseConfig(text, { source = "config.mcpod" } = {}) {
    let raw
    try {
        raw = parseYaml(text)
    } catch (err) {
        throw new ConfigError(`${source} is not valid YAML: ${err.message}`)
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new ConfigError(`${source} must be a YAML mapping`)
    }
    return normalizeConfig(raw, source)
}

function fail(source, message) {
    throw new ConfigError(`${source}: ${message}`)
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

function normalizeConfig(raw, source) {
    const metadata = normalizeMetadata(raw.metadata, source)

    if (raw.build != null && typeof raw.build !== "string") {
        fail(source, "build must be a path string")
    }
    if (raw.image != null && typeof raw.image !== "string") {
        fail(source, "image must be a string")
    }
    if (!raw.image) {
        // The container layer only knows how to pull a prebuilt/base image; a
        // Dockerfile build step is not wired up yet, so image is required even
        // when build is present.
        fail(
            source,
            raw.build
                ? "building from a Dockerfile is not supported yet; set `image` to a prebuilt or base image"
                : "must set `image` to the container image to run"
        )
    }

    let command
    if (raw.command != null) {
        if (!Array.isArray(raw.command) || raw.command.some(part => typeof part !== "string")) {
            fail(source, "command must be an array of strings")
        }
        command = raw.command
    }

    const transport = raw.transport ?? "stdio"
    if (!TRANSPORTS.includes(transport)) {
        fail(source, `transport must be one of ${TRANSPORTS.join(", ")}`)
    }

    let ports
    if (raw.ports != null) {
        if (
            !Array.isArray(raw.ports) ||
            raw.ports.some(port => !Number.isInteger(port) || port <= 0)
        ) {
            fail(source, "ports must be an array of positive integers")
        }
        ports = raw.ports
    }

    const restart = raw.restart ?? "no"
    if (!RESTARTS.includes(restart)) {
        fail(source, `restart must be one of ${RESTARTS.join(", ")}`)
    }

    return {
        metadata,
        ...(raw.source != null && { source: normalizeSource(raw.source, source) }),
        image: raw.image,
        ...(raw.build != null && { build: raw.build }),
        ...(command && { command }),
        transport,
        ...(ports && { ports }),
        environment: normalizeEnvironment(raw.environment, source),
        permissions: normalizePermissions(raw.permissions, source),
        restart,
        ...(raw.scripts != null && { scripts: normalizeScripts(raw.scripts, source) }),
    }
}

function normalizeMetadata(metadata, source) {
    if (!isPlainObject(metadata)) fail(source, "metadata is required and must be a mapping")
    const { name, version, description, author } = metadata
    if (typeof name !== "string" || !NAME_RE.test(name)) {
        fail(source, "metadata.name must be a name like `my-server` (letters, digits, . _ -)")
    }
    for (const [key, value] of Object.entries({ version, description, author })) {
        if (value != null && typeof value !== "string") {
            fail(source, `metadata.${key} must be a string`)
        }
    }
    return {
        name,
        version: version ?? "0.0.0",
        ...(description != null && { description }),
        ...(author != null && { author }),
    }
}

function normalizeSource(sourceField, source) {
    if (!isPlainObject(sourceField)) fail(source, "source must be a mapping")
    if (typeof sourceField.url !== "string") fail(source, "source.url must be a string")
    const { url, commit, subdirectory } = sourceField
    for (const [key, value] of Object.entries({ commit, subdirectory })) {
        if (value != null && typeof value !== "string") {
            fail(source, `source.${key} must be a string`)
        }
    }
    return {
        url,
        ...(commit != null && { commit }),
        ...(subdirectory != null && { subdirectory }),
    }
}

/**
 * Validate the `environment` block, keeping it in its rich form: a value is
 * either a scalar (used as-is) or a descriptor object that install resolves
 * into a concrete value by prompting or applying a default.
 */
function normalizeEnvironment(environment, source) {
    if (environment == null) return {}
    if (!isPlainObject(environment)) fail(source, "environment must be a mapping")
    const normalized = {}
    for (const [key, value] of Object.entries(environment)) {
        if (isScalar(value)) {
            normalized[key] = value
        } else if (isPlainObject(value)) {
            normalized[key] = normalizeEnvDescriptor(key, value, source)
        } else {
            fail(source, `environment.${key} must be a value or a descriptor mapping`)
        }
    }
    return normalized
}

function normalizeEnvDescriptor(key, descriptor, source) {
    const { secret, required, default: defaultValue, options, description } = descriptor
    if (secret != null && typeof secret !== "boolean") {
        fail(source, `environment.${key}.secret must be a boolean`)
    }
    if (required != null && typeof required !== "boolean") {
        fail(source, `environment.${key}.required must be a boolean`)
    }
    if (defaultValue != null && !isScalar(defaultValue)) {
        fail(source, `environment.${key}.default must be a value`)
    }
    if (options != null && (!Array.isArray(options) || options.some(o => !isScalar(o)))) {
        fail(source, `environment.${key}.options must be an array of values`)
    }
    if (description != null && typeof description !== "string") {
        fail(source, `environment.${key}.description must be a string`)
    }
    return {
        ...(secret != null && { secret }),
        ...(required != null && { required }),
        ...(defaultValue != null && { default: defaultValue }),
        ...(options != null && { options }),
        ...(description != null && { description }),
    }
}

/**
 * Normalize the permission model. Default is no access at all. A boolean
 * `network` is accepted as shorthand for `{ outbound: <bool> }`.
 */
function normalizePermissions(permissions, source) {
    if (permissions == null) {
        return { network: { outbound: false }, filesystem: [] }
    }
    if (!isPlainObject(permissions)) fail(source, "permissions must be a mapping")

    return {
        network: normalizeNetwork(permissions.network, source),
        filesystem: normalizeFilesystem(permissions.filesystem, source),
        ...(permissions.compute != null && {
            compute: normalizeCompute(permissions.compute, source),
        }),
    }
}

function normalizeNetwork(network, source) {
    if (network == null) return { outbound: false }
    if (typeof network === "boolean") return { outbound: network }
    if (!isPlainObject(network)) fail(source, "permissions.network must be a boolean or a mapping")
    const outbound = network.outbound ?? false
    if (typeof outbound !== "boolean") {
        fail(source, "permissions.network.outbound must be a boolean")
    }
    if (network.allow != null) {
        if (!Array.isArray(network.allow) || network.allow.some(h => typeof h !== "string")) {
            fail(source, "permissions.network.allow must be an array of host strings")
        }
    }
    return { outbound, ...(network.allow != null && { allow: network.allow }) }
}

function normalizeFilesystem(filesystem, source) {
    if (filesystem == null) return []
    if (!Array.isArray(filesystem) || filesystem.some(entry => typeof entry !== "string")) {
        fail(source, 'permissions.filesystem must be an array of "host:container[:mode]" strings')
    }
    return filesystem
}

function normalizeCompute(compute, source) {
    if (!isPlainObject(compute)) fail(source, "permissions.compute must be a mapping")
    const { cpus, memory } = compute
    if (cpus != null && (typeof cpus !== "number" || cpus <= 0)) {
        fail(source, "permissions.compute.cpus must be a positive number")
    }
    if (memory != null && typeof memory !== "string" && typeof memory !== "number") {
        fail(source, "permissions.compute.memory must be a size like `512m` or a byte count")
    }
    return {
        ...(cpus != null && { cpus }),
        ...(memory != null && { memory }),
    }
}

function normalizeScripts(scripts, source) {
    if (!isPlainObject(scripts)) fail(source, "scripts must be a mapping")
    const normalized = {}
    for (const [phase, script] of Object.entries(scripts)) {
        if (typeof script === "string") {
            normalized[phase] = script
        } else if (isPlainObject(script) && typeof script.inline === "string") {
            normalized[phase] = { inline: script.inline }
        } else {
            fail(source, `scripts.${phase} must be a path string or a { inline } mapping`)
        }
    }
    return normalized
}

function isScalar(value) {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

/**
 * A human-readable summary of what a config grants, shown on the consent
 * screen before install and in `mcpod marketplace info`.
 */
export function describePermissions(config) {
    const net = config.permissions?.network
    const network = net?.outbound
        ? `outbound allowed${net.allow?.length ? ` (${net.allow.join(", ")})` : ""}`
        : "none — fully isolated"
    const filesystem = config.permissions?.filesystem?.length
        ? config.permissions.filesystem.join(", ")
        : "none"
    const compute = config.permissions?.compute
        ? `${config.permissions.compute.cpus ?? "?"} cpus, ${config.permissions.compute.memory ?? "?"} memory`
        : "default limits"
    return { network, filesystem, compute }
}
