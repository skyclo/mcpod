import chalk from "chalk";

export default (program) => {
  program
    .command("stop <name>")
    .description("Stop a running MCP server.")
    .option("-a, --all", "stop all running servers")
    .option("-f, --force", "skip the confirmation prompt")
    .action((name) => {
      console.log(chalk.yellow(`mcpod stop: not implemented yet (${name})`));
    });
};
