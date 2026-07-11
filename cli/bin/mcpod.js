#!/usr/bin/env node
import { readdirSync } from "fs"
import { fileURLToPath } from "url"
import pkg from "../package.json" with { type: "json" }
import { Command } from "commander"

const commandsDir = fileURLToPath(new URL("../commands/", import.meta.url))

const program = new Command()

program
    .name("mcpod")
    .description("Install, manage, and run MCP servers inside isolated Docker containers.")
    .version(pkg.version)

for (const file of readdirSync(commandsDir)
    .filter(f => f.endsWith(".js"))
    .sort()) {
    const { default: registerCommand } = await import(`../commands/${file}`)
    registerCommand(program)
}

program.parseAsync(process.argv)
