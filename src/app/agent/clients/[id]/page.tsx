import Link from "next/link";
import { redirect } from "next/navigation";

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
  status: string | null;
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
        status,
        email,
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

  const activeDossiers = (typedClient.dossiers ?? []).filter(
    (dossier) => dossier.status !== "archived",
  );

  const archivedDossiers = (typedClient.dossiers ?? []).filter(
    (dossier) => dossier.status === "archived",
  );

  const dossierCount = activeDossiers.length;
  const archivedDossierCount = archivedDossiers.length;

  const activeDossierCount = activeDossiers.length;

  async function archiveClientAction(formData: FormData) {
    "use server";

    const clientId = formData.get("client_id") as string;
    const confirmation = (formData.get("confirmation") as string)?.trim();

    if (confirmation !== "ARCHIVER") {
      throw new Error(
        "Confirmation invalide. Pour archiver ce client, écrivez ARCHIVER.",
      );
    }

    const supabase = await createClient();

    const { data: dossiers, error: dossiersError } = await supabase
      .from("dossiers")
      .select("id, status")
      .eq("organisation_id", clientId)
      .neq("status", "archived");

    if (dossiersError) {
      console.error(dossiersError);
      throw new Error("Impossible de vérifier les dossiers du client.");
    }

    if ((dossiers ?? []).length > 0) {
      throw new Error(
        "Impossible d’archiver ce client : il possède encore des dossiers actifs.",
      );
    }

    const { error: archiveError } = await supabase
      .from("organisations")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
      })
      .eq("id", clientId);

    if (archiveError) {
      console.error(archiveError);
      throw new Error("Impossible d’archiver ce client.");
    }

    redirect("/agent/clients");
  }

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
              {dossierCount} dossier{dossierCount > 1 ? "s" : ""} actif
              {dossierCount > 1 ? "s" : ""}
            </SelenBadge>

            {archivedDossierCount > 0 && (
              <SelenBadge variant="neutral" dot>
                {archivedDossierCount} archivé
                {archivedDossierCount > 1 ? "s" : ""}
              </SelenBadge>
            )}

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

          {activeDossiers.length === 0 ? (
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
              {activeDossiers
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
      <div style={{ marginTop: 16 }}>
        <SelenCard>
          <SelenCardTitle>Zone danger</SelenCardTitle>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--selen-text2)",
              marginBottom: 12,
            }}
          >
            L’archivage retire ce client des listes actives, sans supprimer ses
            données historiques. Pour éviter les erreurs, un client ne peut être
            archivé que si tous ses dossiers sont déjà archivés.
          </p>

          {activeDossierCount > 0 ? (
            <div
              style={{
                border: "1px solid rgba(201, 122, 122, 0.35)",
                background: "rgba(201, 122, 122, 0.08)",
                borderRadius: "var(--radius-md)",
                padding: 14,
                color: "var(--selen-danger)",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Ce client ne peut pas être archivé pour le moment :{" "}
              {activeDossierCount} dossier
              {activeDossierCount > 1
                ? "s actifs sont encore ouverts"
                : " actif est encore ouvert"}
              . Archive d’abord les dossiers concernés.
            </div>
          ) : (
            <form
              action={archiveClientAction}
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <input type="hidden" name="client_id" value={typedClient.id} />

              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--selen-text2)",
                }}
              >
                Pour confirmer, écris ARCHIVER
                <input
                  name="confirmation"
                  placeholder="ARCHIVER"
                  style={{
                    width: "100%",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  style={{
                    border: "1px solid rgba(201, 122, 122, 0.45)",
                    background: "rgba(201, 122, 122, 0.12)",
                    color: "var(--selen-danger)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Archiver ce client
                </button>
              </div>
            </form>
          )}
        </SelenCard>
      </div>
    </main>
  );
}
