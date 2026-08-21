import Link from "next/link";
import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type BadgeVariant = NonNullable<ComponentProps<typeof SelenBadge>["variant"]>;

type FeedbackRow = {
  id: string;
  status: string;
  submission_type: string;
  subject: string;
  created_at: string;
  organisation_response: string | null;
  organisations: { name?: string | null } | { name?: string | null }[] | null;
};

type NotificationRow = {
  id: string;
  title: string;
  content: string;
  link_path: string | null;
  created_at: string;
};

type FollowupRow = {
  id: string;
  session_id: string;
  level: string;
  summary: string;
  status: string;
  occurred_at: string;
  daily_sessions: {
    reference?: string | null;
    daily_formations?: { title?: string | null } | { title?: string | null }[] | null;
  } | {
    reference?: string | null;
    daily_formations?: { title?: string | null } | { title?: string | null }[] | null;
  }[] | null;
};

type SessionRow = {
  id: string;
  registration_status: string | null;
  created_at: string;
  daily_formations: { title?: string | null } | { title?: string | null }[] | null;
};

type ActionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  date: string;
  variant: BadgeVariant;
  badge: string;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function feedbackAction(row: FeedbackRow): ActionItem | null {
  const organisation = one(row.organisations)?.name?.trim() || "Organisme";

  if (row.status === "received") {
    return {
      id: `feedback-review-${row.id}`,
      title: row.subject || "Réclamation ou suggestion à examiner",
      detail: `${organisation} · Revue Selen requise avant toute transmission à l’OF.`,
      href: "/agent/daily/stakeholder-feedback",
      date: row.created_at,
      variant: row.submission_type === "complaint" ? "danger" : "warn",
      badge: row.submission_type === "complaint" ? "Réclamation" : "Suggestion",
    };
  }

  if (row.status === "selen_reviewed") {
    return {
      id: `feedback-forward-${row.id}`,
      title: row.subject || "Demande revue à transmettre",
      detail: `${organisation} · La revue Selen est faite, la transmission à l’OF reste à effectuer.`,
      href: "/agent/daily/stakeholder-feedback",
      date: row.created_at,
      variant: "info",
      badge: "À transmettre",
    };
  }

  if (row.status === "forwarded_to_organisation" && row.organisation_response?.trim()) {
    return {
      id: `feedback-close-${row.id}`,
      title: row.subject || "Réponse OF à contrôler",
      detail: `${organisation} · L’OF a répondu, Selen doit contrôler puis clôturer le dossier.`,
      href: "/agent/daily/stakeholder-feedback",
      date: row.created_at,
      variant: "success",
      badge: "À clôturer",
    };
  }

  return null;
}

function registrationLabel(status?: string | null) {
  if (status === "to_review") return "Dossier de candidature à vérifier";
  if (status === "responses_received") return "Réponses de candidature à analyser";
  if (status === "summary_to_review") return "Synthèse Selen à relire";
  return "Candidature à traiter";
}

function sectionTitle(count: number, singular: string, plural: string) {
  return `${count} ${count > 1 ? plural : singular}`;
}

function ActionSection({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle: string;
  items: ActionItem[];
  empty: string;
}) {
  return (
    <SelenCard style={styles.sectionCard}>
      <div style={styles.sectionHeading}>
        <div>
          <SelenCardTitle>{title}</SelenCardTitle>
          <p style={styles.sectionSubtitle}>{subtitle}</p>
        </div>
        <SelenBadge variant={items.length > 0 ? "warn" : "success"} dot>
          {items.length > 0 ? `${items.length} à traiter` : "À jour"}
        </SelenBadge>
      </div>

      {items.length === 0 ? (
        <p style={styles.empty}>{empty}</p>
      ) : (
        <div style={styles.list}>
          {items.map((item) => (
            <article key={item.id} style={styles.item}>
              <div style={styles.itemMain}>
                <div style={styles.badgeRow}>
                  <SelenBadge variant={item.variant} dot>
                    {item.badge}
                  </SelenBadge>
                  <span style={styles.date}>{formatDate(item.date)}</span>
                </div>
                <h2 style={styles.itemTitle}>{item.title}</h2>
                <p style={styles.itemDetail}>{item.detail}</p>
              </div>
              <Link href={item.href} style={{ textDecoration: "none" }}>
                <SelenButton variant="primary" size="sm">
                  Traiter
                </SelenButton>
              </Link>
            </article>
          ))}
        </div>
      )}
    </SelenCard>
  );
}

