import express from "express";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function createApp(store) {
  const app = express();

  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/servers", async (req, res, next) => {
    try {
      const page = parsePositiveInteger(req.query.page, 1);
      const requestedPageSize = parsePositiveInteger(req.query.pageSize, DEFAULT_PAGE_SIZE);
      const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
      const result = await store.list({ page, pageSize, search: req.query.search });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/servers/:name", async (req, res, next) => {
    try {
      const server = await store.findByName(req.params.name);

      if (!server) {
        res.status(404).json({ error: "Server not found." });
        return;
      }

      res.json(stripConfig(server));
    } catch (error) {
      next(error);
    }
  });

  app.get("/servers/:name/config.mcpod", async (req, res, next) => {
    try {
      const server = await store.findByName(req.params.name);

      if (!server) {
        res.status(404).type("text/plain").send("Server not found.\n");
        return;
      }

      res.type("text/yaml").send(`${server.configMcpod.trim()}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function stripConfig(server) {
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
