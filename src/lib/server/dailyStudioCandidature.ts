import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { loadScopedDailyFormation, DailySourceError, DAILY_SOURCE_UUID, DAILY_SOURCE_SHA, DAILY_SOURCE_MIME_TYPES, privateDailyPath, dailySourceDocumentId, sameDailySourceDigest, type PrivateDailySource } from "@/lib/server/dailyStudioFormationSources";

type Json = Record<string, unknown>;
export function candidatureRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalized = (value: unknown) => text(value).toLowerCase();

/** No candidature payload is read before the formation's active agent/OF scope. */
export async function loadScopedDailyCandidature(admin: SupabaseAdminClient, email: string, id: string) {
  if (!DAILY_SOURCE_UUID.test(id)) return null;
  const { data: reference, error: referenceError } = await admin.from("daily_formation_registration_requests")
    .select("id,formation_id").eq("id", id).maybeSingle();
  if (referenceError) throw new DailySourceError("Lecture de la candidature indisponible.", 500);
  if (!reference) return null;
  const formation = await loadScopedDailyFormation(admin, email, reference.formation_id);
  if (!formation) return null;
  const { data: request, error } = await admin.from("daily_formation_registration_requests")
    .select("id,formation_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,need_answers,positioning_answers,adaptation_needed,submitted_at,signature_signed_at,decision_status,attached_session_id,agent_analysis_summary,agent_analysis_completed_at,prerequisites_validated")
    .eq("id", id).eq("formation_id", formation.id).maybeSingle();
  if (error) throw new DailySourceError("Lecture de la candidature indisponible.", 500);
  return request ? { request, formation } : null;
}

export type CandidaturePositioning = { original: PrivateDailySource; filled: Array<PrivateDailySource & { participant: string }>; current: boolean };

