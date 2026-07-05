import { revalidatePath } from "next/cache";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import type { CSSProperties, ComponentProps } from "react";

type DailyFormation = {
  id: string;
  user_id: string;
  title: string;
  global_objective: string;
  target_audience: string;
  duration_hours: number | null;
  duration_days: number | null;
  modality: string | null;
  status: string;
  version: number | null;
  validation_note: string | null;
  positioning_mode: string | null;
  positioning_questions: unknown;
  updated_at: string;
  daily_sessions?: { id: string; status: string | null }[] | null;
};

type DailyOnboarding = {
  id: string;
  user_id: string;
  status: string;
  current_step: number;
  setup_choice: string | null;
  organisation_name: string | null;
  platform_contact_first_name: string | null;
  platform_contact_email: string | null;
  updated_at: string;
};

type BadgeVariant = NonNullable<ComponentProps<typeof SelenBadge>["variant"]>;

type DailySession = {
  id: string;
  user_id: string;
  registration_status: string | null;
  registration_token: string | null;
  adaptation_needed: boolean | null;
  companies: unknown[] | null;
  individual_beneficiaries: unknown[] | null;
  beneficiaries: unknown[] | null;
  created_at: string;
  daily_formations: {
    id: string;
    title: string;
    status: string;
    positioning_mode?: string | null;
    positioning_questions?: unknown;
  } | null;
  daily_registration_responses?: Array<{
    id: string;
    response_type: string | null;
    positioning_answers: Record<string, unknown> | null;
  }> | null;
};

function statusLabel(status: string) {
  if (status === "draft") return "Brouillon";
  if (status === "review") return "À vérifier";
  if (status === "validated") return "Validée";
  if (status === "correction_requested") return "À corriger";
  if (status === "archived") return "Archivée";
  return "À suivre";
}

function formationStatusVariant(status: string): BadgeVariant {
  if (status === "validated") return "success";
  if (status === "correction_requested") return "warn";
  if (status === "archived") return "neutral";
  if (status === "review") return "info";
  return "status";
}

function registrationStatusVariant(status?: string | null): BadgeVariant {
  if (status === "ready_to_send" || status === "summary_validated")
    return "success";
  if (status === "sent" || status === "responses_received") return "info";
  if (status === "to_review" || status === "summary_to_review") return "warn";
  return "status";
}

function registrationStatusLabel(status?: string | null) {
  if (status === "to_prepare") return "À préparer";
  if (status === "to_review") return "À vérifier";
  if (status === "ready_to_send") return "Prêt à envoyer";
  if (status === "sent") return "Envoyé";
  if (status === "responses_received") return "Réponses reçues";
  if (status === "summary_to_review") return "Synthèse à relire";
  if (status === "summary_validated") return "Synthèse validée";
  return "À préparer";
}

function hasPositioningAnswers(
  value: Record<string, unknown> | null | undefined,
) {
  const questions = value?.questions;
  return Array.isArray(questions) && questions.length > 0;
}

function positioningStatus(session: DailySession) {
  if (session.daily_formations?.positioning_mode !== "selen")
    return "Positionnement hors plateforme";
  const expected = Math.max(
    (session.individual_beneficiaries ?? []).length +
      (session.beneficiaries ?? []).length,
    0,
  );
  const received = (session.daily_registration_responses ?? []).filter(
    (response) =>
      response.response_type === "beneficiary" &&
      hasPositioningAnswers(response.positioning_answers),
  ).length;
  return expected > 0
    ? `Positionnements : ${received}/${expected} recu(s)`
    : `Positionnements recus : ${received}`;
}

function formationPositioningSummary(formation: DailyFormation) {
  if (formation.positioning_mode !== "selen")
    return "Positionnement hors plateforme";
  const questions = Array.isArray(formation.positioning_questions)
    ? formation.positioning_questions
    : [];
  return `${questions.length} question(s) de positionnement dans Selen`;
}

