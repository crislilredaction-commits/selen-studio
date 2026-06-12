import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { createAgentNotification } from "@/lib/server/notifications";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function getVitrineBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_VITRINE_URL ??
    process.env.NEXT_PUBLIC_CLIENT_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function getClientPathForDossier(type?: string | null, id?: string | null) {
  if (type === "preaudit") return "/client";
  if (type === "review" || type === "audit_blanc") return "/client/audit-blanc";
  return `/client/dossier/${id ?? ""}`;
}

export async function POST(req: Request) {
  try {
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
      .select("id")
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

      if (dossier?.organisation_id && resend) {
        const { data: organisation } = await supabase
          .from("organisations")
          .select("email, name")
          .eq("id", dossier.organisation_id)
          .single();

        if (organisation?.email) {
          const clientUrl = `${getVitrineBaseUrl()}${getClientPathForDossier(
            dossier.type,
            dossier.id,
          )}`;

          await resend.emails.send({
            from: "Selen ✨ <hello@selen-editions.fr>",
            to: organisation.email,
            subject: "Nouveau message concernant votre dossier",
            html: `
              <p>Bonjour,</p>
              <p>Votre agent vous a envoyé un message :</p>
              <p><strong>${content}</strong></p>
              <p>
                👉 <a href="${clientUrl}">
                  Accéder à mon dossier
                </a>
              </p>
            `,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
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
