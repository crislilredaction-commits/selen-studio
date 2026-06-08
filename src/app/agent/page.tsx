import Link from "next/link";
import type { ReactNode } from "react";

import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/agent/LogoutButton";

type StaffRole = "agent" | "admin";

type StaffInfo = {
  id: string | null;
  user_id: string | null;
  email: string | null;
  role: StaffRole;
  first_name: string | null;
  last_name: string | null;
};

type DossierRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  updated_at: string | null;
};

type AuditBlancCaseRow = {
  id: string;
  client_email: string;
  status: string | null;
  offer: string | null;
  updated_at: string | null;
  agent_id: string | null;
  agent_email: string | null;
  report_status: string | null;
};

type MessageRow = {
  id: string;
  dossier_id: string | null;
  sender_type: string | null;
  content: string | null;
  created_at: string | null;
  read_by_agent_at: string | null;
};

type DashboardItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  date?: string | null;
};

type DashboardData = {
  assignedDossiers: DashboardItem[];
  unreadMessageDossiers: DashboardItem[];
  relanceDossiers: DashboardItem[];
  actionDossiers: DashboardItem[];
  auditBlancItems: DashboardItem[];
  unassignedItems: DashboardItem[];
  unreadMessagesCount: number;
};

const studioLinks: {
  title: string;
  description: string;
  href: string;
  icon: string;
}[] = [];

const adminLinks = [
  {
    title: "Créer un accès agent",
    description:
      "Inviter un nouvel agent ou auditeur à accéder à Selen Studio.",
    href: "/agent/admin/agents",
    icon: "🪪",
    internal: true,
  },
  {
    title: "www.selen-editions.fr",
    description: "Ouvrir le site public et l’espace client Selen.",
    href: "https://www.selen-editions.fr",
    icon: "🌐",
    internal: false,
  },
  {
    title: "selion.selen-editions.fr",
    description: "Ouvrir le robot de prospection et le suivi des prospects.",
    href: "https://selion.selen-editions.fr",
    icon: "🦁",
    internal: false,
  },
];

const quickLinks = [
  {
    label: "Créer un dossier",
    href: "/agent/dossiers/new",
    variant: "primary" as const,
  },
  {
    label: "Créer un client",
    href: "/agent/clients/new",
    variant: "ghost" as const,
  },
];

const inactiveStatuses = new Set([
  "completed",
  "cancelled",
  "archived",
  "done",
  "termine",
  "terminé",
]);

const waitingClientStatuses = new Set([
  "waiting_client",
  "to_complete",
  "collecting_documents",
  "booking_pending",
]);

function isActiveStatus(status?: string | null) {
  if (!status) return true;
  return !inactiveStatuses.has(status);
}

function isWaitingClientStatus(status?: string | null) {
  if (!status) return false;
  return waitingClientStatuses.has(status);
}

function shouldShowAuditBlancInDashboard(auditCase: AuditBlancCaseRow) {
  if (!isActiveStatus(auditCase.status)) return false;

  // Quand le rapport est envoyé au client, on ne garde plus l’audit blanc
  // comme action dashboard tant que le client ne relance pas lui-même.
  if (
    auditCase.report_status === "sent" ||
    auditCase.status === "report_ready" ||
    auditCase.status === "completed"
  ) {
    return false;
  }

  return true;
}

function formatStatus(status?: string | null) {
  if (status === "draft") return "Brouillon";
  if (status === "waiting_client") return "En attente client";
  if (status === "assignable") return "À attribuer";
  if (status === "assigned") return "Attribué";
  if (status === "in_progress") return "En cours";
  if (status === "collecting_documents") return "Collecte documents";
  if (status === "under_review") return "Analyse en cours";
  if (status === "to_complete") return "À compléter";
  if (status === "generated") return "Généré";
  if (status === "compliant") return "Conforme";
  if (status === "archived") return "Archivé";
  if (status === "paid") return "Paiement validé";
  if (status === "booking_pending") return "RDV à planifier";
  if (status === "partially_booked") return "RDV partiel";
  if (status === "booked") return "RDV réservé";
  if (status === "report_ready") return "Rapport prêt";
  if (status === "completed") return "Terminé";
  if (status === "cancelled") return "Annulé";
  return status ?? "À vérifier";
}

