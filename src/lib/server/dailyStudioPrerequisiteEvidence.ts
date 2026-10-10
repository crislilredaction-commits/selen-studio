import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  DAILY_SOURCE_SHA,
  DAILY_SOURCE_UUID,
  downloadPrivateDailySource,
  privateDailyPath,
  type PrivateDailySource,
} from "@/lib/server/dailyStudioFormationSources";
import { loadScopedDailyFormation } from "@/lib/server/dailyStudioFormationSources";

const EVIDENCE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type DailyPrerequisiteEvidenceOwner = {
  kind: "formation" | "session";
  id: string;
  organisationId: string;
  formationId: string;
  sessionId: string | null;
};

export type DailyStudioPrerequisiteEvidence = {
  id: string;
  participant_index: number;
  participant_key: string;
  requirement_id: string;
  requirement_label: string;
  status: "submitted" | "verified" | "rejected";
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewer_label: string | null;
  review_comment: string | null;
  document: PrivateDailySource;
  url: string;
};

export class DailyPrerequisiteEvidenceReviewError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function hasExactVerifiedPrerequisiteCoverage(
  rows: DailyStudioPrerequisiteEvidence[],
  requirements: unknown,
  participantCount: number,
  participantKeys?: string[],
) {
  if (!Array.isArray(requirements) || !requirements.length || participantCount < 1) return false;
  const configured = requirements.map((value) => {
    const row = metadataRecord(value);
    return { id: String(row.id ?? "").trim(), label: String(row.label ?? "").trim(), required: row.required !== false };
  });
  if (configured.some((row) => !row.id || !row.label) || new Set(configured.map((row) => row.id)).size !== configured.length) return false;
  const requiredIds = configured.filter((row) => row.required);
  if (!requiredIds.length) return true;
  const expected = new Set<string>();
  for (let participantIndex = 0; participantIndex < participantCount; participantIndex++) {
    const participantKey = participantKeys?.[participantIndex] || String(participantIndex);
    for (const requirement of requiredIds) expected.add(`${participantKey}:${requirement.id}:${requirement.label}`);
  }
  const requiredIdSet = new Set(requiredIds.map((row) => row.id));
  const requiredRows = rows.filter((row) => requiredIdSet.has(row.requirement_id));
  const actual = new Set(requiredRows.map((row) => `${participantKeys ? row.participant_key : row.participant_index}:${row.requirement_id}:${row.requirement_label}`));
  return requiredRows.length === expected.size && actual.size === expected.size && requiredRows.every((row) => row.status === "verified" && expected.has(`${participantKeys ? row.participant_key : row.participant_index}:${row.requirement_id}:${row.requirement_label}`));
}

