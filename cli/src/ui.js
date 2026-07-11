import ora from "ora"
import { chalkStderr as c } from "chalk"

// All human-facing output is written to stderr. For stdio-transport MCP
// servers, stdout/stdin belong to the MCP protocol, so the UI must never
// write to stdout.
//
// Interactive layout: every line is `<2-space gutter><icon> <text>`, so
// icons sit in one column and text in another. `detail` lines indent to the
// text column. Prompts get the same gutter via `promptTheme`.

const GUTTER = "  "
const DETAIL_INDENT = "    "

/**
 * True when we can render spinners/prompts instead of plain log lines.
 * A TTY that reports no width (some CI pseudo-terminals) breaks cursor
 * math in spinner libraries, so it gets logging mode too.
 */
export function isInteractive() {
    return (
        Boolean(process.stderr.isTTY && process.stdin.isTTY) &&
        (process.stderr.columns ?? 0) > 0 &&
        !process.env.CI
    )
}

/** Theme for @inquirer prompts so they align with the UI's gutter. */
export const promptTheme = {
    prefix: { idle: `${GUTTER}${c.cyan("?")}`, done: `${GUTTER}${c.green("✔")}` },
}

/** Render a fixed-width progress bar like ▐████░░░░▌. */
export function renderBar(fraction, width = 20) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
    const filled = Math.round(clamped * width)
    return `▐${"█".repeat(filled)}${"░".repeat(width - filled)}▌`
}

function timestamp() {
    return new Date().toISOString()
}

function logLine(level, text) {
    process.stderr.write(`[mcpod] ${timestamp()} ${level} ${text}\n`)
}

function iconLine(icon, text) {
    process.stderr.write(`${GUTTER}${icon} ${text}\n`)
}

/**
 * Create a UI appropriate for the session. Interactive sessions get color,
 * spinners, and progress bars; non-interactive sessions get timestamped,
 * machine-greppable log lines with no ANSI escapes.
 */
export function createUI({ interactive = isInteractive() } = {}) {
    if (!interactive) {
        return {
            interactive: false,
            banner(command) {
                logLine("info", `mcpod ${command} (non-interactive session, logging mode)`)
            },
            info: text => logLine("info", text),
            /** Continuation line under the previous info/success line. */
            detail: text => logLine("info", text),
            warn: text => logLine("warn", text),
            error: text => logLine("error", text),
            success: text => logLine("ok", text),
            blank() {},
            /** Long-running step. Progress updates are throttled to occasional lines. */
            task(text) {
                logLine("info", `${text} ...`)
                let lastLogged = 0
                return {
                    update() {},
                    progress(fraction, detail, lines = []) {
                        const now = Date.now()
                        if (now - lastLogged < 2000) return
                        lastLogged = now
                        const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100)
                        const extra = lines.length ? `: ${lines.join("; ")}` : ""
                        logLine("info", `${text}: ${pct}%${detail ? ` (${detail})` : ""}${extra}`)
                    },
                    succeed: (finalText = text) => logLine("ok", finalText),
                    fail: (finalText = text) => logLine("error", finalText),
                }
            },
        }
    }

    return {
        interactive: true,
        banner(command) {
            process.stderr.write(
                `\n${GUTTER}${c.ansi256(104).bold("⬢ mcpod")} ${c.dim("·")} ${c.bold(command)}\n\n`
            )
        },
        info: text => iconLine(c.blue("i"), text),
        detail: text => process.stderr.write(`${DETAIL_INDENT}${c.dim(text)}\n`),
        warn: text => iconLine(c.yellow("⚠"), c.yellow(text)),
        error: text => iconLine(c.red("✖"), c.red(text)),
        success: text => iconLine(c.green("✔"), text),
        blank: () => process.stderr.write("\n"),
        task(text) {
            const spinner = ora({ text, stream: process.stderr, indent: 2 }).start()
            // Persist final lines ourselves so they share the exact gutter of
            // every other line instead of ora's own indent handling.
            const persist = (icon, finalText) => {
                spinner.stop()
                iconLine(icon, finalText)
            }
            return {
                update(newText) {
                    spinner.text = newText
                },
                progress(fraction, detail, lines = []) {
                    const pct = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`.padStart(
                        4
                    )
                    const head = `${text}  ${c.cyan(renderBar(fraction))} ${c.bold(pct)}${
                        detail ? c.dim(` · ${detail}`) : ""
                    }`
                    // ora renders multi-line text under the spinner, which lets a
                    // task show per-item progress (e.g. one line per image layer).
                    const body = lines
                        .slice(0, 12)
                        .map(line => `${GUTTER}${c.dim(line)}`)
                        .join("\n")
                    spinner.text = body ? `${head}\n${body}` : head
                },
                // !BUG: upon success, the success text printed will be indented slightly more than the other lines
                succeed: (finalText = text) => persist(c.green("✔"), finalText),
                fail: (finalText = text) => persist(c.red("✖"), c.red(finalText)),
            }
        },
    }
}
