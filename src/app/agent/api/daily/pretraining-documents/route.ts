import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { publishDailyDocumentAndNotify } from "@/lib/server/dailyDocumentPublication";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

const types = [
  "training_program",
  "training_agreement",
  "training_contract",
  "convocation",
  "registration_positioning",
  "welcome_booklet",
  "internal_regulations",
];

const MAX_REPLACEMENT_SIZE = 10 * 1024 * 1024;
const replacementMimeTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
function safeFileName(value: string) { return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-120) || "document"; }

export async function GET() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (organisationIds.length === 0) return NextResponse.json({ documents: [] });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("daily_documents")
    .select("*,organisations(name)")
    .in("organisation_id", organisationIds)
    .in("document_type", types)
    .eq("is_current", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") ?? "").trim();
  const expectedUpdatedAt = String(form?.get("expected_updated_at") ?? "").trim();
  const file = form?.get("file");
  if (!id || !expectedUpdatedAt || !(file instanceof File)) return NextResponse.json({ error: "Document, version relue et fichier sont requis." }, { status: 400 });
  if (!replacementMimeTypes.has(file.type) || file.size <= 0 || file.size > MAX_REPLACEMENT_SIZE) return NextResponse.json({ error: "Importez un PDF, DOC ou DOCX de 10 Mo maximum." }, { status: 400 });
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (!organisationIds.length) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data: current, error: readError } = await admin.from("daily_documents").select("*").eq("id", id).in("organisation_id", organisationIds).in("document_type", types).eq("is_current", true).maybeSingle();
  if (readError || !current) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (["published", "signed", "archived"].includes(current.status)) return NextResponse.json({ error: "Ce document a déjà été émis et ne peut plus être remplacé dans ce circuit." }, { status: 409 });
  if (current.updated_at !== expectedUpdatedAt) return NextResponse.json({ error: "Le document a changé depuis son ouverture. Rechargez et relisez la pièce." }, { status: 409 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const replacementId = randomUUID();
  const storagePath = `daily/${current.organisation_id}/${current.linked_object_type}/${current.linked_object_id}/${current.document_type}/studio-${replacementId}-${safeFileName(file.name)}`;
  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const cleanupStorage = async () => { await admin.storage.from("documents").remove([storagePath]); };
  const metadata = { ...(current.metadata ?? {}), source: "studio_agent_replacement", original_filename: file.name, replaced_document_id: current.id, replaced_by_email: auth.email, replaced_at: new Date().toISOString() };
  const { data: replacement, error: insertError } = await admin.from("daily_documents").insert({
    id: replacementId, organisation_id: current.organisation_id, formation_id: current.formation_id, session_id: current.session_id,
    learner_id: current.learner_id, enrolment_id: current.enrolment_id, document_type: current.document_type,
    linked_object_type: current.linked_object_type, linked_object_id: current.linked_object_id,
    version: Number(current.version ?? 0) + 1, status: "to_check", logical_name: current.logical_name,
    bucket: "documents", storage_path: storagePath, mime_type: file.type, size_bytes: file.size, sha256,
    created_by: auth.userId, updated_by: auth.userId, is_current: true, previous_document_id: current.id, metadata,
  }).select("*").single();
  if (insertError || !replacement) { await cleanupStorage(); return NextResponse.json({ error: insertError?.message ?? "Remplacement impossible." }, { status: 500 }); }
  const { data: retired, error: retirementError } = await admin.from("daily_documents").update({ is_current: false, updated_by: auth.userId }).eq("id", current.id).eq("organisation_id", current.organisation_id).eq("is_current", true).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (retirementError || !retired) {
    await admin.from("daily_documents").delete().eq("id", replacementId).eq("organisation_id", current.organisation_id);
    await cleanupStorage();
    return NextResponse.json({ error: "Le document a changé pendant le remplacement. Rechargez la liste." }, { status: 409 });
  }
  return NextResponse.json({ document: replacement });
}

export async function PATCH(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const expectedUpdatedAt = typeof body.expected_updated_at === "string" ? body.expected_updated_at.trim() : "";
  if (!id || !["validate", "request_correction", "publish"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }
  if (!expectedUpdatedAt || !Number.isFinite(new Date(expectedUpdatedAt).getTime())) {
    return NextResponse.json({ error: "Rechargez la liste pour relire la version courante du document." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });

  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (organisationIds.length === 0) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const admin = createSupabaseAdminClient();
  const { data: current, error: readError } = await admin
    .from("daily_documents")
    .select("id,status,metadata,organisation_id,document_type,logical_name,version,updated_at")
    .eq("id", id)
    .in("organisation_id", organisationIds)
    .in("document_type", types)
    .eq("is_current", true)
    .single();
  if (readError || !current) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const conflictMessage = "Le document a changé depuis son ouverture. Rechargez la liste et relisez la pièce avant de réessayer.";
  if (current.updated_at !== expectedUpdatedAt) {
    return NextResponse.json({ error: conflictMessage }, { status: 409 });
  }

  if (action === "publish") {
    const publication = await publishDailyDocumentAndNotify({
      admin,
      document: current,
      publishedBy: userId,
      publishedByEmail: auth.email,
    });
    if (!publication.ok) {
      return NextResponse.json({ error: publication.error }, { status: publication.status });
    }
    return NextResponse.json({ document: publication.document, notification: publication.notification });
  }

  if (["published", "signed", "archived"].includes(current.status)) {
    return NextResponse.json({ error: "Ce document n’est plus modifiable dans ce circuit de revue." }, { status: 400 });
  }
  const metadata = {
    ...(current.metadata ?? {}),
    review_note: note || null,
    reviewed_at: new Date().toISOString(),
    reviewed_by_email: auth.email,
  };
  const updates = action === "validate"
    ? { status: "validated", validated_by: userId, validated_at: new Date().toISOString(), updated_by: userId, metadata }
    : { status: "correction_requested", validated_by: null, validated_at: null, updated_by: userId, metadata };
  const { data, error } = await admin
    .from("daily_documents")
    .update(updates)
    .eq("id", id)
    .in("organisation_id", organisationIds)
    .eq("is_current", true)
    .eq("status", current.status)
    .eq("version", current.version)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: conflictMessage }, { status: 409 });
  return NextResponse.json({ document: data });
}
