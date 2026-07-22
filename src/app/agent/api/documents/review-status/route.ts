import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireStudioAgent } from "@/lib/server/studioAuth";
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

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();
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

    const admin = createSupabaseAdminClient();
    const { data: document, error: documentError } = await admin
      .from("documents")
      .select("id, dossier_id, organisation_id")
      .eq("id", documentId)
      .maybeSingle();

    if (documentError) {
      return NextResponse.json({ error: documentError.message }, { status: 500 });
    }

    if (!document) {
      return NextResponse.json(
        { error: "Document introuvable." },
        { status: 404 },
      );
    }

    if (!document.dossier_id && !document.organisation_id) {
      return NextResponse.json(
        { error: "Document sans rattachement dossier ou organisation." },
        { status: 422 },
      );
    }

    if (document.dossier_id) {
      const { data: dossier, error: dossierError } = await admin
        .from("dossiers")
        .select("id")
        .eq("id", document.dossier_id)
        .maybeSingle();

      if (dossierError) {
        return NextResponse.json({ error: dossierError.message }, { status: 500 });
      }

      if (!dossier) {
        return NextResponse.json(
          { error: "Dossier rattache introuvable." },
          { status: 409 },
        );
      }
    }

    if (document.organisation_id) {
      const { data: organisation, error: organisationError } = await admin
        .from("organisations")
        .select("id")
        .eq("id", document.organisation_id)
        .maybeSingle();

      if (organisationError) {
        return NextResponse.json(
          { error: organisationError.message },
          { status: 500 },
        );
      }

      if (!organisation) {
        return NextResponse.json(
          { error: "Organisation rattachee introuvable." },
          { status: 409 },
        );
      }
    }

    if (sendToClient) {
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

    const notes = typeof rawNotes === "string" ? rawNotes.trim() : undefined;

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

    const { error } = await admin
      .from("documents")
      .update(updatePayload)
      .eq("id", documentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      if (document.dossier_id) {
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
