import Link from "next/link";

/**
 * Marketplace card for one server. Renders only real registry fields —
 * name, description, author, version, tags — no invented popularity metrics.
 *
 * @param {{ server: import("@/lib/marketplace").ServerMeta }} props
 */
export default function ServerCard({ server }) {
  const tags = Array.isArray(server.tags) ? server.tags : [];

  return (
    <Link
      href={`/servers/${encodeURIComponent(server.name)}`}
      className="card card-link"
      style={{
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
          {server.name}
        </span>
        {server.displayName && server.displayName !== server.name ? (
          <span style={{ fontSize: 12.5, color: "var(--dim)" }}>{server.displayName}</span>
        ) : null}
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--faint)" }}
        >
          v{server.version}
        </span>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--dim)", flex: 1 }}>
        {server.description}
      </div>

      {tags.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className="mono"
        style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--faint)" }}
      >
        <span>{server.author}</span>
      </div>
    </Link>
  );
}
