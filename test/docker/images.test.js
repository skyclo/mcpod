import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createPullProgressTracker, formatBytes } from "../../cli/src/docker/images.js"

describe("formatBytes", () => {
    it("formats byte counts with sensible units", () => {
        assert.equal(formatBytes(0), "0 B")
        assert.equal(formatBytes(512), "512 B")
        assert.equal(formatBytes(2048), "2.0 kB")
        assert.equal(formatBytes(12.4 * 1024 ** 2), "12 MB")
        assert.equal(formatBytes(1024 ** 3), "1.0 GB")
    })
})

describe("createPullProgressTracker", () => {
    it("aggregates per-layer download progress into one fraction", () => {
        const tracker = createPullProgressTracker()
        tracker.onEvent({
            id: "a",
            status: "Downloading",
            progressDetail: { current: 50, total: 100 },
        })
        const { fraction, detail } = tracker.onEvent({
            id: "b",
            status: "Downloading",
            progressDetail: { current: 25, total: 100 },
        })
        assert.equal(fraction, 75 / 200)
        assert.equal(detail, "0/2 layers")
    })

    it("exposes a per-layer snapshot with status, bytes, and totals", () => {
        const tracker = createPullProgressTracker()
        tracker.onEvent({
            id: "a",
            status: "Downloading",
            progressDetail: { current: 10, total: 40 },
        })
        const { layers } = tracker.onEvent({ id: "b", status: "Waiting" })
        assert.deepEqual(layers, [
            { id: "a", status: "Downloading", current: 10, total: 40, done: false },
            { id: "b", status: "Waiting", current: 0, total: 0, done: false },
        ])
    })

    it("counts completed and cached layers as done", () => {
        const tracker = createPullProgressTracker()
        tracker.onEvent({
            id: "a",
            status: "Downloading",
            progressDetail: { current: 10, total: 100 },
        })
        tracker.onEvent({ id: "a", status: "Pull complete" })
        const { fraction, detail, layers } = tracker.onEvent({ id: "b", status: "Already exists" })
        assert.equal(detail, "2/2 layers")
        assert.equal(fraction, 1)
        assert.ok(layers.every(layer => layer.done))
    })

    it("ignores events without layer ids and the tag manifest event", () => {
        const tracker = createPullProgressTracker()
        tracker.onEvent({ status: "Digest: sha256:abc" })
        const { fraction, detail, layers } = tracker.onEvent({
            id: "22-alpine",
            status: "Pulling from library/node",
        })
        assert.equal(fraction, 0)
        assert.equal(detail, "")
        assert.deepEqual(layers, [])
    })
})