function Metric({ value, label, children }: { value: number; label: string; children?: ReactNode }) {
  return (
    <div style={styles.metric}>
      <strong style={styles.metricValue}>{value}</strong>
      <span style={styles.metricLabel}>{label}</span>
      {children}
    </div>
  );
}

export default async function DailyAgentActionsPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={styles.page}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const [feedbackResult, notificationsResult, followupResult, sessionsResult] = await Promise.all([
    admin
      .from("daily_stakeholder_feedback")
      .select("id,status,submission_type,subject,created_at,organisation_response,organisations(name)")
      .in("status", ["received", "selen_reviewed", "forwarded_to_organisation"])
      .order("created_at", { ascending: true })
      .limit(100),
    admin
      .from("notifications")
      .select("id,title,content,link_path,created_at")
      .eq("type", "client_message")
      .is("read_at", null)
      .is("dismissed_at", null)
      .or(`target_user_id.eq.${auth.userId},target_user_id.is.null`)
      .order("created_at", { ascending: true })
      .limit(100),
    admin
      .from("daily_session_followup_entries")
      .select("id,session_id,level,summary,status,occurred_at,daily_sessions(reference,daily_formations(title))")
      .neq("status", "resolved")
      .order("occurred_at", { ascending: true })
      .limit(100),
    admin
      .from("daily_sessions")
      .select("id,registration_status,created_at,daily_formations(title)")
      .in("registration_status", ["to_review", "responses_received", "summary_to_review"])
      .neq("status", "archived")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  const readError =
    feedbackResult.error ??
    notificationsResult.error ??
    followupResult.error ??
    sessionsResult.error;

  if (readError) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>Impossible de charger les actions Daily : {readError.message}</p>
      </main>
    );
  }

  const feedbackItems = ((feedbackResult.data ?? []) as unknown as FeedbackRow[])
    .map(feedbackAction)
    .filter((item): item is ActionItem => Boolean(item));

  const messageItems = ((notificationsResult.data ?? []) as NotificationRow[]).map((row) => ({
    id: `message-${row.id}`,
    title: row.title || "Message client non lu",
    detail: row.content || "Un client Daily attend une réponse de Selen.",
    href: row.link_path || "/agent",
    date: row.created_at,
    variant: "info" as BadgeVariant,
    badge: "Message client",
  }));

  const followupItems = ((followupResult.data ?? []) as unknown as FollowupRow[])
    .filter((row) => ["critical", "high"].includes(row.level))
    .map((row) => {
      const session = one(row.daily_sessions);
      const formation = one(session?.daily_formations);
      return {
        id: `followup-${row.id}`,
        title: row.summary || "Situation de session à suivre",
        detail: `${formation?.title || session?.reference || "Session Daily"} · Situation ${row.level === "critical" ? "critique" : "importante"} encore ouverte.`,
        href: `/agent/daily/sessions/${row.session_id}`,
        date: row.occurred_at,
        variant: row.level === "critical" ? ("danger" as BadgeVariant) : ("warn" as BadgeVariant),
        badge: row.level === "critical" ? "Critique" : "À suivre",
      };
    });

  const registrationItems = ((sessionsResult.data ?? []) as unknown as SessionRow[]).map((row) => ({
    id: `registration-${row.id}`,
    title: registrationLabel(row.registration_status),
    detail: `${one(row.daily_formations)?.title || "Formation Daily"} · Intervention agent requise avant la suite du parcours préformation.`,
    href: `/agent/daily/sessions/${row.id}`,
    date: row.created_at,
    variant: "warn" as BadgeVariant,
    badge: "Candidature",
  }));

  const total = feedbackItems.length + messageItems.length + followupItems.length + registrationItems.length;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Selen Daily · agent</p>
          <h1 style={styles.title}>Actions à faire</h1>
          <p style={styles.subtitle}>
            Une file opérationnelle unique pour repérer ce qui demande réellement une intervention Selen, sans fouiller chaque dossier.
          </p>
        </div>
        <Link href="/agent/daily" style={{ textDecoration: "none" }}>
          <SelenButton variant="secondary" size="sm">Retour au pilotage</SelenButton>
        </Link>
      </header>

      <section style={styles.metrics}>
        <Metric value={total} label="actions ouvertes" />
        <Metric value={registrationItems.length} label="candidatures" />
        <Metric value={feedbackItems.length} label="réclamations / suggestions" />
        <Metric value={messageItems.length} label="messages non lus" />
        <Metric value={followupItems.length} label="situations sensibles" />
      </section>

      <ActionSection
        title={sectionTitle(registrationItems.length, "candidature à traiter", "candidatures à traiter")}
        subtitle="Contrôle des réponses, synthèse et prérequis avant convention."
        items={registrationItems}
        empty="Aucune candidature n’attend d’intervention agent."
      />

      <ActionSection
        title={sectionTitle(feedbackItems.length, "réclamation ou suggestion", "réclamations ou suggestions")}
        subtitle="Revue Selen, transmission volontaire à l’OF puis clôture après réponse."
        items={feedbackItems}
        empty="Aucune réclamation ou suggestion ne nécessite d’action Selen."
      />

      <ActionSection
        title={sectionTitle(messageItems.length, "message client non lu", "messages clients non lus")}
        subtitle="Messages Daily encore non lus pour cet agent ou adressés à l’équipe support."
        items={messageItems}
        empty="Aucun message client Daily non lu."
      />

      <ActionSection
        title={sectionTitle(followupItems.length, "situation sensible", "situations sensibles")}
        subtitle="Incidents et adaptations de niveau important ou critique encore ouverts."
        items={followupItems}
        empty="Aucune situation importante ou critique n’est actuellement ouverte."
      />
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "24px 28px 56px",
    color: "var(--selen-text)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  eyebrow: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
    opacity: 0.8,
  },
  title: {
    margin: "8px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  subtitle: {
    maxWidth: 680,
    margin: "8px 0 0",
    color: "var(--selen-text2)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    gap: 10,
    marginBottom: 16,
  },
  metric: {
    minHeight: 88,
    padding: "14px 16px",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-bg2)",
    boxShadow: "0 12px 28px rgba(120, 90, 50, 0.08)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
  },
  metricValue: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    lineHeight: 1,
    color: "var(--selen-gold2)",
  },
  metricLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "var(--selen-text3)",
  },
  sectionCard: {
    marginBottom: 16,
  },
  sectionHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  sectionSubtitle: {
    margin: "6px 0 0",
    fontSize: 12,
    color: "var(--selen-text3)",
    lineHeight: 1.5,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    padding: "14px 16px",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
  },
  itemMain: {
    minWidth: 0,
    flex: "1 1 520px",
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  date: {
    fontSize: 11,
    color: "var(--selen-text3)",
  },
  itemTitle: {
    margin: "9px 0 0",
    fontSize: 15,
    fontWeight: 650,
    lineHeight: 1.35,
  },
  itemDetail: {
    margin: "6px 0 0",
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--selen-text2)",
  },
  empty: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--selen-text3)",
  },
  error: {
    color: "var(--selen-danger)",
  },
};
