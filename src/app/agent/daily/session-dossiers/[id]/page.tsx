import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

const EDITABLE_STATUSES = new Set(["draft", "review", "correction_requested"]);
type Props = { params: Promise<{ id: string }> };

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  const parsed = Number(value(formData, key).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function objectives(formData: FormData) {
  return value(formData, "learning_objectives")
    .split("\n")
    .map((item) => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

function dailyBase() {
  return (process.env.NEXT_PUBLIC_DAILY_SITE_URL || "https://www.selen-editions.fr").replace(/\/$/, "");
}

function dailyUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${dailyBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

async function persistProgram(formData: FormData, validate: boolean) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const sessionId = value(formData, "session_id");
  const formationId = value(formData, "formation_id");
  if (!sessionId || !formationId) throw new Error("Session ou programme introuvable.");

  const admin = createSupabaseAdminClient();
  const [{ data: session }, { data: formation }] = await Promise.all([
    admin.from("daily_sessions").select("id,formation_id").eq("id", sessionId).maybeSingle(),
    admin.from("daily_formations").select("id,status").eq("id", formationId).maybeSingle(),
  ]);

  if (!session || session.formation_id !== formationId || !formation) {
    throw new Error("Le programme ne correspond pas à cette session.");
  }
  if (!EDITABLE_STATUSES.has(formation.status)) {
    throw new Error("Ce programme est déjà validé. Crée une nouvelle version avant de le modifier.");
  }

  const durationHours = numberValue(formData, "duration_hours");
  const durationDays = numberValue(formData, "duration_days");
  const learningObjectives = objectives(formData);
  if (!value(formData, "title") || !value(formData, "global_objective") || learningObjectives.length === 0 || !durationHours || !durationDays) {
    throw new Error("Complète au minimum l'intitulé, l'objectif principal, les objectifs pédagogiques et les durées.");
  }

  const patch = {
    title: value(formData, "title"),
    global_objective: value(formData, "global_objective"),
    learning_objectives: learningObjectives,
    target_audience: value(formData, "target_audience"),
    prerequisites: value(formData, "prerequisites"),
    duration_hours: durationHours,
    duration_days: durationDays,
    modality: value(formData, "modality") || "presentiel",
    access_delays: value(formData, "access_delays"),
    price: value(formData, "price"),
    pedagogical_methods: value(formData, "pedagogical_methods"),
    pedagogical_resources: value(formData, "pedagogical_resources"),
    evaluation_methods: value(formData, "evaluation_methods"),
    accessibility: value(formData, "accessibility"),
    contact_phone: value(formData, "contact_phone"),
    contact_email: value(formData, "contact_email").toLowerCase(),
    contact_website: value(formData, "contact_website") || null,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await admin.from("daily_formations").update(patch).eq("id", formationId);
  if (updateError) throw new Error(updateError.message);

  if (validate) {
    const { data: validated, error: validationError } = await admin.rpc("daily_validate_formation_version", {
      p_formation_id: formationId,
      p_validation_note: "Programme vérifié et validé.",
    });
    if (validationError) throw new Error(validationError.message);
    const validatedRow = Array.isArray(validated) ? validated[0] : validated;
    const validatedId = validatedRow?.id ?? formationId;
    const { error: taskError } = await admin
      .from("daily_formations")
      .update({ spontaneous_registration_task_status: "to_attach" })
      .eq("id", validatedId);
    if (taskError) throw new Error(taskError.message);
  }

  revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
  revalidatePath("/agent/daily/session-dossiers");
  revalidatePath("/agent/daily");
  redirect(`/agent/daily/session-dossiers/${sessionId}?saved=${validate ? "validated" : "draft"}`);
}

async function saveProgram(formData: FormData) {
  "use server";
  return persistProgram(formData, false);
}

async function validateProgram(formData: FormData) {
  "use server";
  return persistProgram(formData, true);
}

export default async function SessionPreparationPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}>Accès refusé.</main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,modality,status")
    .eq("id", id)
    .maybeSingle();
  if (!session) return <main style={s.page}>Session introuvable.</main>;

  const [{ data: organisation }, { data: formation }] = await Promise.all([
    admin.from("organisations").select("name,legal_name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("*").eq("id", session.formation_id).maybeSingle(),
  ]);
  if (!formation) return <main style={s.page}>Programme introuvable.</main>;

  const editable = EDITABLE_STATUSES.has(formation.status);
  const sourceUrl = dailyUrl(formation.detailed_program_document_url);
  const organisationName = organisation?.legal_name || organisation?.name || "Organisme de formation";
  const objectiveLines = Array.isArray(formation.learning_objectives) ? formation.learning_objectives.join("\n") : "";

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.kicker}>Daily · Préparation agent</p>
          <h1 style={s.h1}>{formation.title || "Programme de formation"}</h1>
          <p style={s.muted}>{organisationName}{session.internal_reference ? ` · ${session.internal_reference}` : ""}</p>
        </div>
        <div style={s.actionsTop}>
          <Link href="/agent/daily/session-dossiers" style={s.secondaryLink}>← Sessions</Link>
          <Link href={`/agent/daily/session-dossiers/${encodeURIComponent(id)}/full`} style={s.secondaryLink}>Voir le dossier complet</Link>
        </div>
      </header>

      <section style={s.purposeCard}>
        <div style={s.purposeNumber}>1</div>
        <div>
          <h2 style={s.h2}>{editable ? "Vérifie uniquement le programme" : "Programme validé"}</h2>
          <p style={s.muted}>
            {editable
              ? "Cette page sert à relire les informations qui seront publiées dans le programme. Tu corriges seulement ce qui doit l'être, puis tu valides. Le reste de la session se traite dans les tâches agent."
              : "Tu n'as plus rien à faire sur le programme. Le client dispose maintenant de son lien d'inscription et de son QR code dans son espace Daily."}
          </p>
        </div>
      </section>

      {editable ? (
        <section style={s.stepsRow}>
          <div style={s.stepCard}><strong>1. Compare</strong><span>Ouvre le programme source si besoin.</span></div>
          <div style={s.stepCard}><strong>2. Corrige</strong><span>Modifie seulement les informations utiles.</span></div>
          <div style={s.stepCard}><strong>3. Valide</strong><span>Le client récupère ensuite ses outils d'inscription.</span></div>
        </section>
      ) : null}

      {sourceUrl && editable ? (
        <section style={s.sourceBox}>
          <div>
            <strong>Programme transmis par le client</strong>
            <p style={s.muted}>Utilise-le uniquement comme référence pour ta vérification.</p>
          </div>
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={s.secondaryLink}>Ouvrir le document ↗</a>
        </section>
      ) : null}

      <form style={s.form}>
        <input type="hidden" name="session_id" value={id} />
        <input type="hidden" name="formation_id" value={formation.id} />

        <details open style={s.section}>
          <summary style={s.summary}>Essentiel du programme</summary>
          <div style={s.grid}>
            <Field label="Intitulé" wide><input name="title" defaultValue={formation.title ?? ""} disabled={!editable} required style={s.input} /></Field>
            <Field label="Objectif principal" wide><textarea name="global_objective" defaultValue={formation.global_objective ?? ""} disabled={!editable} required rows={3} style={s.textarea} /></Field>
            <Field label="Objectifs pédagogiques" help="Un objectif par ligne." wide><textarea name="learning_objectives" defaultValue={objectiveLines} disabled={!editable} required rows={4} style={s.textarea} /></Field>
            <Field label="Public visé"><textarea name="target_audience" defaultValue={formation.target_audience ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
            <Field label="Prérequis"><textarea name="prerequisites" defaultValue={formation.prerequisites ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
          </div>
        </details>

        <details style={s.section}>
          <summary style={s.summary}>Organisation pratique</summary>
          <div style={s.grid}>
            <Field label="Durée en heures"><input name="duration_hours" type="number" step="0.5" min="0.5" defaultValue={formation.duration_hours ?? ""} disabled={!editable} required style={s.input} /></Field>
            <Field label="Durée en jours"><input name="duration_days" type="number" step="0.5" min="0.5" defaultValue={formation.duration_days ?? ""} disabled={!editable} required style={s.input} /></Field>
            <Field label="Modalité"><select name="modality" defaultValue={formation.modality ?? "presentiel"} disabled={!editable} style={s.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
            <Field label="Délai d'accès"><input name="access_delays" defaultValue={formation.access_delays ?? ""} disabled={!editable} style={s.input} /></Field>
            <Field label="Tarif TTC"><input name="price" defaultValue={formation.price ?? ""} disabled={!editable} style={s.input} /></Field>
          </div>
        </details>

        <details style={s.section}>
          <summary style={s.summary}>Pédagogie et évaluation</summary>
          <div style={s.grid}>
            <Field label="Méthodes pédagogiques" wide><textarea name="pedagogical_methods" defaultValue={formation.pedagogical_methods ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
            <Field label="Moyens et ressources pédagogiques" wide><textarea name="pedagogical_resources" defaultValue={formation.pedagogical_resources ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
            <Field label="Modalités d'évaluation" wide><textarea name="evaluation_methods" defaultValue={formation.evaluation_methods ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
            <Field label="Accessibilité" wide><textarea name="accessibility" defaultValue={formation.accessibility ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
          </div>
        </details>

        <details style={s.section}>
          <summary style={s.summary}>Coordonnées affichées</summary>
          <div style={s.grid}>
            <Field label="Téléphone"><input name="contact_phone" defaultValue={formation.contact_phone ?? ""} disabled={!editable} style={s.input} /></Field>
            <Field label="Email"><input name="contact_email" type="email" defaultValue={formation.contact_email ?? ""} disabled={!editable} style={s.input} /></Field>
            <Field label="Site internet" wide><input name="contact_website" defaultValue={formation.contact_website ?? ""} disabled={!editable} style={s.input} /></Field>
          </div>
        </details>

        {editable ? (
          <div style={s.footerActions}>
            <button formAction={saveProgram} style={s.secondaryButton}>Enregistrer pour plus tard</button>
            <button formAction={validateProgram} style={s.primaryButton}>✓ Valider le programme</button>
          </div>
        ) : null}
      </form>
    </main>
  );
}

function Field({ label, help, wide = false, children }: { label: string; help?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ ...s.field, ...(wide ? s.wide : {}) }}>
      <span style={s.label}>{label}</span>
      {help ? <span style={s.help}>{help}</span> : null}
      {children}
    </label>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap" },
  kicker: { margin: 0, color: "var(--selen-gold2)", textTransform: "uppercase", letterSpacing: ".16em", fontSize: 10, fontWeight: 800 },
  h1: { margin: "5px 0", fontFamily: "var(--font-display)", fontSize: 31 },
  h2: { margin: "0 0 5px", fontSize: 20 },
  muted: { margin: "4px 0", color: "var(--selen-text2)", lineHeight: 1.55, fontSize: 13 },
  actionsTop: { display: "flex", gap: 8, flexWrap: "wrap" },
  secondaryLink: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 12px", border: "1px solid var(--selen-border)", borderRadius: 9, color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 13 },
  purposeCard: { display: "flex", gap: 14, alignItems: "flex-start", border: "1px solid var(--selen-border2)", background: "var(--selen-bg2)", borderRadius: 14, padding: 18, marginBottom: 14 },
  purposeNumber: { width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "var(--selen-gold2)", color: "var(--selen-bg)", fontWeight: 900, flexShrink: 0 },
  stepsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 14 },
  stepCard: { display: "grid", gap: 4, border: "1px solid var(--selen-border)", borderRadius: 12, padding: 12, background: "var(--selen-bg3)", fontSize: 12, color: "var(--selen-text2)" },
  sourceBox: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", border: "1px solid var(--selen-border)", borderRadius: 12, padding: 14, marginBottom: 14, background: "var(--selen-bg2)", flexWrap: "wrap" },
  form: { display: "grid", gap: 12 },
  section: { border: "1px solid var(--selen-border)", background: "var(--selen-bg2)", borderRadius: 14, overflow: "hidden" },
  summary: { cursor: "pointer", padding: "14px 16px", fontWeight: 850, color: "var(--selen-text)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, padding: "0 16px 16px" },
  field: { display: "grid", gap: 6 },
  wide: { gridColumn: "1 / -1" },
  label: { fontSize: 12, fontWeight: 800, color: "var(--selen-text)" },
  help: { fontSize: 11, color: "var(--selen-text3)" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid var(--selen-border)", borderRadius: 8, background: "var(--selen-bg3)", color: "var(--selen-text)", padding: "10px 11px" },
  textarea: { width: "100%", boxSizing: "border-box", border: "1px solid var(--selen-border)", borderRadius: 8, background: "var(--selen-bg3)", color: "var(--selen-text)", padding: "10px 11px", resize: "vertical" },
  footerActions: { display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", paddingTop: 6 },
  secondaryButton: { border: "1px solid var(--selen-border)", borderRadius: 9, background: "transparent", color: "var(--selen-text)", padding: "11px 14px", fontWeight: 800, cursor: "pointer" },
  primaryButton: { border: 0, borderRadius: 9, background: "var(--selen-gold2)", color: "var(--selen-bg)", padding: "11px 16px", fontWeight: 900, cursor: "pointer" },
};
