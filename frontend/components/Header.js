"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import InstallModal from "@/components/InstallModal";

function HeaderInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [installOpen, setInstallOpen] = useState(false);

  // Keep the box in sync with ?q= when we're on the browse page.
  useEffect(() => {
    if (pathname === "/browse") setQuery(searchParams.get("q") ?? "");
  }, [pathname, searchParams]);

  const onBrowse = pathname === "/browse";

  function submit(value) {
    const q = value.trim();
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="wrap"
        style={{ height: 60, display: "flex", alignItems: "center", gap: 28 }}
      >
        <Link
          href="/"
          aria-label="mcpod home"
          style={{ display: "flex", alignItems: "center", flex: "none" }}
        >
          <Image
            src="/mcpod_png.png"
            alt="mcpod"
            width={812}
            height={254}
            priority
            style={{ height: 24, width: "auto" }}
          />
        </Link>

        <nav style={{ display: "flex", gap: 22, fontSize: 13.5, color: "var(--dim)" }}>
          <Link href="/browse" style={{ color: onBrowse ? "var(--text)" : "var(--dim)" }}>
            Browse
          </Link>
          <Link href="/#how" style={{ color: "var(--dim)" }}>
            How it works
          </Link>
          <a
            href="https://github.com/skyclo/mcpod"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--dim)" }}
          >
            GitHub
          </a>
        </nav>

        <div style={{ flex: 1 }} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--panel-2)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "7px 12px",
            width: 280,
          }}
        >
          <span className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>
            /
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (onBrowse) {
                const q = e.target.value.trim();
                router.replace(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
              }
            }}
            placeholder="search servers…"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text)",
              fontSize: 13,
              width: "100%",
            }}
          />
        </form>

        <button
          type="button"
          onClick={() => setInstallOpen(true)}
          className="btn-accent"
          style={{ flex: "none" }}
        >
          Get mcpod
        </button>
      </div>
      <InstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </header>
  );
}

export default function Header() {
  return (
    <Suspense fallback={null}>
      <HeaderInner />
    </Suspense>
  );
}
