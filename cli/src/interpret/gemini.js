import { access, readFile, readdir } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { basename, extname, join, resolve } from "node:path"
import { GoogleGenAI } from "@google/genai"
import { parse } from "yaml"

const MAX_FILE_BYTES = 64 * 1024
const MAX_TOTAL_BYTES = 512 * 1024
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite"
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"])
const TEXT_EXTENSIONS = new Set([
    ".md",
    ".mdx",
    ".txt",
    ".rst",
    ".adoc",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".sh",
    ".bash",
    ".zsh",
    ".dockerfile",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".rb",
    ".php",
    ".xml",
    ".html",
    ".css",
    ".sql",
    ".env.example",
])

function isTextPath(path) {
    const file = path.toLowerCase()
    return (
        file === "readme" ||
        file === "dockerfile" ||
        file.startsWith("readme.") ||
        TEXT_EXTENSIONS.has(extname(file)) ||
        path.includes("/docs/")
    )
}

async function pathExists(path) {
    try {
        await access(path, fsConstants.F_OK)
        return true
    } catch {
        return false
    }
}

async function walk(root, dir = root, files = []) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".env.example") continue
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue
            await walk(root, join(dir, entry.name), files)
            continue
        }
        const absPath = join(dir, entry.name)
        const relPath = absPath.slice(root.length + 1)
        if (isTextPath(relPath)) files.push(relPath)
    }
    return files
}

export async function collectRepositoryContext(target) {
    const root = resolve(target)
    if (!(await pathExists(root))) {
        throw new Error(
            `--interpret-unsafe currently expects a local repository path. Could not find: ${target}`
        )
    }

    const files = await walk(root)
    let totalBytes = 0
    const docs = []
    const omitted = []

    for (const relPath of files.sort()) {
        const absPath = join(root, relPath)
        const body = await readFile(absPath)
        if (body.includes(0)) {
            omitted.push(`${relPath} (binary)`)
            continue
        }
        if (body.byteLength > MAX_FILE_BYTES) {
            omitted.push(`${relPath} (too large)`)
            continue
        }
        if (totalBytes + body.byteLength > MAX_TOTAL_BYTES) {
            omitted.push(`${relPath} (token budget)`)
            continue
        }
        docs.push({ path: relPath, content: body.toString("utf8") })
        totalBytes += body.byteLength
    }

    if (!docs.length) {
        throw new Error(`No readable documentation/code files found under: ${target}`)
    }

    return { root, docs, omitted }
}

function makePrompt({ name, context }) {
    const files = context.docs
        .map(file => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
        .join("\n\n")
    const omitted =
        context.omitted.length > 0 ? `\nOmitted files: ${context.omitted.join(", ")}\n` : "\n"

    return `
You are generating a config.mcpod YAML file for the MCPod CLI.

Repository name: ${name}
Repository root: ${context.root}
${omitted}
Read the provided repository content and produce one valid config.mcpod YAML document.
Return YAML only, without explanations.

Required fields:
- metadata.name
- metadata.description
- metadata.version
- image
- command (array)
- transport (stdio or http)
- environment (object)
- permissions.network.outbound (boolean)
- permissions.network.allow (array when outbound is true)
- permissions.filesystem (array, empty if none)
- permissions.compute.cpus
- permissions.compute.memory
- restart

Repository files:
${files}
`.trim()
}

export function extractYaml(text) {
    const match = text.match(/```(?:ya?ml)?\s*([\s\S]*?)```/i)
    return (match ? match[1] : text).trim()
}

export async function interpretRepositoryToConfig({
    target,
    name = basename(resolve(target)),
    model = DEFAULT_MODEL,
    generateContent,
} = {}) {
    if (!process.env.GEMINI_API_KEY && typeof process.loadEnvFile === "function") {
        try {
            await process.loadEnvFile()
        } catch (err) {
            if (err?.code !== "ENOENT") throw err
        }
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required for --interpret-unsafe.")
    }

    const context = await collectRepositoryContext(target)
    const prompt = makePrompt({ name, context })
    const runGenerate =
        generateContent ||
        (async ({ model: selectedModel, contents }) => {
            const client = new GoogleGenAI({ apiKey })
            return client.models.generateContent({ model: selectedModel, contents })
        })

    const result = await runGenerate({ model, contents: prompt })
    const yamlText = extractYaml(result?.text || "")
    if (!yamlText) {
        throw new Error("Gemini did not return a config.mcpod document.")
    }

    const config = parse(yamlText)
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Gemini returned an invalid config.mcpod document.")
    }
    return config
}
