import { confirm } from "@inquirer/prompts"
import { createUI, promptTheme } from "../src/ui.js"
import { ensureDaemon } from "../src/docker/client.js"
import { listServerContainers, stopContainer } from "../src/docker/containers.js"
import { listRecords, loadRecord } from "../src/state/records.js"

export default program => {
    program
        .command("stop [name]")
        .description("Stop a running MCP server.")
        .option("-a, --all", "stop all running servers")
        .option("-f, --force", "skip the confirmation prompt")
        .action(async (name, options) => {
            const ui = createUI()
            ui.banner(options.all ? "stop --all" : `stop ${name ?? ""}`)

            try {
                if (options.all && name) {
                    ui.error("Pass either a server name or --all, not both.")
                    process.exitCode = 1
                    return
                }
                if (!options.all && !name) {
                    ui.error(
                        "Specify a server to stop, or pass --all to stop every running server."
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

                // Resolve the target servers, then find their running containers.
                let targets
                if (options.all) {
                    targets = await listRecords()
                } else {
                    if (!(await loadRecord(name))) {
                        ui.error(
                            `${name} is not installed. Install it first with \`mcpod install ${name}\`.`
                        )
                        process.exitCode = 1
                        return
                    }
                    targets = [name]
                }

                const running = []
                for (const target of targets) {
                    for (const c of await listServerContainers(target, { all: false })) {
                        running.push({ server: target, ...c })
                    }
                }

                if (running.length === 0) {
                    if (options.all) {
                        ui.warn("No MCP servers are currently running.")
                    } else {
                        ui.error(`${name} is not currently running.`)
                    }
                    process.exitCode = 1
                    return
                }

                // Stopping multiple servers at once is destructive enough to confirm.
                if (options.all && !options.force) {
                    if (!ui.interactive) {
                        ui.error(
                            `Non-interactive session: pass --force to stop ${running.length} running container(s).`
                        )
                        process.exitCode = 1
                        return
                    }
                    ui.blank()
                    ui.info(`About to stop ${running.length} running container(s):`)
                    for (const c of running) ui.detail(`${c.server} (${c.name})`)
                    ui.blank()
                    const ok = await confirm({
                        message: "Stop them all?",
                        default: true,
                        theme: promptTheme,
                    })
                    if (!ok) {
                        ui.warn("Stop cancelled.")
                        process.exitCode = 1
                        return
                    }
                    ui.blank()
                }

                let stopped = 0
                for (const c of running) {
                    const task = ui.task(`Stopping ${c.server} (${c.name})`)
                    try {
                        await stopContainer(c.id)
                        task.succeed(`Stopped ${c.server} (${c.name})`)
                        stopped++
                    } catch (err) {
                        task.fail(`Failed to stop ${c.server} (${c.name}): ${err.message}`)
                    }
                }

                ui.blank()
                ui.success(`Stopped ${stopped} of ${running.length} running container(s).`)
                if (stopped < running.length) process.exitCode = 1
            } catch (err) {
                if (err?.name === "ExitPromptError") {
                    ui.warn("Stop cancelled.")
                    process.exitCode = 1
                    return
                }
                ui.error(err.message)
                process.exitCode = 1
            }
        })
}
