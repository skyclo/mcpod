"use client";

import { useState } from "react";

/**
 * A clickable "$ command" chip that copies its command to the clipboard.
 * Faithful to the design's copy affordance (dollar prompt + copy/copied label).
 */
export default function CopyButton({ command, prefix = "$", compact = false }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (navigator.clipboard) navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="mono card card-link"
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 10 : 14,
        background: "#000",
        borderRadius: compact ? 8 : 10,
        padding: compact ? "11px 14px" : "13px 18px",
        fontSize: compact ? 12.5 : 13.5,
        cursor: "pointer",
        color: "var(--text)",
        width: "100%",
        textAlign: "left",
      }}
    >
      <span style={{ color: "var(--faint)" }}>{prefix}</span>
      <span style={{ flex: 1 }}>{command}</span>
      <span
        style={{
          color: copied ? "var(--ok)" : "var(--faint)",
          fontSize: compact ? 10.5 : 11,
          marginLeft: 6,
        }}
      >
        {copied ? "copied ✓" : "copy"}
      </span>
    </button>
  );
}
