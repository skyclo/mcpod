import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import TerminalDemo from "@/components/TerminalDemo";
import ServerCard from "@/components/ServerCard";
import RegistryNotice from "@/components/RegistryNotice";
import { listServers } from "@/lib/marketplace";

const STEPS = [
  {
    n: "01 / INSTALL",
    h: "Read the manifest",
    p: "mcpod install <name> pulls the server's config.mcpod from the registry. That file names the base image, the package to run, and every permission the server asks for.",
  },
  {
    n: "02 / SANDBOX",
    h: "Build the container",
    p: "The server runs from its published package on node:22-alpine, inside a Docker container mcpod creates through dockerode. The manifest becomes the container's limits: network drops to an allowlist of hosts, the filesystem is only the directories you mount read-only, and CPU and memory are capped. Nothing outside that is reachable.",
  },
  {
    n: "03 / CONNECT",
    h: "Broker stdio",
    p: "Your client talks MCP over stdio to mcpod, which relays it to the container. Claude Code, an IDE, or an agent connects the same way it would to a server running on your machine.",
  },
];

export default async function LandingPage() {
  const { servers, total, unreachable } = await listServers({ pageSize: 6 });
  const featured = servers.slice(0, 6);
  const first = featured[0];

  const diagramPods = featured.slice(0, 3).map((s) => ({
    name: s.name,
    line1: `tags: ${(s.tags ?? []).slice(0, 2).join(", ") || "—"}`,
    line2: `v${s.version}`,
  }));

  return (
    <main>
      {/* hero */}
      <section className="wrap grid-hero" style={{ padding: "96px 28px 72px" }}>
        <div>
          <div className="pill" style={{ marginBottom: 26, letterSpacing: "0.08em" }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ac)" }}
            />
            UCF BLOOMKNIGHTS 2026 SUBMISSION
          </div>
          <h1
            style={{
              fontSize: 56,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              fontWeight: 700,
              margin: "0 0 22px",
            }}
          >
            The package manager for MCP servers.
            <br />
            <span style={{ color: "var(--ac)" }}>Sandboxed by default.</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: "var(--muted)",
              margin: "0 0 34px",
              maxWidth: 520,
              textWrap: "pretty",
            }}
          >
            One command installs any MCP server into an isolated Docker container — no arbitrary
            code on your host, no leaked credentials, no supply-chain surprises. Explicit
            permissions, or nothing.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 320, flex: "1 1 320px" }}>
              <CopyButton command="curl -fsSL https://mcpod.dev/install.sh | sh" />
            </div>
            <Link href="/browse" className="btn-ghost">
              Browse servers →
            </Link>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--faint)" }}>
            requires Docker · works with any MCP client
          </div>
        </div>

        <TerminalDemo serverName={first?.name ?? "context7"} />
      </section>

      {unreachable ? (
        <div className="wrap" style={{ paddingBottom: 32 }}>
          <RegistryNotice />
        </div>
      ) : null}

      {/* how it works */}
      <section
        id="how"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "#050506" }}
      >
        <div className="wrap" style={{ padding: "80px 28px" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--ac)", marginBottom: 14 }}>
            HOW IT WORKS
          </div>
          <h2
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 48px",
            }}
          >
            What happens when you install a server.
          </h2>

          {/* diagram */}
          <div className="grid-diagram" style={{ marginBottom: 56 }}>
            <div
              className="card"
              style={{
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                justifyContent: "center",
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                YOUR MACHINE
              </div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>AI client</div>
              <div style={{ fontSize: 13, color: "var(--dim)" }}>
                Claude, an IDE, or an agent; anything that speaks MCP
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: "0 22px",
                gap: 6,
              }}
            >
              <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                MCP over stdio
              </div>
              <div style={{ color: "var(--ac)", fontSize: 18 }}>⇄</div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                brokered
              </div>
            </div>
            <div
              style={{
                border: "1.5px dashed var(--ac-dim)",
                borderRadius: 12,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--ac)" }}>
                  mcpod runtime · sandbox boundary
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
                  docker
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {(diagramPods.length
                  ? diagramPods
                  : [{ name: "—", line1: "", line2: "" }]
                ).map((pod, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--panel-2)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 9,
                      padding: "14px 14px 12px",
                    }}
                  >
                    <div
                      className="mono"
                      style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}
                    >
                      {pod.name}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10, color: "var(--dim)", lineHeight: 1.7 }}
                    >
                      {pod.line1}
                      <br />
                      {pod.line2}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-3" style={{ gap: 20 }}>
            {STEPS.map((st) => (
              <div
                key={st.n}
                style={{
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 12,
                  padding: 26,
                  background: "#000",
                }}
              >
                <div className="mono" style={{ fontSize: 12, color: "var(--ac)", marginBottom: 14 }}>
                  {st.n}
                </div>
                <div style={{ fontWeight: 600, fontSize: 16.5, marginBottom: 10 }}>{st.h}</div>
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    color: "var(--dim)",
                    textWrap: "pretty",
                  }}
                >
                  {st.p}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* featured */}
      <section style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="wrap" style={{ padding: "76px 28px 90px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 36,
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ac)", marginBottom: 12 }}>
                IN THE REGISTRY
              </div>
              <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
                Popular pods
              </h2>
            </div>
            <Link href="/browse" style={{ fontSize: 13.5, color: "var(--dim)" }}>
              View all {total || featured.length} →
            </Link>
          </div>

          {featured.length ? (
            <div className="grid-3">
              {featured.map((s) => (
                <ServerCard key={s.name} server={s} />
              ))}
            </div>
          ) : (
            <RegistryNotice />
          )}
        </div>
      </section>
    </main>
  );
}
