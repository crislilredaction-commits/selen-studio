import Link from "next/link";

import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type DailyNotification = {
  id: string;
  title: string;
  content: string | null;
  organisation_name: string | null;
  link_path: string | null;
  source_kind: string | null;
  pinned: boolean | null;
  read_at: string | null;
  escalation_at: string | null;
  created_at: string;
};

type StakeholderFeedback = {
  id: string;
  submission_type: string;
  stakeholder_type: string;
  submitter_name: string | null;
  subject: string | null;
  status: string;
  organisation_response: string | null;
  resolved_at: string | null;
  created_at: string;
};

type RegistrationSession = {
  id: string;
  registration_status: string | null;
  adaptation_needed: boolean | null;
  daily_formations: { title: string } | null;
};

type PendingAssessment = {
  id: string;
  session_id: string;
  enrolment_id: string;
  score: number | null;
  score_max: number | null;
  notes: string | null;
  updated_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function notificationLabel(sourceKind: string | null) {
  if (sourceKind === "daily_session_checklist") return "Session";
  if (sourceKind === "daily_trainer_certification") return "Formateur";
  if (sourceKind === "daily_checklist") return "Organisme";
  return "Daily";
}

function feedbackActionLabel(row: StakeholderFeedback) {
  if (row.status === "received") return "À relire par Selen";
  if (row.status === "selen_reviewed") return "À transmettre à l’OF";
  if (
    row.status === "forwarded_to_organisation" &&
    row.organisation_response?.trim()
  ) {
    return "Réponse OF à contrôler et clôturer";
  }
  return "En attente";
}

export default async function DailyActionsPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>{auth.error}</p>
      </main>
    );
  }

  const supabase = await createClient();
  const admin = createSupabaseAdminClient();

  const [notificationsRes, feedbackRes, registrationsRes, assessmentsRes] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id,title,content,organisation_name,link_path,source_kind,pinned,read_at,escalation_at,created_at",
      )
      .like("source_kind", "daily_%")
      .is("dismissed_at", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("daily_stakeholder_feedback")
      .select(
        "id,submission_type,stakeholder_type,submitter_name,subject,status,organisation_response,resolved_at,created_at",
      )
      .in("status", [
        "received",
        "selen_reviewed",
        "forwarded_to_organisation",
      ])
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("daily_sessions")
      .select(
        "id,registration_status,adaptation_needed,daily_formations(title)",
      )
      .in("registration_status", ["to_review", "summary_to_review"])
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("daily_learning_assessments")
      .select("id,session_id,enrolment_id,score,score_max,notes,updated_at")
      .eq("outcome", "pending")
      .eq("method", "Selen quiz")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const loadError =
    notificationsRes.error ?? feedbackRes.error ?? registrationsRes.error ?? assessmentsRes.error;

  if (loadError) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>Impossible de charger les actions Daily : {loadError.message}</p>
      </main>
    );
  }

  const notifications = (notificationsRes.data ?? []) as DailyNotification[];
  const feedback = ((feedbackRes.data ?? []) as StakeholderFeedback[]).filter(
    (row) =>
      row.status === "received" ||
      row.status === "selen_reviewed" ||
      (row.status === "forwarded_to_organisation" &&
        Boolean(row.organisation_response?.trim()) &&
        !row.resolved_at),
  );
  const registrations = (registrationsRes.data ?? []) as unknown as RegistrationSession[];
  const assessments = (assessmentsRes.data ?? []) as PendingAssessment[];

  const totalActions = notifications.length + feedback.length + registrations.length + assessments.length;
  const unreadNotifications = notifications.filter((row) => !row.read_at).length;
  const escalatedNotifications = notifications.filter(
    (row) => row.escalation_at && new Date(row.escalation_at) <= new Date(),
  ).length;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Studio agent · Daily</p>
          <h1 style={styles.title}>Actions à faire</h1>
          <p style={styles.subtitle}>
            Une vue courte des interventions humaines encore nécessaires. Les
            éléments terminés disparaissent de cette file au lieu d’y prendre
            racine pour l’éternité.
          </p>
        </div>
        <Link href="/agent/daily" style={{ textDecoration: "none" }}>
          <SelenButton variant="ghost">Retour au pilotage</SelenButton>
        </Link>
      </header>

      <section style={styles.statsGrid}>
        <Stat label="Actions actives" value={totalActions} />
        <Stat label="Notifications non lues" value={unreadNotifications} />
        <Stat label="Actions escaladées" value={escalatedNotifications} />
        <Stat label="Évaluations à valider" value={assessments.length} />
      </section>

      <SelenCard style={styles.sectionCard}>
        <SelenCardTitle>Alertes Daily assignées</SelenCardTitle>
        <p style={styles.helpText}>
          Cette liste réutilise le registre de notifications existant et son
          routage agent/admin. Aucune nouvelle logique d’assignation n’est
          dupliquée ici.
        </p>
        {notifications.length === 0 ? (
          <p style={styles.empty}>Aucune alerte Daily active pour ton compte.</p>
        ) : (
          <div style={styles.list}>
            {notifications.map((row) => (
              <article key={row.id} style={styles.item}>
                <div style={styles.itemHead}>
                  <div style={styles.badges}>
                    <SelenBadge variant={row.pinned ? "warn" : "info"} dot>
                      {notificationLabel(row.source_kind)}
                    </SelenBadge>
                    {!row.read_at ? (
                      <SelenBadge variant="status">Non lue</SelenBadge>
                    ) : null}
                    {row.escalation_at && new Date(row.escalation_at) <= new Date() ? (
                      <SelenBadge variant="danger">Escaladée</SelenBadge>
                    ) : null}
                  </div>
                  <span style={styles.date}>{formatDate(row.created_at)}</span>
                </div>
                <h2 style={styles.itemTitle}>{row.title}</h2>
                <p style={styles.itemText}>
                  {[row.organisation_name, row.content].filter(Boolean).join(" · ")}
                </p>
                {row.link_path ? (
                  <Link href={row.link_path} style={styles.link}>
                    Traiter l’action →
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </SelenCard>

      <SelenCard style={styles.sectionCard}>
        <SelenCardTitle>Candidatures à contrôler</SelenCardTitle>
        <p style={styles.helpText}>
          Les dossiers restent ici tant qu’une revue ou une synthèse Selen est
          attendue avant la convention.
        </p>
        {registrations.length === 0 ? (
          <p style={styles.empty}>Aucune candidature en attente de contrôle.</p>
        ) : (
          <div style={styles.list}>
            {registrations.map((session) => (
              <article key={session.id} style={styles.item}>
                <div style={styles.badges}>
                  <SelenBadge variant="warn" dot>
                    {session.registration_status === "summary_to_review"
                      ? "Synthèse à relire"
                      : "Dossier à vérifier"}
                  </SelenBadge>
                  {session.adaptation_needed ? (
                    <SelenBadge variant="danger">Adaptation signalée</SelenBadge>
                  ) : null}
                </div>
                <h2 style={styles.itemTitle}>
                  {session.daily_formations?.title ?? "Session Daily"}
                </h2>
                <Link
                  href={`/agent/daily/sessions/${session.id}`}
                  style={styles.link}
                >
                  Ouvrir la candidature →
                </Link>
              </article>
            ))}
          </div>
        )}
      </SelenCard>

      <SelenCard style={styles.sectionCard}>
        <SelenCardTitle>Évaluations Selen à valider</SelenCardTitle>
        <p style={styles.helpText}>
          Les questionnaires Selen transmis restent visibles tant que le résultat pédagogique est encore à valider. Le score automatique n’est qu’une aide à la relecture.
        </p>
        {assessments.length === 0 ? (
          <p style={styles.empty}>Aucune évaluation Selen en attente de validation.</p>
        ) : (
          <div style={styles.list}>
            {assessments.map((assessment) => (
              <article key={assessment.id} style={styles.item}>
                <div style={styles.itemHead}>
                  <div style={styles.badges}>
                    <SelenBadge variant="warn" dot>Validation humaine</SelenBadge>
                    {assessment.score != null && assessment.score_max != null ? (
                      <SelenBadge variant="info">{assessment.score}/{assessment.score_max}</SelenBadge>
                    ) : null}
                  </div>
                  <span style={styles.date}>{formatDate(assessment.updated_at)}</span>
                </div>
                <h2 style={styles.itemTitle}>Questionnaire apprenant transmis</h2>
                <p style={styles.itemText}>{assessment.notes ?? "Le résultat pédagogique doit encore être qualifié."}</p>
                <Link href={`/agent/daily/session-dossiers/${assessment.session_id}`} style={styles.link}>
                  Ouvrir le dossier de session →
                </Link>
              </article>
            ))}
          </div>
        )}
      </SelenCard>

      <SelenCard style={styles.sectionCard}>
        <SelenCardTitle>Réclamations & suggestions</SelenCardTitle>
        <p style={styles.helpText}>
          Seules les étapes nécessitant réellement une action Selen sont
          affichées. Une demande transmise à l’OF reste silencieuse jusqu’à sa
          réponse.
        </p>
        {feedback.length === 0 ? (
          <p style={styles.empty}>Aucune réclamation ou suggestion à traiter.</p>
        ) : (
          <div style={styles.list}>
            {feedback.map((row) => (
              <article key={row.id} style={styles.item}>
                <div style={styles.itemHead}>
                  <div style={styles.badges}>
                    <SelenBadge
                      variant={row.submission_type === "complaint" ? "danger" : "info"}
                      dot
                    >
                      {row.submission_type === "complaint"
                        ? "Réclamation"
                        : "Suggestion"}
                    </SelenBadge>
                    <SelenBadge variant="warn">
                      {feedbackActionLabel(row)}
                    </SelenBadge>
                  </div>
                  <span style={styles.date}>{formatDate(row.created_at)}</span>
                </div>
                <h2 style={styles.itemTitle}>{row.subject ?? "Demande sans objet"}</h2>
                <p style={styles.itemText}>
                  {[row.submitter_name, row.stakeholder_type].filter(Boolean).join(" · ")}
                </p>
                <Link href="/agent/daily/stakeholder-feedback" style={styles.link}>
                  Ouvrir la file de traitement →
                </Link>
              </article>
            ))}
          </div>
        )}
      </SelenCard>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.stat}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={styles.statValue}>{value}</strong>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 22, flexWrap: "wrap" as const },
  eyebrow: { margin: 0, fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: "var(--selen-gold)" },
  title: { margin: "8px 0 0", fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.15 },
  subtitle: { margin: "10px 0 0", maxWidth: 760, color: "var(--selen-text2)", fontSize: 14, lineHeight: 1.65 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  stat: { border: "1px solid var(--selen-border)", background: "var(--selen-bg2)", borderRadius: "var(--radius-md)", padding: 14, display: "grid", gap: 8 },
  statLabel: { fontSize: 11, color: "var(--selen-text3)" },
  statValue: { fontFamily: "var(--font-display)", fontSize: 25, color: "var(--selen-gold2)" },
  sectionCard: { marginBottom: 18 },
  helpText: { margin: "7px 0 14px", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.6 },
  empty: { margin: 0, color: "var(--selen-text3)", fontSize: 13 },
  list: { display: "grid", gap: 10 },
  item: { border: "1px solid var(--selen-border)", background: "var(--selen-bg3)", borderRadius: "var(--radius-md)", padding: 14 },
  itemHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" as const },
  badges: { display: "flex", gap: 7, flexWrap: "wrap" as const },
  date: { fontSize: 11, color: "var(--selen-text3)" },
  itemTitle: { margin: "10px 0 5px", fontSize: 15, lineHeight: 1.4 },
  itemText: { margin: 0, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.55 },
  link: { display: "inline-block", marginTop: 10, color: "var(--selen-gold2)", textDecoration: "none", fontSize: 12, fontWeight: 700 },
  error: { color: "var(--selen-danger)", fontSize: 14 },
};
