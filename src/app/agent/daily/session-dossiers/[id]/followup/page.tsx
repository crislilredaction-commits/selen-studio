import { revalidatePath } from "next/cache";
import Link from "next/link";
import { loadDailyCandidatureFollowup } from "@/lib/server/dailyCandidatureFollowup";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { isSignatureTerminal } from "@/lib/daily/signatureReminder24h";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

type Props = { params: Promise<{ id: string }> };
const INACTIVE_ENROLMENTS = new Set(["cancelled", "declined", "abandoned", "completed"]);
const newRequestId = () => globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";

async function refreshFollowupChecklist(admin: ReturnType<typeof createSupabaseAdminClient>, organisationId: string, sessionId: string) {
  const [{ data: slots }, { data: records }, { count: openEntries }] = await Promise.all([
    admin.from("daily_attendance_slots").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_attendance_records").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_session_followup_entries").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("status", "open"),
  ]);
  const allSlotsClosed = (slots ?? []).length > 0 && (slots ?? []).every((slot) => ["closed", "cancelled"].includes(slot.status));
  const allRecordsDecided = (records ?? []).length > 0 && (records ?? []).every((record) => record.status !== "pending");
  const hasAttendanceActivity = (slots ?? []).some((slot) => slot.status !== "draft") || (records ?? []).some((record) => record.status !== "pending");
  const status = (openEntries ?? 0) === 0 && allSlotsClosed && allRecordsDecided ? "to_review" : ((openEntries ?? 0) > 0 || hasAttendanceActivity ? "in_progress" : "todo");
  await admin.from("daily_session_checklist_items").update({ status }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("item_key", "attendance_followup").neq("status", "not_applicable");
}

