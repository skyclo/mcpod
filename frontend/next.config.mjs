import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The repo root has its own lockfile; pin Turbopack to this app so it doesn't
  // infer the monorepo root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
