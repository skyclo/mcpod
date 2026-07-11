#!/usr/bin/env node
import express from "express"

const app = express()
const port = process.env.PORT || 4000

app.get("/health", (req, res) => {
    res.json({ status: "ok" })
})

app.listen(port, () => {
    console.log(`mcpod marketplace server listening on port ${port}`)
})
