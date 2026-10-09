import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { dailySourceDocumentId, downloadPrivateDailySource, loadPrivateDailySource, loadScopedDailyFormation } from "@/lib/server/dailyStudioFormationSources";
import { parseDailyFormationCreationMode, requiredFormationFields } from "@/lib/dailyFormationCreationPolicy";
import DailyFormationReviewTabs from "@/components/daily/DailyFormationReviewTabs";
import DailyQuestionnaireEditor from "@/components/daily/DailyQuestionnaireEditor";
import DailyQuestionnaireSourceUpload from "@/components/daily/DailyQuestionnaireSourceUpload";
import DailyFormationReviewForm from "@/components/daily/DailyFormationReviewForm";
import { parseDailyQuestionnaire } from "@/lib/dailyQuestionnaireEditing";
import { questionnaireFiles, saveDailyQuestionnaireSources } from "@/lib/server/dailyStudioQuestionnaireSources";

const EDITABLE_STATUSES = new Set(["draft", "review", "correction_requested"]);
const MODALITIES = new Set(["presentiel", "distanciel", "mixte"]);
const FIELD_LABELS: Record<string, string> = {
  title: "intitulé", global_objective: "objectif principal", target_audience: "public visé",
  duration_hours: "durée en heures", duration_days: "durée en jours", modality: "modalité",
  access_delays: "délai d’accès", price: "tarif", pedagogical_resources: "moyens pédagogiques",
  evaluation_methods: "modalités d’évaluation", contact_phone: "téléphone", contact_email: "email",
};
type Props = { sessionId?: string; formationId?: string };

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

function hasOwnPositioningSource(formation: Record<string, unknown>) {
  return formation.positioning_mode === "off_platform" && Boolean(String(formation.positioning_questionnaire_document_url ?? "").trim());
}

