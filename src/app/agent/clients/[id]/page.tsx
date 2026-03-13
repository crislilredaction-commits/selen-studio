import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type DossierRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  siret: string | null;
  nda_number: string | null;
  address: string | null;
  dossiers: DossierRow[] | null;
};

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

export default async function ClientPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("organisations")
    .select(
      `
        id,
        name,
        email,
        phone,
        siret,
        nda_number,
        address,
        dossiers (
          id,
          title,
          type,
          status,
          created_at
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

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

  if (!client) {
    return (
      <main style={{ padding: "24px 28px", color: "var(--selen-text)" }}>
        Client introuvable
      </main>
    );
  }

  const typedClient = client as ClientRow;
  const dossierCount = typedClient.dossiers?.length ?? 0;

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
            Fiche client
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
            {typedClient.name}
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <SelenBadge variant="neutral" dot>
              {dossierCount} dossier{dossierCount > 1 ? "s" : ""}
            </SelenBadge>

            {typedClient.nda_number ? (
              <SelenBadge variant="type" dot>
                NDA : {typedClient.nda_number}
              </SelenBadge>
            ) : (
              <SelenBadge variant="warn" dot>
                Pas de NDA renseigné
              </SelenBadge>
            )}
          </div>
        </div>

        <Link
          href={`/agent/dossiers/new?client=${typedClient.id}`}
          style={{ textDecoration: "none" }}
        >
          <SelenButton variant="primary">+ Nouveau dossier</SelenButton>
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1.6fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <SelenCard>
          <SelenCardTitle>Informations client</SelenCardTitle>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
            }}
          >
            {[
              { label: "Email", value: typedClient.email },
              { label: "Téléphone", value: typedClient.phone },
              { label: "SIRET", value: typedClient.siret },
              { label: "N° NDA", value: typedClient.nda_number },
              { label: "Adresse", value: typedClient.address },
            ].map((field) => (
              <div key={field.label}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--selen-text3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 4,
                  }}
                >
                  {field.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--selen-text)",
                    lineHeight: 1.45,
                  }}
                >
                  {field.value ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Dossiers du client</SelenCardTitle>

          {!typedClient.dossiers || typedClient.dossiers.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--selen-text3)",
              }}
            >
              Aucun dossier pour le moment.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {typedClient.dossiers
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
                .map((dossier) => (
                  <Link
                    key={dossier.id}
                    href={`/agent/dossiers/${dossier.id}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.6fr 0.8fr 1fr 0.8fr",
                        gap: 12,
                        alignItems: "center",
                        padding: "14px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--selen-bg3)",
                        border: "1px solid var(--selen-border)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--selen-text)",
                            marginBottom: 4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {dossier.title}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--selen-text3)",
                          }}
                        >
                          Créé le{" "}
                          {new Date(dossier.created_at).toLocaleDateString(
                            "fr-FR",
                          )}
                        </div>
                      </div>

                      <div>
                        <SelenBadge
                          variant={getTypeBadgeVariant(dossier.type)}
                          dot
                        >
                          {getTypeLabel(dossier.type)}
                        </SelenBadge>
                      </div>

                      <div>
                        <SelenBadge
                          variant={getStatusBadgeVariant(dossier.status)}
                          dot
                        >
                          {getStatusLabel(dossier.status)}
                        </SelenBadge>
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                          fontSize: 12,
                          color: "var(--selen-gold2)",
                        }}
                      >
                        Ouvrir →
                      </div>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </SelenCard>
      </div>
    </main>
  );
}
