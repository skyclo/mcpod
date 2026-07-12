export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div
        className="wrap mono"
        style={{
          padding: "34px 28px",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 11.5,
          color: "var(--faint)",
        }}
      >
        <span>mcpod — open source, MIT</span>
        <span style={{ display: "flex", gap: 18 }}>
          <a href="https://github.com/skyclo/mcpod" target="_blank" rel="noreferrer">
            github
          </a>
          <a href="https://modelcontextprotocol.io/" target="_blank" rel="noreferrer">
            about mcp
          </a>
          <span>registry API</span>
        </span>
      </div>
    </footer>
  );
}