async function persistProgram(formData: FormData, validate: boolean, questionnairesOnly = false, returnDestination = false) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const sessionId = value(formData, "session_id");
  const formationId = value(formData, "formation_id");
  if (!formationId) throw new Error("Programme introuvable.");

  const admin = createSupabaseAdminClient();
  const formation = await loadScopedDailyFormation(admin, auth.email, formationId);
  if (!formation) throw new Error("Programme introuvable.");
  const { data: session, error: sessionError } = sessionId ? await admin.from("daily_sessions").select("id,formation_id,organisation_id")
    .eq("id", sessionId).eq("formation_id", formationId).eq("organisation_id", formation.organisation_id).neq("status", "archived").maybeSingle() : { data: null, error: null };
  if (sessionError || (sessionId && !session)) {
    throw new Error("Le programme ne correspond pas à cette session.");
  }
  if (!EDITABLE_STATUSES.has(formation.status) && !(questionnairesOnly && formation.status === "validated")) {
    throw new Error("Ce programme est déjà validé. Crée une nouvelle version avant de le modifier.");
  }
  const expectedUpdatedAt = value(formData, "formation_updated_at");
  if (!expectedUpdatedAt || expectedUpdatedAt !== formation.updated_at) {
    throw new Error("Le programme a changé. Actualise le dossier avant de l’enregistrer.");
  }

  const files = questionnaireFiles(formData, formation);
  const questionnairePatch: Record<string, unknown> = {};
  if (formation.positioning_mode === "selen" && (formData.has("positioning_questions") || validate)) {
    questionnairePatch.positioning_questions = parseDailyQuestionnaire(formData.has("positioning_questions") ? value(formData, "positioning_questions") : JSON.stringify(formation.positioning_questions));
  }
  if (formation.learning_assessment_mode === "selen_quiz") {
    if (formData.has("learning_assessment_questions") || validate) questionnairePatch.learning_assessment_questions = parseDailyQuestionnaire(formData.has("learning_assessment_questions") ? value(formData, "learning_assessment_questions") : JSON.stringify(formation.learning_assessment_questions), true);
    if (formData.has("learning_assessment_instructions")) questionnairePatch.learning_assessment_instructions = value(formData, "learning_assessment_instructions") || null;
  }
  const durationHours = numberValue(formData, "duration_hours");
  const durationDays = numberValue(formData, "duration_days");
  const learningObjectives = objectives(formData);
  const modality = value(formData, "modality");
  if (!questionnairesOnly && !MODALITIES.has(modality)) throw new Error("Modalité de formation invalide.");
  if (!questionnairesOnly && (!value(formData, "title") || !value(formData, "global_objective") || learningObjectives.length === 0 || !durationHours || !durationDays)) {
    throw new Error("Complète au minimum l'intitulé, l'objectif principal, les objectifs pédagogiques et les durées.");
  }
  if (validate) {
    const missing = requiredFormationFields(parseDailyFormationCreationMode(formation.creation_mode))
      .filter(field => field !== "modality" && !value(formData, field));
    if (missing.length) throw new Error(`Complète les champs requis avant de valider : ${missing.map(field => FIELD_LABELS[field] || field).join(", ")}.`);
    if (!value(formData, "detailed_program")) throw new Error("Complète le contenu détaillé avant de valider le programme.");
    const requiredSources: Array<"program" | "positioning" | "assessment"> = [];
    if (formation.creation_mode === "program_import") requiredSources.push("program");
    if (formation.positioning_mode === "off_platform") requiredSources.push("positioning");
    if (formation.learning_assessment_mode === "external" && formation.learning_assessment_document_url) requiredSources.push("assessment");
    for (const kind of requiredSources) {
      if (files.some(file => file.kind === kind)) continue;
      const source = await loadPrivateDailySource(admin, formation, kind);
      await downloadPrivateDailySource(admin, source);
    }
  }

  const patch: Record<string, unknown> = questionnairesOnly ? {} : {
    title: value(formData, "title"),
    global_objective: value(formData, "global_objective"),
    learning_objectives: learningObjectives,
    target_audience: value(formData, "target_audience"),
    detailed_program: value(formData, "detailed_program"),
    prerequisites: value(formData, "prerequisites"),
    duration_hours: durationHours,
    duration_days: durationDays,
    modality,
    access_delays: value(formData, "access_delays"),
    registration_methods: value(formData, "registration_methods"),
    price: value(formData, "price"),
    pedagogical_methods: value(formData, "pedagogical_methods"),
    pedagogical_resources: value(formData, "pedagogical_resources"),
    evaluation_methods: value(formData, "evaluation_methods"),
    accessibility: value(formData, "accessibility"),
    disability_referent: value(formData, "disability_referent") || null,
    contact_phone: value(formData, "contact_phone"),
    contact_email: value(formData, "contact_email").toLowerCase(),
    contact_website: value(formData, "contact_website") || null,
    updated_at: new Date().toISOString(),
  };
  Object.assign(patch, questionnairePatch);
  if (formation.status === "correction_requested" || (questionnairesOnly && formation.status === "validated")) Object.assign(patch, { status: "review", validation_note: null, agent_review_signaled_at: new Date().toISOString() });
  patch.updated_at = new Date().toISOString();

  let savedFormation: { id: string; status: string; updated_at: string } | null;
  if (files.length) {
    savedFormation = await saveDailyQuestionnaireSources(admin, formation, auth.email, auth.userId, patch, files);
  } else {
    const updateQuery = admin.from("daily_formations").update(patch).eq("id", formationId).eq("organisation_id", formation.organisation_id).eq("status", formation.status).eq("updated_at", expectedUpdatedAt);
    const { data: updatedFormation, error: updateError } = await updateQuery.select("id,status,updated_at").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updatedFormation) throw new Error("Le programme a changé. Actualise le dossier avant de l’enregistrer.");
    savedFormation = updatedFormation;
  }

  if (validate) {
    if (!savedFormation?.updated_at || !EDITABLE_STATUSES.has(savedFormation.status)) {
      throw new Error("L’enregistrement n’a pas pu être confirmé. Recharge le dossier.");
    }
    const saved = await loadScopedDailyFormation(admin, auth.email, formationId);
    if (!saved || saved.organisation_id !== formation.organisation_id) throw new Error("Programme introuvable.");
    if (saved.updated_at !== savedFormation.updated_at || saved.status !== savedFormation.status) {
      throw new Error("Le programme a changé. Actualise le dossier avant de le valider.");
    }
    if (files.length) {
      for (const file of files) await downloadPrivateDailySource(admin, await loadPrivateDailySource(admin, saved, file.kind as "positioning" | "assessment"));
    }
    const { data: validated, error: validationError } = await admin.rpc("daily_validate_formation_review", {
      p_formation_id: formationId,
      p_organisation_id: formation.organisation_id,
      p_expected_updated_at: savedFormation.updated_at,
      p_expected_status: savedFormation.status,
      p_validation_note: "Programme vérifié et validé.",
    });
    if (validationError) throw new Error(validationError.code === "P0001" ? "Le programme a changé. Actualise le dossier avant de le valider." : validationError.message);
    const validatedRow = Array.isArray(validated) ? validated[0] : validated;
    if (validatedRow?.id !== formationId) throw new Error("La validation n’a pas confirmé le programme attendu.");
    const { data: validatedFormation, error: validatedStatusError } = await admin.from("daily_formations").select("id,status").eq("id", formationId).eq("organisation_id", formation.organisation_id).maybeSingle();
    if (validatedStatusError) throw new Error(validatedStatusError.message);
    if (!validatedFormation || validatedFormation.status !== "validated") throw new Error("La validation n’a pas confirmé le statut validé du programme.");
  }

  if (sessionId) revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
  revalidatePath(`/agent/daily/formations/${formationId}`);
  revalidatePath(`/agent/daily/organisations/${formation.organisation_id}`);
  revalidatePath("/agent/daily/session-dossiers");
  revalidatePath("/agent/daily");
  revalidatePath("/agent");
  const destination = `${sessionId ? `/agent/daily/session-dossiers/${sessionId}` : `/agent/daily/formations/${formationId}`}?saved=${validate ? "validated" : "draft"}`;
  if (returnDestination) return destination;
  redirect(destination);
}