export function dailyPrerequisiteContract(value: unknown, fallback: { prerequisite_mode?: unknown; prerequisite_requirements?: unknown }) {
  const contract = metadataRecord(value);
  const participants = Array.isArray(contract.participants) ? contract.participants.map(metadataRecord) : [];
  const validSnapshot = contract.version === 1 && ["none", "required"].includes(String(contract.mode)) && Array.isArray(contract.requirements) &&
    participants.every((row) => Number.isInteger(row.index) && typeof row.key === "string" && /^[0-9a-f]{64}$/.test(row.key));
  if (validSnapshot) return {
    mode: String(contract.mode), requirements: contract.requirements,
    participantKeys: participants.map((row) => String(row.key)), participantCount: participants.length,
  };
  return { mode: String(fallback.prerequisite_mode ?? "none"), requirements: fallback.prerequisite_requirements,
    participantKeys: undefined, participantCount: 0 };
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function loadDailyPrerequisiteEvidence(
  admin: SupabaseAdminClient,
  owner: DailyPrerequisiteEvidenceOwner,
) {
  if (!DAILY_SOURCE_UUID.test(owner.id) || !DAILY_SOURCE_UUID.test(owner.organisationId) || !DAILY_SOURCE_UUID.test(owner.formationId)) {
    throw new DailyPrerequisiteEvidenceReviewError("Dossier de prérequis introuvable.", 404);
  }
  const ownerColumn = owner.kind === "formation" ? "registration_request_id" : "registration_response_id";
  const { data, error } = await admin.from("daily_prerequisite_evidence")
    .select("id,registration_request_id,registration_response_id,participant_index,participant_key,requirement_id,requirement_label,document_id,status,updated_at,reviewed_at,reviewed_by,review_comment")
    .eq(ownerColumn, owner.id)
    .order("participant_index", { ascending: true })
    .order("requirement_id", { ascending: true });
  if (error) throw new DailyPrerequisiteEvidenceReviewError("Lecture des justificatifs indisponible.", 500);
  const evidence = data ?? [];
  const reviewerLabels = new Map<string, string>();
  await Promise.all([...new Set(evidence.map((row) => row.reviewed_by).filter((id): id is string => typeof id === "string"))].map(async (id) => {
    const { data: reviewer } = await admin.auth.admin.getUserById(id);
    reviewerLabels.set(id, reviewer.user?.email?.trim() || id);
  }));
  const documentIds = evidence.map((row) => row.document_id).filter((id): id is string => typeof id === "string");
  if (!documentIds.length) return [] as DailyStudioPrerequisiteEvidence[];
  const { data: documents, error: documentError } = await admin.from("daily_documents")
    .select("id,organisation_id,formation_id,session_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,archived_at,logical_name,metadata")
    .eq("organisation_id", owner.organisationId)
    .eq("formation_id", owner.formationId)
    .in("id", documentIds);
  if (documentError) throw new DailyPrerequisiteEvidenceReviewError("Lecture des justificatifs indisponible.", 500);
  const documentMap = new Map((documents ?? []).map((document) => [document.id, document]));
  const rows: DailyStudioPrerequisiteEvidence[] = [];
  for (const row of evidence) {
    const document = row.document_id ? documentMap.get(row.document_id) : null;
    const metadata = metadataRecord(document?.metadata);
    const exactOwner = owner.kind === "formation"
      ? row.registration_request_id === owner.id && row.registration_response_id == null
      : row.registration_response_id === owner.id && row.registration_request_id == null;
    const exactDocument = document &&
      document.document_type === "prerequisite_application_evidence" &&
      document.linked_object_type === (owner.kind === "formation" ? "registration_request" : "registration_response") &&
      document.linked_object_id === owner.id &&
      document.organisation_id === owner.organisationId &&
      document.formation_id === owner.formationId &&
      document.session_id === owner.sessionId &&
      document.bucket === "documents" && document.is_current && document.status !== "archived" && !document.archived_at &&
      privateDailyPath(document.storage_path, owner.organisationId) &&
      EVIDENCE_MIME_TYPES.has(document.mime_type) && DAILY_SOURCE_SHA.test(document.sha256 ?? "") &&
      metadata.source === "daily_prerequisite_evidence" &&
      metadata.participant_index === row.participant_index && metadata.participant_key === row.participant_key && metadata.requirement_id === row.requirement_id;
    if (!exactOwner || !exactDocument || !["submitted", "verified", "rejected"].includes(row.status)) {
      throw new DailyPrerequisiteEvidenceReviewError("Un justificatif ne correspond pas exactement à ce dossier.", 409);
    }
    const source: PrivateDailySource = {
      id: document.id,
      name: String(metadata.original_filename || document.logical_name || "Justificatif"),
      bucket: document.bucket,
      storage_path: document.storage_path,
      mime_type: document.mime_type,
      sha256: document.sha256,
    };
    await downloadPrivateDailySource(admin, source);
    const { data: signed, error: signedError } = await admin.storage.from("documents").createSignedUrl(source.storage_path, 600);
    if (signedError || !signed?.signedUrl) throw new DailyPrerequisiteEvidenceReviewError("Ouverture du justificatif indisponible.", 500);
    rows.push({
      id: row.id,
      participant_index: row.participant_index,
      participant_key: row.participant_key,
      requirement_id: row.requirement_id,
      requirement_label: row.requirement_label,
      status: row.status as DailyStudioPrerequisiteEvidence["status"],
      updated_at: row.updated_at,
      reviewed_at: row.reviewed_at,
      reviewed_by: row.reviewed_by,
      reviewer_label: row.reviewed_by ? reviewerLabels.get(row.reviewed_by) ?? row.reviewed_by : null,
      review_comment: row.review_comment,
      document: source,
      url: signed.signedUrl,
    });
  }
  if (rows.length !== evidence.length) throw new DailyPrerequisiteEvidenceReviewError("Le dossier de justificatifs est incomplet.", 409);
  return rows;
}

export async function reviewDailyPrerequisiteEvidence(input: {
  admin: SupabaseAdminClient;
  owner: DailyPrerequisiteEvidenceOwner;
  evidenceId: string;
  expectedUpdatedAt: string;
  decision: string;
  comment: string;
  reviewerId: string;
}) {
  if (!DAILY_SOURCE_UUID.test(input.evidenceId) || !DAILY_SOURCE_UUID.test(input.reviewerId) || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
    throw new DailyPrerequisiteEvidenceReviewError("Rechargez le dossier avant de statuer.", 409);
  }
  if (input.decision !== "verified" && input.decision !== "rejected") throw new DailyPrerequisiteEvidenceReviewError("Décision de revue invalide.");
  if (input.decision === "rejected" && !input.comment.trim()) throw new DailyPrerequisiteEvidenceReviewError("Le motif du refus est obligatoire.");
  const rows = await loadDailyPrerequisiteEvidence(input.admin, input.owner);
  const evidence = rows.find((row) => row.id === input.evidenceId);
  if (!evidence || evidence.status !== "submitted" || evidence.updated_at !== input.expectedUpdatedAt) {
    throw new DailyPrerequisiteEvidenceReviewError("Le justificatif a changé. Rechargez le dossier avant de statuer.", 409);
  }
  const { error } = await input.admin.rpc("review_daily_prerequisite_evidence", {
    p_evidence_id: evidence.id,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_decision: input.decision,
    p_comment: input.comment.trim() || null,
    p_reviewer: input.reviewerId,
  });
  if (error) throw new DailyPrerequisiteEvidenceReviewError(error.message, 409);
}

export async function loadScopedDailySessionPrerequisites(admin: SupabaseAdminClient, email: string, sessionId: string) {
  if (!DAILY_SOURCE_UUID.test(sessionId)) return null;
  const { data: session, error } = await admin.from("daily_sessions")
    .select("id,formation_id,organisation_id")
    .eq("id", sessionId).maybeSingle();
  if (error) throw new DailyPrerequisiteEvidenceReviewError("Lecture de la session indisponible.", 500);
  if (!session?.formation_id || !session.organisation_id) return null;
  const formation = await loadScopedDailyFormation(admin, email, session.formation_id);
  if (!formation || formation.organisation_id !== session.organisation_id) return null;
  const { data: responses, error: responseError } = await admin.from("daily_registration_responses")
    .select("id,response_type,participants,respondent_first_name,respondent_last_name,prerequisite_contract")
    .eq("session_id", sessionId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });
  if (responseError) throw new DailyPrerequisiteEvidenceReviewError("Lecture des candidatures indisponible.", 500);
  const dossiers = await Promise.all((responses ?? []).map(async (response) => {
    const contract = dailyPrerequisiteContract(response.prerequisite_contract, formation);
    const evidence = contract.mode === "required" ? await loadDailyPrerequisiteEvidence(admin, {
      kind: "session", id: response.id, organisationId: session.organisation_id,
      formationId: session.formation_id, sessionId,
    }) : [];
    const participantCount = contract.participantCount || (response.response_type === "company" ? Math.max(Array.isArray(response.participants) ? response.participants.length : 0, 1) : 1);
    return { response, contract, evidence, complete: contract.mode !== "required" || hasExactVerifiedPrerequisiteCoverage(evidence, contract.requirements, participantCount, contract.participantKeys) };
  }));
  return { session, formation, dossiers, complete: dossiers.length === 0 || dossiers.every((dossier) => dossier.complete) };
}
