import Link from "next/link";
import type { ReactNode } from "react";

import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/agent/LogoutButton";
import DailyActionSummarySection from "@/components/agent/DailyActionSummarySection";
import { isOwnerLil } from "@/lib/ownerLil";
import {
  getDailyActionSummary,
  type DailyActionSummary,
} from "@/lib/server/dailyActionSummary";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

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

type ReminderRow = {
  id: string;
  client_email: string | null;
  dossier_id: string | null;
  reminder_type: string | null;
  status: string | null;
  subject: string | null;
  due_at: string | null;
  metadata: Record<string, unknown> | null;
};

type SupportTicketRow = {
  id: string;
  client_email: string | null;
  client_name: string | null;
  subject: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type RefundRequestRow = {
  id: string;
  ticket_id: string | null;
  client_email: string | null;
  amount_cents: number | null;
  reason: string | null;
  created_at: string | null;
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
  supportTickets: DashboardItem[];
  refundRequests: DashboardItem[];
  actionDossiers: DashboardItem[];
  actionDossiersCount: number;
  auditBlancItems: DashboardItem[];
  unassignedItems: DashboardItem[];
  unreadMessagesCount: number;
  canAccessGestionLil: boolean;
};

const studioLinks: {
  title: string;
  description: string;
  href: string;
  icon: string;
}[] = [];

const adminLinks = [
  {
    title: "Gestion Lil",
    description:
      "Piloter les audits externes, le CA Selen et les actions SAV admin.",
    href: "/agent/gestion",
    icon: "💼",
    internal: true,
  },
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

function isActiveStatus(status?: string | null) {
  if (!status) return true;
  return !inactiveStatuses.has(status);
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

function formatReminderType(type?: string | null) {
  if (type === "preaudit_incomplete_15_days") return "Préaudit";
  if (type === "audit_blanc_booking_reminder_7_days") return "Review";
  if (type === "audit_blanc_48h_reminder") return "Rappel Review";
  if (type === "nda_inactive_9_days") return "NDA";
  return "Relance";
}

function supportPriorityRank(priority?: string | null) {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  if (priority === "low") return 3;
  return 4;
}

function supportActivityDate(ticket: SupportTicketRow) {
  return ticket.last_message_at || ticket.updated_at || ticket.created_at;
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

function buildSupportTicketItem(ticket: SupportTicketRow): DashboardItem {
  return {
    id: ticket.id,
    title: ticket.subject || "Ticket support",
    subtitle: [
      ticket.client_name || ticket.client_email || "Client",
      ticket.category || "support",
      ticket.priority || "normal",
    ].join(" · "),
    href: `/agent/support/${ticket.id}`,
    date: supportActivityDate(ticket),
  };
}

function buildDailyActionItem(summary: DailyActionSummary): DashboardItem | null {
  if (summary.total <= 0) return null;

  const details = [
    summary.candidatures > 0
      ? `${summary.candidatures} candidature${summary.candidatures > 1 ? "s" : ""}`
      : null,
    summary.feedback > 0
      ? `${summary.feedback} réclamation${summary.feedback > 1 ? "s / suggestions" : " / suggestion"}`
      : null,
    summary.unreadMessages > 0
      ? `${summary.unreadMessages} message${summary.unreadMessages > 1 ? "s" : ""}`
      : null,
    summary.sensitiveFollowups > 0
      ? `${summary.sensitiveFollowups} situation${summary.sensitiveFollowups > 1 ? "s sensibles" : " sensible"}`
      : null,
  ].filter(Boolean) as string[];

  return {
    id: "daily-actions-summary",
    title: `Daily · ${summary.total} action${summary.total > 1 ? "s" : ""} à traiter`,
    subtitle: details.join(" · "),
    href: summary.href,
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
  const canAccessGestionLil = isOwnerLil(staff.email);
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
  const activeUnreadDossierIds = new Set(
    unreadDossiersRaw.map((dossier) => dossier.id),
  );
  const activeUnreadMessagesCount = unreadMessagesRaw.filter(
    (message) =>
      message.dossier_id && activeUnreadDossierIds.has(message.dossier_id),
  ).length;

  const { data: reminderData } = await supabase
    .from("client_reminders")
    .select(
      "id, client_email, dossier_id, reminder_type, status, subject, due_at, metadata",
    )
    .in("status", ["draft", "ready", "postponed"])
    .order("due_at", { ascending: true })
    .limit(12);

  const relanceDossiers = ((reminderData ?? []) as ReminderRow[]).map(
    (reminder) => {
      const reason =
        typeof reminder.metadata?.reason === "string"
          ? reminder.metadata.reason
          : reminder.subject || "Relance client à traiter";

      return {
        id: reminder.id,
        title: reminder.client_email || "Client à relancer",
        subtitle: `${formatReminderType(reminder.reminder_type)} · ${reason}`,
        href: "/agent/relances",
        date: reminder.due_at,
      };
    },
  );

  const { data: supportTicketsData, error: supportTicketsError } =
    await supabase
      .from("support_tickets")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(30);

  if (supportTicketsError) {
    console.error("Erreur chargement tickets dashboard:", supportTicketsError);
  }

  const supportTickets = ((supportTicketsData ?? []) as SupportTicketRow[])
    .sort((a, b) => {
      const priorityDelta =
        supportPriorityRank(a.priority) - supportPriorityRank(b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return (
        new Date(supportActivityDate(b) ?? 0).getTime() -
        new Date(supportActivityDate(a) ?? 0).getTime()
      );
    })
    .slice(0, 6)
    .map(buildSupportTicketItem);

  let refundRequests: DashboardItem[] = [];
  if (canAccessGestionLil) {
    const { data: refundData } = await supabase
      .from("support_refund_requests")
      .select("id, ticket_id, client_email, amount_cents, reason, created_at")
      .eq("status", "to_process")
      .order("created_at", { ascending: false })
      .limit(6);

    refundRequests = ((refundData ?? []) as RefundRequestRow[]).map(
      (refund) => ({
        id: refund.id,
        title: refund.client_email || "Client a rembourser",
        subtitle: `${refund.reason || "Remboursement a traiter"}${
          refund.amount_cents
            ? ` · ${(refund.amount_cents / 100).toFixed(2)} €`
            : ""
        }`,
        href: refund.ticket_id
          ? `/agent/support/${refund.ticket_id}`
          : "/agent/support",
        date: refund.created_at,
      }),
    );
  }

  let dailyActionSummary: DailyActionSummary | null = null;
  if (staff.user_id) {
    try {
      dailyActionSummary = await getDailyActionSummary(staff.user_id);
    } catch (error) {
      const readError = error as { code?: string; message?: string };
      console.error("[agent-dashboard] Daily action summary read failed", {
        code: readError.code,
        message: readError.message,
      });
    }
  }

  const dailyActionItem = dailyActionSummary
    ? buildDailyActionItem(dailyActionSummary)
    : null;

  const legacyActionDossiers = uniqueItems([
    ...unreadMessageDossiers,
    ...relanceDossiers.filter(
      (item) =>
        !((reminderData ?? []) as ReminderRow[]).some(
          (reminder) =>
            reminder.id === item.id &&
            reminder.reminder_type === "preaudit_incomplete_15_days",
        ),
    ),
  ]);

  const actionDossiers = uniqueItems([
    ...(dailyActionItem ? [dailyActionItem] : []),
    ...legacyActionDossiers,
  ]);
  const actionDossiersCount =
    legacyActionDossiers.length + (dailyActionSummary?.total ?? 0);

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
    supportTickets: supportTickets.slice(0, 6),
    refundRequests,
    actionDossiers: actionDossiers.slice(0, 8),
    actionDossiersCount,
    auditBlancItems,
    unassignedItems: [...unassignedDossiers, ...unassignedAudits].slice(0, 8),
    unreadMessagesCount: activeUnreadMessagesCount,
    canAccessGestionLil,
  };
}

export default async function AgentHomePage() {
  const supabase = await createClient();
  const staff = await getCurrentStaffInfo(supabase);
  const admin = createSupabaseAdminClient();
  const dashboard = await getDashboardData(admin, staff);

  const isAdmin = staff.role === "admin";
  const canAccessGestionLil = dashboard.canAccessGestionLil;
  const greetingName = getGreetingName(staff);
  const visibleAdminLinks = adminLinks.filter((item) =>
    item.href === "/agent/gestion" ? canAccessGestionLil : isAdmin,
  );

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

      <DailyActionSummarySection userId={staff.user_id} />

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
          count={dashboard.actionDossiersCount}
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
          footerHref="/agent/relances"
          footerLabel="Ouvrir les relances"
        />
        <TaskCard
          icon="🛟"
          title="Support à traiter"
          count={dashboard.supportTickets.length}
          emptyText="Aucun ticket support à traiter."
          items={dashboard.supportTickets}
          footerHref="/agent/support"
          footerLabel="Ouvrir le support"
        />
        {canAccessGestionLil && (
          <TaskCard
            icon="💸"
            title="Remboursements a traiter"
            count={dashboard.refundRequests.length}
            emptyText="Aucun remboursement en attente."
            items={dashboard.refundRequests}
            footerHref="/agent/support"
            footerLabel="Ouvrir le support"
          />
        )}
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

      {visibleAdminLinks.length > 0 && (
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
              {visibleAdminLinks.map((item) => {
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
