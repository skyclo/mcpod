import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap" style={{ padding: "120px 28px", textAlign: "center" }}>
      <div className="mono" style={{ fontSize: 13, color: "var(--ac)", marginBottom: 14 }}>
        404 · pod not found
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
        That server isn&rsquo;t in the registry.
      </h1>
      <p style={{ color: "var(--dim)", fontSize: 15, marginBottom: 28 }}>
        It may have been removed, or the name is misspelled.
      </p>
      <Link href="/browse" className="btn-accent" style={{ padding: "12px 20px" }}>
        Browse all pods
      </Link>
    </main>
  );
}
