import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createAgentNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

const SYSTEM_MESSAGE =
  "Le client a déposé ses documents finaux pour vérification du dossier NDA.";

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

function oneHourAgoIso() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";

    if (!dossierId) {
      return NextResponse.json(
        { ok: false, error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();
    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, type, status")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError) {
      return NextResponse.json(
        { ok: false, error: dossierError.message },
        { status: 500 },
      );
    }

    if (!dossier) {
      return NextResponse.json(
        { ok: false, error: "dossier_not_found" },
        { status: 404 },
      );
    }

    if (dossier.type !== "nda") {
      return NextResponse.json(
        { ok: false, error: "not_nda_dossier" },
        { status: 400 },
      );
    }

    const { data: recentMessage } = await supabase
      .from("messages")
      .select("id")
      .eq("dossier_id", dossierId)
      .eq("sender_type", "client")
      .eq("content", SYSTEM_MESSAGE)
      .gte("created_at", oneHourAgoIso())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let messageId = recentMessage?.id ?? null;

    if (!messageId) {
      const { data: insertedMessage, error: messageError } = await supabase
        .from("messages")
        .insert({
          dossier_id: dossierId,
          content: SYSTEM_MESSAGE,
          sender_type: "client",
          read_by_client_at: new Date().toISOString(),
          read_by_agent_at: null,
        })
        .select("id")
        .single();

      if (messageError || !insertedMessage) {
        return NextResponse.json(
          {
            ok: false,
            error: messageError?.message ?? "message_not_created",
          },
          { status: 500 },
        );
      }

      messageId = insertedMessage.id;

      await createAgentNotification({
        supabase,
        dossierId,
        type: "client_submitted_nda_final_documents",
        title: "Documents finaux NDA déposés",
        content: SYSTEM_MESSAGE,
        sourceMessageId: messageId,
      });
    }

    if (dossier.status !== "archived" && dossier.status !== "compliant") {
      const { error: statusError } = await supabase
        .from("dossiers")
        .update({
          status: "under_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", dossierId);

      if (statusError) {
        return NextResponse.json(
          { ok: false, error: statusError.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      messageId,
      status: "under_review",
      deduped: Boolean(recentMessage?.id),
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
