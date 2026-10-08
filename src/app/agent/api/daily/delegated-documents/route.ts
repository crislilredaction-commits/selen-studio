import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";

const BUCKET = "documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_ENTITY_TYPES = new Set(["organisation", "trainer", "learner", "formation", "session", "enrolment"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg", "image/png",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "odt", "xls", "xlsx", "jpg", "jpeg", "png"]);
const ENTITY_TABLES = {
  trainer: "daily_trainer_profiles", learner: "daily_learners", formation: "daily_formations",
  session: "daily_sessions", enrolment: "daily_session_enrolments",
} as const;

function cleanFileName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-120) || "document";
}
function isAllowedFile(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return ALLOWED_MIME_TYPES.has(file.type) || (!file.type && ALLOWED_EXTENSIONS.has(extension));
}

export async function POST(req: Request) {
  const auth = await requireStudioAgent();
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const file = form.get("file");
  const organisationId = String(form.get("organisation_id") ?? "").trim();
  const logicalName = String(form.get("logical_name") ?? "").trim();
  const replacesDocumentId = String(form.get("replace_document_id") ?? "").trim() || null;
  const expectedUpdatedAt = String(form.get("expected_updated_at") ?? "").trim() || null;
  const rawLinks = form.getAll("link").map(String).filter(Boolean);

  if (!(file instanceof File) || !organisationId || !logicalName) {
    return NextResponse.json({ ok: false, error: "Fichier, organisme et nom du document sont requis." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: "Le fichier doit faire entre 1 octet et 25 Mo." }, { status: 400 });
  }
  if (!isAllowedFile(file)) {
    return NextResponse.json({ ok: false, error: "Importez un PDF, document Word/OpenDocument, fichier Excel ou une image JPG/PNG." }, { status: 400 });
  }
  if (replacesDocumentId && (!/^[0-9a-f-]{36}$/i.test(replacesDocumentId) || !expectedUpdatedAt)) {
    return NextResponse.json({ ok: false, error: "La version à remplacer est invalide. Rechargez la page." }, { status: 400 });
  }
  if (!(await isDailyOrganisationInAgentScope(auth.email, organisationId))) {
    return NextResponse.json({ ok: false, error: "Organisme hors du périmètre Daily de cet agent." }, { status: 403 });
  }

  const links = rawLinks.length ? rawLinks : [`organisation:${organisationId}`];
  const parsedLinks = links.map((value) => {
    const separator = value.indexOf(":");
    return { entityType: value.slice(0, separator), entityId: value.slice(separator + 1) };
  });
  if (parsedLinks.some(({ entityType, entityId }) => !ALLOWED_ENTITY_TYPES.has(entityType) || !/^[0-9a-f-]{36}$/i.test(entityId))) {
    return NextResponse.json({ ok: false, error: "Un rattachement documentaire est invalide." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: agentProfile } = await admin.from("agent_profiles").select("id").eq("email", auth.email).eq("is_active", true).maybeSingle();
  for (const { entityType, entityId } of parsedLinks) {
    if (entityType === "organisation") {
      if (entityId !== organisationId) return NextResponse.json({ ok: false, error: "Le rattachement organisme est invalide." }, { status: 400 });
      continue;
    }
    const table = ENTITY_TABLES[entityType as keyof typeof ENTITY_TABLES];
    const { data: scopedEntity, error: scopeError } = await admin.from(table).select("id").eq("id", entityId).eq("organisation_id", organisationId).maybeSingle();
    if (scopeError || !scopedEntity) return NextResponse.json({ ok: false, error: "Un rattachement ne fait pas partie de cet organisme." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const documentId = randomUUID();
  const storagePath = `daily/${organisationId}/delegated/${documentId}-${cleanFileName(file.name)}`;

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

  const cleanupStorage = async () => { await admin.storage.from(BUCKET).remove([storagePath]); };
  const linkPayload = replacesDocumentId ? [] : parsedLinks.map(({ entityType, entityId }) => ({ entity_type: entityType, entity_id: entityId }));
  const { data: registered, error: documentError } = await admin.rpc("daily_register_delegated_document", {
    p_document_id: documentId, p_organisation_id: organisationId, p_logical_name: logicalName,
    p_bucket: BUCKET, p_storage_path: storagePath, p_mime_type: file.type || "application/octet-stream",
    p_size_bytes: file.size, p_sha256: sha256, p_actor: auth.userId,
    p_agent_profile_id: agentProfile?.id ?? null,
    p_metadata: { source: "studio_delegation", original_filename: file.name, uploaded_by_email: auth.email },
    p_replaces_document_id: replacesDocumentId, p_expected_updated_at: expectedUpdatedAt,
    p_links: linkPayload,
  }).single();
  if (documentError || !registered) {
    await cleanupStorage();
    const conflict = /changed|current|replace|concurr|existe|version/i.test(documentError?.message ?? "");
    return NextResponse.json({ ok: false, error: conflict ? "Le document a changé. Rechargez la page avant de réessayer." : "L’import n’a pas pu être enregistré. Vérifiez les rattachements et réessayez." }, { status: conflict ? 409 : 400 });
  }

  const { count } = await admin.from("daily_document_links").select("id", { count: "exact", head: true }).eq("document_id", documentId).eq("organisation_id", organisationId);
  return NextResponse.json({ ok: true, document_id: documentId, version: (registered as { version: number }).version, links: count ?? 0 });
}
