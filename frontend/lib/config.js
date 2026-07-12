import { parse } from "yaml";

/**
 * Turn a raw config.mcpod YAML string into the view model the detail page
 * renders: a permission manifest (network / filesystem / compute / secrets)
 * plus runtime facts (image, command, transport…).
 *
 * The permission model here mirrors what the mcpod CLI actually enforces when
 * it creates the container — this page is a faithful preview of the sandbox,
 * not decoration.
 */

/**
 * @typedef {object} Permission
 * @property {string} label
 * @property {string} value
 * @property {boolean} ok    true => an explicit ALLOW grant, false => denied/none
 */

/**
 * @param {string | null} yamlText
 */
export function parseConfig(yamlText) {
  if (!yamlText) return null;

  let doc;
  try {
    doc = parse(yamlText) ?? {};
  } catch {
    return { error: true, raw: yamlText, permissions: [], facts: [] };
  }

  const perms = doc.permissions ?? {};
  const net = perms.network ?? {};
  const fs = Array.isArray(perms.filesystem) ? perms.filesystem : [];
  const compute = perms.compute ?? {};
  const env = doc.environment ?? {};
  const envKeys = Object.keys(env);

  const allow = Array.isArray(net.allow) ? net.allow : [];
  const outbound = Boolean(net.outbound);

  /** @type {Permission[]} */
  const permissions = [
    {
      label: "Network",
      ok: outbound,
      value: outbound
        ? allow.length
          ? `outbound · ${allow.join(", ")}`
          : "outbound · unrestricted"
        : "none — no egress",
    },
    {
      label: "Filesystem",
      ok: fs.length > 0,
      value: fs.length
        ? fs.map((m) => formatMount(m)).join(", ")
        : "none — container scratch only",
    },
    {
      label: "Secrets / env",
      ok: envKeys.length > 0,
      value: envKeys.length
        ? `${envKeys.join(", ")} (injected at runtime)`
        : "none required",
    },
    {
      label: "Compute",
      ok: false,
      value: formatCompute(compute),
    },
  ];

  const command = Array.isArray(doc.command) ? doc.command.join(" ") : (doc.command ?? "—");

  const facts = [
    ["image", doc.image ?? "—"],
    ["command", command],
    ["transport", doc.transport ?? "stdio"],
    ["cpus", compute.cpus != null ? String(compute.cpus) : "—"],
    ["memory", compute.memory ?? "—"],
    ["restart", doc.restart ?? "no"],
  ];

  return { error: false, permissions, facts, allow, outbound, filesystem: fs };
}

function formatMount(mount) {
  if (typeof mount === "string") return mount;
  if (mount && typeof mount === "object") {
    const path = mount.path ?? mount.source ?? JSON.stringify(mount);
    const mode = mount.readonly === false || mount.rw ? "rw" : "ro";
    return `${path} (${mode})`;
  }
  return String(mount);
}

function formatCompute(compute) {
  const parts = [];
  if (compute.cpus != null) parts.push(`${compute.cpus} cpu`);
  if (compute.memory) parts.push(compute.memory);
  return parts.length ? parts.join(" · ") : "runtime default";
}
