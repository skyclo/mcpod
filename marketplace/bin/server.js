#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";
import { MarketplaceStore } from "../src/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 4000;
const databasePath = process.env.MARKETPLACE_DB_PATH || resolve(__dirname, "../data/servers.json");
const store = new MarketplaceStore(databasePath);
const app = createApp(store);

app.listen(port, () => {
  console.log(`mcpod marketplace server listening on port ${port}`);
});
