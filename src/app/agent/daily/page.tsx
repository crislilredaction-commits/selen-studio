import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

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

function statusColor(status: string) {
  if (status === "validated") return "#6f8f4e";
  if (status === "correction_requested") return "#c76f45";
  if (status === "archived") return "#8d8174";
  return "var(--selen-gold)";
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

function hasPositioningAnswers(value: Record<string, unknown> | null | undefined) {
  const questions = value?.questions;
  return Array.isArray(questions) && questions.length > 0;
}

function positioningStatus(session: DailySession) {
  if (session.daily_formations?.positioning_mode !== "selen") return "Positionnement hors plateforme";
  const expected = Math.max((session.individual_beneficiaries ?? []).length + (session.beneficiaries ?? []).length, 0);
  const received = (session.daily_registration_responses ?? []).filter(
    (response) => response.response_type === "beneficiary" && hasPositioningAnswers(response.positioning_answers),
  ).length;
  return expected > 0
    ? `Positionnements : ${received}/${expected} recu(s)`
    : `Positionnements recus : ${received}`;
}

function formationPositioningSummary(formation: DailyFormation) {
  if (formation.positioning_mode !== "selen") return "Positionnement hors plateforme";
  const questions = Array.isArray(formation.positioning_questions) ? formation.positioning_questions : [];
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
      .select("id,user_id,status,current_step,setup_choice,organisation_name,platform_contact_first_name,platform_contact_email,updated_at")
      .order("updated_at", { ascending: false }),
    admin
      .from("daily_sessions")
      .select("id,user_id,registration_status,registration_token,adaptation_needed,companies,beneficiaries,individual_beneficiaries,created_at,daily_formations(id,title,status,positioning_mode,positioning_questions),daily_registration_responses(id,response_type,positioning_answers)")
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  if (formationsRes.error || onboardingRes.error || sessionsRes.error) {
    return (
      <main style={s.page}>
        <p style={s.error}>
          Erreur Daily : {formationsRes.error?.message ?? onboardingRes.error?.message ?? sessionsRes.error?.message}
        </p>
      </main>
    );
  }

  const formations = (formationsRes.data ?? []) as DailyFormation[];
  const onboardings = (onboardingRes.data ?? []) as DailyOnboarding[];
  const sessions = (sessionsRes.data ?? []) as unknown as DailySession[];
  const toReviewCount = formations.filter((formation) => formation.status === "review").length;
  const videoCount = onboardings.filter((row) => row.setup_choice === "video").length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily</p>
          <h1 style={s.title}>Formations à vérifier</h1>
          <p style={s.subtitle}>
            Vue minimale pour valider les programmes Daily avant les futurs envois officiels.
          </p>
        </div>
        <div style={s.counter}>
          <strong>{toReviewCount}</strong>
          <span>à vérifier</span>
        </div>
        <div style={s.counter}>
          <strong>{videoCount}</strong>
          <span>visio demandée</span>
        </div>
      </header>

      <section style={s.card}>
        <p style={s.badge}>Sessions à préparer</p>
        <div style={s.onboardingGrid}>
          {sessions.map((session) => (
            <article key={session.id} style={s.onboardingItem}>
              <strong>{session.daily_formations?.title ?? "Formation non reliée"}</strong>
              <span>Formation : {statusLabel(session.daily_formations?.status ?? "draft")}</span>
              <span>Dossier : {registrationStatusLabel(session.registration_status)}</span>
              <span>{positioningStatus(session)}</span>
              <span>
                {(session.individual_beneficiaries ?? []).length} individuel(s) ·{" "}
                {(session.companies ?? []).length} entreprise(s)
              </span>
              {session.adaptation_needed ? <span style={s.alert}>Adaptation à suivre</span> : null}
              <a href={`/agent/daily/sessions/${session.id}`} style={s.linkButton}>
                Ouvrir le dossier
              </a>
            </article>
          ))}
          {sessions.length === 0 ? (
            <p style={s.subtitle}>Aucune session Daily à préparer pour le moment.</p>
          ) : null}
        </div>
      </section>

      <section style={s.list}>
        {formations.map((formation) => {
          const sessions = formation.daily_sessions ?? [];
          return (
            <article key={formation.id} style={s.card}>
              <div style={s.cardHead}>
                <div>
                  <p style={s.badge}>{statusLabel(formation.status)}</p>
                  <h2 style={s.cardTitle}>{formation.title}</h2>
                  <p style={s.meta}>
                    v{formation.version ?? 1} · {formation.duration_hours ?? "?"} h · {formation.duration_days ?? "?"} j · {formation.modality ?? "modalité non renseignée"}
                  </p>
                </div>
                <span style={{ ...s.statusDot, background: statusColor(formation.status) }} />
              </div>

              <div style={s.summaryGrid}>
                <p>
                  <strong>Objectif</strong>
                  <span>{formation.global_objective}</span>
                </p>
                <p>
                  <strong>Public visé</strong>
                  <span>{formation.target_audience}</span>
                </p>
                <p>
                  <strong>Sessions associées</strong>
                  <span>{sessions.length}</span>
                </p>
                <p>
                  <strong>Positionnement</strong>
                  <span>{formationPositioningSummary(formation)}</span>
                </p>
                <p>
                  <strong>Dernière mise à jour</strong>
                  <span>{new Date(formation.updated_at).toLocaleDateString("fr-FR")}</span>
                </p>
              </div>

              {formation.validation_note ? (
                <p style={s.note}>Note agent : {formation.validation_note}</p>
              ) : null}

              <form action={updateDailyFormation} style={s.actions}>
                <input type="hidden" name="id" value={formation.id} />
                <input
                  name="note"
                  placeholder="Note agent visible pour le suivi interne"
                  style={s.input}
                />
                <button name="action" value="validate" style={s.primaryButton}>
                  Valider
                </button>
                <button name="action" value="correction" style={s.secondaryButton}>
                  À corriger
                </button>
                {formation.status === "archived" ? (
                  <button name="action" value="reactivate" style={s.secondaryButton}>
                    Remettre active
                  </button>
                ) : (
                  <button name="action" value="archive" style={s.secondaryButton}>
                    Archiver
                  </button>
                )}
              </form>
            </article>
          );
        })}

        {formations.length === 0 ? (
          <div style={s.card}>
            <p style={s.subtitle}>Aucune formation Daily pour le moment.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px 32px 56px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 22 },
  eyebrow: { fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 34, margin: "8px 0", color: "var(--selen-text)" },
  subtitle: { color: "var(--selen-text2)", lineHeight: 1.6, margin: 0 },
  counter: { display: "grid", gap: 2, minWidth: 120, border: "1px solid var(--selen-border)", padding: 14, textAlign: "center", color: "var(--selen-gold2)" },
  list: { display: "grid", gap: 14 },
  card: { background: "var(--selen-card-texture), var(--selen-card)", border: "1px solid rgba(245,208,138,0.18)", borderRadius: "var(--radius-sm)", padding: 18, color: "var(--selen-text-oncard)" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 12 },
  badge: { color: "var(--selen-gold2)", fontSize: 12, fontWeight: 800, margin: 0 },
  cardTitle: { margin: "5px 0", color: "var(--selen-text-oncard)", fontSize: 22 },
  meta: { color: "var(--selen-text3-oncard)", margin: 0, fontSize: 13 },
  statusDot: { width: 14, height: 14, borderRadius: 999, flexShrink: 0, marginTop: 8 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 14 },
  onboardingGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 },
  onboardingItem: { display: "grid", gap: 4, border: "1px solid rgba(245,208,138,0.14)", padding: 12, color: "var(--selen-text2-oncard)" },
  alert: { color: "var(--selen-danger)", fontWeight: 800 },
  linkButton: { minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", padding: "0 12px", background: "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))", color: "var(--selen-ink)", fontWeight: 800, textDecoration: "none" },
  note: { color: "var(--selen-text2-oncard)", borderTop: "1px solid rgba(245,208,138,0.14)", paddingTop: 10 },
  actions: { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) repeat(3, auto)", gap: 8, marginTop: 14, alignItems: "center" },
  input: { minHeight: 38, borderRadius: "var(--radius-sm)", border: "1px solid rgba(245,208,138,0.22)", background: "#f7ecd8", color: "#3b281b", padding: "0 10px" },
  primaryButton: { minHeight: 38, border: 0, borderRadius: "var(--radius-sm)", padding: "0 14px", background: "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))", color: "var(--selen-ink)", fontWeight: 800 },
  secondaryButton: { minHeight: 38, borderRadius: "var(--radius-sm)", padding: "0 14px", border: "1px solid rgba(245,208,138,0.24)", background: "rgba(247,239,224,0.08)", color: "var(--selen-text2-oncard)", fontWeight: 700 },
  error: { color: "var(--selen-danger)" },
};
