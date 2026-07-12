import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import ServerTabs from "./ServerTabs";
import { getServer, getServerConfig } from "@/lib/marketplace";
import { parseConfig } from "@/lib/config";

export async function generateMetadata({ params }) {
  const { name } = await params;
  const server = await getServer(name);
  if (!server) return { title: "Server not found — mcpod" };
  return {
    title: `${server.name} — mcpod`,
    description: server.description,
  };
}

export default async function ServerDetailPage({ params }) {
  const { name } = await params;
  const [server, rawConfig] = await Promise.all([getServer(name), getServerConfig(name)]);

  if (!server) notFound();

  const config = parseConfig(rawConfig);
  const tags = server.tags ?? [];

  const overview = buildOverview(server, config);

  const installCmd = `mcpod install ${server.name}`;
  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        [server.name]: { command: "mcpod", args: ["run", server.name] },
      },
    },
    null,
    2,
  );

  const facts = config?.facts ?? [];
  const factMap = Object.fromEntries(facts);
  const statRows = [
    ["publisher", server.author],
    ["version", `v${server.version}`],
    ["image", factMap.image ?? "—"],
    ["transport", factMap.transport ?? "stdio"],
    ["compute", [factMap.cpus, factMap.memory].filter((v) => v && v !== "—").join(" · ") || "—"],
    ["restart", factMap.restart ?? "no"],
    ["license", "MIT"],
  ];

  return (
    <main className="wrap" style={{ padding: "36px 28px 90px" }}>
      <Link
        href="/browse"
        style={{
          fontSize: 13,
          color: "var(--dim)",
          marginBottom: 26,
          display: "inline-block",
        }}
      >
        ← Back to browse
      </Link>

      <div className="grid-detail">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1
              className="mono"
              style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}
            >
              {server.name}
            </h1>
            {server.displayName && server.displayName !== server.name ? (
              <span style={{ fontSize: 15, color: "var(--dim)" }}>{server.displayName}</span>
            ) : null}
          </div>
          <div
            style={{
              fontSize: 15.5,
              color: "var(--muted)",
              lineHeight: 1.6,
              marginBottom: 20,
              maxWidth: 640,
              textWrap: "pretty",
            }}
          >
            {server.description}
          </div>

          {tags.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 26 }}>
              {tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          <ServerTabs
            overview={overview}
            permissions={config?.permissions ?? []}
            rawConfig={rawConfig}
            configError={config?.error}
          />
        </div>

        {/* sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 10 }}>
              INSTALL
            </div>
            <div style={{ marginBottom: 12 }}>
              <CopyButton command={installCmd} compact />
            </div>
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--faint)", margin: "16px 0 8px" }}
            >
              CLIENT CONFIG
            </div>
            <pre className="code-block">{clientConfig}</pre>
          </div>

          <div
            className="card"
            style={{ padding: 20, display: "flex", flexDirection: "column", gap: 13 }}
          >
            {statRows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                <span style={{ color: "var(--faint)", flex: "none" }}>{k}</span>
                <span
                  className="mono"
                  style={{
                    color: "var(--text)",
                    fontSize: 12.5,
                    textAlign: "right",
                    wordBreak: "break-word",
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
            {server.gitUrl ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                <span style={{ color: "var(--faint)", flex: "none" }}>source</span>
                <a
                  href={server.gitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                  style={{ fontSize: 12.5, textAlign: "right", wordBreak: "break-all" }}
                >
                  repository ↗
                </a>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

function buildOverview(server, config) {
  const sections = [{ h: "What it does", p: server.description }];

  if (config && !config.error) {
    const net = config.permissions.find((p) => p.label === "Network");
    const fs = config.permissions.find((p) => p.label === "Filesystem");
    const posture = [];
    if (net) {
      posture.push(
        net.ok
          ? `Network egress is limited to ${config.allow.length ? "the declared allowlist" : "outbound only"}.`
          : "The container has no network access at all.",
      );
    }
    if (fs) {
      posture.push(
        fs.ok
          ? "It can only see the directories mounted into it — nothing else on your host."
          : "It has no host filesystem access; only container scratch space.",
      );
    }
    posture.push(
      "mcpod enforces this manifest when it creates the container, so the server can't exceed what config.mcpod declares.",
    );
    sections.push({ h: "Sandbox posture", p: posture.join(" ") });
  }

  sections.push({
    h: "Getting started",
    p: `Run mcpod install ${server.name}, then point any MCP client at it with mcpod run ${server.name}. The source lives at ${server.gitUrl || "its published repository"}.`,
  });

  return sections;
}