function formatType(type?: string | null) {
  if (type === "nda") return "NDA";
  if (type === "review") return "Review";
  if (type === "prepa") return "Prépa";
  if (type === "daily") return "Daily";
  return type ?? "Dossier";
}

function formatOffer(offer?: string | null) {
  if (offer === "direct") return "Audit blanc direct";
  if (offer === "reserved_after_auto_audit")
    return "Audit blanc après auto-audit";
  if (offer === "manual") return "Audit blanc manuel";
  return "Audit blanc";
}

function formatDate(value?: string | null) {
  if (!value) return "Date non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getNameFromEmail(email?: string | null) {
  if (!email) return "agent";
  return email.split("@")[0] || "agent";
}

function getGreetingName(staff: StaffInfo) {
  return staff.first_name?.trim() || getNameFromEmail(staff.email);
}

function buildDossierItem(dossier: DossierRow): DashboardItem {
  return {
    id: dossier.id,
    title: dossier.title || `Dossier ${dossier.id.slice(0, 8)}`,
    subtitle: `${formatType(dossier.type)} · ${formatStatus(dossier.status)}`,
    href: `/agent/dossiers/${dossier.id}`,
    date: dossier.updated_at,
  };
}

function buildAuditItem(auditCase: AuditBlancCaseRow): DashboardItem {
  return {
    id: auditCase.id,
    title: auditCase.client_email,
    subtitle: `${formatOffer(auditCase.offer)} · ${formatStatus(auditCase.status)}`,
    href: `/agent/audits-blancs/${auditCase.id}`,
    date: auditCase.updated_at,
  };
}

