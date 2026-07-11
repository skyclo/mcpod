import { confirm } from "@inquirer/prompts"
import { createUI, promptTheme } from "../src/ui.js"
import { ensureDaemon } from "../src/docker/client.js"
import { pullImage } from "../src/docker/images.js"
import { resolveConfig } from "../src/marketplace/index.js"
import { deleteRecord, listRecords, loadRecord, saveRecord } from "../src/state/records.js"
import { describePermissions } from "../src/config/index.js"
import { layerLines, resolveEnvironment } from "./install.js"

/**
 * Compare dotted versions. Returns a positive number when `a` is newer than
 * `b`, negative when older, 0 when equal. Non-numeric segments fall back to a
 * string comparison so odd version strings still order deterministically.
 */
export function compareVersions(a, b) {
    const pa = String(a).split(".")
    const pb = String(b).split(".")
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = Number(pa[i])
        const nb = Number(pb[i])
        if (Number.isInteger(na) && Number.isInteger(nb)) {
            if (na !== nb) return na - nb
        } else {
            const cmp = (pa[i] ?? "").localeCompare(pb[i] ?? "")
            if (cmp !== 0) return cmp
        }
    }
    return 0
}

/**
 * Reinstall one server at the marketplace's current version. Update means
 * stop, remove, recreate — there is no in-place patching — so this re-pulls
 * the image and rewrites the install record. A running container is not
 * touched; the next `mcpod run` picks up the new config.
 *
 * @returns {Promise<"updated"|"current"|"missing">}
 */
async function updateOne(name, options, ui) {
    const record = await loadRecord(name)
    if (!record) {
        ui.error(`${name} is not installed. Install it first with \`mcpod install ${name}\`.`)
        return "missing"
    }
    const installedVersion = record.config?.metadata?.version ?? "0.0.0"

    const resolving = ui.task(`Checking marketplace for ${name}`)
    const config = await resolveConfig(name).catch(err => {
        resolving.fail(err.message)
        throw err
    })
    const latestVersion = config.metadata.version

    if (compareVersions(latestVersion, installedVersion) <= 0) {
        resolving.succeed(`${name} is already up to date (v${installedVersion}).`)
        return "current"
    }
    resolving.succeed(`${name} v${installedVersion} → v${latestVersion} available`)

    // Permissions can change between versions; re-consent when they do.
    const permsChanged =
        JSON.stringify(record.config?.permissions) !== JSON.stringify(config.permissions)
    if (permsChanged) {
        const perms = describePermissions(config)
        ui.blank()
        ui.info(`${name} v${latestVersion} requests updated permissions:`)
        ui.detail(`network:     ${perms.network}`)
        ui.detail(`filesystem:  ${perms.filesystem}`)
        ui.detail(`compute:     ${perms.compute}`)
        ui.blank()
        if (options.yes) {
            ui.info("Updated permissions accepted via --yes.")
        } else if (!ui.interactive) {
            ui.error(`Permissions changed for ${name}; pass --yes to accept and update.`)
            return "current"
        } else {
            const granted = await confirm({
                message: "Grant the updated permissions and update?",
                default: true,
                theme: promptTheme,
            })
            if (!granted) {
                ui.warn(`Skipped ${name} — updated permissions not granted.`)
                return "current"
            }
            ui.blank()
        }
    }

    const environment = await resolveEnvironment(config.environment, {
        interactive: ui.interactive,
        yes: options.yes,
        existing: record.config?.environment ?? {},
    })

    const pull = ui.task(`Pulling image ${config.image}`)
    await pullImage(config.image, ({ fraction, detail, layers }) =>
        pull.progress(fraction, detail, layerLines(layers, ui.interactive))
    ).catch(err => {
        pull.fail(`Failed to pull ${config.image}: ${err.message}`)
        throw err
    })
    pull.succeed(`Image ${config.image} ready`)

    // Stop, remove, recreate: drop the old record and write the new one,
    // keeping the existing client registrations (they point at `mcpod run`,
    // which is version-agnostic).
    await deleteRecord(name)
    await saveRecord(name, {
        config: { ...config, environment },
        clients: record.clients ?? [],
        installedAt: new Date().toISOString(),
    })
    ui.success(`Updated ${name} to v${latestVersion}.`)
    return "updated"
}

export default program => {
    program
        .command("update [name]")
        .description("Reinstall a server at the newer version available in the marketplace.")
        .option("-a, --all", "update every installed server")
        .option("-y, --yes", "accept updated permissions without prompting")
        .action(async (name, options) => {
            const ui = createUI()
            ui.banner(options.all ? "update --all" : `update ${name ?? ""}`.trim())

            try {
                if (!name && !options.all) {
                    ui.error("Provide a server name, or pass --all to update every server.")
                    process.exitCode = 1
                    return
                }
                if (name && options.all) {
                    ui.error("Pass either a server name or --all, not both.")
                    process.exitCode = 1
                    return
                }

                const names = options.all ? await listRecords() : [name]
                if (!names.length) {
                    ui.info("No servers installed.")
                    return
                }

                const daemon = ui.task("Connecting to Docker daemon")
                const version = await ensureDaemon().catch(err => {
                    daemon.fail(err.message)
                    throw err
                })
                daemon.succeed(`Docker daemon connected (v${version})`)

                const counts = { updated: 0, current: 0, missing: 0 }
                for (const target of names) {
                    ui.blank()
                    counts[await updateOne(target, options, ui)] += 1
                }

                if (options.all) {
                    ui.blank()
                    ui.success(
                        `Done — ${counts.updated} updated, ${counts.current} already current` +
                            (counts.missing ? `, ${counts.missing} not installed` : "") +
                            "."
                    )
                }
                if (counts.missing) process.exitCode = 1
            } catch (err) {
                if (err?.name === "ExitPromptError") {
                    ui.warn("Update cancelled.")
                    process.exitCode = 1
                    return
                }
                ui.error(err.message)
                process.exitCode = 1
            }
        })
}
