import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createAgentNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = [
  "submitted",
  "refusal_received",
  "nda_obtained",
] as const;

type DepositEvent = (typeof ALLOWED_EVENTS)[number];

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

function isDepositEvent(value: unknown): value is DepositEvent {
  return (
    typeof value === "string" &&
    ALLOWED_EVENTS.includes(value as DepositEvent)
  );
}

function getEventPayload(event: DepositEvent, now: string) {
  if (event === "submitted") {
    return {
      values: {
        nda_deposit_status: "dreets_pending",
        nda_deposit_submitted_at: now,
      },
      message:
        "Le client a indiqué avoir déposé son dossier sur la plateforme officielle. Le dossier est maintenant en attente du retour DREETS.",
      notificationTitle: "Dossier NDA déposé officiellement",
      dossierStatus: "compliant" as const,
    };
  }

  if (event === "refusal_received") {
    return {
      values: {
        nda_deposit_status: "refusal_received",
        nda_deposit_refusal_received_at: now,
      },
      message: "Le client a déposé un courrier de refus DREETS pour étude.",
      notificationTitle: "Courrier de refus DREETS reçu",
      dossierStatus: "under_review" as const,
    };
  }

  return {
    values: {
      nda_deposit_status: "nda_obtained",
      nda_obtained_at: now,
    },
    message:
      "Le NDA a été signalé comme obtenu. Le dossier peut être préparé pour clôture.",
    notificationTitle: "NDA obtenu",
    dossierStatus: "compliant" as const,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";

    if (!dossierId || !isDepositEvent(body?.event)) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const { data: dossier, error: dossierError } = await admin
      .from("dossiers")
      .select("id, type, organisation_id, status")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { ok: false, error: dossierError?.message ?? "dossier_not_found" },
        { status: dossierError ? 500 : 404 },
      );
    }

    if (dossier.type !== "nda") {
      return NextResponse.json(
        { ok: false, error: "not_nda_dossier" },
        { status: 400 },
      );
    }

    if (!dossier.organisation_id) {
      return NextResponse.json(
        { ok: false, error: "missing_organisation" },
        { status: 422 },
      );
    }

    const now = new Date().toISOString();
    const payload = getEventPayload(body.event, now);

    const { error: variablesError } = await admin.from("nda_variables").upsert(
      {
        dossier_id: dossierId,
        organisation_id: dossier.organisation_id,
        ...payload.values,
      },
      { onConflict: "dossier_id" },
    );

    if (variablesError) {
      return NextResponse.json(
        { ok: false, error: variablesError.message },
        { status: 500 },
      );
    }

    if (dossier.status !== "archived") {
      const { error: statusError } = await admin
        .from("dossiers")
        .update({
          status: payload.dossierStatus,
          updated_at: now,
        })
        .eq("id", dossierId);

      if (statusError) {
        return NextResponse.json(
          { ok: false, error: statusError.message },
          { status: 500 },
        );
      }
    }

    const { data: insertedMessage, error: messageError } = await admin
      .from("messages")
      .insert({
        dossier_id: dossierId,
        content: payload.message,
        sender_type: "client",
        read_by_client_at: now,
        read_by_agent_at: null,
      })
      .select("id")
      .single();

    if (messageError) {
      console.error("Message suivi dépôt NDA non créé.", messageError);
    }

    await createAgentNotification({
      supabase: admin,
      dossierId,
      type: "client_submitted_nda_final_documents",
      title: payload.notificationTitle,
      content: payload.message,
      sourceMessageId: insertedMessage?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      status: payload.dossierStatus,
      depositStatus: payload.values.nda_deposit_status,
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
