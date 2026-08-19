"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type ActionCategory = {
  key: string;
  label: string;
  count: number;
  href: string;
};

type DashboardActions = {
  total: number;
  categories: ActionCategory[];
};

export default function AgentDailyActionBanner() {
  const pathname = usePathname();
  const [data, setData] = useState<DashboardActions | null>(null);

  useEffect(() => {
    if (pathname !== "/agent") return;

    const controller = new AbortController();

    void fetch("/agent/api/daily/dashboard-actions", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as DashboardActions;
      })
      .then((payload) => {
        if (payload) setData(payload);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Erreur chargement actions Daily:", error);
      });

    return () => controller.abort();
  }, [pathname]);

  if (pathname !== "/agent" || !data || data.total <= 0) return null;

  return (
    <section
      aria-label="Actions Daily à traiter"
      style={{
        margin: "18px auto 0",
        maxWidth: 1180,
        padding: "0 28px",
      }}
    >
      <div
        style={{
          border: "1px solid var(--selen-border)",
          borderRadius: "var(--radius-lg)",
          background:
            "linear-gradient(135deg, rgba(201, 148, 58, 0.12), rgba(255,255,255,0.02))",
          padding: 16,
          boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--selen-gold)",
              }}
            >
              Daily · actions agent
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--selen-text)",
              }}
            >
              {data.total} action{data.total > 1 ? "s" : ""} à traiter
            </p>
          </div>

          <Link
            href="/agent/daily"
            style={{
              color: "var(--selen-gold2)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Ouvrir Daily →
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
          }}
        >
          {data.categories.map((category) => (
            <Link
              key={category.key}
              href={category.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 10px",
                borderRadius: 999,
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg3)",
                color: "var(--selen-text2)",
                textDecoration: "none",
                fontSize: 12,
              }}
            >
              <strong style={{ color: "var(--selen-text)" }}>
                {category.count}
              </strong>
              {category.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
