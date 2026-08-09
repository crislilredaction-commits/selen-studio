import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

type NotificationRow = {
  id: string;
  target_role: string | null;
  target_user_id: string | null;
  target_agent_profile_id?: string | null;
  source_kind?: string | null;
  escalation_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

export async function GET() {
  try {
    const auth = await requireSupportAgent();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    // Refresh time-based certification reminders when the Studio notification
    // center is opened. This keeps 90/30-day alerts current without creating a
    // second scheduler solely for Daily.
    const { error: syncError } = await admin.rpc(
      "daily_sync_trainer_certification_notifications",
    );
    if (syncError && syncError.code !== "PGRST202") {
      console.error("Erreur synchronisation alertes certifications Daily:", syncError);
    }

    const [{ data: adminUser }, { data: agentProfile }] = await Promise.all([
      admin
        .from("selen_admin_users")
        .select("role,is_active")
        .eq("email", auth.email)
        .eq("is_active", true)
        .maybeSingle(),
      admin
        .from("agent_profiles")
        .select("id,user_id,email,role,is_active")
        .eq("email", auth.email)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const isAdmin = adminUser?.role === "admin" || agentProfile?.role === "admin";
    const currentAgentProfileId = agentProfile?.id ?? null;
    const now = Date.now();

    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const visible = ((data ?? []) as NotificationRow[])
      .filter((item) => {
        const isDaily =
          item.source_kind === "daily_checklist" ||
          item.source_kind === "daily_trainer_certification";

        if (isDaily) {
          if (
            currentAgentProfileId &&
            item.target_agent_profile_id === currentAgentProfileId
          ) {
            return true;
          }

          if (!isAdmin) return false;

          if (item.target_role === "admin" && !item.target_agent_profile_id) {
            return true;
          }

          return Boolean(
            item.source_kind === "daily_checklist" &&
              item.escalation_at &&
              new Date(item.escalation_at).getTime() <= now,
          );
        }

        // Preserve the historical Studio behavior for notifications that are
        // not part of Daily, while respecting explicitly targeted messages.
        if (item.target_user_id === user.id) return true;
        if (item.target_user_id) return false;
        if (item.target_role === "admin") return isAdmin;
        return true;
      })
      .slice(0, 30);

    return NextResponse.json({ items: visible });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
