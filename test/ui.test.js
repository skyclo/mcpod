import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createUI, renderBar } from "../cli/src/ui.js"

describe("renderBar", () => {
    it("renders proportional fill", () => {
        assert.equal(renderBar(0, 4), "▐░░░░▌")
        assert.equal(renderBar(0.5, 4), "▐██░░▌")
        assert.equal(renderBar(1, 4), "▐████▌")
    })

    it("clamps out-of-range and non-finite input", () => {
        assert.equal(renderBar(-1, 4), "▐░░░░▌")
        assert.equal(renderBar(2, 4), "▐████▌")
        assert.equal(renderBar(NaN, 4), "▐░░░░▌")
    })
})

describe("createUI", () => {
    it("exposes the same surface in both modes", () => {
        for (const interactive of [true, false]) {
            const ui = createUI({ interactive })
            assert.equal(ui.interactive, interactive)
            for (const method of [
                "banner",
                "info",
                "detail",
                "warn",
                "error",
                "success",
                "blank",
            ]) {
                assert.equal(
                    typeof ui[method],
                    "function",
                    `${method} in interactive=${interactive}`
                )
            }
            const task = ui.task("noop")
            for (const method of ["update", "progress", "succeed", "fail"]) {
                assert.equal(typeof task[method], "function")
            }
            task.succeed()
        }
    })
})
