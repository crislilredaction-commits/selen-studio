import Link from "next/link";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

const studioLinks = [
  {
    title: "Clients",
    description:
      "Voir le portefeuille clients, les accès aux prestations et les informations de contact.",
    href: "/agent/clients",
    icon: "👥",
  },
  {
    title: "Dossiers",
    description:
      "Suivre les dossiers NDA, Review, Prépa ou Daily en cours de traitement.",
    href: "/agent/dossiers",
    icon: "📁",
  },
  {
    title: "Audits blancs",
    description:
      "Piloter les audits blancs Qualiopi côté agent : préparation, analyse et rapport.",
    href: "/agent/audits-blancs",
    icon: "🧾",
  },
  {
    title: "Formations",
    description: "Gérer les formations et les éléments liés aux programmes.",
    href: "/agent/formations",
    icon: "📚",
  },
  {
    title: "Organisations",
    description:
      "Gérer les organismes de formation et leurs informations administratives.",
    href: "/agent/organisations",
    icon: "🏢",
  },
];

const adminLinks = [
  {
    title: "www.selen-editions.fr",
    description: "Ouvrir le site public et l’espace client Selen.",
    href: "https://www.selen-editions.fr",
    icon: "🌐",
    external: true,
  },
  {
    title: "Sélion",
    description: "Ouvrir le robot de prospection et le suivi des prospects.",
    href: "https://selion.selen-editions.fr",
    icon: "🦁",
    external: true,
  },
];

export default function AgentHomePage() {
  return (
    <main
      style={{
        padding: "24px 28px",
        maxWidth: 1180,
        margin: "0 auto",
        color: "var(--selen-text)",
      }}
    >
      <section
        style={{
          display: "grid",
          gap: 18,
          marginBottom: 24,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 9,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--selen-gold)",
              opacity: 0.85,
            }}
          >
            Selen Studio
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--selen-text)",
              marginTop: 8,
              lineHeight: 1.15,
            }}
          >
            Tableau de bord agent
          </h1>

          <p
            style={{
              marginTop: 10,
              maxWidth: 720,
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--selen-text2)",
            }}
          >
            Bienvenue dans le back-office Selen. Ici, on pilote les clients, les
            dossiers, les audits blancs et les prestations internes. La vitrine
            reste réservée au public et aux clients.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Link href="/agent/clients" style={{ textDecoration: "none" }}>
            <SelenButton variant="primary">Ouvrir les clients</SelenButton>
          </Link>

          <Link href="/agent/dossiers" style={{ textDecoration: "none" }}>
            <SelenButton variant="ghost">Voir les dossiers</SelenButton>
          </Link>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {studioLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <SelenCard
              style={{
                height: "100%",
                transition: "transform 0.15s ease, border-color 0.15s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>

                <div>
                  <SelenCardTitle style={{ marginBottom: 6 }}>
                    {item.title}
                  </SelenCardTitle>

                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "var(--selen-text2)",
                    }}
                  >
                    {item.description}
                  </p>

                  <p
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      color: "var(--selen-gold2)",
                      fontWeight: 600,
                    }}
                  >
                    Ouvrir →
                  </p>
                </div>
              </div>
            </SelenCard>
          </Link>
        ))}
      </section>

      <section>
        <SelenCard>
          <SelenCardTitle>Accès admin</SelenCardTitle>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--selen-text2)",
              marginBottom: 16,
            }}
          >
            Ces raccourcis servent à naviguer entre les différents espaces
            Selen. Plus tard, ils seront visibles uniquement pour les comptes
            administrateurs.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {adminLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: 14,
                  background: "var(--selen-bg3)",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>

                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: "var(--selen-text)",
                  }}
                >
                  {item.title}
                </div>

                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--selen-text2)",
                  }}
                >
                  {item.description}
                </p>

                <p
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "var(--selen-gold2)",
                    fontWeight: 600,
                  }}
                >
                  Ouvrir dans un nouvel onglet ↗
                </p>
              </a>
            ))}
          </div>
        </SelenCard>
      </section>
    </main>
  );
}