function uniqueItems(items: DashboardItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function getCurrentStaffInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<StaffInfo> {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return {
      id: null,
      user_id: null,
      role: "admin",
      email: "local-dev-agent@selen.local",
      first_name: null,
      last_name: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      id: null,
      user_id: null,
      role: "agent",
      email: null,
      first_name: null,
      last_name: null,
    };
  }

  const { data: staffByUserId } = await supabase
    .from("selen_admin_users")
    .select("role, email, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const { data: staffByEmail } = staffByUserId?.role
    ? { data: null }
    : await supabase
        .from("selen_admin_users")
        .select("role, email, is_active")
        .eq("email", user.email)
        .eq("is_active", true)
        .maybeSingle();

  const role = (staffByUserId?.role ??
    staffByEmail?.role ??
    "agent") as StaffRole;

  const staffEmail = staffByUserId?.email ?? staffByEmail?.email ?? user.email;

  const { data: agentProfileByUserId } = await supabase
    .from("agent_profiles")
    .select("id, user_id, email, role, first_name, last_name, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (agentProfileByUserId) {
    return {
      id: agentProfileByUserId.id,
      user_id: agentProfileByUserId.user_id,
      email: agentProfileByUserId.email ?? staffEmail,
      role,
      first_name: agentProfileByUserId.first_name,
      last_name: agentProfileByUserId.last_name,
    };
  }

  const { data: agentProfileByEmail } = await supabase
    .from("agent_profiles")
    .select("id, user_id, email, role, first_name, last_name, is_active")
    .eq("email", staffEmail)
    .eq("is_active", true)
    .maybeSingle();

  return {
    id: agentProfileByEmail?.id ?? null,
    user_id: agentProfileByEmail?.user_id ?? user.id,
    email: agentProfileByEmail?.email ?? staffEmail,
    role,
    first_name: agentProfileByEmail?.first_name ?? null,
    last_name: agentProfileByEmail?.last_name ?? null,
  };
}

async function getDashboardData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staff: StaffInfo,
): Promise<DashboardData> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const assignedDossierIds = new Set<string>();

  if (staff.id) {
    const { data: assignmentData } = await supabase
      .from("dossier_assignments")
      .select("dossier_id")
      .eq("agent_id", staff.id);

    (assignmentData ?? []).forEach((assignment) => {
      if (assignment.dossier_id) assignedDossierIds.add(assignment.dossier_id);
    });
  }

  let assignedDossiersRaw: DossierRow[] = [];

  if (assignedDossierIds.size > 0) {
    const { data: dossierData } = await supabase
      .from("dossiers")
      .select("id, title, type, status, updated_at")
      .in("id", Array.from(assignedDossierIds))
      .order("updated_at", { ascending: false });

    assignedDossiersRaw = ((dossierData ?? []) as DossierRow[]).filter(
      (dossier) => isActiveStatus(dossier.status),
    );
  }

  const assignedDossiers = assignedDossiersRaw.map(buildDossierItem);

  const relevantDossierIds: string[] =
    staff.role === "admin"
      ? []
      : assignedDossiersRaw.map((dossier) => dossier.id);

  let unreadMessagesRaw: MessageRow[] = [];

  const shouldLoadUnreadMessages =
    staff.role === "admin" || relevantDossierIds.length > 0;

  if (shouldLoadUnreadMessages) {
    let unreadMessagesQuery = supabase
      .from("messages")
      .select(
        "id, dossier_id, sender_type, content, created_at, read_by_agent_at",
      )
      .eq("sender_type", "client")
      .is("read_by_agent_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (staff.role !== "admin") {
      unreadMessagesQuery = unreadMessagesQuery.in(
        "dossier_id",
        relevantDossierIds,
      );
    }

    const { data: unreadMessageData } = await unreadMessagesQuery;

    unreadMessagesRaw = (unreadMessageData ?? []) as MessageRow[];
  }

  const unreadDossierIds = Array.from(
    new Set(
      unreadMessagesRaw
        .map((message) => message.dossier_id)
        .filter(Boolean) as string[],
    ),
  );

  let unreadDossiersRaw: DossierRow[] = [];

  if (unreadDossierIds.length > 0) {
    const { data: unreadDossierData } = await supabase
      .from("dossiers")
      .select("id, title, type, status, updated_at")
      .in("id", unreadDossierIds);

    unreadDossiersRaw = ((unreadDossierData ?? []) as DossierRow[]).filter(
      (dossier) => isActiveStatus(dossier.status),
    );
  }

  const unreadMessageDossiers = unreadDossiersRaw.map((dossier) => ({
    ...buildDossierItem(dossier),
    subtitle: `${formatType(dossier.type)} · message client non lu`,
  }));

  let relanceDossiersRaw: DossierRow[] = [];

  if (assignedDossiersRaw.length > 0) {
    const assignedIds = assignedDossiersRaw.map((dossier) => dossier.id);

    const { data: recentMessageData } = await supabase
      .from("messages")
      .select(
        "id, dossier_id, sender_type, content, created_at, read_by_agent_at",
      )
      .in("dossier_id", assignedIds)
      .order("created_at", { ascending: false })
      .limit(200);

    const latestMessageByDossier = new Map<string, MessageRow>();

    ((recentMessageData ?? []) as MessageRow[]).forEach((message) => {
      if (!message.dossier_id) return;
      if (!latestMessageByDossier.has(message.dossier_id)) {
        latestMessageByDossier.set(message.dossier_id, message);
      }
    });

    relanceDossiersRaw = assignedDossiersRaw.filter((dossier) => {
      const latestMessage = latestMessageByDossier.get(dossier.id);

      if (latestMessage?.created_at) {
        const latestMessageDate = new Date(latestMessage.created_at);

        return (
          latestMessage.sender_type !== "client" &&
          latestMessageDate < sevenDaysAgo
        );
      }

      if (!dossier.updated_at) return false;

      return (
        isWaitingClientStatus(dossier.status) &&
        new Date(dossier.updated_at) < sevenDaysAgo
      );
    });
  }

  const relanceDossiers = relanceDossiersRaw.map((dossier) => ({
    ...buildDossierItem(dossier),
    subtitle: `${formatType(dossier.type)} · relance client à prévoir`,
  }));

  const actionDossiers = uniqueItems([
    ...unreadMessageDossiers,
    ...relanceDossiers,
  ]);

  const { data: allAssignmentData } = await supabase
    .from("dossier_assignments")
    .select("dossier_id");

  const allAssignedDossierIds = new Set(
    (allAssignmentData ?? [])
      .map((assignment) => assignment.dossier_id)
      .filter(Boolean) as string[],
  );

  const { data: candidateUnassignedDossiers } = await supabase
    .from("dossiers")
    .select("id, title, type, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  const unassignedDossiers = (
    (candidateUnassignedDossiers ?? []) as DossierRow[]
  )
    .filter((dossier) => isActiveStatus(dossier.status))
    .filter((dossier) => !allAssignedDossierIds.has(dossier.id))
    .slice(0, 6)
    .map((dossier) => ({
      ...buildDossierItem(dossier),
      subtitle: `${formatType(dossier.type)} · sans attribution`,
    }));

  const { data: unassignedAuditData } = await supabase
    .from("audit_blanc_cases")
    .select(
      "id, client_email, status, offer, updated_at, agent_id, agent_email, report_status",
    )
    .or("agent_id.is.null,agent_email.is.null")
    .order("updated_at", { ascending: false })
    .limit(6);

  const unassignedAudits = ((unassignedAuditData ?? []) as AuditBlancCaseRow[])
    .filter((auditCase) => shouldShowAuditBlancInDashboard(auditCase))
    .map((auditCase) => ({
      ...buildAuditItem(auditCase),
      subtitle: `${formatOffer(auditCase.offer)} · sans attribution`,
    }));

  let auditBlancItems: DashboardItem[] = [];

  if (staff.role === "admin" || staff.id || staff.email) {
    let auditQuery = supabase
      .from("audit_blanc_cases")
      .select(
        "id, client_email, status, offer, updated_at, agent_id, agent_email, report_status",
      )
      .order("updated_at", { ascending: false })
      .limit(20);

    if (staff.role !== "admin") {
      if (staff.id && staff.email) {
        auditQuery = auditQuery.or(
          `agent_id.eq.${staff.id},agent_email.eq.${staff.email}`,
        );
      } else if (staff.id) {
        auditQuery = auditQuery.eq("agent_id", staff.id);
      } else if (staff.email) {
        auditQuery = auditQuery.eq("agent_email", staff.email);
      }
    }

    const { data: auditData } = await auditQuery;

    auditBlancItems = ((auditData ?? []) as AuditBlancCaseRow[])
      .filter((auditCase) => shouldShowAuditBlancInDashboard(auditCase))
      .slice(0, 8)
      .map((auditCase) => ({
        ...buildAuditItem(auditCase),
        subtitle: `${formatOffer(auditCase.offer)} · ${formatStatus(
          auditCase.status,
        )}`,
      }));
  }

  return {
    assignedDossiers: assignedDossiers.slice(0, 6),
    unreadMessageDossiers: unreadMessageDossiers.slice(0, 6),
    relanceDossiers: relanceDossiers.slice(0, 6),
    actionDossiers: actionDossiers.slice(0, 8),
    auditBlancItems,
    unassignedItems: [...unassignedDossiers, ...unassignedAudits].slice(0, 8),
    unreadMessagesCount: unreadMessagesRaw.length,
  };
}