async function requireScopedSession(sessionId: string, email: string) {
  const admin = createSupabaseAdminClient();
  const { data: session, error } = await admin
    .from("daily_sessions")
    .select("id,organisation_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session?.organisation_id) throw new Error("Session introuvable.");
  if (!(await isDailyOrganisationInAgentScope(email, session.organisation_id))) {
    throw new Error("Cette session n’est pas dans votre périmètre Daily.");
  }
  return session;
}

async function addEntry(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  const entryType = String(formData.get("entry_type") ?? "incident");
  const level = String(formData.get("level") ?? "info");
  const requestId = String(formData.get("request_id") ?? "");
  if (!sessionId || !summary || !requestId || !["incident", "adaptation", "absence"].includes(entryType) || !["info", "attention", "critical"].includes(level)) {
    throw new Error("Suivi invalide.");
  }
  const session = await requireScopedSession(sessionId, auth.email);
  const admin = createSupabaseAdminClient();
  const enrolmentId = String(formData.get("enrolment_id") ?? "") || null;
  if (enrolmentId) {
    const { data: enrolment, error: enrolmentError } = await admin.from("daily_session_enrolments").select("id,status").eq("id", enrolmentId).eq("organisation_id", session.organisation_id).eq("session_id", sessionId).maybeSingle();
    if (enrolmentError) throw new Error(enrolmentError.message);
    if (!enrolment || INACTIVE_ENROLMENTS.has(enrolment.status)) throw new Error("Inscription introuvable ou inactive.");
  }
  const { error } = await admin.from("daily_session_followup_entries").insert({
    id: requestId,
    organisation_id: session.organisation_id,
    session_id: sessionId,
    enrolment_id: enrolmentId,
    entry_type: entryType,
    level,
    summary,
    description: String(formData.get("description") ?? "").trim() || null,
    action_taken: String(formData.get("action_taken") ?? "").trim() || null,
    status: "open",
    created_by: auth.userId,
    author_role: "Agent Selen",
    author_name: auth.email,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  await refreshFollowupChecklist(admin, session.organisation_id, sessionId);
  revalidatePath(`/agent/daily/session-dossiers/${sessionId}/followup`);
  revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
}

async function resolveEntry(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const actionTaken = String(formData.get("action_taken") ?? "").trim();
  if (!sessionId || !id || !actionTaken) throw new Error("Suivi et action réalisée requis.");
  const session = await requireScopedSession(sessionId, auth.email);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("daily_session_followup_entries")
    .update({
      action_taken: actionTaken,
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: auth.userId,
    })
    .eq("id", id)
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", sessionId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Suivi déjà traité ou introuvable.");
  await refreshFollowupChecklist(admin, session.organisation_id, sessionId);
  revalidatePath(`/agent/daily/session-dossiers/${sessionId}/followup`);
  revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
}

function partyLabel(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["beneficiaire", "beneficiary", "learner", "apprenant"].includes(normalized)) return "Apprenant";
  if (["entreprise", "company", "enterprise", "commanditaire"].includes(normalized)) return "Entreprise / commanditaire";
  if (["formateur", "trainer"].includes(normalized)) return "Formateur";
  if (["organisme", "organisation"].includes(normalized)) return "Organisme";
  return "Autre partie prenante";
}

export default async function DailySessionFollowupPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,internal_reference,daily_formations(title)")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error("Lecture de la session indisponible.");
  if (!session?.organisation_id) return <main style={{ padding: 28 }}>Session introuvable.</main>;
  if (!(await isDailyOrganisationInAgentScope(auth.email, session.organisation_id))) {
    return <main style={{ padding: 28 }}>Accès refusé.</main>;
  }

  const [{ data: entries, error: entriesError }, { data: enrolments, error: enrolmentsError }, { data: signatures, error: signaturesError }] = await Promise.all([
    admin
      .from("daily_session_followup_entries")
      .select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", id)
      .order("occurred_at", { ascending: false }),
    admin
      .from("daily_session_enrolments")
      .select("id,status,daily_learners(first_name,last_name,email)")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", id),
    admin
      .from("daily_convention_signatures")
      .select("id,signatory_type,signatory_name,signatory_email,status,signed_at,viewed_at")
      .eq("session_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (entriesError || enrolmentsError || signaturesError) throw new Error("Lecture de la fiche de suivi indisponible.");
  const activeEnrolments = (enrolments ?? []).filter((enrolment) => !INACTIVE_ENROLMENTS.has(enrolment.status));
  const candidatures = await loadDailyCandidatureFollowup(admin, session.organisation_id, id);
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  const pendingSignatures = (signatures ?? []).filter((signature) => !isSignatureTerminal(signature.status, signature.signed_at));

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 28 }}>
      <Link href={`/agent/daily/session-dossiers/${id}`}>← Retour au dossier</Link>
      <h1>Fiche de suivi de session</h1>
      <p style={{ color: "var(--selen-text2)" }}>
        {formation?.title ?? "Session Daily"} · {session.internal_reference || "Sans référence"}. Cette fiche est partagée avec l’espace formateur.
      </p>
      <p>
        <Link href={`/agent/daily/session-dossiers/${id}/followup/pdf`} style={{ display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
          Télécharger la fiche PDF
        </Link>
      </p>

      <SelenCard>
        <SelenCardTitle>Synthèses de candidature</SelenCardTitle>
        {candidatures.length === 0 ? <p>Aucune synthèse rattachée à une inscription active.</p> : candidatures.map(item => <article key={item.requestId} style={{ marginBottom: 18 }}>
          <Link href={`/agent/daily/candidatures/${item.requestId}`}><strong>{item.applicant}</strong></Link>
          <p>Analyse Selen enregistrée : {item.analyzedAt}</p>
          <p>Apprenants : {item.learners.map(person => person.name).join(", ")}</p>
          <dl>{item.sections.map(section => <div key={section.key}><dt style={{ fontWeight: 700 }}>{section.label}</dt><dd style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{section.value}</dd></div>)}</dl>
        </article>)}
      </SelenCard>

      <SelenCard>
        <SelenCardTitle>Signatures en attente</SelenCardTitle>
        {pendingSignatures.length === 0 ? (
          <p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>Aucune signature à relancer pour cette session.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {pendingSignatures.map((signature) => (
              <div key={signature.id} style={{ borderTop: "1px solid var(--selen-border)", paddingTop: 10 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>{partyLabel(signature.signatory_type)}</strong>
                  {signature.signatory_name ? ` · ${signature.signatory_name}` : ""}
                  {signature.signatory_email ? ` · ${signature.signatory_email}` : ""}
                  {signature.viewed_at ? " · document consulté" : " · consultation non tracée"}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--selen-text2)" }}>
                  Séquence suivie automatiquement : emails J+3 et J+6, puis tâche agent J+9. Une alerte urgente remplace la prochaine étape si la formation démarre avant celle-ci.
                </p>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--selen-text2)", marginBottom: 0, marginTop: 10 }}>
          La signature arrête immédiatement la séquence. Les envois automatiques sont idempotents et restent traçables dans Communications & preuves.
        </p>
      </SelenCard>

      <SelenCard>
        <SelenCardTitle>Ajouter un suivi</SelenCardTitle>
        <form action={addEntry} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <input type="hidden" name="session_id" value={id} />
          <input type="hidden" name="request_id" value={newRequestId()} />
          <select name="entry_type" defaultValue="incident"><option value="incident">Incident / difficulté</option><option value="adaptation">Adaptation</option><option value="absence">Absence à qualifier</option></select>
          <select name="level" defaultValue="info"><option value="info">Information</option><option value="attention">À suivre</option><option value="critical">Critique</option></select>
          <select name="enrolment_id" defaultValue="">
            <option value="">Toute la session</option>
            {activeEnrolments.map((enrolment) => {
              const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
              return <option key={enrolment.id} value={enrolment.id}>{`${learner?.first_name ?? ""} ${learner?.last_name ?? ""}`.trim() || learner?.email || "Apprenant"}</option>;
            })}
          </select>
          <input name="summary" required placeholder="Constat" />
          <textarea name="description" placeholder="Détails utiles" />
          <textarea name="action_taken" placeholder="Action engagée" />
          <SelenButton type="submit">Ajouter au suivi</SelenButton>
        </form>
      </SelenCard>

      <section style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {(entries ?? []).map((entry) => (
          <SelenCard key={entry.id}>
            <SelenCardTitle>{entry.summary}</SelenCardTitle>
            <p style={{ fontSize: 12, color: "var(--selen-text2)" }}>
              {entry.entry_type} · {entry.level} · {entry.status === "resolved" ? "Traité" : "Ouvert"} · {new Date(entry.occurred_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
            </p>
            <p style={{ fontSize: 12, color: "var(--selen-text2)" }}>Ajouté par {entry.author_name || "auteur historique non renseigné"}{entry.author_role ? ` · ${entry.author_role}` : ""}</p>
            {entry.description ? <p>{entry.description}</p> : null}
            {entry.action_taken ? <p><strong>Action :</strong> {entry.action_taken}</p> : null}
            {entry.status !== "resolved" ? (
              <form action={resolveEntry} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input type="hidden" name="session_id" value={id} />
                <input type="hidden" name="id" value={entry.id} />
                <input name="action_taken" defaultValue={entry.action_taken ?? ""} placeholder="Suite / résolution" style={{ minWidth: 260 }} />
                <SelenButton type="submit">Marquer traité</SelenButton>
              </form>
            ) : null}
          </SelenCard>
        ))}
        {(entries ?? []).length === 0 ? <SelenCard>Aucun suivi saisi pour le moment.</SelenCard> : null}
      </section>
    </main>
  );
}
