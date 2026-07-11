import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createApp } from "../src/app.js";
import { MarketplaceStore } from "../src/store.js";

let server;
let baseUrl;
let tempDir;
let store;

const servers = [
  {
    name: "alpha",
    displayName: "Alpha Server",
    description: "First test server",
    version: "1.0.0",
    author: "Example Author",
    gitUrl: "https://example.com/alpha.git",
    tags: ["files"],
    configMcpod: "name: alpha\nversion: 1.0.0\n",
  },
  {
    name: "beta",
    displayName: "Beta Server",
    description: "Second test server",
    version: "2.0.0",
    author: "Example Author",
    gitUrl: "https://example.com/beta.git",
    tags: ["git"],
    configMcpod: "name: beta\nversion: 2.0.0\n",
  },
];

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mcpod-marketplace-"));
  const databasePath = join(tempDir, "servers.json");
  store = new MarketplaceStore(databasePath);
  await store.saveAll(servers);

  const app = createApp(store);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
});

test("GET /servers returns paginated server metadata without configs", async () => {
  const response = await fetch(`${baseUrl}/servers?page=1&pageSize=1`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 1);
  assert.equal(body.total, 2);
  assert.equal(body.totalPages, 2);
  assert.deepEqual(body.servers, [
    {
      name: "alpha",
      displayName: "Alpha Server",
      description: "First test server",
      version: "1.0.0",
      author: "Example Author",
      gitUrl: "https://example.com/alpha.git",
      tags: ["files"],
    },
  ]);
});

test("GET /servers supports simple search", async () => {
  const response = await fetch(`${baseUrl}/servers?search=Second`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.servers[0].name, "beta");
});

test("GET /servers/:name returns detailed server metadata", async () => {
  const response = await fetch(`${baseUrl}/servers/beta`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.name, "beta");
  assert.equal(body.configMcpod, undefined);
});

test("GET /servers/:name/config.mcpod returns the install config", async () => {
  const response = await fetch(`${baseUrl}/servers/alpha/config.mcpod`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/yaml; charset=utf-8");
  assert.equal(body, "name: alpha\nversion: 1.0.0\n");
});

test("store can save JSON database changes", async () => {
  await store.saveAll([servers[0]]);
  const raw = await readFile(join(tempDir, "servers.json"), "utf8");

  assert.deepEqual(JSON.parse(raw), { servers: [servers[0]] });
  await store.saveAll(servers);
});
