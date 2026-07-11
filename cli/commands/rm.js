import { confirm } from "@inquirer/prompts"
import { createUI, promptTheme } from "../src/ui.js"
import { ensureDaemon } from "../src/docker/client.js"
import { listServerContainers, removeContainer } from "../src/docker/containers.js"
import { unregisterServer } from "../src/clients.js"
import { deleteRecord, loadRecord } from "../src/state/records.js"

export default program => {
    program
        .command("rm <name>")
        .description("Uninstall an MCP server and remove its container.")
        .option("-f, --force", "skip the confirmation prompt")
        .action(async (name, options) => {
            const ui = createUI()
            ui.banner(`rm ${name}`)

            try {
                const record = await loadRecord(name)
                if (!record) {
                    ui.error(`${name} is not installed.`)
                    process.exitCode = 1
                    return
                }
                const clients = record.clients ?? []

                // rm is destructive: confirm unless forced.
                if (!options.force) {
                    if (!ui.interactive) {
                        ui.error(`Non-interactive session: pass --force to uninstall ${name}.`)
                        process.exitCode = 1
                        return
                    }
                    ui.blank()
                    ui.info(`This will uninstall ${name}:`)
                    ui.detail("stop and remove its containers")
                    ui.detail(
                        clients.length
                            ? `unregister from ${clients.length} client config(s)`
                            : "no client registrations to remove"
                    )
                    ui.detail("delete its install record")
                    ui.blank()
                    const ok = await confirm({
                        message: `Uninstall ${name}?`,
                        default: false,
                        theme: promptTheme,
                    })
                    if (!ok) {
                        ui.warn("Uninstall cancelled.")
                        process.exitCode = 1
                        return
                    }
                    ui.blank()
                }

                // Container removal needs the daemon; if it is down, warn and
                // continue so the install record and client entries still get
                // cleaned up. Leftover containers are named `mcpod-<name>-*`.
                const daemon = ui.task("Connecting to Docker daemon")
                let daemonUp = true
                await ensureDaemon().then(
                    v => daemon.succeed(`Docker daemon connected (v${v})`),
                    err => {
                        daemonUp = false
                        daemon.fail(err.message)
                    }
                )

                if (daemonUp) {
                    const containers = await listServerContainers(name, { all: true })
                    if (containers.length === 0) {
                        ui.info("No containers to remove.")
                    }
                    for (const c of containers) {
                        const task = ui.task(`Removing container ${c.name}`)
                        try {
                            await removeContainer(c.id)
                            task.succeed(`Removed container ${c.name}`)
                        } catch (err) {
                            task.fail(`Failed to remove ${c.name}: ${err.message}`)
                        }
                    }
                } else {
                    ui.warn(
                        "Docker daemon unreachable — skipping container removal. Remove leftover mcpod containers once Docker is running."
                    )
                }

                // Unregister from the MCP clients recorded at install time.
                if (clients.length) {
                    for (const r of await unregisterServer(name, clients)) {
                        if (r.error) ui.warn(`Could not update ${r.spec}: ${r.error}`)
                        else if (r.removed) ui.success(`Unregistered from ${r.spec} → ${r.path}`)
                        else ui.detail(`${r.spec}: ${r.skipped}`)
                    }
                }

                // Delete the install record last, so a failure above leaves the
                // record intact and the uninstall can be retried.
                await deleteRecord(name)
                ui.success(`Removed install record for ${name}`)

                ui.blank()
                ui.success(`Uninstalled ${name}.`)
            } catch (err) {
                if (err?.name === "ExitPromptError") {
                    ui.warn("Uninstall cancelled.")
                    process.exitCode = 1
                    return
                }
                ui.error(err.message)
                process.exitCode = 1
            }
        })
}
