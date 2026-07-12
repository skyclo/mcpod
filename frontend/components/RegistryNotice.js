/**
 * Shown when the marketplace registry can't be reached. Keeps the page honest
 * instead of rendering an empty grid with no explanation.
 */
export default function RegistryNotice() {
  return (
    <div
      style={{
        border: "1.5px dashed var(--ac-dim)",
        borderRadius: 12,
        padding: 28,
        color: "var(--dim)",
      }}
    >
      <div className="mono" style={{ fontSize: 13, color: "var(--ac)", marginBottom: 10 }}>
        registry unreachable
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.65, maxWidth: 620 }}>
        Couldn&rsquo;t reach the mcpod marketplace server. Start it from{" "}
        <span className="mono" style={{ color: "var(--text)" }}>
          ../marketplace
        </span>{" "}
        with{" "}
        <span className="mono" style={{ color: "var(--text)" }}>
          npm start
        </span>
        , or point{" "}
        <span className="mono" style={{ color: "var(--text)" }}>
          MARKETPLACE_URL
        </span>{" "}
        at a running registry.
      </div>
    </div>
  );
}
