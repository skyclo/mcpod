import chalk from "chalk"
import { describePermissions } from "../src/config/index.js"
import {
    fetchConfigText,
    getServerInfo,
    listServers,
    marketplaceUrl,
    resolveConfig,
    searchServers,
} from "../src/marketplace/index.js"

// Browse output is user-facing data, not MCP protocol traffic, so it goes to
// stdout (greppable, redirectable) — `mcpod marketplace fetch <name> > cfg`
// writes a clean config.mcpod. Errors go to stderr via `fail`.

function fail(message) {
    process.stderr.write(`${chalk.red("✖")} ${message}\n`)
    process.exitCode = 1
}

/** Print a page of servers as an aligned NAME / VERSION / DESCRIPTION table. */
function printServerTable(page) {
    if (!page.servers.length) {
        console.log(chalk.dim("No servers found."))
        return
    }
    const nameWidth = Math.max(4, ...page.servers.map(s => s.name.length))
    const versionWidth = Math.max(7, ...page.servers.map(s => (s.version ?? "").length))
    console.log(
        chalk.bold(
            `${"NAME".padEnd(nameWidth)}  ${"VERSION".padEnd(versionWidth)}  DESCRIPTION`
        )
    )
    for (const server of page.servers) {
        console.log(
            `${chalk.cyan(server.name.padEnd(nameWidth))}  ` +
                `${(server.version ?? "").padEnd(versionWidth)}  ` +
                `${chalk.dim(server.description ?? "")}`
        )
    }
    const shown = page.servers.length
    const from = (page.page - 1) * page.pageSize + 1
    console.log(
        chalk.dim(
            `\nShowing ${from}–${from + shown - 1} of ${page.total} ` +
                `(page ${page.page}/${page.totalPages}).` +
                (page.page < page.totalPages ? ` Use --page ${page.page + 1} for more.` : "")
        )
    )
}

function paginationOptions(command) {
    return command
        .option("-p, --page <n>", "page number", value => Number.parseInt(value, 10), 1)
        .option(
            "--page-size <n>",
            "results per page",
            value => Number.parseInt(value, 10),
            50
        )
}

export default program => {
    const marketplace = program
        .command("marketplace")
        .description("Browse the MCP server registry.")

    paginationOptions(
        marketplace.command("search <query>").description("Search the registry by keyword.")
    ).action(async (query, options) => {
        try {
            const page = await searchServers(query, {
                page: options.page,
                pageSize: options.pageSize,
            })
            printServerTable(page)
        } catch (err) {
            fail(err.message)
        }
    })

    paginationOptions(
        marketplace.command("list").description("List all servers in the registry.")
    ).action(async options => {
        try {
            const page = await listServers({ page: options.page, pageSize: options.pageSize })
            printServerTable(page)
        } catch (err) {
            fail(err.message)
        }
    })

    marketplace
        .command("fetch <name>")
        .description("Fetch a server's config.mcpod without installing it.")
        .action(async name => {
            try {
                const text = await fetchConfigText(name)
                process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
            } catch (err) {
                fail(err.message)
            }
        })

    marketplace
        .command("info <name>")
        .description("Show details for a server in the registry.")
        .action(async name => {
            try {
                const info = await getServerInfo(name)
                if (!info) {
                    fail(`No server named "${name}" in the marketplace (${marketplaceUrl()}).`)
                    return
                }
                console.log(chalk.bold.cyan(info.name) + chalk.dim(` v${info.version ?? "?"}`))
                if (info.displayName) console.log(info.displayName)
                if (info.description) console.log(info.description)
                console.log()
                if (info.author) console.log(`${chalk.bold("author:")}  ${info.author}`)
                if (info.gitUrl) console.log(`${chalk.bold("source:")}  ${info.gitUrl}`)
                if (info.tags?.length) {
                    console.log(`${chalk.bold("tags:")}    ${info.tags.join(", ")}`)
                }

                // The permission summary comes from the actual config.mcpod, so
                // `info` previews the same consent screen install would show.
                const config = await resolveConfig(name)
                const perms = describePermissions(config)
                console.log()
                console.log(chalk.bold("permissions:"))
                console.log(`  network:     ${perms.network}`)
                console.log(`  filesystem:  ${perms.filesystem}`)
                console.log(`  compute:     ${perms.compute}`)
                console.log()
                console.log(chalk.dim(`Install with \`mcpod install ${info.name}\`.`))
            } catch (err) {
                fail(err.message)
            }
        })
}
