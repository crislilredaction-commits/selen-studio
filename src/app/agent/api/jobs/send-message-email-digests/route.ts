import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!resend) {
      return NextResponse.json({ success: true, skipped: "no resend key" });
    }

    const supabase = await createClient();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: pending, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("type", "client_message")
      .is("read_at", null)
      .is("dismissed_at", null)
      .is("email_sent_at", null)
      .lte("created_at", tenMinutesAgo);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const notif of pending ?? []) {
      const { data: recentlySent } = await supabase
        .from("notifications")
        .select("id")
        .eq("dossier_id", notif.dossier_id)
        .eq("type", "client_message")
        .gte("email_sent_at", twoHoursAgo)
        .limit(1);

      if ((recentlySent ?? []).length > 0) continue;

      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", notif.target_user_id)
        .maybeSingle();

      if (!profile?.email) continue;

      await resend.emails.send({
        from: "Selen ✨ <hello@selen-editions.fr>",
        to: profile.email,
        subject: notif.title ?? "Nouveau message client",
        html: `
          <p>Bonjour,</p>
          <p><strong>${notif.organisation_name ?? "Un client"}</strong> a écrit dans le dossier <strong>${notif.dossier_title ?? "Dossier"}</strong>.</p>
          <p>${notif.content ?? ""}</p>
          <p>
            👉 <a href="${process.env.NEXT_PUBLIC_APP_URL}${notif.link_path ?? "/agent/dossiers"}">
              Ouvrir le dossier
            </a>
          </p>
        `,
      });

      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", notif.id);
    }

    return NextResponse.json({
      success: true,
      processed: pending?.length ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