async function updateDailyFormation(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = String(formData.get("id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!id) throw new Error("Formation Daily introuvable.");

  const status =
    action === "validate"
      ? "validated"
      : action === "correction"
        ? "correction_requested"
        : action === "archive"
          ? "archived"
          : action === "reactivate"
            ? "review"
            : null;

  if (!status) throw new Error("Action Daily inconnue.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("daily_formations")
    .update({
      status,
      validation_note: note || null,
      archived_at: status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/agent/daily");
}

function StatTile({
  label,
  value,
  accent = "var(--selen-gold2)",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div style={s.statTile}>
      <p style={s.statLabel}>{label}</p>
      <p style={{ ...s.statValue, color: accent }}>{value}</p>
    </div>
  );
}

export default async function AgentDailyPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return (
      <main style={s.page}>
        <p style={s.error}>{auth.error}</p>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const [formationsRes, onboardingRes, sessionsRes] = await Promise.all([
    admin
      .from("daily_formations")
      .select(
        "id,user_id,title,global_objective,target_audience,duration_hours,duration_days,modality,status,version,validation_note,positioning_mode,positioning_questions,updated_at,daily_sessions(id,status)",
      )
      .order("updated_at", { ascending: false }),
    admin
      .from("daily_onboarding")
      .select(
        "id,user_id,status,current_step,setup_choice,organisation_name,platform_contact_first_name,platform_contact_email,updated_at",
      )
      .order("updated_at", { ascending: false }),
    admin
      .from("daily_sessions")
      .select(
        "id,user_id,registration_status,registration_token,adaptation_needed,companies,beneficiaries,individual_beneficiaries,created_at,daily_formations(id,title,status,positioning_mode,positioning_questions),daily_registration_responses(id,response_type,positioning_answers)",
      )
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  if (formationsRes.error || onboardingRes.error || sessionsRes.error) {
    return (
      <main style={s.page}>
        <p style={s.error}>
          Erreur Daily :{" "}
          {formationsRes.error?.message ??
            onboardingRes.error?.message ??
            sessionsRes.error?.message}
        </p>
      </main>
    );
  }

  const formations = (formationsRes.data ?? []) as DailyFormation[];
  const onboardings = (onboardingRes.data ?? []) as DailyOnboarding[];
  const sessions = (sessionsRes.data ?? []) as unknown as DailySession[];
  const toReviewCount = formations.filter(
    (formation) => formation.status === "review",
  ).length;
  const videoCount = onboardings.filter(
    (row) => row.setup_choice === "video",
  ).length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Pilotage Daily</h1>
          <p style={s.subtitle}>
            Sessions, formations et alertes Daily à traiter avant les envois
            officiels.
          </p>
        </div>
      </header>

      <section style={s.statsGrid}>
        <StatTile
          label="Formations à vérifier"
          value={toReviewCount}
          accent="var(--selen-gold)"
        />
        <StatTile
          label="Visio demandée"
          value={videoCount}
          accent="var(--selen-info)"
        />
      </section>

      <SelenCard style={s.sectionCard}>
        <SelenCardTitle>Sessions à préparer</SelenCardTitle>

        {sessions.length === 0 ? (
          <p style={s.emptyText}>
            Aucune session Daily à préparer pour le moment.
          </p>
        ) : (
          <div style={s.sessionGrid}>
            {sessions.map((session) => (
              <article key={session.id} style={s.sessionCard}>
                <div style={s.sessionHead}>
                  <h2 style={s.sessionTitle}>
                    {session.daily_formations?.title ?? "Formation non reliée"}
                  </h2>
                  <div style={s.badgeRow}>
                    <SelenBadge
                      variant={formationStatusVariant(
                        session.daily_formations?.status ?? "draft",
                      )}
                      dot
                    >
                      Formation :{" "}
                      {statusLabel(session.daily_formations?.status ?? "draft")}
                    </SelenBadge>
                    <SelenBadge
                      variant={registrationStatusVariant(
                        session.registration_status,
                      )}
                      dot
                    >
                      Dossier :{" "}
                      {registrationStatusLabel(session.registration_status)}
                    </SelenBadge>
                  </div>
                </div>

                <div style={s.sessionMeta}>
                  <p style={s.metaLine}>{positioningStatus(session)}</p>
                  <p style={s.metaLine}>
                    {(session.individual_beneficiaries ?? []).length}{" "}
                    individuel(s) · {(session.companies ?? []).length}{" "}
                    entreprise(s)
                  </p>
                </div>

                {session.adaptation_needed ? (
                  <p style={s.alertLine}>
                    <SelenBadge variant="danger">
                      Adaptation à suivre
                    </SelenBadge>
                  </p>
                ) : null}

                <div style={s.sessionActions}>
                  <Link
                    href={`/agent/daily/sessions/${session.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <SelenButton variant="primary" size="sm">
                      Ouvrir le dossier
                    </SelenButton>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </SelenCard>

      <SelenCard style={s.sectionCard}>
        <SelenCardTitle>Formations à valider</SelenCardTitle>

        {formations.length === 0 ? (
          <p style={s.emptyText}>Aucune formation Daily pour le moment.</p>
        ) : (
          <div style={s.formationList}>
            {formations.map((formation) => {
              const linkedSessions = formation.daily_sessions ?? [];

              return (
                <article key={formation.id} style={s.formationCard}>
                  <div style={s.formationHead}>
                    <div style={s.formationIntro}>
                      <SelenBadge
                        variant={formationStatusVariant(formation.status)}
                        dot
                      >
                        {statusLabel(formation.status)}
                      </SelenBadge>
                      <h2 style={s.formationTitle}>{formation.title}</h2>
                      <p style={s.formationMeta}>
                        v{formation.version ?? 1} ·{" "}
                        {formation.duration_hours ?? "?"} h ·{" "}
                        {formation.duration_days ?? "?"} j ·{" "}
                        {formation.modality ?? "modalité non renseignée"}
                      </p>
                    </div>
                  </div>

                  <div style={s.summaryGrid}>
                    <div style={s.summaryItem}>
                      <span style={s.summaryLabel}>Objectif</span>
                      <span style={s.summaryValue}>
                        {formation.global_objective}
                      </span>
                    </div>
                    <div style={s.summaryItem}>
                      <span style={s.summaryLabel}>Public visé</span>
                      <span style={s.summaryValue}>
                        {formation.target_audience}
                      </span>
                    </div>
                    <div style={s.summaryItem}>
                      <span style={s.summaryLabel}>Sessions associées</span>
                      <span style={s.summaryValue}>
                        {linkedSessions.length}
                      </span>
                    </div>
                    <div style={s.summaryItem}>
                      <span style={s.summaryLabel}>Positionnement</span>
                      <span style={s.summaryValue}>
                        {formationPositioningSummary(formation)}
                      </span>
                    </div>
                    <div style={s.summaryItem}>
                      <span style={s.summaryLabel}>Dernière mise à jour</span>
                      <span style={s.summaryValue}>
                        {new Date(formation.updated_at).toLocaleDateString(
                          "fr-FR",
                        )}
                      </span>
                    </div>
                  </div>

                  {formation.validation_note ? (
                    <p style={s.note}>
                      <span style={s.summaryLabel}>Note agent</span>
                      <span style={s.summaryValue}>
                        {formation.validation_note}
                      </span>
                    </p>
                  ) : null}

                  <form action={updateDailyFormation} style={s.actions}>
                    <input type="hidden" name="id" value={formation.id} />
                    <input
                      name="note"
                      placeholder="Note agent visible pour le suivi interne"
                      style={s.input}
                    />
                    <button
                      type="submit"
                      name="action"
                      value="validate"
                      style={s.actionPrimary}
                    >
                      Valider
                    </button>
                    <button
                      type="submit"
                      name="action"
                      value="correction"
                      style={s.actionSecondary}
                    >
                      À corriger
                    </button>
                    {formation.status === "archived" ? (
                      <button
                        type="submit"
                        name="action"
                        value="reactivate"
                        style={s.actionGhost}
                      >
                        Remettre active
                      </button>
                    ) : (
                      <button
                        type="submit"
                        name="action"
                        value="archive"
                        style={s.actionGhost}
                      >
                        Archiver
                      </button>
                    )}
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </SelenCard>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
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
    marginBottom: 20,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
    opacity: 0.8,
    margin: 0,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: "var(--selen-text)",
    marginTop: 8,
    marginBottom: 0,
    lineHeight: 1.2,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    fontSize: 13,
    color: "var(--selen-text2)",
    lineHeight: 1.6,
    maxWidth: 620,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  statTile: {
    background: "var(--selen-bg2)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-lg)",
    padding: "14px 16px",
    boxShadow: "0 12px 28px rgba(120, 90, 50, 0.08)",
  },
  statLabel: {
    margin: 0,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--selen-text3)",
    marginBottom: 8,
  },
  statValue: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
    color: "var(--selen-gold2)",
  },
  sectionCard: {
    marginBottom: 16,
  },
  emptyText: {
    margin: 0,
    fontSize: 13,
    color: "var(--selen-text3)",
    lineHeight: 1.6,
  },
  sessionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  sessionCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "14px 16px",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
  },
  sessionHead: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sessionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: "var(--selen-text)",
    lineHeight: 1.35,
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  sessionMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  metaLine: {
    margin: 0,
    fontSize: 13,
    color: "var(--selen-text2)",
    lineHeight: 1.5,
  },
  alertLine: {
    margin: 0,
  },
  sessionActions: {
    marginTop: "auto",
    paddingTop: 4,
  },
  formationList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  formationCard: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: "16px 18px",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
  },
  formationHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  formationIntro: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  formationTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "var(--selen-text)",
    lineHeight: 1.35,
  },
  formationMeta: {
    margin: 0,
    fontSize: 12,
    color: "var(--selen-text3)",
    lineHeight: 1.5,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  summaryItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  summaryLabel: {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--selen-text3)",
    fontWeight: 600,
  },
  summaryValue: {
    fontSize: 13,
    color: "var(--selen-text2)",
    lineHeight: 1.55,
    wordBreak: "break-word",
  },
  note: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: 0,
    paddingTop: 12,
    borderTop: "1px solid var(--selen-border)",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    paddingTop: 12,
    borderTop: "1px solid var(--selen-border)",
  },
  input: {
    flex: "1 1 220px",
    minHeight: 34,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.08)",
    color: "var(--selen-text)",
    padding: "0 12px",
    fontSize: 13,
  },
  error: {
    color: "var(--selen-danger)",
  },

  actionPrimary: {
    minHeight: 34,
    border: 0,
    borderRadius: "var(--radius-sm)",
    padding: "0 14px",
    background:
      "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
    color: "var(--selen-ink)",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  actionSecondary: {
    minHeight: 34,
    borderRadius: "var(--radius-sm)",
    padding: "0 14px",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-bg2)",
    color: "var(--selen-text)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  actionGhost: {
    minHeight: 34,
    borderRadius: "var(--radius-sm)",
    padding: "0 14px",
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--selen-text2)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
};
