import { checkbox, confirm, input, password, select } from "@inquirer/prompts"
import { createUI, promptTheme, renderBar } from "../src/ui.js"
import { ensureDaemon } from "../src/docker/client.js"
import { formatBytes, pullImage } from "../src/docker/images.js"
import { allClientSpecs, clientChoices, parseClientSpec, registerServer } from "../src/clients.js"
import { loadRecord, loadSettings, saveRecord } from "../src/state/records.js"
import { describePermissions } from "../src/config/index.js"
import { resolveConfig } from "../src/marketplace/index.js"

function isEnvDescriptor(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Turn a config's `environment` block into the flat `{ KEY: value }` map the
 * container gets. Scalars pass through; descriptor entries are prompted for
 * (interactive) or filled from their default. A required descriptor with no
 * default and no answer aborts install rather than starting a broken server.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function resolveEnvironment(environment, { interactive, yes, existing = {} }) {
    const resolved = {}
    for (const [key, spec] of Object.entries(environment ?? {})) {
        if (!isEnvDescriptor(spec)) {
            resolved[key] = String(spec)
            continue
        }

        // Prefer a previously stored answer (used by `update`), then the
        // descriptor's own default.
        const fallback =
            existing[key] != null
                ? String(existing[key])
                : spec.default != null
                  ? String(spec.default)
                  : undefined
        if (!interactive || yes) {
            if (fallback !== undefined) {
                resolved[key] = fallback
            } else if (spec.required) {
                throw new Error(
                    `Environment variable ${key} is required but has no default; ` +
                        "run install interactively to provide it."
                )
            }
            continue
        }

        const message = `${key}${spec.description ? ` — ${spec.description}` : ""}`
        let answer
        if (spec.options?.length) {
            answer = await select({
                message,
                choices: spec.options.map(o => ({ value: String(o) })),
                default: fallback,
                theme: promptTheme,
            })
        } else if (spec.secret) {
            answer = await password({ message, mask: true, theme: promptTheme })
        } else {
            answer = await input({ message, default: fallback, theme: promptTheme })
        }
        answer = answer?.trim()
        if (answer) {
            resolved[key] = answer
        } else if (spec.required) {
            throw new Error(`Environment variable ${key} is required.`)
        }
    }
    return resolved
}

/** One display line per image layer, sized for spinners or log lines. */
export function layerLines(layers, interactive) {
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
                const config = await resolveConfig(name).catch(err => {
                    resolving.fail(err.message)
                    throw err
                })
                resolving.succeed(`Resolved ${name} v${config.metadata.version} from marketplace`)

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

                // Resolve the environment now (prompting for any descriptor
                // values) so the stored config carries a flat `{ KEY: value }`
                // map that `mcpod run` can hand straight to the container.
                const environment = await resolveEnvironment(config.environment, {
                    interactive: ui.interactive,
                    yes: options.yes,
                })
                if (Object.keys(config.environment ?? {}).length) {
                    ui.blank()
                }
                const recordConfig = { ...config, environment }

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
                    config: recordConfig,
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
