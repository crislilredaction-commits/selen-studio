import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { buildNdaProgramDocumentHtml } from "@/lib/server/ndaProgramDocumentHtml";
import { getNdaDocumentContext } from "@/lib/server/ndaDocumentContext";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GENERATED_MODEL = "nda_programme_v1";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function requireAgent() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return { ok: true as const };
  }

  const sessionClient = await createSessionClient();
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser();

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Vous devez être connecté côté agent." },
        { status: 401 },
      ),
    };
  }

  const admin = getAdminClient();
  const { data: adminUser, error: adminError } = await admin
    .from("selen_admin_users")
    .select("id, user_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: `Impossible de vérifier les droits agent. ${adminError.message}`,
        },
        { status: 500 },
      ),
    };
  }

  if (
    !adminUser ||
    (adminUser.role !== "agent" && adminUser.role !== "admin")
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Accès agent non autorisé." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAgent();

    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const dossierId = typeof body?.dossierId === "string" ? body.dossierId : "";

    if (!dossierId.trim()) {
      return NextResponse.json(
        { ok: false, error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const context = await getNdaDocumentContext(dossierId.trim());
    const missingRequiredFields = [...context.flags.missingRequiredFields];

    if (!context.dossier.organisation_id) {
      missingRequiredFields.push("organisation_id");
    }

    if (missingRequiredFields.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_generation_context",
          missingRequiredFields,
        },
        { status: 422 },
      );
    }

    const latestProgramVersion = context.latestProgramVersion;

    if (!latestProgramVersion) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_generation_context",
          missingRequiredFields: ["latestProgramVersion"],
        },
        { status: 422 },
      );
    }

    const generatedAt = new Date();
    const html = buildNdaProgramDocumentHtml({
      kind: "final",
      version: latestProgramVersion,
      organisation: context.organisation,
      variables: context.variables,
      generatedAt,
    });

    const admin = getAdminClient();
    const organisationId = context.dossier.organisation_id as string;
    const timestamp = generatedAt
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    const storagePath = `generated/${organisationId}/${context.dossier.id}/programme-formation-${timestamp}.doc`;
    const fileBuffer = new TextEncoder().encode(html);

    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: "application/msword; charset=utf-8",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: `Storage: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { error: supersedeError } = await admin
      .from("documents")
      .update({
        review_status: "superseded",
        requires_client_action: false,
        is_visible_to_client: false,
      })
      .eq("dossier_id", context.dossier.id)
      .eq("document_type", "programme_formation")
      .eq("document_role", "client_to_complete")
      .eq("review_status", "pending_client")
      .eq("generated_from_model", GENERATED_MODEL);

    if (supersedeError) {
      return NextResponse.json(
        { ok: false, error: `Database: ${supersedeError.message}` },
        { status: 500 },
      );
    }

    const formationTitle =
      context.variables?.intitule_formation ||
      latestProgramVersion.title ||
      "formation";
    const documentName = `Programme de formation - ${formationTitle}.doc`;

    const { data: insertedDocument, error: insertError } = await admin
      .from("documents")
      .insert({
        name: documentName,
        document_type: "programme_formation",
        status: "generated",
        source: "generated",
        storage_path: storagePath,
        organisation_id: organisationId,
        dossier_id: context.dossier.id,
        scope: "dossier",
        document_role: "client_to_complete",
        review_status: "pending_client",
        is_visible_to_client: true,
        requires_client_action: true,
        generated_from_model: GENERATED_MODEL,
        metadata: {
          generated_at: generatedAt.toISOString(),
          source_program_version_id: latestProgramVersion.id,
          source_program_version_type: latestProgramVersion.version_type,
          document_family: "nda_generation",
          action_required: "signature_client",
          kind: "final_program",
        },
      })
      .select("id")
      .single();

    if (insertError || !insertedDocument) {
      return NextResponse.json(
        {
          ok: false,
          error: `Database: ${
            insertError?.message ?? "document non créé"
          }`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      documentId: insertedDocument.id,
      storagePath,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
