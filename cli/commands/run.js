import chalk from "chalk";

export default (program) => {
  program
    .command("run <name>")
    .description("Start an installed MCP server as a Docker container.")
    .option("--cwd <path>", "scope filesystem permissions to this directory")
    .action((name) => {
      console.log(chalk.yellow(`mcpod run: not implemented yet (${name})`));
    });
};
