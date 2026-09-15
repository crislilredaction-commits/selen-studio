import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";

const BUCKET = "documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_ENTITY_TYPES = new Set(["organisation", "trainer", "learner", "formation", "session", "enrolment"]);

function cleanFileName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-120) || "document";
}

export async function POST(req: Request) {
  const auth = await requireStudioAgent();
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const file = form.get("file");
  const organisationId = String(form.get("organisation_id") ?? "").trim();
  const logicalName = String(form.get("logical_name") ?? "").trim();
  const rawLinks = form.getAll("link").map(String).filter(Boolean);

  if (!(file instanceof File) || !organisationId || !logicalName) {
    return NextResponse.json({ ok: false, error: "Fichier, organisme et nom du document sont requis." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: "Le fichier doit faire entre 1 octet et 25 Mo." }, { status: 400 });
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
  const { error: documentError } = await admin.from("daily_documents").insert({
    id: documentId,
    organisation_id: organisationId,
    document_type: "delegated_upload",
    linked_object_type: "organisation",
    linked_object_id: organisationId,
    version: 1,
    status: "draft",
    logical_name: logicalName,
    bucket: BUCKET,
    storage_path: storagePath,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256,
    created_by: auth.userId,
    updated_by: auth.userId,
    metadata: { source: "studio_delegation", original_filename: file.name, uploaded_by_email: auth.email },
  });
  if (documentError) {
    await cleanupStorage();
    return NextResponse.json({ ok: false, error: documentError.message }, { status: 500 });
  }

  const linkRows = parsedLinks.map(({ entityType, entityId }) => ({
    document_id: documentId,
    organisation_id: organisationId,
    entity_type: entityType,
    entity_id: entityId,
    created_by_agent_profile_id: agentProfile?.id ?? null,
    metadata: { source: "studio_delegation" },
  }));
  const { error: linkError } = await admin.from("daily_document_links").insert(linkRows);
  if (linkError) {
    await admin.from("daily_documents").delete().eq("id", documentId).eq("organisation_id", organisationId);
    await cleanupStorage();
    return NextResponse.json({ ok: false, error: linkError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, document_id: documentId, links: linkRows.length });
}
