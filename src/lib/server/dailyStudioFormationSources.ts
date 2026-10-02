import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";

export const DAILY_SOURCE_MIME_TYPES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const DAILY_SOURCE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DAILY_SOURCE_SHA = /^[a-f0-9]{64}$/i;
export type PrivateDailySource = { id: string; name: string; bucket: string; storage_path: string; mime_type: string; sha256: string };
export class DailySourceError extends Error {
  constructor(message: string, public status = 404) { super(message); }
}
export function dailySourceDocumentId(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/api\/client\/daily\/uploads\?id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1].toLowerCase() ?? null;
}
export function privateDailyPath(path: unknown, organisationId: string) {
  return typeof path === "string" && path.startsWith(`daily/${organisationId}/`) &&
    !/[\\%\u0000-\u001f]/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..");
}

export async function loadScopedDailyFormation(admin: SupabaseAdminClient, email: string, id: string) {
  if (!DAILY_SOURCE_UUID.test(id)) return null;
  const organisationIds = await getDailyOrganisationIdsForAgent(email);
  if (!organisationIds.length) return null;
  const { data, error } = await admin.from("daily_formations").select("*")
    .eq("id", id).in("organisation_id", organisationIds).maybeSingle();
  if (error) throw new DailySourceError("Lecture de la formation indisponible.", 500);
  return data;
}

export async function loadPrivateDailySource(admin: SupabaseAdminClient, formation: { id: string; organisation_id: string; [key: string]: unknown }, kind: "program" | "positioning") {
  const reference = kind === "program" ? formation.detailed_program_document_url : formation.positioning_questionnaire_document_url;
  if (kind === "positioning" && formation.positioning_mode !== "off_platform") throw new DailySourceError("Document source privé introuvable.");
  const id = dailySourceDocumentId(reference);
  if (!id || formation.status === "archived") throw new DailySourceError("Document source privé introuvable.");
  const documentType = kind === "program" ? "training_program_source" : "positioning_questionnaire_source";
  const { data: doc, error } = await admin.from("daily_documents")
    .select("id,organisation_id,formation_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,logical_name,metadata")
    .eq("id", id).eq("organisation_id", formation.organisation_id).eq("document_type", documentType)
    .eq("linked_object_type", "organisation").eq("linked_object_id", formation.organisation_id).maybeSingle();
  if (error) throw new DailySourceError("Lecture du document source indisponible.", 500);
  if (!doc || doc.bucket !== "documents" || !doc.is_current || doc.status === "archived" ||
    (doc.formation_id && doc.formation_id !== formation.id) || !privateDailyPath(doc.storage_path, formation.organisation_id) ||
    !DAILY_SOURCE_MIME_TYPES.has(doc.mime_type) || !DAILY_SOURCE_SHA.test(doc.sha256 ?? "")) {
    throw new DailySourceError("Document source privé introuvable.");
  }
  return { id: doc.id, name: String(doc.metadata?.original_filename || doc.logical_name || "Document source"), bucket: doc.bucket,
    storage_path: doc.storage_path, mime_type: doc.mime_type, sha256: doc.sha256 } as PrivateDailySource;
}

export async function downloadPrivateDailySource(admin: SupabaseAdminClient, document: PrivateDailySource) {
  if (document.bucket !== "documents") throw new DailySourceError("Document privé introuvable.");
  const { data, error } = await admin.storage.from("documents").download(document.storage_path);
  if (error || !data) throw new DailySourceError("Téléchargement indisponible.", 500);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== document.sha256) {
    throw new DailySourceError("Le fichier ne correspond plus à sa preuve enregistrée.", 409);
  }
  return new Response(bytes, { headers: {
    "Content-Type": document.mime_type,
    "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
