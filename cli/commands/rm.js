import chalk from "chalk";

export default (program) => {
  program
    .command("rm <name>")
    .description("Uninstall an MCP server and remove its container.")
    .option("-f, --force", "skip the confirmation prompt")
    .action((name) => {
      console.log(chalk.yellow(`mcpod rm: not implemented yet (${name})`));
    });
};
