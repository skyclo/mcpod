import chalk from "chalk"

export default program => {
    const marketplace = program
        .command("marketplace")
        .description("Browse the MCP server registry.")

    marketplace
        .command("search <query>")
        .description("Search the registry by keyword.")
        .action(query => {
            console.log(chalk.yellow(`mcpod marketplace search: not implemented yet (${query})`))
        })

    marketplace
        .command("list")
        .description("List all servers in the registry.")
        .action(() => {
            console.log(chalk.yellow("mcpod marketplace list: not implemented yet"))
        })

    marketplace
        .command("fetch <name>")
        .description("Fetch a server's config.mcpod without installing it.")
        .action(name => {
            console.log(chalk.yellow(`mcpod marketplace fetch: not implemented yet (${name})`))
        })

    marketplace
        .command("info <name>")
        .description("Show details for a server in the registry.")
        .action(name => {
            console.log(chalk.yellow(`mcpod marketplace info: not implemented yet (${name})`))
        })
}
