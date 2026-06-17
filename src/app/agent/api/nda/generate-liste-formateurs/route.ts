import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { getNdaDocumentContext } from "@/lib/server/ndaDocumentContext";
import {
  buildNdaListeFormateursDocumentDocx,
  getNdaListeFormateursGenerationReadiness,
  NDA_LISTE_FORMATEURS_GENERATED_MODEL,
} from "@/lib/server/ndaListeFormateursDocumentDocx";
import { notifyClientVisibleDocuments } from "@/lib/server/notifyClientVisibleDocuments";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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
    .select("id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (
    adminError ||
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

function formatTemplateError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inconnue.";

  const details =
    typeof error === "object" && error !== null && "properties" in error
      ? (
          error as {
            properties?: {
              errors?: Array<{
                message?: string;
                properties?: Record<string, unknown>;
              }>;
            };
          }
        ).properties?.errors?.map((templateError) => ({
          message: templateError.message ?? "Erreur de modèle Word.",
          id: templateError.properties?.id,
          explanation: templateError.properties?.explanation,
          xtag: templateError.properties?.xtag,
          context: templateError.properties?.context,
          offset: templateError.properties?.offset,
        }))
      : undefined;

  return {
    message,
    details: details ?? [],
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAgent();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";

    if (!dossierId) {
      return NextResponse.json(
        { ok: false, error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const context = await getNdaDocumentContext(dossierId);

    if (!context.dossier.organisation_id) {
      return NextResponse.json(
        { ok: false, error: "missing_organisation" },
        { status: 422 },
      );
    }

    const readiness = getNdaListeFormateursGenerationReadiness(context);
    if (!readiness.ok) {
      return NextResponse.json({ ...readiness }, { status: 422 });
    }

    const admin = getAdminClient();
    const generatedAt = new Date();
    const timestamp = generatedAt
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    const organisationId = context.dossier.organisation_id;
    const filenameTitle =
      safeFilename(context.variables?.intitule_formation ?? "") || "formation";
    const storagePath = `generated/${organisationId}/${context.dossier.id}/liste-formateurs-dreets-${filenameTitle}-${timestamp}.docx`;

    const fileBuffer = buildNdaListeFormateursDocumentDocx(context);

    const { error: supersedeError } = await admin
      .from("documents")
      .update({
        review_status: "superseded",
        requires_client_action: false,
        is_visible_to_client: false,
      })
      .eq("dossier_id", context.dossier.id)
      .eq("document_type", "liste_formateurs")
      .eq("document_role", "client_to_complete")
      .eq("generated_from_model", NDA_LISTE_FORMATEURS_GENERATED_MODEL);

    if (supersedeError) {
      throw new Error(`Database: ${supersedeError.message}`);
    }

    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage: ${uploadError.message}`);
    }

    const { data: insertedDocument, error: insertError } = await admin
      .from("documents")
      .insert({
        name: "Liste des formateurs DREETS.docx",
        document_type: "liste_formateurs",
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
        generated_from_model: NDA_LISTE_FORMATEURS_GENERATED_MODEL,
        metadata: {
          generated_at: generatedAt.toISOString(),
          document_family: "nda_signing_documents",
          action_required: "signature_client",
          kind: "liste_formateurs_dreets",
        },
      })
      .select("id, name, document_type, storage_path")
      .single();

    if (insertError || !insertedDocument) {
      throw new Error(
        `Database: ${insertError?.message ?? "document non créé"}`,
      );
    }

    let emailNotification = { sent: false };

    try {
      const {
        data: signingDocumentsForEmail,
        error: signingDocumentsEmailError,
      } = await admin
        .from("documents")
        .select("id, document_type")
        .eq("dossier_id", context.dossier.id)
        .eq("document_role", "client_to_complete")
        .eq("is_visible_to_client", true)
        .eq("requires_client_action", true)
        .in("document_type", ["programme_formation", "convention_formation"]);

      if (signingDocumentsEmailError) {
        console.warn(
          "Vérification des documents à signer impossible avant notification.",
          signingDocumentsEmailError,
        );
      }

      const signingTypes = new Set(
        (signingDocumentsForEmail ?? []).map((doc) => doc.document_type),
      );

      const hasProgrammeAndConvention =
        signingTypes.has("programme_formation") &&
        signingTypes.has("convention_formation");

      if (hasProgrammeAndConvention) {
        emailNotification = await notifyClientVisibleDocuments({
          dossierId: context.dossier.id,
          dossierType: "nda",
          organisation: context.organisation,
          subject: "Vos documents NDA à signer sont prêts",
          message:
            "Vos documents NDA à signer sont maintenant disponibles dans votre espace client Selen : programme de formation, convention de formation et liste des formateurs DREETS. Vous pouvez les télécharger, les signer ou tamponner si nécessaire, puis déposer les documents signés et les pièces finales directement dans l’espace prévu.",
        });
      } else {
        console.warn(
          "Notification NDA non envoyée : programme et convention ne sont pas encore tous les deux disponibles.",
          {
            dossierId: context.dossier.id,
            hasProgramme: signingTypes.has("programme_formation"),
            hasConvention: signingTypes.has("convention_formation"),
          },
        );
      }
    } catch (emailError) {
      console.error(
        "Notification client après préparation de la liste des formateurs échouée.",
        emailError,
      );
    }

    return NextResponse.json({
      ok: true,
      document: insertedDocument,
      storagePath,
      emailNotification,
    });
  } catch (error) {
    const formattedError = formatTemplateError(error);

    console.error("Erreur génération liste formateurs DREETS", {
      error: formattedError.message,
      details: formattedError.details,
    });

    return NextResponse.json(
      {
        ok: false,
        error: formattedError.message,
        details: formattedError.details,
      },
      { status: 500 },
    );
  }
}
