import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isActiveDailyOrganisation } from "@/lib/server/dailyOrganisationScope";

function redirectTo(request: Request, organisationId: string) {
  return NextResponse.redirect(new URL(`/agent/daily/organisations/${organisationId}`, request.url), 303);
}

export async function POST(request: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const formData = await request.formData();
  const organisationId = String(formData.get("organisation_id") ?? "").trim();
  const requestedAgentProfileId = String(formData.get("agent_profile_id") ?? "").trim();
  if (!organisationId) {
    return NextResponse.json({ error: "Organisme manquant." }, { status: 400 });
  }
  if (!(await isActiveDailyOrganisation(organisationId))) {
    return NextResponse.json({ error: "Organisme Daily introuvable ou inactif." }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: adminUser, error: adminUserError }, { data: existing, error: existingError }] = await Promise.all([
    admin.from("agent_profiles").select("id,email,role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id").eq("organisation_id", organisationId).maybeSingle(),
  ]);

  const readError = profileError ?? adminUserError ?? existingError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const isAdmin = adminUser?.role === "admin" || profile?.role === "admin";

  let targetAgentProfileId: string;
  if (isAdmin) {
    targetAgentProfileId = requestedAgentProfileId;
    if (!targetAgentProfileId) {
      return NextResponse.json({ error: "Agent cible manquant." }, { status: 400 });
    }
  } else {
    if (!profile?.id || profile.role !== "agent") {
      return NextResponse.json({ error: "Profil agent actif requis pour prendre en charge un organisme." }, { status: 403 });
    }
    targetAgentProfileId = profile.id;

    if (requestedAgentProfileId && requestedAgentProfileId !== profile.id) {
      return NextResponse.json({ error: "Un agent ne peut assigner un organisme qu’à lui-même." }, { status: 403 });
    }
    if (existing && existing.agent_profile_id !== profile.id) {
      return NextResponse.json({ error: "Cet organisme est déjà assigné. Seul un administrateur peut le réassigner." }, { status: 403 });
    }
    if (existing?.agent_profile_id === profile.id) return redirectTo(request, organisationId);
  }

  const { data: target, error: targetError } = await admin
    .from("agent_profiles")
    .select("id,role,is_active")
    .eq("id", targetAgentProfileId)
    .eq("is_active", true)
    .in("role", ["agent", "admin"])
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Agent cible inéligible." }, { status: 400 });

  const now = new Date().toISOString();
  const { error: writeError } = await admin.from("daily_organisation_assignments").upsert({
    organisation_id: organisationId,
    agent_profile_id: targetAgentProfileId,
    assigned_by: auth.userId,
    assigned_at: now,
  }, { onConflict: "organisation_id" });
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

  return redirectTo(request, organisationId);
}
