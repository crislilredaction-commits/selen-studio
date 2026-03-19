import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";

type DossierType =
  | "nda"
  | "review"
  | "prepa"
  | "daily"
  | "non_conformite"
  | "audit_blanc"
  | "mise_en_conformite"
  | "audit_reel";

type DossierStatus =
  | "draft"
  | "waiting_client"
  | "assignable"
  | "assigned"
  | "in_progress"
  | "generated"
  | "collecting_documents"
  | "under_review"
  | "to_complete"
  | "compliant"
  | "archived";

type AssignmentProfile =
  | {
      full_name: string | null;
      email: string | null;
    }
  | {
      full_name: string | null;
      email: string | null;
    }[]
  | null;

type AssignmentRow = {
  is_primary: boolean;
  profiles: AssignmentProfile;
};

type OrganisationRelation =
  | {
      name: string;
    }
  | {
      name: string;
    }[]
  | null;

type DossierRow = {
  id: string;
  title: string;
  type: DossierType;
  status: DossierStatus;
  created_at: string;
  organisations: OrganisationRelation;
  dossier_assignments: AssignmentRow[] | null;
  messages?:
    | {
        id: string;
        sender_type: "agent" | "client";
        read_by_agent_at: string | null;
      }[]
    | null;
};

function getUnreadClientMessagesCount(
  messages?:
    | {
        id: string;
        sender_type: "agent" | "client";
        read_by_agent_at: string | null;
      }[]
    | null,
): number {
  if (!messages || messages.length === 0) return 0;

  return messages.filter(
    (message) =>
      message.sender_type === "client" && message.read_by_agent_at === null,
  ).length;
}

function getOrganisationName(organisation: OrganisationRelation): string {
  if (!organisation) return "—";
  if (Array.isArray(organisation)) {
    return organisation[0]?.name ?? "—";
  }
  return organisation.name ?? "—";
}

function getAssignedAgentName(assignments: AssignmentRow[] | null): string {
  if (!assignments || assignments.length === 0) return "—";

  const primaryAssignment =
    assignments.find((assignment) => assignment.is_primary) ?? assignments[0];

  const profile = primaryAssignment.profiles;

  if (!profile) return "—";

  if (Array.isArray(profile)) {
    return profile[0]?.full_name ?? profile[0]?.email ?? "—";
  }

  return profile.full_name ?? profile.email ?? "—";
}

function getTypeLabel(type: DossierType): string {
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

function getTypeBadgeVariant(type: DossierType) {
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

function getStatusLabel(status: DossierStatus): string {
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

function getStatusBadgeVariant(status: DossierStatus) {
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

export default async function AgentDossiersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dossiers")
    .select(
      `
      id,
      title,
      type,
      status,
      created_at,
      organisations (
        name
      ),
      dossier_assignments (
        is_primary,
        profiles:agent_id (
          full_name,
          email
        )
      ),
      messages (
        id,
        sender_type,
        read_by_agent_at
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

  const dossiers = (data ?? []) as DossierRow[];

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
            Dossiers
          </h1>

          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "var(--selen-text2)",
            }}
          >
            Vue de pilotage des dossiers clients.
          </p>
        </div>

        <Link href="/agent/dossiers/new" style={{ textDecoration: "none" }}>
          <SelenButton variant="primary">+ Nouveau dossier</SelenButton>
        </Link>
      </div>

      <SelenCard>
        <SelenCardTitle>Dossiers en cours</SelenCardTitle>

        {dossiers.length === 0 ? (
          <div
            style={{
              padding: "8px 2px 2px",
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
            {dossiers.map((dossier) => {
              const unreadCount = getUnreadClientMessagesCount(
                dossier.messages,
              );
              const hasUnread = unreadCount > 0;

              return (
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
                      gridTemplateColumns: "1.7fr 1.1fr 0.8fr 1fr 1.1fr 0.8fr",
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
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
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

                        {hasUnread && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              background: "rgba(212, 159, 63, 0.16)",
                              border: "1px solid rgba(212, 159, 63, 0.35)",
                              color: "var(--selen-gold2)",
                              borderRadius: 999,
                              padding: "3px 8px",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Nouveau message
                            <span
                              style={{
                                minWidth: 18,
                                height: 18,
                                borderRadius: 999,
                                background: "var(--selen-gold)",
                                color: "#1a120b",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "0 5px",
                              }}
                            >
                              {unreadCount}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--selen-text2)",
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {getOrganisationName(dossier.organisations)}
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
                        fontSize: 13,
                        color: "var(--selen-text2)",
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {getAssignedAgentName(dossier.dossier_assignments)}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--selen-gold2)",
                        textAlign: "right",
                      }}
                    >
                      Ouvrir →
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SelenCard>
    </main>
  );
}
