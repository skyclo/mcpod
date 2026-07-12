"use client";

import { useEffect, useState } from "react";

/**
 * The animated install transcript in the hero. Mirrors a real `mcpod install`
 * run — Docker check, permission prompt read from config.mcpod, and MCP client
 * registration — with cwd and paths truncated so nothing machine-specific leaks.
 *
 * Each line is a list of colored segments so the prompt, checkmarks, and the
 * client checkbox list can be tinted the way a real TTY renders them.
 */
const C = {
  text: "var(--text)",
  dim: "var(--dim)",
  faint: "var(--faint)",
  green: "var(--ok)",
  blue: "var(--blue)",
  ac: "var(--ac)",
};

function buildScript(server) {
  const blank = { blank: true };
  return [
    {
      segs: [
        { t: "user@laptop-1", c: C.green },
        { t: ":", c: C.dim },
        { t: "~/project1", c: C.blue },
        { t: "$ ", c: C.faint },
        { t: `mcpod install ${server}`, c: C.text },
      ],
    },
    blank,
    { segs: [{ t: "  * ", c: C.ac }, { t: `mcpod · install ${server}`, c: C.text, b: true }] },
    blank,
    { segs: [{ t: "✓ ", c: C.green }, { t: "Docker daemon connected (v29.6.1)", c: C.dim }] },
    { segs: [{ t: "✓ ", c: C.green }, { t: `Resolved ${server} v1.0.0 from marketplace`, c: C.dim }] },
    blank,
    { segs: [{ t: `  ${server} requests the following permissions:`, c: C.dim }] },
    {
      segs: [
        { t: "    network:    ", c: C.faint },
        { t: "outbound (registry.npmjs.org, context7.com, …)", c: C.dim },
      ],
    },
    { segs: [{ t: "    filesystem: ", c: C.faint }, { t: "none", c: C.dim }] },
    { segs: [{ t: "    compute:    ", c: C.faint }, { t: "1 cpu, 512m memory", c: C.dim }] },
    blank,
    {
      segs: [
        { t: "✓ ", c: C.green },
        { t: "Grant these permissions and install? ", c: C.text, b: true },
        { t: "Yes", c: C.ac },
      ],
    },
    blank,
    { segs: [{ t: "✓ ", c: C.green }, { t: "Image node:22-alpine ready", c: C.dim }] },
    blank,
    {
      segs: [
        { t: "? ", c: C.ac },
        { t: `Register ${server} with which MCP clients?`, c: C.text, b: true },
      ],
    },
    {
      segs: [
        { t: "  ■ ", c: C.ac },
        { t: "LM Studio — global   ", c: C.dim },
        { t: "✓ detected", c: C.green },
      ],
    },
    {
      segs: [
        { t: "> ", c: C.ac },
        { t: "■ ", c: C.ac },
        { t: "Claude Code — global ", c: C.text },
        { t: "✓ detected", c: C.green },
      ],
    },
    { segs: [{ t: "  □ ", c: C.faint }, { t: "Claude Desktop — global", c: C.dim }] },
    {
      segs: [
        { t: "  □ ", c: C.faint },
        { t: "VS Code — global     ", c: C.dim },
        { t: "✓ detected", c: C.green },
      ],
    },
    blank,
    { segs: [{ t: "(space to select, enter to confirm — select none to skip)", c: C.faint }] },
  ];
}

export default function TerminalDemo({ serverName = "context7" }) {
  const script = buildScript(serverName);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s + 1) % (script.length + 8));
    }, 260);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverName]);

  // Index of the line the cursor should trail, while lines are still revealing.
  const cursorLine = step < script.length ? step - 1 : -1;

  return (
    <div
      style={{
        background: "#0a0a0d",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ width: 10, height: 10, borderRadius: "50%", background: "#3a3a40" }}
          />
        ))}
        <span className="mono" style={{ marginLeft: 10, fontSize: 11, color: "var(--faint)" }}>
          mcpod — zsh
        </span>
      </div>
      <div
        className="mono"
        style={{
          padding: "18px 20px",
          fontSize: 12.5,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {/* Every line is always in the DOM so the panel keeps a fixed height;
            un-revealed lines are just transparent, then fade in on their turn. */}
        {script.map((ln, i) => {
          const visible = i < step;
          if (ln.blank) return <div key={i} style={{ height: "1.7em" }} />;
          return (
            <div
              key={i}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "none" : "translateY(4px)",
                transition: "opacity .28s ease, transform .28s ease",
              }}
            >
              {ln.segs.map((s, j) => (
                <span key={j} style={{ color: s.c, fontWeight: s.b ? 700 : 400 }}>
                  {s.t}
                </span>
              ))}
              {i === cursorLine ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 15,
                    marginLeft: 4,
                    background: "var(--ac)",
                    verticalAlign: "middle",
                    animation: "blink 1.1s infinite",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
