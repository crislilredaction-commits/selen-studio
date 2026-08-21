import Link from "next/link";

import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type DailyActionSummary = {
  total: number;
  candidatures: number;
  feedback: number;
  unreadMessages: number;
  sensitiveFollowups: number;
  href: string;
};

type DailyActionSummaryCardProps = {
  summary: DailyActionSummary;
};

const actionRows = [
  { key: "candidatures", label: "Candidatures à contrôler", icon: "📝" },
  { key: "feedback", label: "Réclamations & suggestions", icon: "💬" },
  { key: "unreadMessages", label: "Messages clients non lus", icon: "📨" },
  { key: "sensitiveFollowups", label: "Situations sensibles en session", icon: "⚠️" },
] as const;

export default function DailyActionSummaryCard({
  summary,
}: DailyActionSummaryCardProps) {
  if (summary.total <= 0) return null;

  return (
    <section aria-labelledby="daily-actions-title" style={{ marginBottom: 24 }}>
      <Link
        href={summary.href}
        style={{ color: "inherit", textDecoration: "none", display: "block" }}
      >
        <SelenCard
          style={{
            borderColor: "var(--selen-border2)",
            transition: "transform 0.15s ease, border-color 0.15s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 220, flex: "1 1 260px" }}>
              <p
                style={{
                  margin: 0,
                  marginBottom: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--selen-gold2)",
                }}
              >
                Daily · actions agent
              </p>
              <SelenCardTitle
                style={{ marginBottom: 8, fontSize: 19 }}
              >
                <span id="daily-actions-title">
                  {summary.total} action{summary.total > 1 ? "s" : ""} à traiter
                </span>
              </SelenCardTitle>
              <p
                style={{
                  margin: 0,
                  maxWidth: 620,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--selen-text2)",
                }}
              >
                Les interventions humaines Daily sont regroupées ici pour éviter
                qu’une candidature, un message ou une situation sensible reste
                caché dans un écran secondaire.
              </p>
            </div>

            <div
              aria-hidden="true"
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg3)",
                fontSize: 24,
                flexShrink: 0,
              }}
            >
              ⚡
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 10,
              marginTop: 16,
            }}
          >
            {actionRows.map((row) => {
              const value = summary[row.key];

              return (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--selen-border)",
                    background: "var(--selen-bg3)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      fontSize: 12,
                      color: "var(--selen-text2)",
                    }}
                  >
                    <span aria-hidden="true">{row.icon}</span>
                    <span>{row.label}</span>
                  </span>
                  <strong
                    style={{
                      fontSize: 14,
                      color:
                        value > 0 ? "var(--selen-gold2)" : "var(--selen-text3)",
                      flexShrink: 0,
                    }}
                  >
                    {value}
                  </strong>
                </div>
              );
            })}
          </div>

          <p
            style={{
              margin: "14px 0 0",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--selen-gold2)",
            }}
          >
            Ouvrir le centre d’actions Daily →
          </p>
        </SelenCard>
      </Link>
    </section>
  );
}
