import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import ClientAccessManager from "./ClientAccessManager";

type DossierLite = {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

type ClientRow = {
  id: string;
  name: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
  nda_number: string | null;
  created_at: string;
  dossiers: DossierLite[] | null;
};

function getStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "waiting_client":
      return "En attente client";
    case "assignable":
      return "À assigner";
    case "assigned":
      return "Assigné";
    case "in_progress":
      return "En cours";
    case "generated":
      return "Généré";
    case "collecting_documents":
      return "Collecte documents";
    case "under_review":
      return "En vérification";
    case "to_complete":
      return "À compléter";
    case "compliant":
      return "Conforme";
    case "archived":
      return "Archivé";
    default:
      return status;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "nda":
      return "NDA";
    case "review":
      return "Review";
    case "prepa":
      return "Prépa";
    case "daily":
      return "Daily";
    case "non_conformite":
      return "Non-conformité";
    case "audit_blanc":
      return "Review";
    case "mise_en_conformite":
      return "Prépa";
    case "audit_reel":
      return "Prépa";
    default:
      return type;
  }
}

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case "nda":
      return "type";
    case "review":
      return "info";
    case "prepa":
      return "warn";
    case "daily":
      return "success";
    case "non_conformite":
      return "danger";
    case "audit_blanc":
      return "info";
    case "mise_en_conformite":
      return "warn";
    case "audit_reel":
      return "warn";
    default:
      return "neutral";
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "compliant":
    case "generated":
      return "success";
    case "waiting_client":
    case "to_complete":
      return "warn";
    case "in_progress":
    case "collecting_documents":
    case "under_review":
      return "info";
    case "archived":
      return "neutral";
    case "assignable":
    case "assigned":
      return "status";
    case "draft":
      return "neutral";
    default:
      return "status";
  }
}

function getLatestDossier(dossiers: DossierLite[] | null): DossierLite | null {
  if (!dossiers || dossiers.length === 0) return null;

  return [...dossiers].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

export default async function AgentClientsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organisations")
    .select(
      `
        id,
        name,
        siret,
        email,
        phone,
        nda_number,
        created_at,
        dossiers (
          id,
          title,
          type,
          status,
          created_at
        )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main style={{ padding: "24px 28px" }}>
        <div
          style={{
            color: "var(--selen-danger)",
            background: "var(--selen-card)",
            border: "1px solid var(--selen-border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
          }}
        >
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      </main>
    );
  }

  const clients = (data ?? []) as ClientRow[];

  return (
    <main
      style={{
        padding: "24px 28px",
        maxWidth: 1120,
        margin: "0 auto",
        color: "var(--selen-text)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
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
              opacity: 0.8,
            }}
          >
            Studio agent
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--selen-text)",
              marginTop: 8,
              lineHeight: 1.2,
            }}
          >
            Clients
          </h1>

          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "var(--selen-text2)",
            }}
          >
            Vue portefeuille des clients et de leurs dossiers.
          </p>
        </div>

        <Link href="/agent/clients/new" style={{ textDecoration: "none" }}>
          <SelenButton variant="primary">+ Nouveau client</SelenButton>
        </Link>
      </div>
      <div style={{ marginBottom: 18 }}>
        <ClientAccessManager />
      </div>
      <SelenCard>
        <SelenCardTitle>Portefeuille clients</SelenCardTitle>

        {clients.length === 0 ? (
          <div
            style={{
              padding: "8px 2px 2px",
              fontSize: 13,
              color: "var(--selen-text3)",
            }}
          >
            Aucun client pour le moment.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {clients.map((client) => {
              const dossierCount = client.dossiers?.length ?? 0;
              const latestDossier = getLatestDossier(client.dossiers);

              return (
                <div
                  key={client.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1.1fr 0.9fr 0.8fr 1.5fr 0.9fr",
                    gap: 12,
                    alignItems: "center",
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/agent/clients/${client.id}`}
                      style={{
                        textDecoration: "none",
                        color: "var(--selen-text)",
                        fontSize: 14,
                        fontWeight: 600,
                        display: "block",
                        marginBottom: 4,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {client.name}
                    </Link>

                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--selen-text3)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {client.email ?? "—"}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--selen-text2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {client.phone ?? "—"}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--selen-text2)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {client.nda_number ?? "—"}
                  </div>

                  <div>
                    <SelenBadge variant="neutral" dot>
                      {dossierCount} dossier{dossierCount > 1 ? "s" : ""}
                    </SelenBadge>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    {latestDossier ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--selen-text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {latestDossier.title}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <SelenBadge
                            variant={getTypeBadgeVariant(latestDossier.type)}
                            dot
                          >
                            {getTypeLabel(latestDossier.type)}
                          </SelenBadge>

                          <SelenBadge
                            variant={getStatusBadgeVariant(
                              latestDossier.status,
                            )}
                            dot
                          >
                            {getStatusLabel(latestDossier.status)}
                          </SelenBadge>
                        </div>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--selen-text3)",
                        }}
                      >
                        Aucun dossier
                      </span>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    {latestDossier ? (
                      <Link
                        href={`/agent/dossiers/${latestDossier.id}`}
                        style={{
                          textDecoration: "none",
                          fontSize: 12,
                          color: "var(--selen-gold2)",
                        }}
                      >
                        Ouvrir →
                      </Link>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--selen-text3)",
                        }}
                      >
                        —
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SelenCard>
    </main>
  );
}