async function saveProgram(formData: FormData) {
  "use server";
  return persistProgram(formData, false);
}

async function validateProgram(formData: FormData) {
  "use server";
  return persistProgram(formData, true);
}

async function saveQuestionnaires(formData: FormData) {
  "use server";
  return persistProgram(formData, false, true);
}

async function submitReview(formData: FormData, intent: "save" | "validate" | "questionnaires") {
  "use server";
  if (!["save", "validate", "questionnaires"].includes(intent)) return { error: "Action invalide." };
  try {
    const destination = await persistProgram(formData, intent === "validate", intent === "questionnaires", true);
    return { redirectTo: destination };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enregistrement indisponible." };
  }
}

export default async function DailyFormationReview({ sessionId, formationId }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  const { data: session, error: sessionError } = sessionId && organisationIds.length ? await admin.from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,modality,status")
    .eq("id", sessionId).in("organisation_id", organisationIds).neq("status", "archived").maybeSingle() : { data: null, error: null };
  if (sessionError || (sessionId && !session)) return <main style={s.page}>Session introuvable.</main>;
  const formation = await loadScopedDailyFormation(admin, auth.email, session?.formation_id ?? formationId ?? "");
  if (!formation || formation.status === "archived" || (session && formation.organisation_id !== session.organisation_id)) return <main style={s.page}>Programme introuvable.</main>;
  const { data: organisation } = await admin.from("organisations").select("name,legal_name").eq("id", formation.organisation_id).maybeSingle();

  const editable = EDITABLE_STATUSES.has(formation.status);
  const validationFields = new Set(requiredFormationFields(parseDailyFormationCreationMode(formation.creation_mode)));
  const sourceUrl = dailySourceDocumentId(formation.detailed_program_document_url) ? `/agent/api/daily/formations/${formation.id}/source-document?kind=program` : null;
  const organisationName = organisation?.legal_name || organisation?.name || "Organisme de formation";
  const objectiveLines = Array.isArray(formation.learning_objectives) ? formation.learning_objectives.join("\n") : "";

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.kicker}>Daily · Préparation agent</p>
          <h1 style={s.h1}>{formation.title || "Programme de formation"}</h1>
          <p style={s.muted}>{organisationName}{session?.internal_reference ? ` · ${session.internal_reference}` : ""}</p>
        </div>
        <div style={s.actionsTop}>
          <Link href={`/agent/daily/organisations/${formation.organisation_id}?tab=programs`} style={s.secondaryLink}>← Programmes de cet OF</Link>
          <Link href="/agent/daily/session-dossiers" style={s.secondaryLink}>← Sessions</Link>
          {session ? <Link href={`/agent/daily/session-dossiers/${encodeURIComponent(session.id)}/full`} style={s.secondaryLink}>Voir le dossier complet</Link> : <Link href={`/agent/daily/organisations/${formation.organisation_id}`} style={s.secondaryLink}>Voir le dossier complet de l’OF</Link>}
        </div>
      </header>

      <section style={s.purposeCard}>
        <div style={s.purposeNumber}>1</div>
        <div>
          <h2 style={s.h2}>{editable ? "Vérifie le programme et les questionnaires" : "Programme validé"}</h2>
          <p style={s.muted}>
            {editable
              ? "Relis le programme, le questionnaire de positionnement et l’évaluation finale configurés par l’OF. Corrige le programme et les questionnaires si besoin, puis valide la formation. Le reste de la session se traite dans les tâches agent."
              : "Le programme est validé. Tu peux modifier les questionnaires ci-dessous ; leur enregistrement renverra la formation en vérification, avec le même lien d’inscription."}
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

      {sourceUrl ? (
        <section style={s.sourceBox}>
          <div>
            <strong>Programme transmis par le client</strong>
            <p style={s.muted}>Utilise-le uniquement comme référence pour ta vérification.</p>
          </div>
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={s.secondaryLink}>Ouvrir le document ↗</a>
        </section>
      ) : null}

      <DailyFormationReviewForm submit={submitReview} defaultIntent={editable ? "save" : "questionnaires"}>
        <input type="hidden" name="session_id" value={session?.id ?? ""} />
        <input type="hidden" name="formation_id" value={formation.id} />
        <input type="hidden" name="formation_updated_at" value={formation.updated_at ?? ""} />

        <DailyFormationReviewTabs>
          <div style={{ display: "grid", gap: 12 }}>
            <details open style={s.section}>
              <summary style={s.summary}>Essentiel du programme</summary>
              <div style={s.grid}>
                <Field label="Intitulé" wide><input name="title" defaultValue={formation.title ?? ""} disabled={!editable} required style={s.input} /></Field>
                <Field label="Objectif principal" wide><textarea name="global_objective" defaultValue={formation.global_objective ?? ""} disabled={!editable} required rows={3} style={s.textarea} /></Field>
                <Field label="Objectifs pédagogiques" help="Un objectif par ligne." wide><textarea name="learning_objectives" defaultValue={objectiveLines} disabled={!editable} required rows={4} style={s.textarea} /></Field>
                <Field label="Contenu détaillé de la formation" wide><textarea name="detailed_program" defaultValue={formation.detailed_program ?? ""} disabled={!editable} required rows={10} style={s.textarea} /></Field>
                <Field label="Public visé"><textarea name="target_audience" defaultValue={formation.target_audience ?? ""} disabled={!editable} required={validationFields.has("target_audience")} rows={3} style={s.textarea} /></Field>
                <Field label="Prérequis"><textarea name="prerequisites" defaultValue={formation.prerequisites ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
              </div>
            </details>

            <section style={{ ...s.section, padding: 16 }}>
              <h2 style={s.h2}>Justificatifs des prérequis configurés par l’OF</h2>
              <p style={s.muted}>{formation.prerequisite_mode === "required" ? "Prérequis obligatoires : les preuves ci-dessous sont demandées aux candidats." : "Aucun prérequis déclaré."}</p>
              {Array.isArray(formation.prerequisite_requirements) ? <ul>{formation.prerequisite_requirements.map((requirement: { id?: string; label?: string; description?: string }, index: number) => <li key={requirement.id || index}><strong>{requirement.label}</strong>{requirement.description ? ` · ${requirement.description}` : ""}</li>)}</ul> : null}
            </section>

            <details style={s.section}>
              <summary style={s.summary}>Organisation pratique</summary>
              <div style={s.grid}>
                <Field label="Durée en heures"><input name="duration_hours" type="number" step="0.5" min="0.5" defaultValue={formation.duration_hours ?? ""} disabled={!editable} required style={s.input} /></Field>
                <Field label="Durée en jours"><input name="duration_days" type="number" step="0.5" min="0.5" defaultValue={formation.duration_days ?? ""} disabled={!editable} required style={s.input} /></Field>
                <Field label="Modalité"><select name="modality" defaultValue={formation.modality ?? "presentiel"} disabled={!editable} style={s.input}><option value="presentiel">Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select></Field>
                <Field label="Délai d'accès"><input name="access_delays" defaultValue={formation.access_delays ?? ""} disabled={!editable} required={validationFields.has("access_delays")} style={s.input} /></Field>
                <Field label="Modalités d’inscription" wide><textarea name="registration_methods" defaultValue={formation.registration_methods ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
                <Field label="Tarif TTC"><input name="price" defaultValue={formation.price ?? ""} disabled={!editable} required={validationFields.has("price")} style={s.input} /></Field>
              </div>
            </details>

            <details style={s.section}>
              <summary style={s.summary}>Pédagogie et évaluation</summary>
              <div style={s.grid}>
                <Field label="Méthodes pédagogiques" wide><textarea name="pedagogical_methods" defaultValue={formation.pedagogical_methods ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
                <Field label="Moyens et ressources pédagogiques" wide><textarea name="pedagogical_resources" defaultValue={formation.pedagogical_resources ?? ""} disabled={!editable} required={validationFields.has("pedagogical_resources")} rows={3} style={s.textarea} /></Field>
                <Field label="Modalités d'évaluation" wide><textarea name="evaluation_methods" defaultValue={formation.evaluation_methods ?? ""} disabled={!editable} required={validationFields.has("evaluation_methods")} rows={3} style={s.textarea} /></Field>
                <Field label="Accessibilité" wide><textarea name="accessibility" defaultValue={formation.accessibility ?? ""} disabled={!editable} rows={3} style={s.textarea} /></Field>
                <Field label="Référent handicap"><input name="disability_referent" defaultValue={formation.disability_referent ?? ""} disabled={!editable} style={s.input} /></Field>
              </div>
            </details>

            <details style={s.section}>
              <summary style={s.summary}>Coordonnées affichées</summary>
              <div style={s.grid}>
                <Field label="Téléphone"><input name="contact_phone" defaultValue={formation.contact_phone ?? ""} disabled={!editable} required style={s.input} /></Field>
                <Field label="Email"><input name="contact_email" type="email" defaultValue={formation.contact_email ?? ""} disabled={!editable} required style={s.input} /></Field>
                <Field label="Site internet" wide><input name="contact_website" defaultValue={formation.contact_website ?? ""} disabled={!editable} style={s.input} /></Field>
              </div>
            </details>
          </div>

          <section style={{ ...s.section, padding: 16 }}>
            <h2 style={s.h2}>Questionnaire de positionnement</h2>
            {formation.positioning_mode === "off_platform" ? (
              <>
                <p style={s.muted}>{hasOwnPositioningSource(formation) ? "Questionnaire propre OF : téléchargement, remplissage hors Selen et réimportation obligatoire." : "Importe le questionnaire original de l’OF avant de valider la formation. Le candidat le téléchargera, le remplira hors Selen puis réimportera sa copie."}</p>
                {dailySourceDocumentId(formation.positioning_questionnaire_document_url) ? <a href={`/agent/api/daily/formations/${formation.id}/source-document?kind=positioning`} style={s.secondaryLink} target="_blank" rel="noreferrer">Ouvrir le questionnaire propre OF →</a> : null}
                <h3>Remplacer le questionnaire de positionnement</h3><p style={s.muted}>L’original est remplacé lors de l’enregistrement. Les versions précédentes sont conservées.</p>
                <DailyQuestionnaireSourceUpload formationId={formation.id} updatedAt={formation.updated_at} kind="positioning" />
              </>
            ) : formation.positioning_mode === "selen" ? (
              <>
                <p style={s.muted}>Questionnaire de positionnement Selen configuré par l’OF.</p>
                <DailyQuestionnaireEditor questions={formation.positioning_questions} />
              </>
            ) : <p style={s.muted}>Positionnement non configuré.</p>}
          </section>

          <section style={{ ...s.section, padding: 16 }}>
            <h2 style={s.h2}>Évaluation finale</h2>
            <p style={s.muted}>{formation.learning_assessment_mode === "selen_quiz" ? "Évaluation intégrée dans Selen." : formation.learning_assessment_mode === "external" ? "Évaluation externe fournie par le formateur ou l’OF." : "Évaluation finale non configurée."}</p>
            <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>Consignes de l’OF</h3>
            {formation.learning_assessment_mode === "selen_quiz" ? <>
              <textarea aria-label="Consignes de l’évaluation finale" name="learning_assessment_instructions" defaultValue={formation.learning_assessment_instructions || ""} style={s.textarea} rows={3} />
              <DailyQuestionnaireEditor questions={formation.learning_assessment_questions} assessment />
            </> : <p style={{ ...s.muted, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{formation.learning_assessment_instructions || "Aucune consigne renseignée."}</p>}
            {formation.learning_assessment_mode === "external" ? <>
              {dailySourceDocumentId(formation.learning_assessment_document_url) ? <a href={`/agent/api/daily/formations/${formation.id}/source-document?kind=assessment`} target="_blank" rel="noreferrer" style={s.secondaryLink}>Ouvrir le questionnaire d’évaluation finale →</a> : <p style={s.muted}>Aucun questionnaire source importé. Les copies remplies après la session restent dans les dossiers apprenants.</p>}
              <h3>Importer ou remplacer le questionnaire d’évaluation finale</h3><p style={s.muted}>Ce fichier est distinct des copies remplies par les apprenants.</p>
              <DailyQuestionnaireSourceUpload formationId={formation.id} updatedAt={formation.updated_at} kind="assessment" />
            </> : null}
          </section>
        </DailyFormationReviewTabs>

        {editable ? (
          <div style={s.footerActions}>
            <button data-review-intent="save" formAction={saveProgram} formNoValidate style={s.secondaryButton}>Enregistrer pour plus tard</button>
            <button data-review-intent="validate" formAction={validateProgram} style={s.primaryButton}>✓ Valider la formation</button>
          </div>
        ) : formation.status === "validated" ? <div style={s.footerActions}><p style={s.muted}>Une modification des questionnaires renvoie cette formation en vérification, en conservant son lien d’inscription.</p><button data-review-intent="questionnaires" formAction={saveQuestionnaires} formNoValidate style={s.primaryButton}>Enregistrer les questionnaires</button></div> : null}
      </DailyFormationReviewForm>
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 14, padding: "0 16px 16px" },
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
