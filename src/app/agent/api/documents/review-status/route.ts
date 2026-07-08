import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  getNdaAgentWorkflowState,
  syncNdaDossierStatus,
} from "@/lib/server/ndaAgentWorkflow";
import { hasNdaProgramDocumentContent } from "@/lib/server/ndaProgramDocumentHtml";
import { notifyClientVisibleDocuments } from "@/lib/server/notifyClientVisibleDocuments";

export const dynamic = "force-dynamic";

const ALLOWED_REVIEW_STATUSES = [
  "not_reviewed",
  "validated",
  "to_correct",
] as const;

type AllowedReviewStatus = (typeof ALLOWED_REVIEW_STATUSES)[number];

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

function isAllowedReviewStatus(value: unknown): value is AllowedReviewStatus {
  return (
    typeof value === "string" &&
    ALLOWED_REVIEW_STATUSES.includes(value as AllowedReviewStatus)
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function requireAgent() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return { ok: true as const, userId: null as string | null };
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
    .select("id, user_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `Impossible de vérifier les droits agent. ${adminError.message}` },
        { status: 500 },
      ),
    };
  }

  if (!adminUser) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Accès agent non autorisé." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, userId: user.id };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAgent();
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const documentId = body?.documentId;
    const reviewStatus = body?.reviewStatus;
    const clientVisible =
      typeof body?.clientVisible === "boolean" ? body.clientVisible : null;
    const sendToClient = body?.sendToClient === true;
    const rawNotes = body?.notes;

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json(
        { error: "documentId manquant ou invalide." },
        { status: 400 },
      );
    }

    if (
      clientVisible === null &&
      !sendToClient &&
      !isAllowedReviewStatus(reviewStatus)
    ) {
      return NextResponse.json(
        { error: "reviewStatus invalide." },
        { status: 400 },
      );
    }

    if (sendToClient) {
      const admin = getAdminClient();
      const now = new Date().toISOString();
      const { error } = await admin
        .from("documents")
        .update({
          review_status: "pending_client",
          is_visible_to_client: true,
          visible_to_client_at: now,
          requires_client_action: true,
        })
        .eq("id", documentId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (clientVisible !== null) {
      const admin = getAdminClient();
      const now = new Date().toISOString();
      const { error } = await admin
        .from("documents")
        .update({
          is_visible_to_client: clientVisible,
          visible_to_client_at: clientVisible ? now : null,
          requires_client_action: false,
        })
        .eq("id", documentId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    const notes =
      typeof rawNotes === "string" ? rawNotes.trim() : undefined;

    const updatePayload: Record<string, unknown> = {
      review_status: reviewStatus,
    };

    if (notes !== undefined) {
      updatePayload.notes = notes.length > 0 ? notes : null;
    }

    if (reviewStatus === "validated") {
      updatePayload.validated_at = new Date().toISOString();
      updatePayload.validated_by =
        auth.userId && isUuid(auth.userId) ? auth.userId : null;
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("documents")
      .update(updatePayload)
      .eq("id", documentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      const { data: document } = await admin
        .from("documents")
        .select("dossier_id")
        .eq("id", documentId)
        .maybeSingle();

      if (document?.dossier_id) {
        const { data: dossier } = await admin
          .from("dossiers")
          .select(
            `
            id,
            type,
            status,
            organisations:organisation_id (
              name,
              email
            )
          `,
          )
          .eq("id", document.dossier_id)
          .maybeSingle();

        if (dossier?.type === "nda") {
          const [
            { data: documents },
            { data: variables },
            { data: versions },
          ] = await Promise.all([
            admin
              .from("documents")
              .select(
                "id, document_type, document_role, review_status, status, source, is_visible_to_client, requires_client_action",
              )
              .eq("dossier_id", dossier.id),
            admin
              .from("nda_variables")
              .select("*")
              .eq("dossier_id", dossier.id)
              .maybeSingle(),
            admin
              .from("dossier_program_versions")
              .select("*")
              .eq("dossier_id", dossier.id)
              .order("created_at", { ascending: false })
              .limit(30),
          ]);

          const workflowState = getNdaAgentWorkflowState({
            documents: documents ?? [],
            variables: variables ?? null,
            latestProgramVersion:
              (versions ?? []).find(hasNdaProgramDocumentContent) ?? null,
          });

          await syncNdaDossierStatus({
            admin,
            dossierId: dossier.id,
            currentStatus: dossier.status,
            targetStatus: workflowState.targetDossierStatus,
          });

          if (
            workflowState.targetDossierStatus === "compliant" &&
            dossier.status !== "compliant"
          ) {
            const organisationRaw = Array.isArray(dossier.organisations)
              ? dossier.organisations[0]
              : dossier.organisations;

            await notifyClientVisibleDocuments({
              dossierId: dossier.id,
              dossierType: "nda",
              organisation: organisationRaw ?? null,
              subject: "Votre dossier NDA est prêt à être déposé",
              message:
                "Votre dossier NDA est prêt pour le dépôt. Les documents vérifiés par Selen sont disponibles dans votre espace client, avec la procédure à suivre sur la plateforme officielle.",
            }).catch((emailError) => {
              console.error(
                "Notification client dossier NDA prêt au dépôt échouée.",
                emailError,
              );
            });
          }
        }
      }
    } catch (syncError) {
      console.error("NDA status sync after document review failed:", syncError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
