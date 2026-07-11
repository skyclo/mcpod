import { statSync } from "fs"
import { resolve } from "path"
import { createUI } from "../src/ui.js"
import { ensureDaemon } from "../src/docker/client.js"
import { imageExists, pullImage } from "../src/docker/images.js"
import { attachStdio, createServerContainer, makeContainerName } from "../src/docker/containers.js"
import { loadRecord } from "../src/state/records.js"

export default program => {
    program
        .command("run <name>")
        .description("Start an installed MCP server as a Docker container.")
        .option("--cwd <path>", "scope filesystem permissions to this directory")
        .action(async (name, options) => {
            const ui = createUI()
            ui.banner(`run ${name}`)

            try {
                const record = await loadRecord(name)
                if (!record) {
                    ui.error(
                        `${name} is not installed. Install it first with \`mcpod install ${name}\`.`
                    )
                    process.exitCode = 1
                    return
                }
                const config = record.config

                let cwd
                if (options.cwd) {
                    cwd = resolve(options.cwd)
                    if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
                        ui.error(`--cwd is not a directory: ${cwd}`)
                        process.exitCode = 1
                        return
                    }
                }

                const daemon = ui.task("Connecting to Docker daemon")
                const version = await ensureDaemon().catch(err => {
                    daemon.fail(err.message)
                    throw err
                })
                daemon.succeed(`Docker daemon connected (v${version})`)

                if (!(await imageExists(config.image))) {
                    const pull = ui.task(`Image ${config.image} missing locally, pulling`)
                    await pullImage(config.image, (fraction, detail) =>
                        pull.progress(fraction, detail)
                    ).catch(err => {
                        pull.fail(`Failed to pull ${config.image}: ${err.message}`)
                        throw err
                    })
                    pull.succeed(`Image ${config.image} ready`)
                }

                const containerName = makeContainerName(name, cwd ?? "")
                const creating = ui.task(`Creating container ${containerName}`)
                const container = await createServerContainer(config, {
                    name: containerName,
                    cwd,
                }).catch(err => {
                    creating.fail(`Failed to create container: ${err.message}`)
                    throw err
                })
                const network = config.permissions?.network?.outbound ? "outbound" : "none"
                creating.succeed(
                    `Container ${containerName} created (network: ${network}${cwd ? `, cwd: ${cwd} → /workspace` : ""})`
                )

                const stdio = (config.transport ?? "stdio") === "stdio"
                // Attach before start so no early server output is lost.
                const stream = stdio ? await attachStdio(container) : null

                const starting = ui.task("Starting server")
                await container.start().catch(err => {
                    starting.fail(`Failed to start: ${err.message}`)
                    throw err
                })
                starting.succeed(`Server ${name} running`)

                let stopping = false
                const stop = async signal => {
                    if (stopping) return
                    stopping = true
                    ui.blank()
                    ui.warn(`Received ${signal}, stopping ${name}...`)
                    await container.stop({ t: 5 }).catch(() => {})
                }
                process.on("SIGINT", () => stop("SIGINT"))
                process.on("SIGTERM", () => stop("SIGTERM"))

                if (!stdio) {
                    ui.info(`Transport is ${config.transport}; container runs until stopped.`)
                }

                const { StatusCode: exitCode } = await container.wait({ condition: "next-exit" })

                stream?.destroy()
                process.stdin.pause()

                if (exitCode === 0 || stopping) {
                    ui.success(`${name} stopped (exit code ${exitCode}).`)
                } else {
                    ui.error(`${name} exited with code ${exitCode}.`)
                    process.exitCode = exitCode || 1
                }
            } catch (err) {
                ui.error(err.message)
                process.exitCode = 1
            }
        })
}
