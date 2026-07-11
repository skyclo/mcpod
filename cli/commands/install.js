import { checkbox, confirm } from "@inquirer/prompts"
import { createUI, promptTheme, renderBar } from "../src/ui.js"
import { ensureDaemon } from "../src/docker/client.js"
import { formatBytes, pullImage } from "../src/docker/images.js"
import { allClientSpecs, clientChoices, parseClientSpec, registerServer } from "../src/clients.js"
import { loadRecord, loadSettings, saveRecord } from "../src/state/records.js"

// Emulated marketplace config for the Context7 MCP server, standing in for a
// fetched + parsed config.mcpod until the marketplace client and config
// module land. Context7 ships no Docker image of its own, so this config
// does what a config.mcpod author would: run the published npm package on a
// generic Node base image and grant only the network access it needs (npm
// registry to fetch the package, context7.com for the docs API).
const EMULATED_CONFIG = {
    metadata: {
        name: "context7",
        description: "Context7 MCP server — up-to-date code docs and examples for LLMs.",
        version: "1.0.0",
        author: "Upstash",
    },
    image: "node:22-alpine",
    command: ["npx", "-y", "@upstash/context7-mcp"],
    transport: "stdio",
    environment: {},
    permissions: {
        network: {
            outbound: true,
            allow: ["registry.npmjs.org", "context7.com", "*.context7.com"],
        },
        filesystem: [],
        compute: { cpus: 1, memory: "512m" },
    },
    restart: "no",
}

function describePermissions(config) {
    const network = config.permissions?.network?.outbound
        ? `outbound allowed${config.permissions.network.allow ? ` (${config.permissions.network.allow.join(", ")})` : ""}`
        : "none — fully isolated"
    const filesystem = config.permissions?.filesystem?.length
        ? config.permissions.filesystem.join(", ")
        : "none"
    const compute = config.permissions?.compute
        ? `${config.permissions.compute.cpus ?? "?"} cpus, ${config.permissions.compute.memory ?? "?"} memory`
        : "default limits"
    return { network, filesystem, compute }
}

/** One display line per image layer, sized for spinners or log lines. */
function layerLines(layers, interactive) {
    if (interactive) {
        return layers.map(layer => {
            const fraction = layer.total ? layer.current / layer.total : layer.done ? 1 : 0
            const pct = `${Math.round(fraction * 100)}%`.padStart(4)
            const size = layer.total
                ? `  ${formatBytes(layer.current)} / ${formatBytes(layer.total)}`
                : ""
            return `${layer.id.padEnd(14)} ${renderBar(fraction, 12)} ${pct}  ${layer.status}${size}`
        })
    }
    // Logging mode: only the layers still in flight, compactly.
    return layers
        .filter(layer => !layer.done)
        .map(layer => {
            const pct = layer.total ? ` ${Math.round((layer.current / layer.total) * 100)}%` : ""
            return `${layer.id} ${layer.status}${pct}`
        })
}

/**
 * Decide which MCP clients to register the server with. Flags win; then an
 * interactive picker; then (non-interactive) `defaultClients` from
 * ~/.mcpod/config.json; otherwise none.
 */
async function resolveClientSpecs(name, options, ui) {
    if (options.client.length) return options.client
    if (!ui.interactive) {
        const settings = await loadSettings()
        const specs = settings.defaultClients ?? []
        if (specs.length) {
            ui.info(`Using defaultClients from ~/.mcpod/config.json: ${specs.join(", ")}`)
        } else {
            ui.info(
                "Skipping client registration (no --client flag, no defaultClients in ~/.mcpod/config.json)."
            )
        }
        return specs
    }
    // TODO: if a user's ~/.mcpod/config.json has defaultClients, pre-select those in the interactive picker.
    // promptTheme indents the message and choice rows to match the install
    // banner's 2-space gutter; the instructions line is indented to match here.
    return checkbox({
        message: `Register ${name} with which MCP clients?`,
        choices: clientChoices(),
        instructions: "  (space to select, enter to confirm — select none to skip)",
        theme: promptTheme,
    })
}