export default async function AgentHomePage() {
  const supabase = await createClient();
  const staff = await getCurrentStaffInfo(supabase);
  const dashboard = await getDashboardData(supabase, staff);

  const isAdmin = staff.role === "admin";
  const greetingName = getGreetingName(staff);

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
            Bonjour {greetingName} ✨
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
            Voici ton tableau de bord du jour : les dossiers à suivre, les
            messages clients, les relances à prévoir et les dossiers sans
            attribution.
          </p>

          {staff.email && (
            <p
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "var(--selen-text3)",
              }}
            >
              Connecté avec : {staff.email} — rôle : {staff.role}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ textDecoration: "none" }}
            >
              <SelenButton variant={item.variant}>{item.label}</SelenButton>
            </Link>
          ))}

          <LogoutButton />
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <TaskCard
          icon="💬"
          title="Nouveaux messages"
          count={dashboard.unreadMessagesCount}
          emptyText="Aucun nouveau message client."
          items={dashboard.unreadMessageDossiers}
          footerHref="/agent/dossiers"
          footerLabel="Ouvrir les dossiers avec messages"
        />

        <TaskCard
          icon="⚡"
          title="Dossiers à traiter"
          count={dashboard.actionDossiers.length}
          emptyText="Aucune action immédiate détectée."
          items={dashboard.actionDossiers}
        />

        <TaskCard
          icon="🧾"
          title="Audits blancs Review"
          count={dashboard.auditBlancItems.length}
          emptyText="Aucun audit blanc Review actif à suivre."
          items={dashboard.auditBlancItems}
          footerHref="/agent/audits-blancs"
          footerLabel="Ouvrir les audits blancs"
        />

        <TaskCard
          icon="📨"
          title="Clients à relancer"
          count={dashboard.relanceDossiers.length}
          emptyText="Aucune relance client détectée."
          items={dashboard.relanceDossiers}
        />
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
      {dashboard.unassignedItems.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <TaskCard
            icon="🧭"
            title="Dossiers en attente d’un agent"
            count={dashboard.unassignedItems.length}
            emptyText="Aucun dossier en attente d’attribution."
            items={dashboard.unassignedItems}
            footerHref="/agent/dossiers"
            footerLabel="Voir les dossiers"
          />
        </section>
      )}

      {isAdmin && (
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
              Ces raccourcis permettent de naviguer entre les différents espaces
              Selen. Ils sont réservés aux comptes administrateurs.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {adminLinks.map((item) => {
                const card = (
                  <div
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-md)",
                      padding: 14,
                      background: "var(--selen-bg3)",
                      height: "100%",
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 8 }}>
                      {item.icon}
                    </div>

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
                      {item.internal
                        ? "Ouvrir →"
                        : "Ouvrir dans un nouvel onglet ↗"}
                    </p>
                  </div>
                );

                if (item.internal) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                      }}
                    >
                      {card}
                    </Link>
                  );
                }

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    {card}
                  </a>
                );
              })}
            </div>
          </SelenCard>
        </section>
      )}
    </main>
  );
}

