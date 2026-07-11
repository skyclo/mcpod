import chalk from "chalk";

export default (program) => {
  program
    .command("install <name>")
    .description("Install an MCP server from the marketplace, a local path, or a Git repo URL.")
    .option(
      "--interpret-unsafe",
      "use Gemini to translate the server's docs into a config.mcpod when none exists",
    )
    .action((name) => {
      console.log(chalk.yellow(`mcpod install: not implemented yet (${name})`));
    });
};
