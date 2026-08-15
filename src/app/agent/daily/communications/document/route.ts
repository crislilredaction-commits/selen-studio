import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export const runtime = "nodejs";

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "document";
}

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const url = new URL(req.url);
  const communicationId = url.searchParams.get("communication_id")?.trim();
  const documentId = url.searchParams.get("document_id")?.trim();
  if (!communicationId || !documentId) {
    return Response.json({ error: "communication_id et document_id requis" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: snapshot, error: snapshotError } = await admin
    .from("daily_communication_documents")
    .select("document_id,logical_name,document_version,sha256,storage_path")
    .eq("communication_id", communicationId)
    .eq("document_id", documentId)
    .maybeSingle();

  if (snapshotError) return Response.json({ error: snapshotError.message }, { status: 500 });
  if (!snapshot) return Response.json({ error: "Document non rattaché à cette preuve." }, { status: 404 });

  const { data: document, error: documentError } = await admin
    .from("daily_documents")
    .select("id,bucket,storage_path,mime_type,logical_name,version,sha256")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) return Response.json({ error: documentError.message }, { status: 500 });
  if (!document) return Response.json({ error: "Version documentaire source introuvable." }, { status: 404 });

  if (
    document.storage_path !== snapshot.storage_path ||
    Number(document.version) !== Number(snapshot.document_version) ||
    String(document.sha256 ?? "") !== String(snapshot.sha256 ?? "")
  ) {
    return Response.json({ error: "La version stockée ne correspond plus au snapshot de preuve. Téléchargement bloqué par sécurité." }, { status: 409 });
  }

  const { data: file, error: downloadError } = await admin.storage
    .from(document.bucket)
    .download(snapshot.storage_path);

  if (downloadError || !file) {
    return Response.json({ error: "Le fichier exact associé à cette preuve est indisponible dans le stockage." }, { status: 404 });
  }

  const storageName = snapshot.storage_path.split("/").pop() || snapshot.logical_name || document.logical_name || "document";
  const filename = safeFilename(storageName);
  const buffer = Buffer.from(await file.arrayBuffer());

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": document.mime_type || file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
