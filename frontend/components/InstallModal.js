"use client";

import { useEffect } from "react";
import CopyButton from "@/components/CopyButton";

const INSTALL_CMD = "curl -fsSL https://mcpod.dev/install.sh | sh";

/**
 * Install-instructions dialog opened by the header's "Get mcpod" button.
 * Closes on backdrop click, the ✕, or Escape.
 */
export default function InstallModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.66)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Install mcpod"
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          background: "var(--panel)",
          width: "100%",
          maxWidth: 460,
          padding: 26,
          animation: "fadeUp .2s ease both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Get mcpod</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "var(--dim)",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--dim)", lineHeight: 1.6, marginBottom: 20 }}>
          Install the CLI, then run any MCP server in its own container.
        </div>

        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8 }}>
          INSTALL SCRIPT
        </div>
        <CopyButton command={INSTALL_CMD} compact />

        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", margin: "20px 0 8px" }}>
          OR BUILD FROM SOURCE
        </div>
        <pre className="code-block" style={{ fontSize: 11.5 }}>
          {`git clone https://github.com/skyclo/mcpod.git
cd mcpod && npm install
cd cli && npm link`}
        </pre>

        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", margin: "20px 0 8px" }}>
          REQUIREMENTS
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            color: "var(--dim)",
            lineHeight: 1.7,
          }}
        >
          <li>Node.js 20 or newer</li>
          <li>Docker running locally (for container operations)</li>
        </ul>

        <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
          <a
            href="https://github.com/skyclo/mcpod#getting-started"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
            style={{ fontSize: 13, padding: "10px 16px" }}
          >
            Read the docs ↗
          </a>
        </div>
      </div>
    </div>
  );
}
