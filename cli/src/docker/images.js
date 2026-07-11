import { getDocker } from "./client.js"

/** @returns {Promise<boolean>} whether the image exists locally */
export async function imageExists(ref, docker = getDocker()) {
    try {
        await docker.getImage(ref).inspect()
        return true
    } catch (err) {
        if (err.statusCode === 404) return false
        throw err
    }
}

/** Format a byte count like "12.4 MB". */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
    const units = ["B", "kB", "MB", "GB"]
    const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
    const value = bytes / 1024 ** exponent
    return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

/**
 * Aggregate dockerode pull-progress events into an overall fraction plus a
 * per-layer snapshot, so the UI can show each file being downloaded.
 * Exported for tests; pullImage wires it to the live event stream.
 */
export function createPullProgressTracker() {
    const layers = new Map() // id -> { id, status, current, total, done }
    return {
        /**
         * @returns {{
         *   fraction: number,
         *   detail: string,
         *   layers: Array<{id: string, status: string, current: number, total: number, done: boolean}>,
         * }}
         */
        onEvent(event) {
            // The manifest event carries the tag as its id ("Pulling from
            // library/node"); only real layers belong in the snapshot.
            if (event.id && !/^Pulling from /.test(event.status ?? "")) {
                const layer = layers.get(event.id) ?? {
                    id: event.id,
                    status: "Waiting",
                    current: 0,
                    total: 0,
                    done: false,
                }
                if (event.status) layer.status = event.status
                if (event.progressDetail?.total) {
                    layer.current = event.progressDetail.current ?? layer.current
                    layer.total = event.progressDetail.total
                }
                if (event.status === "Pull complete" || event.status === "Already exists") {
                    layer.done = true
                    layer.current = layer.total || layer.current
                }
                layers.set(event.id, layer)
            }
            let current = 0
            let total = 0
            let done = 0
            for (const layer of layers.values()) {
                current += layer.current
                total += layer.total
                if (layer.done) done += 1
            }
            return {
                fraction: total > 0 ? current / total : 0,
                detail: layers.size > 0 ? `${done}/${layers.size} layers` : "",
                layers: [...layers.values()],
            }
        },
    }
}

/**
 * Pull an image, reporting overall and per-layer progress.
 * @param {string} ref image reference, e.g. "node:22-alpine"
 * @param {(state: {fraction: number, detail: string, layers: object[]}) => void} [onProgress]
 */
export async function pullImage(ref, onProgress, docker = getDocker()) {
    const stream = await docker.pull(ref)
    const tracker = createPullProgressTracker()
    await new Promise((resolve, reject) => {
        docker.modem.followProgress(
            stream,
            err => (err ? reject(err) : resolve()),
            event => {
                if (event.error) return reject(new Error(event.error))
                onProgress?.(tracker.onEvent(event))
            }
        )
    })
}
