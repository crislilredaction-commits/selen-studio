import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "./supabaseAdmin";
import { DAILY_SOURCE_MIME_TYPES, DAILY_SOURCE_UUID, DAILY_SOURCE_SHA, loadScopedDailyFormation, DailySourceError } from "./dailyStudioFormationSources";

const MAX_SIZE = 10 * 1024 * 1024;
type Formation = { id: string; organisation_id: string; status: string; updated_at: string; [key: string]: unknown };
type UploadedSource = { id: string; name: string; mime_type: string; size_bytes: number; sha256: string };

export function questionnaireFiles(form: FormData, formation: Formation) {
  return [
    { kind: "positioning", name: "positioning_source_file", allowed: formation.positioning_mode === "off_platform" },
    { kind: "assessment", name: "assessment_source_file", allowed: formation.learning_assessment_mode === "external" },
  ].flatMap(config => {
    const entry = form.get(config.name);
    if (!entry) return [];
    let source: UploadedSource;
    try { source = JSON.parse(typeof entry === "string" ? entry : ""); } catch { throw new DailySourceError("Import du questionnaire invalide.", 400); }
    if (!source || !config.allowed || typeof source.id !== "string" || !DAILY_SOURCE_UUID.test(source.id) || !DAILY_SOURCE_SHA.test(source.sha256 || "") || typeof source.name !== "string" || !source.name.trim() || source.name.length > 255
      || !Number.isInteger(source.size_bytes) || source.size_bytes <= 0 || source.size_bytes > MAX_SIZE || !DAILY_SOURCE_MIME_TYPES.has(source.mime_type)) throw new DailySourceError("Attends la fin de l’import ou annule le remplacement avant d’enregistrer.", 400);
    return [{ kind: config.kind, source: { ...source, id: source.id.toLowerCase() } }];
  });
}

// The browser uploads once to a server-issued private destination. Only metadata
// passes through the form, so 10MB files don't cross Vercel's request-size limit.
// The RPC switches the references and document
// versions together under the formation lock; it never changes a learner copy.
export async function saveDailyQuestionnaireSources(admin: SupabaseAdminClient, formation: Formation, email: string, actor: string, patch: Record<string, unknown>, files: ReturnType<typeof questionnaireFiles>) {
  const prepared: Array<Record<string, unknown>> = [];
  const expectedStatus = formation.status, expectedUpdatedAt = formation.updated_at;
  async function checkCurrent() {
    const current = await loadScopedDailyFormation(admin, email, formation.id);
    if (!current || current.organisation_id !== formation.organisation_id) throw new DailySourceError("Programme introuvable.");
    if (current.status !== expectedStatus || current.updated_at !== expectedUpdatedAt) throw new DailySourceError("Le programme a changé. Actualise le dossier avant de l’enregistrer.", 409);
  }
  await checkCurrent();
  for (const { kind, source } of files) {
    const id = source.id;
    const path = "daily/" + formation.organisation_id + "/formation-sources/" + formation.id + "/" + kind + "/" + id;
    const { data, error } = await admin.storage.from("documents").download(path);
    if (error || !data) throw new DailySourceError("Le fichier importé n’est plus disponible. Réimporte-le.", 409);
    if (data.size > MAX_SIZE) throw new DailySourceError("Le fichier doit peser moins de 10 Mo.", 400);
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_SIZE || bytes.length !== source.size_bytes || (data.type && data.type !== source.mime_type)
      || createHash("sha256").update(bytes).digest("hex") !== source.sha256.toLowerCase()) throw new DailySourceError("Le fichier importé ne correspond pas à sa preuve. Réimporte-le.", 409);
    prepared.push({ kind, id, storage_path: path, mime_type: source.mime_type, size_bytes: bytes.length, sha256: source.sha256.toLowerCase(), name: source.name });
  }
  await checkCurrent();
  const { data, error } = await admin.rpc("daily_save_formation_review_sources", {
    p_formation_id: formation.id, p_organisation_id: formation.organisation_id,
    p_expected_updated_at: expectedUpdatedAt, p_expected_status: expectedStatus,
    p_actor: actor, p_patch: patch, p_sources: prepared,
  });
  if (error) {
    throw new DailySourceError(error.code === "P0001" ? "Le programme ou le document a changé. Actualise le dossier avant de l’enregistrer." : "Enregistrement du questionnaire indisponible.", error.code === "P0001" ? 409 : 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id !== formation.id) throw new DailySourceError("L’enregistrement n’a pas pu être confirmé. Recharge le dossier.", 500);
  return row;
  // Never delete staged bytes on a failed/uncertain save: another concurrent
  // submission of the same immutable upload may have committed successfully.
}
