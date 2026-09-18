import Link from "next/link";

// The one header both public pages share. Section links point at the public
// page's anchors with a leading slash so they work from any route; on `/`
// itself that is a same-document hash change, no reload.
const SECTIONS: { label: string; href: string; page: "findings" | "anatomy" }[] = [
  { label: "Findings", href: "/#findings", page: "findings" },
  { label: "Anatomy", href: "/anatomy", page: "anatomy" },
  { label: "Origins", href: "/#origins", page: "findings" },
  { label: "Validity", href: "/#validity", page: "findings" },
  { label: "Dataset", href: "/#dataset", page: "findings" },
];

export function SiteHeader({ current, live }: { current: "findings" | "anatomy"; live: boolean }) {
  return (
    <header className="top">
      <Link href="/" className="wordmark">
        MIRAGE
      </Link>
      <nav className="tabs" aria-label="Sections">
        {SECTIONS.map((s) =>
          s.page === "anatomy" ? (
            <Link key={s.label} href={s.href} aria-current={current === "anatomy" ? "true" : undefined}>
              {s.label}
            </Link>
          ) : (
            <a key={s.label} href={s.href}>
              {s.label}
            </a>
          ),
        )}
      </nav>
      <span className="status">
        <span className="beacon" data-live={live} />
        {live ? "live sensor" : "published snapshot"}
      </span>
    </header>
  );
}