export default program => {
    program
        .command("install <name>")
        .description("Install an MCP server from the marketplace, a local path, or a Git repo URL.")
        .option("-y, --yes", "accept the server's requested permissions without prompting")
        .option(
            "-c, --client <client:scope>",
            `register the server with an MCP client (repeatable or comma-separated; one of: ${allClientSpecs().join(", ")})`,
            (value, previous) => previous.concat(value.split(",")),
            []
        )
        .option(
            "--interpret-unsafe",
            "use Gemini to translate the server's docs into a config.mcpod when none exists"
        )
        .action(async (name, options) => {
            const ui = createUI()
            ui.banner(`install ${name}`)

            try {
                // Fail fast on bad --client specs before touching Docker.
                options.client.forEach(parseClientSpec)

                if (options.interpretUnsafe) {
                    ui.warn(
                        "--interpret-unsafe is not implemented yet; using the standard install path."
                    )
                }

                if (await loadRecord(name)) {
                    ui.error(
                        `${name} is already installed. Remove it first with \`mcpod rm ${name}\`.`
                    )
                    process.exitCode = 1
                    return
                }

                const daemon = ui.task("Connecting to Docker daemon")
                const version = await ensureDaemon().catch(err => {
                    daemon.fail(err.message)
                    throw err
                })
                daemon.succeed(`Docker daemon connected (v${version})`)

                const resolving = ui.task(`Resolving ${name} from marketplace`)
                const config = {
                    ...EMULATED_CONFIG,
                    metadata: { ...EMULATED_CONFIG.metadata, name },
                }
                resolving.succeed(`Resolved ${name} v${config.metadata.version} (emulated config)`)

                // Consent screen: the user grants the config's permissions before
                // anything is downloaded.
                const perms = describePermissions(config)
                ui.blank()
                ui.info(`${name} requests the following permissions:`)
                ui.detail(`network:     ${perms.network}`)
                ui.detail(`filesystem:  ${perms.filesystem}`)
                ui.detail(`compute:     ${perms.compute}`)
                ui.blank()

                if (options.yes) {
                    ui.info("Permissions accepted via --yes.")
                } else if (!ui.interactive) {
                    ui.error("Non-interactive session: pass --yes to accept these permissions.")
                    process.exitCode = 1
                    return
                } else {
                    const granted = await confirm({
                        message: "Grant these permissions and install?",
                        default: true,
                        theme: promptTheme,
                    })
                    if (!granted) {
                        ui.warn(
                            "Install cancelled — no permissions granted, nothing was installed."
                        )
                        process.exitCode = 1
                        return
                    }
                    ui.blank()
                }

                const pull = ui.task(`Pulling image ${config.image}`)
                await pullImage(config.image, ({ fraction, detail, layers }) =>
                    pull.progress(fraction, detail, layerLines(layers, ui.interactive))
                ).catch(err => {
                    pull.fail(`Failed to pull ${config.image}: ${err.message}`)
                    throw err
                })
                pull.succeed(`Image ${config.image} ready`)

                // Register the server with MCP clients so they launch it via
                // `mcpod run <name>`.
                ui.blank()
                const specs = await resolveClientSpecs(name, options, ui)
                const registrations = specs.length ? await registerServer(name, specs) : []
                const registered = []
                for (const result of registrations) {
                    if (result.error) {
                        ui.warn(`Could not register with ${result.spec}: ${result.error}`)
                    } else {
                        ui.success(`Registered with ${result.spec} → ${result.path}`)
                        registered.push({ spec: result.spec, path: result.path })
                    }
                }

                const recordFile = await saveRecord(name, {
                    config,
                    clients: registered,
                    installedAt: new Date().toISOString(),
                })
                ui.success(`Install record saved to ${recordFile}`)

                ui.blank()
                ui.success(
                    `Installed ${name} v${config.metadata.version} — start it with \`mcpod run ${name}\``
                )
            } catch (err) {
                if (err?.name === "ExitPromptError") {
                    ui.warn("Install cancelled.")
                    process.exitCode = 1
                    return
                }
                ui.error(err.message)
                process.exitCode = 1
            }
        })
}
