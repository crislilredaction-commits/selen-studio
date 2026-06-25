import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

async function requireAgent() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim().toLowerCase();

  if (!email) return { ok: false as const, error: "Non authentifié.", status: 401 };

  const { data: adminUser } = await supabase
    .from("selen_admin_users")
    .select("role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (adminUser && ["agent", "admin"].includes(adminUser.role)) {
    return { ok: true as const, email };
  }

  const { data: profile, error } = await supabase
    .from("agent_profiles")
    .select("role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message, status: 500 };
  if (!profile || !["agent", "admin"].includes(profile.role)) {
    return { ok: false as const, error: "Accès agent requis.", status: 403 };
  }

  return { ok: true as const, email };
}

export async function POST(req: Request) {
  const auth = await requireAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { ticketId, note } = await req.json();
    const cleanTicketId = String(ticketId ?? "").trim();
    const cleanNote = String(note ?? "").trim();

    if (!cleanTicketId || !cleanNote) {
      return NextResponse.json(
        { error: "ticketId et note sont requis." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("support_notes").insert({
      ticket_id: cleanTicketId,
      agent_email: auth.email,
      note: cleanNote,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Ajout note support échoué.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}

