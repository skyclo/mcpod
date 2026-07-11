# AGENTS.md

Guidance for AI coding agents working in this repository. Humans may read it too, but the
canonical project description lives in `README.md`.

## What MCPod is

MCPod (MCP + Pod) is a CLI tool that installs, manages, and runs MCP (Model Context Protocol)
servers inside isolated Docker containers. It is being built during a 12-hour hackathon, so
prefer working code over abstraction. Do not add layers, plugins, or config options that no
current command needs.

MCPod has NOTHING to do with Minecraft. It is a tool for running AI Model Context Protocol
servers in isolated containers.

Core responsibilities:

1. **Marketplace** — browse a registry of MCP servers (`mcpod marketplace search|list|fetch|info`).
2. **Install** — install a server from the marketplace by reading the `config.mcpod` YAML file
   in the server's repository (`mcpod install <name>`). With `mcpod install --interpret-unsafe <name>`,
   MCPod calls the Google Gemini API to translate the server's README/install docs into a
   generated `config.mcpod`, which is then used for install and environment configuration.
3. **Run** — start, stop, and supervise MCP server lifecycles as Docker containers
   (`mcpod run <name>`, `mcpod stop <name>`). MCPod acts as a small Docker orchestrator.
4. **Manage** — uninstall (`mcpod rm <name>`) and update when the marketplace has a newer
   version (`mcpod update <name>`, `mcpod update -a`).
5. **Permissions** — `config.mcpod` declares what a server may access: internet access,
   filesystem paths (mounted as Docker bind volumes), and similar. MCPod enforces these when it
   creates the container. A server can also be scoped to the user's current working directory,
   in which case only that directory is mounted.

## Stack and conventions

- **Runtime:** Node.js 26, ES modules (`"type": "module"` in `package.json`). No TypeScript;
  plain JS with JSDoc types where a signature is unclear.
- **Package manager:** npm. Commit `package-lock.json`.
- **CLI framework:** Commander.js. One file per top-level command.
- **TUI/output:** `chalk` for color, `ora` for spinners, `@inquirer/prompts` for interactive
  prompts. Every interactive prompt must have a flag equivalent so commands can run
  non-interactively.
- **YAML:** the `yaml` package for parsing/serializing `config.mcpod`.
- **Docker:** `dockerode` for container control. Never shell out to the `docker` CLI from code;
  it breaks error handling and is harder to test.
- **Gemini:** only the `--interpret-unsafe` path may call the Gemini API. Read the key from the
  `GEMINI_API_KEY` environment variable. Never hardcode keys, never log them, and never call
  Gemini in any other code path.
- **Express:** only for the marketplace server, which is a separate project under `./marketplace`.
  The CLI does not run an HTTP server.

## Architecture

There are 2 components to MCPod:

- **Marketplace Server** — a registry of MCP servers, which is a separate project under
  `./marketplace`. It serves a paged JSON index of available servers and their `config.mcpod`
  files. MCPod fetches this index and the `config.mcpod` files to install servers. It is unused
  when installing from a local path or Git repo URL
- **MCPod CLI** — the main program under `./cli/`, which implements the commands above. It is a
  thin orchestrator that calls Dockerode to create and manage containers, and calls the
  marketplace server to fetch `config.mcpod` files.

## Repository layout

```
cli/                      # the main program, installed as `mcpod` in the user's PATH
cli/bin/mcpod.js          # entry point, wires Commander program
cli/commands/             # one file per command: marketplace.js, install.js, run.js, stop.js,
                          #   rm.js, update.js
cli/src/config/           # config.mcpod parsing, validation, permission model
cli/src/docker/           # container create/start/stop/remove, bind-volume construction
cli/src/marketplace/      # registry client: search, list, fetch, info
cli/src/interpret/        # Gemini-backed doc-to-config.mcpod translation (unsafe path)
cli/src/state/            # installed-server records under ~/.mcpod/
test/                     # mirrors src/ layout

marketplace/              # separate project for the marketplace server
marketplace/bin/server.js # entry point, wires Express server
marketplace/src/          # Express server code, serves JSON index and config.mcpod files
```

If a directory does not exist yet, create it at this path rather than inventing a new layout.

## Commands

```bash
npm install          # install dependencies
npm test             # run tests (node --test)
npm run lint         # eslint
npm run format       # prettier --write .
node bin/mcpod.js    # run the CLI locally without linking
```

If a script is missing from `package.json`, add it in this form rather than a variant.

## Workflow

1. Update your To-Do list in `.agents/todo.md` with your current task. If you complete a task
   mark it as done and add a new task. If you are blocked, note the blocker and any relevant
   context. Do not wait for a human to read this file. Be proactive and ask for help if you need
   it via the chat.
2. Before changing behavior, read the command file in `src/commands/` and any module it calls.
3. Make the change with the smallest diff that works. Match the style of surrounding code.
4. Add or update a test in the mirrored path under `test/`. Docker and Gemini calls must be
   mocked in tests; tests must pass on a machine without Docker running.
5. Run `npm test` and `npm run lint` before declaring work done. Report actual failures; do not
   skip or silence a failing test to get green.
6. Note current progress in `.agents/progress.md` with your current progress and next steps. If
   you are blocked, note the blocker and any relevant context. Also include a short summary of
   what you are working on in the file. Do not wait for a human to read this file. Be proactive
   and ask for help if you need it via the chat.

## Safety rules (do not weaken these)

- **Container isolation is the product.** Containers get no network access and no bind mounts
  unless `config.mcpod` explicitly grants them. Never add `--privileged`, host networking, a
  Docker-socket mount, or a blanket `/` bind mount, even to fix a bug quickly.
- **Bind mounts come only from validated config.** Resolve paths, reject anything outside what
  the user granted, and mount read-only unless the config asks for write access.
- **`--interpret-unsafe` is opt-in and labeled unsafe on purpose.** The generated `config.mcpod`
  must be shown to the user for confirmation before install. Do not auto-apply it, and do not
  extend Gemini interpretation to the default install path.
- **Treat marketplace content as untrusted input.** Validate `config.mcpod` against the schema
  in `src/config/` before acting on any field. Never `eval` or `exec` strings from a fetched
  config on the host; install steps run inside the container.
- Destructive commands (`rm`, `stop -a`) prompt for confirmation unless `--force`/`-f` is passed.

## Things agents get wrong here

- `config.mcpod` is YAML, not JSON, and the filename has no extension beyond `.mcpod`.
- "Update" means reinstalling from the marketplace at a newer version; there is no in-place
  patching of a running container. Stop, remove, recreate.
- CWD scoping applies per `run` invocation: the same installed server can run scoped to
  different directories at different times, so container names must encode more than the
  server name.
- State lives in `~/.mcpod/`, not in the repo and not in the container. A removed container
  must not lose the install record.
