import chalk from "chalk";

export default (program) => {
  program
    .command("update [name]")
    .description("Reinstall a server at the newer version available in the marketplace.")
    .option("-a, --all", "update every installed server")
    .action((name) => {
      console.log(chalk.yellow(`mcpod update: not implemented yet (${name ?? "--all"})`));
    });
};
