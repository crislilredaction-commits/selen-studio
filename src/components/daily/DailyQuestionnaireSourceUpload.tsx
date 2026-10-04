"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { dailyQuestionnaireSourceMime, prepareDailyQuestionnaireSourceUpload } from "@/lib/dailyQuestionnaireEditing";
import { useDailyReviewUploadPending } from "./DailyFormationReviewForm";

export default function DailyQuestionnaireSourceUpload({ formationId, updatedAt, kind }: { formationId: string; updatedAt: string; kind: "positioning" | "assessment" }) {
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const setUploadPending = useDailyReviewUploadPending();
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadPending(kind, true);
    setBusy(true); setError(""); setSource(JSON.stringify({ pending: true })); setFileName("");
    try {
      const mimeType = dailyQuestionnaireSourceMime(file.name, file.type);
      if (!mimeType || !file.size || file.size > 10 * 1024 * 1024) throw new Error("Choisis un fichier PDF ou Word de moins de 10 Mo.");
      const response = await fetch("/agent/api/daily/formations/" + formationId + "/source-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, mime_type: mimeType, size_bytes: file.size, expected_updated_at: updatedAt }) });
      const ticket = await response.json().catch(() => ({}));
      if (!response.ok || !ticket.token) throw new Error(ticket.error || "Import indisponible.");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
      const prepared = prepareDailyQuestionnaireSourceUpload(file, mimeType);
      const { error } = await createClient().storage.from("documents").uploadToSignedUrl(ticket.path, ticket.token, prepared.body, prepared.options);
      if (error) throw new Error("Le fichier n’a pas pu être importé. Réessaie.");
      setSource(JSON.stringify({ id: ticket.id, name: file.name, mime_type: mimeType, size_bytes: file.size, sha256 }));
      setFileName(file.name);
      setUploadPending(kind, false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { setBusy(false); event.target.value = ""; }
  }
  return <div style={{ display: "grid", gap: 8 }}>
    <input type="hidden" name={kind === "positioning" ? "positioning_source_file" : "assessment_source_file"} value={source} />
    <label>Choisir le fichier PDF ou Word (10 Mo maximum)<input type="file" accept=".pdf,.doc,.docx" disabled={busy} onChange={upload} style={{ display: "block", marginTop: 8, maxWidth: "100%" }} /></label>
    {busy ? <p role="status">Import en cours… Attends la fin avant d’enregistrer.</p> : fileName ? <p role="status">{fileName} — prêt à remplacer l’original lors de l’enregistrement.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {source && !busy ? <button type="button" onClick={() => { setSource(""); setError(""); setFileName(""); setUploadPending(kind, false); }}>Annuler ce remplacement</button> : null}
  </div>;
}
