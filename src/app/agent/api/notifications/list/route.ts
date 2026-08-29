import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

type NotificationRow = {
  id: string;
  type: string | null;
  source_kind?: string | null;
  target_role: string | null;
  target_user_id: string | null;
  dismissed_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

function isMessagingItem(item: NotificationRow) {
  const source = `${item.source_kind ?? ""} ${item.type ?? ""}`.toLowerCase();
  return source.includes("message") || source.includes("reply") || source.includes("support");
}

export async function GET() {
  try {
    const auth = await requireSupportAgent();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const [{ data: adminUser }, { data: agentProfile }] = await Promise.all([
      admin.from("selen_admin_users").select("role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
      admin.from("agent_profiles").select("id,user_id,email,role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    ]);

    const isAdmin = adminUser?.role === "admin" || agentProfile?.role === "admin";
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const visible = ((data ?? []) as NotificationRow[])
      .filter(isMessagingItem)
      .filter((item) => {
        if (item.target_user_id === user.id) return true;
        if (item.target_user_id) return false;
        if (item.target_role === "admin") return isAdmin;
        return true;
      })
      .slice(0, 30);

    return NextResponse.json({ items: visible });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
