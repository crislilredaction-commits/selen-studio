import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  buildNdaProgramDocumentHtml,
  hasNdaProgramDocumentContent,
  validateNdaProgramDurationConsistency,
} from "@/lib/server/ndaProgramDocumentHtml";
import { buildNdaConventionDocumentHtml } from "@/lib/server/ndaConventionDocumentHtml";
import { getNdaDocumentContext } from "@/lib/server/ndaDocumentContext";
import { notifyClientVisibleDocuments } from "@/lib/server/notifyClientVisibleDocuments";
import { syncNdaDossierStatus } from "@/lib/server/ndaAgentWorkflow";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GENERATED_MODEL = "nda_signing_documents_v1";

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
        { ok: false, error: "Vous devez être connecté côté agent." },
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
          ok: false,
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
        { ok: false, error: "Accès agent non autorisé." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

async function supersedePreviousGeneratedSigningDocuments(args: {
  admin: ReturnType<typeof getAdminClient>;
  dossierId: string;
  documentTypes: string[];
}) {
  const { admin, dossierId, documentTypes } = args;

  const { error } = await admin
    .from("documents")
    .update({
      review_status: "superseded",
      requires_client_action: false,
      is_visible_to_client: false,
    })
    .eq("dossier_id", dossierId)
    .eq("source", "generated")
    .eq("document_role", "client_to_complete")
    .in("document_type", documentTypes);

  if (error) {
    throw new Error(`Database: ${error.message}`);
  }
}

async function uploadAndCreateDocument(args: {
  admin: ReturnType<typeof getAdminClient>;
  html: string;
  storagePath: string;
  documentName: string;
  documentType: string;
  organisationId: string;
  dossierId: string;
  metadata: Record<string, unknown>;
}) {
  const {
    admin,
    html,
    storagePath,
    documentName,
    documentType,
    organisationId,
    dossierId,
    metadata,
  } = args;

  const fileBuffer = new TextEncoder().encode(html);

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, fileBuffer, {
      contentType: "application/msword; charset=utf-8",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage: ${uploadError.message}`);
  }

  const { data: insertedDocument, error: insertError } = await admin
    .from("documents")
    .insert({
      name: documentName,
      document_type: documentType,
      status: "generated",
      source: "generated",
      storage_path: storagePath,
      organisation_id: organisationId,
      dossier_id: dossierId,
      scope: "dossier",
      document_role: "client_to_complete",
      review_status: "pending_client",
      is_visible_to_client: true,
      requires_client_action: true,
      generated_from_model: GENERATED_MODEL,
      metadata,
    })
    .select("id, name, document_type")
    .single();

  if (insertError || !insertedDocument) {
    throw new Error(`Database: ${insertError?.message ?? "document non créé"}`);
  }

  return insertedDocument;
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

    const missingRequiredFields = context.flags.missingRequiredFields.filter(
      (field) => field !== "latestProgramVersion",
    );

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

    if (
      !latestProgramVersion ||
      !hasNdaProgramDocumentContent(latestProgramVersion)
    ) {
      return NextResponse.json(
        { ok: false, error: "missing_program_content" },
        { status: 422 },
      );
    }

    const durationConsistency = validateNdaProgramDurationConsistency(
      latestProgramVersion,
      context.variables,
    );

    if (!durationConsistency.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "duration_mismatch",
          message: durationConsistency.message,
          declaredHours: durationConsistency.declaredHours,
          modulesTotalHours: durationConsistency.modulesTotalHours,
        },
        { status: 422 },
      );
    }

    const generatedAt = new Date();
    const admin = getAdminClient();

    const organisationId = context.dossier.organisation_id as string;
    const timestamp = generatedAt
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");

    const formationTitle =
      context.variables?.intitule_formation ||
      latestProgramVersion.title ||
      "formation";

    const filenameTitle = safeFilename(formationTitle) || "formation";

    await supersedePreviousGeneratedSigningDocuments({
      admin,
      dossierId: context.dossier.id,
      documentTypes: ["programme_formation", "convention_formation"],
    });

    const programHtml = buildNdaProgramDocumentHtml({
      kind: "final",
      version: latestProgramVersion,
      organisation: context.organisation,
      variables: context.variables,
      generatedAt,
    });

    const conventionHtml = buildNdaConventionDocumentHtml({
      context,
      generatedAt,
    });

    const basePath = `generated/${organisationId}/${context.dossier.id}`;

    const programDocument = await uploadAndCreateDocument({
      admin,
      html: programHtml,
      storagePath: `${basePath}/programme-formation-${filenameTitle}-${timestamp}.doc`,
      documentName: `Programme de formation - ${formationTitle}.doc`,
      documentType: "programme_formation",
      organisationId,
      dossierId: context.dossier.id,
      metadata: {
        generated_at: generatedAt.toISOString(),
        source_program_version_id: latestProgramVersion.id,
        source_program_version_type: latestProgramVersion.version_type,
        document_family: "nda_signing_documents",
        action_required: "signature_client",
        kind: "final_program",
      },
    });

    const conventionDocument = await uploadAndCreateDocument({
      admin,
      html: conventionHtml,
      storagePath: `${basePath}/convention-formation-${filenameTitle}-${timestamp}.doc`,
      documentName: `Convention de formation - ${formationTitle}.doc`,
      documentType: "convention_formation",
      organisationId,
      dossierId: context.dossier.id,
      metadata: {
        generated_at: generatedAt.toISOString(),
        source_program_version_id: latestProgramVersion.id,
        source_program_version_type: latestProgramVersion.version_type,
        document_family: "nda_signing_documents",
        action_required: "signature_client",
        kind: "convention",
      },
    });

    await syncNdaDossierStatus({
      admin,
      dossierId: context.dossier.id,
      currentStatus: context.dossier.status,
      targetStatus: "waiting_client",
    });

    await notifyClientVisibleDocuments({
      dossierId: context.dossier.id,
      organisation: context.organisation,
      subject: "Vos documents NDA sont disponibles",
      message:
        "Vos documents à signer sont maintenant disponibles dans votre espace client Selen. Vous pouvez les télécharger, les signer, puis déposer les documents signés directement dans votre dossier.",
    });

    return NextResponse.json({
      ok: true,
      documents: [programDocument, conventionDocument],
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
