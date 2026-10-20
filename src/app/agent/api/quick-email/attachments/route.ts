import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  safeStudioEmailAttachmentName,
  isStudioEmailAttachmentTypeAllowed,
  STUDIO_EMAIL_ATTACHMENT_BUCKET,
  STUDIO_EMAIL_ATTACHMENT_MAX_FILE_BYTES,
} from "@/lib/studioEmailAttachments";

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  const organisationId = typeof body?.organisationId === "string" ? body.organisationId.trim() : "";
  const name = safeStudioEmailAttachmentName(typeof body?.name === "string" ? body.name : "");
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = Number(body?.sizeBytes);
  if (!/^[0-9a-f-]{36}$/i.test(organisationId) || !name || !isStudioEmailAttachmentTypeAllowed(name, mimeType)
    || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > STUDIO_EMAIL_ATTACHMENT_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Pièce jointe invalide ou trop volumineuse." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data: organisation, error: organisationError } = await admin.from("organisations").select("id").eq("id", organisationId).maybeSingle();
  if (organisationError || !organisation) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });
  const id = randomUUID();
  const path = `daily/${organisationId}/communications/pending/${auth.userId}/${id}`;
  const { data, error } = await admin.storage.from(STUDIO_EMAIL_ATTACHMENT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) return NextResponse.json({ error: "Téléversement indisponible." }, { status: 500 });
  return NextResponse.json({ path, token: data.token, name, mimeType, sizeBytes }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
