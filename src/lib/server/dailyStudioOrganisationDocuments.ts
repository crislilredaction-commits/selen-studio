import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isDailyOrganisationInAgentScope, getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { DAILY_SOURCE_UUID, DAILY_SOURCE_SHA, DailySourceError, privateDailyPath, sameDailySourceDigest } from "@/lib/server/dailyStudioFormationSources";

export type DailyOrganisationDocument = {
  id: string; organisation_id: string; document_type: string; logical_name: string;
  version: number; status: string; created_at: string; bucket: string; storage_path: string;
  mime_type: string; sha256: string | null; metadata: Record<string, unknown> | null;
};
export type DailyOrganisationProgram = {
  id: string; title: string; status: string; version: number; duration_hours: number | null;
};

export function isPrivateDailyOrganisationDocument(document: DailyOrganisationDocument) {
  return document.bucket === "documents" && privateDailyPath(document.storage_path, document.organisation_id) &&
    Boolean(document.mime_type && /^[\w.+-]+\/[\w.+-]+$/.test(document.mime_type)) &&
    (!document.sha256 || DAILY_SOURCE_SHA.test(document.sha256));
}

export async function loadDailyOrganisationWorkspace(admin: SupabaseAdminClient, email: string, organisationId: string, kind: "programs" | "documents") {
  if (!DAILY_SOURCE_UUID.test(organisationId) || !(await isDailyOrganisationInAgentScope(email, organisationId))) {
    throw new DailySourceError("Organisme hors de ton périmètre Daily.", 403);
  }
  // Read every current row, including programmes without a session and pieces
  // that have already been checked. Access never depends on a pending task.
  const rows: Array<DailyOrganisationProgram | DailyOrganisationDocument> = [];
  for (let offset = 0; ; offset += 100) {
    const query = kind === "programs"
      ? admin.from("daily_formations").select("id,title,status,version,duration_hours").eq("organisation_id", organisationId).neq("status", "archived")
      : admin.from("daily_documents").select("id,organisation_id,document_type,logical_name,version,status,created_at,bucket,storage_path,mime_type,sha256,metadata").eq("organisation_id", organisationId).eq("is_current", true).neq("status", "archived");
    const { data, error } = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 99);
    if (error) throw new DailySourceError("Chargement du dossier indisponible.", 500);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 100) break;
  }
  return rows;
}

export async function downloadScopedDailyOrganisationDocument(admin: SupabaseAdminClient, email: string, id: string) {
  if (!DAILY_SOURCE_UUID.test(id)) throw new DailySourceError("Document introuvable.");
  const organisationIds = await getDailyOrganisationIdsForAgent(email);
  if (!organisationIds.length) throw new DailySourceError("Document introuvable.");
  const { data: document, error } = await admin.from("daily_documents")
    .select("id,organisation_id,document_type,logical_name,version,status,created_at,bucket,storage_path,mime_type,sha256,metadata")
    .eq("id", id).in("organisation_id", organisationIds).eq("is_current", true).neq("status", "archived").maybeSingle();
  if (error) throw new DailySourceError("Lecture du document indisponible.", 500);
  if (!document || !isPrivateDailyOrganisationDocument(document)) throw new DailySourceError("Document privé introuvable.");
  const { data: file, error: downloadError } = await admin.storage.from("documents").download(document.storage_path);
  if (downloadError || !file) throw new DailySourceError("Téléchargement indisponible.", 500);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (document.sha256 && !sameDailySourceDigest(createHash("sha256").update(bytes).digest("hex"), document.sha256)) {
    throw new DailySourceError("Le fichier ne correspond plus à sa preuve enregistrée.", 409);
  }
  const name = String(document.metadata?.original_filename || document.logical_name || "Document client").replace(/[\u0000-\u001f\u007f]/g, "");
  return new Response(bytes, { headers: {
    "Content-Type": document.mime_type,
    "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