function TaskCard({
  icon,
  title,
  count,
  emptyText,
  items,
  footerHref,
  footerLabel,
}: {
  icon: string;
  title: string;
  count: number;
  emptyText: string;
  items: DashboardItem[];
  footerHref?: string;
  footerLabel?: string;
}) {
  return (
    <SelenCard style={{ height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 22,
              marginBottom: 8,
            }}
          >
            {icon}
          </p>

          <SelenCardTitle>{title}</SelenCardTitle>
        </div>

        <div
          style={{
            minWidth: 38,
            height: 38,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            padding: "0 10px",
            background: "var(--selen-bg3)",
            border: "1px solid var(--selen-border)",
            color: "var(--selen-gold2)",
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          {count}
        </div>
      </div>

      {items.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--selen-text3)",
          }}
        >
          {emptyText}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {items.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                border: "1px solid var(--selen-border)",
                borderRadius: "var(--radius-sm)",
                padding: 10,
                background: "var(--selen-bg3)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--selen-text)",
                  marginBottom: 4,
                  lineHeight: 1.35,
                }}
              >
                {item.title}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--selen-text2)",
                  lineHeight: 1.4,
                }}
              >
                {item.subtitle}
              </div>

              {item.date && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--selen-text3)",
                    marginTop: 6,
                  }}
                >
                  Dernière mise à jour : {formatDate(item.date)}
                </div>
              )}
            </Link>
          ))}

          {items.length > 4 && (
            <p
              style={{
                fontSize: 12,
                color: "var(--selen-text3)",
                marginTop: 2,
              }}
            >
              + {items.length - 4} autre{items.length - 4 > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {footerHref && footerLabel && (
        <div style={{ marginTop: 12 }}>
          <Link
            href={footerHref}
            style={{
              fontSize: 12,
              color: "var(--selen-gold2)",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {footerLabel} →
          </Link>
        </div>
      )}
    </SelenCard>
  );
}
