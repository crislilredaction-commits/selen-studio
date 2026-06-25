import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateClientReminders } from "@/lib/server/clientReminders";

async function requireAgent() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim().toLowerCase();

  if (userError || !userData.user || !email) {
    return { ok: false as const, error: "Non authentifié.", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("agent_profiles")
    .select("id, email, role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (profileError) {
    return { ok: false as const, error: profileError.message, status: 500 };
  }

  if (!profile || !["agent", "admin"].includes(profile.role)) {
    return { ok: false as const, error: "Accès agent requis.", status: 403 };
  }

  return { ok: true as const, email };
}

export async function POST() {
  const auth = await requireAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await generateClientReminders();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Génération relances clients échouée.", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant la génération.",
      },
      { status: 500 },
    );
  }
}

