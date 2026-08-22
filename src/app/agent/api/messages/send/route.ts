import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAgentNotification } from "@/lib/server/notifications";
import { getVitrineClientUrl } from "@/lib/vitrineLinks";
import {
  renderSelenEmailFromText,
} from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export async function POST(req: Request) {
  try {
    const auth = await requireSupportAgent();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = await createClient();
    const { dossierId, content, senderType } = await req.json();

    if (!dossierId || !content) {
      return NextResponse.json(
        { error: "dossierId ou content manquant" },
        { status: 400 },
      );
    }

    if (senderType !== "agent" && senderType !== "client") {
      return NextResponse.json(
        { error: "senderType invalide" },
        { status: 400 },
      );
    }

    const payload =
      senderType === "client"
        ? {
            dossier_id: dossierId,
            content,
            sender_type: "client",
            read_by_client_at: new Date().toISOString(),
            read_by_agent_at: null,
          }
        : {
            dossier_id: dossierId,
            content,
            sender_type: "agent",
            read_by_agent_at: new Date().toISOString(),
            read_by_client_at: null,
          };

    const { data: insertedMessage, error: insertError } = await supabase
      .from("messages")
      .insert(payload)
      .select("id, content, sender_type, created_at")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (senderType === "client") {
      await createAgentNotification({
        supabase,
        dossierId,
        type: "client_message",
        title: "Nouveau message client",
        content,
        sourceMessageId: insertedMessage.id,
      });
    }

    if (senderType === "agent") {
      const { data: dossier } = await supabase
        .from("dossiers")
        .select("id, type, organisation_id")
        .eq("id", dossierId)
        .single();

      if (dossier?.organisation_id) {
        const { data: organisation } = await supabase
          .from("organisations")
          .select("email, name")
          .eq("id", dossier.organisation_id)
          .single();

        if (organisation?.email) {
          const clientUrl = getVitrineClientUrl(dossier.type, dossier.id);
          const rendered = renderSelenEmailFromText({
            title: "Nouveau message concernant votre dossier",
            bodyText: [
              "Bonjour,",
              "Votre agent vous a envoyé un message :",
              content,
            ].join("\n\n"),
            ctaLabel: "Accéder à mon dossier",
            ctaUrl: clientUrl,
          });

          const emailResult = await sendClientEmailWithSilence({
            supabase,
            organisationId: dossier.organisation_id,
            to: organisation.email,
            subject: "Nouveau message concernant votre dossier",
            html: rendered.html,
            text: rendered.text,
          });

          if (emailResult.paused) {
            return NextResponse.json(
              {
                success: false,
                message: insertedMessage,
                emailed: false,
                error: emailResult.error,
              },
              { status: 409 },
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: insertedMessage });
  } catch (error) {
    console.error("Erreur route messages/send:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
