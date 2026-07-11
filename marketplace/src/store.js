import { readFile, writeFile } from "node:fs/promises";

/**
 * @typedef {object} MarketplaceServer
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} version
 * @property {string} author
 * @property {string} gitUrl
 * @property {string[]} tags
 * @property {string} configMcpod
 */

export class MarketplaceStore {
  constructor(databasePath) {
    this.databasePath = databasePath;
  }

  async readAll() {
    const raw = await readFile(this.databasePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.servers)) {
      throw new Error("Marketplace database must contain a servers array.");
    }

    return parsed.servers;
  }

  async saveAll(servers) {
    await writeFile(this.databasePath, `${JSON.stringify({ servers }, null, 2)}\n`, "utf8");
  }

  async list({ page = 1, pageSize = 20, search } = {}) {
    const allServers = await this.readAll();
    const normalizedSearch = search?.trim().toLowerCase();
    const filteredServers = normalizedSearch
      ? allServers.filter((server) => matchesSearch(server, normalizedSearch))
      : allServers;
    const total = filteredServers.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const servers = filteredServers.slice(start, start + pageSize).map(toMetadata);

    return { servers, page, pageSize, total, totalPages };
  }

  async findByName(name) {
    const servers = await this.readAll();
    return servers.find((server) => server.name === name);
  }
}

export function toMetadata(server) {
  return {
    name: server.name,
    displayName: server.displayName,
    description: server.description,
    version: server.version,
    author: server.author,
    gitUrl: server.gitUrl,
    tags: server.tags,
  };
}

function matchesSearch(server, normalizedSearch) {
  const searchableFields = [
    server.name,
    server.displayName,
    server.description,
    server.author,
    server.gitUrl,
    ...(server.tags ?? []),
  ];

  return searchableFields.some((field) => field?.toLowerCase().includes(normalizedSearch));
}
