"use client";

import { useState } from "react";

const TAB_DEFS = [
  ["overview", "Overview"],
  ["permissions", "Permissions"],
  ["config", "config.mcpod"],
];

export default function ServerTabs({ overview, permissions, rawConfig, configError }) {
  const [tab, setTab] = useState("overview");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          marginBottom: 28,
        }}
      >
        {TAB_DEFS.map(([key, label]) => (
          <span
            key={key}
            onClick={() => setTab(key)}
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              padding: "10px 16px",
              cursor: "pointer",
              color: tab === key ? "var(--text)" : "var(--dim)",
              borderBottom: `2px solid ${tab === key ? "var(--ac)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {tab === "overview" ? (
        <div>
          {overview.map((sec) => (
            <div key={sec.h} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>{sec.h}</div>
              <div
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.7,
                  color: "var(--muted)",
                  textWrap: "pretty",
                }}
              >
                {sec.p}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "permissions" ? (
        <div>
          <div
            style={{
              border: "1.5px dashed var(--ac-dim)",
              borderRadius: 12,
              padding: 22,
              marginBottom: 20,
            }}
          >
            <div className="mono" style={{ fontSize: 11.5, color: "var(--ac)", marginBottom: 8 }}>
              SANDBOX MANIFEST · enforced by the runtime, not the server
            </div>
            <div style={{ fontSize: 13.5, color: "var(--dim)", lineHeight: 1.6 }}>
              Everything not listed below is denied. The container gets no host filesystem, no
              device access, and no network beyond the declared allowlist.
            </div>
          </div>

          {permissions.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {permissions.map((pm) => (
                <div
                  key={pm.label}
                  className="card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "15px 20px",
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: pm.ok ? "var(--ok)" : "var(--dim)",
                      border: `1px solid ${pm.ok ? "var(--ok-line)" : "rgba(255,255,255,0.15)"}`,
                      borderRadius: 5,
                      padding: "3px 8px",
                      flex: "none",
                      width: 52,
                      textAlign: "center",
                    }}
                  >
                    {pm.ok ? "ALLOW" : "DENY"}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, width: 120, flex: "none" }}>
                    {pm.label}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>
                    {pm.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mono" style={{ fontSize: 13, color: "var(--dim)" }}>
              No config.mcpod available for this server.
            </div>
          )}
        </div>
      ) : null}

      {tab === "config" ? (
        <div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12 }}>
            The exact manifest the registry serves and mcpod installs from.
          </div>
          {rawConfig ? (
            <pre className="code-block" style={{ fontSize: 12, padding: 18 }}>
              {rawConfig}
            </pre>
          ) : (
            <div className="mono" style={{ fontSize: 13, color: "var(--dim)" }}>
              {configError
                ? "config.mcpod could not be parsed."
                : "This server does not publish a config.mcpod."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
