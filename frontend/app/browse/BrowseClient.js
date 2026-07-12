"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ServerCard from "@/components/ServerCard";
import RegistryNotice from "@/components/RegistryNotice";

const SORTS = [
  { value: "default", label: "Registry order" },
  { value: "name", label: "A → Z" },
  { value: "name-desc", label: "Z → A" },
  { value: "version", label: "Version" },
];

export default function BrowseClient({
  initialQuery,
  initialResults,
  total,
  unreachable,
  categories,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [results, setResults] = useState(initialResults);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("default");
  const [loading, setLoading] = useState(false);
  const firstRun = useRef(true);

  // Live search: whenever ?q= changes (typed in the header or the box below),
  // re-query the real registry through the /api proxy.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (urlQuery === initialQuery) return; // server already gave us this
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/servers?search=${encodeURIComponent(urlQuery)}`);
        const data = await res.json();
        if (!cancelled) setResults(data.servers ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [urlQuery, initialQuery]);

  const displayed = useMemo(() => {
    let list = results;
    if (category !== "All") {
      list = list.filter((s) => (s.tags ?? []).includes(category));
    }
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "name-desc") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "version") sorted.sort((a, b) => b.version.localeCompare(a.version));
    return sorted;
  }, [results, category, sort]);

  function setQuery(value) {
    const q = value.trim();
    router.replace(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  const resultText = loading
    ? "searching…"
    : `${displayed.length} of ${total || displayed.length} pods${
        urlQuery ? ` matching "${urlQuery}"` : ""
      }`;

  return (
    <main className="wrap" style={{ padding: "44px 28px 90px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
        Browse pods
      </h1>
      <div style={{ fontSize: 14, color: "var(--dim)", marginBottom: 28 }}>{resultText}</div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 16px",
            flex: 1,
            minWidth: 280,
          }}
        >
          <span className="mono" style={{ color: "var(--ac)", fontSize: 13 }}>
            $
          </span>
          <input
            value={urlQuery}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search by name, capability, publisher…"
            className="mono"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text)",
              fontSize: 14,
              width: "100%",
            }}
          />
          {urlQuery ? (
            <span
              onClick={() => setQuery("")}
              style={{ color: "var(--faint)", cursor: "pointer", fontSize: 13 }}
            >
              ✕
            </span>
          ) : null}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="field"
          style={{ padding: "11px 14px", fontSize: 13 }}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {categories.length > 1 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 30 }}>
          {categories.map((c) => (
            <span
              key={c}
              className="chip"
              data-active={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {unreachable ? (
        <RegistryNotice />
      ) : displayed.length ? (
        <div className="grid-3">
          {displayed.map((s) => (
            <ServerCard key={s.name} server={s} />
          ))}
        </div>
      ) : (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.15)",
            borderRadius: 12,
            padding: 70,
            textAlign: "center",
            color: "var(--dim)",
          }}
        >
          <div className="mono" style={{ fontSize: 14, marginBottom: 10 }}>
            no pods match {urlQuery ? `"${urlQuery}"` : "that filter"}
          </div>
          <span
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
            style={{ color: "var(--ac)", cursor: "pointer", fontSize: 13 }}
          >
            clear search
          </span>
        </div>
      )}
    </main>
  );
}