/** Reads this request's original and proofs, including immutable signed history. */
export async function loadCandidaturePositioning(admin: SupabaseAdminClient, request: Json, formation: { id: string; organisation_id: string; [key: string]: unknown }): Promise<CandidaturePositioning | null> {
  const answers = candidatureRecord(request.positioning_answers);
  if (answers.mode !== "off_platform") return null;
  const sourceId = text(answers.source_document_id);
  if (!DAILY_SOURCE_UUID.test(sourceId) || !DAILY_SOURCE_SHA.test(text(answers.source_sha256)) || !DAILY_SOURCE_SHA.test(text(answers.submission_fingerprint)) || !Array.isArray(answers.external_documents)) {
    throw new DailySourceError("Preuves de positionnement incohérentes.", 409);
  }
  const subjects = request.response_type === "company" ? request.participants : [{ first_name: request.respondent_first_name, last_name: request.respondent_last_name, email: request.respondent_email }];
  if (!Array.isArray(subjects) || !subjects.length || answers.external_documents.length !== subjects.length) throw new DailySourceError("Preuves de positionnement incomplètes.", 409);
  const descriptors = answers.external_documents.map(candidatureRecord);
  if (descriptors.some(proof => !DAILY_SOURCE_UUID.test(text(proof.document_id)) || !Number.isInteger(proof.participant_index) || Number(proof.participant_index) < 0 || Number(proof.participant_index) >= subjects.length) ||
    new Set(descriptors.map(proof => proof.document_id)).size !== descriptors.length || new Set(descriptors.map(proof => proof.participant_index)).size !== subjects.length) {
    throw new DailySourceError("Preuves de positionnement incohérentes.", 409);
  }
  const { data: documents, error } = await admin.from("daily_documents")
    .select("id,organisation_id,formation_id,session_id,learner_id,enrolment_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,logical_name,metadata")
    .eq("organisation_id", formation.organisation_id).in("id", [sourceId, ...descriptors.map(proof => String(proof.document_id))]);
  if (error) throw new DailySourceError("Lecture des preuves de positionnement indisponible.", 500);
  const byId = new Map((documents ?? []).map(doc => [doc.id, doc]));
  const original = byId.get(sourceId);
  const validFile = (doc: typeof original) => Boolean(doc && doc.bucket === "documents" && doc.status !== "archived" &&
    privateDailyPath(doc.storage_path, formation.organisation_id) && DAILY_SOURCE_MIME_TYPES.has(doc.mime_type) && DAILY_SOURCE_SHA.test(doc.sha256 ?? ""));
  if (!validFile(original) || !original || original.document_type !== "positioning_questionnaire_source" || original.linked_object_type !== "organisation" ||
    original.linked_object_id !== formation.organisation_id || (original.formation_id && original.formation_id !== formation.id) || !sameDailySourceDigest(original.sha256, answers.source_sha256)) {
    throw new DailySourceError("Questionnaire original de cette candidature introuvable.", 409);
  }
  const converted = descriptors.some(proof => byId.get(String(proof.document_id))?.document_type === "positioning_evidence");
  const { data: mappings, error: mappingError } = converted ? await admin.from("daily_registration_request_enrolments")
    .select("registration_request_id,participant_index,participant_email,learner_id,enrolment_id").eq("registration_request_id", request.id) : { data: [], error: null };
  if (mappingError) throw new DailySourceError("Vérification de l’inscription indisponible.", 500);
  const enrolmentIds = (mappings ?? []).map(row => row.enrolment_id);
  const { data: enrolments, error: enrolmentError } = enrolmentIds.length ? await admin.from("daily_session_enrolments")
    .select("id,organisation_id,session_id,learner_id").eq("organisation_id", formation.organisation_id).in("id", enrolmentIds) : { data: [], error: null };
  const { data: session, error: sessionError } = converted && typeof request.attached_session_id === "string" ? await admin.from("daily_sessions")
    .select("id,organisation_id,formation_id").eq("id", request.attached_session_id).eq("organisation_id", formation.organisation_id).eq("formation_id", formation.id).maybeSingle() : { data: null, error: null };
  if (enrolmentError || sessionError) throw new DailySourceError("Vérification de l’inscription indisponible.", 500);
  const asSource = (doc: NonNullable<typeof original>): PrivateDailySource => ({ id: doc.id, name: String(doc.metadata?.original_filename || doc.logical_name || "Positionnement"),
    bucket: doc.bucket, storage_path: doc.storage_path, mime_type: doc.mime_type, sha256: doc.sha256 });
  const filled = descriptors.map(proof => {
    const doc = byId.get(String(proof.document_id));
    const metadata = candidatureRecord(doc?.metadata);
    const subject = candidatureRecord(subjects[Number(proof.participant_index)]);
    const firstName = text(subject.first_name ?? subject.firstname ?? subject.firstName);
    const lastName = text(subject.last_name ?? subject.lastname ?? subject.lastName);
    const email = normalized(subject.email ?? subject.mail);
    const candidateBinding = doc?.document_type === "positioning_application_evidence" && doc.linked_object_type === "registration_request" && doc.linked_object_id === request.id && !doc.session_id && !doc.learner_id && !doc.enrolment_id;
    const mapping = (mappings ?? []).find(row => row.enrolment_id === doc?.enrolment_id && row.participant_index === proof.participant_index && normalized(row.participant_email) === email && row.learner_id === doc?.learner_id);
    const enrolment = (enrolments ?? []).find(row => row.id === doc?.enrolment_id && row.learner_id === doc?.learner_id && row.session_id === request.attached_session_id);
    const enrolmentBinding = request.decision_status === "accepted" && session && mapping && enrolment && doc?.document_type === "positioning_evidence" &&
      doc.linked_object_type === "enrolment" && doc.linked_object_id === doc.enrolment_id && doc.session_id === session.id && metadata.source_request_id === request.id && metadata.source_request_kind === "formation";
    if (!validFile(doc) || !doc || !firstName || !lastName || !email || !(candidateBinding || enrolmentBinding) || doc.formation_id !== formation.id ||
      !sameDailySourceDigest(doc.sha256, proof.sha256) || !DAILY_SOURCE_SHA.test(text(proof.sha256)) || metadata.source !== "daily_own_positioning" || metadata.source_document_id !== sourceId ||
      !sameDailySourceDigest(metadata.source_sha256, original.sha256) || metadata.submission_fingerprint !== answers.submission_fingerprint || metadata.participant_index !== proof.participant_index ||
      normalized(metadata.subject_email) !== email || normalized(metadata.subject_first_name) !== normalized(firstName) || normalized(metadata.subject_last_name) !== normalized(lastName) ||
      normalized(proof.email) !== email || normalized(proof.first_name) !== normalized(firstName) || normalized(proof.last_name) !== normalized(lastName)) {
      throw new DailySourceError("Une copie de positionnement ne correspond pas à cette candidature.", 409);
    }
    return { ...asSource(doc), participant: `${firstName} ${lastName}` };
  });
  return { original: asSource(original), filled, current: Boolean(original.is_current && formation.status !== "archived" && formation.positioning_mode === "off_platform" && dailySourceDocumentId(formation.positioning_questionnaire_document_url) === sourceId) };
}
