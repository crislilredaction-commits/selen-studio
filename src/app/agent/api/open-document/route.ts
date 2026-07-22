import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();

    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const documentId =
      typeof body?.documentId === "string"
        ? body.documentId
        : typeof body?.id === "string"
          ? body.id
          : "";

    if (!documentId.trim()) {
      return NextResponse.json(
        { ok: false, error: "document_not_found" },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: doc, error: fetchError } = await admin
      .from("documents")
      .select(
        "id, name, storage_path, dossier_id, organisation_id, source, document_role, review_status, document_type",
      )
      .eq("id", documentId.trim())
      .maybeSingle();

    if (fetchError || !doc) {
      return NextResponse.json(
        { ok: false, error: "document_not_found" },
        { status: 404 },
      );
    }

    if (!doc.dossier_id && !doc.organisation_id) {
      return NextResponse.json(
        { ok: false, error: "invalid_document_scope" },
        { status: 422 },
      );
    }

    if (doc.dossier_id) {
      const { data: dossier, error: dossierError } = await admin
        .from("dossiers")
        .select("id, organisation_id")
        .eq("id", doc.dossier_id)
        .maybeSingle();

      if (dossierError) {
        return NextResponse.json(
          { ok: false, error: "document_scope_check_failed" },
          { status: 500 },
        );
      }

      if (!dossier || (doc.organisation_id && dossier.organisation_id !== doc.organisation_id)) {
        return NextResponse.json(
          { ok: false, error: "invalid_document_scope" },
          { status: 409 },
        );
      }
    } else if (doc.organisation_id) {
      const { data: organisation, error: organisationError } = await admin
        .from("organisations")
        .select("id")
        .eq("id", doc.organisation_id)
        .maybeSingle();

      if (organisationError) {
        return NextResponse.json(
          { ok: false, error: "document_scope_check_failed" },
          { status: 500 },
        );
      }

      if (!organisation) {
        return NextResponse.json(
          { ok: false, error: "invalid_document_scope" },
          { status: 409 },
        );
      }
    }

    const storagePath = String(doc.storage_path ?? "").trim();

    if (!storagePath) {
      return NextResponse.json(
        { ok: false, error: "missing_storage_path" },
        { status: 422 },
      );
    }

    const { data, error } = await admin.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 10);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: "signed_url_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (error) {
    console.error("OPEN DOCUMENT ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "signed_url_failed" },
      { status: 500 },
    );
  }
}
