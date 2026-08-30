import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const SLA_MS = 72 * 60 * 60 * 1000;

type DailyTaskAuthorizationInput = {
  organisationId: string;
  signaledAt?: string | null;
};

export async function requireDailyTaskAction(input: DailyTaskAuthorizationInput) {
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  if (!input.organisationId) throw new Error("Organisme Daily introuvable.");

  const admin = createSupabaseAdminClient();
  const email = auth.email.trim().toLowerCase();
  const [{ data: adminUser }, { data: agentProfile }, { data: assignment }] = await Promise.all([
    admin
      .from("selen_admin_users")
      .select("role,is_active")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("agent_profiles")
      .select("id,role,is_active")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("daily_organisation_assignments")
      .select("agent_profile_id")
      .eq("organisation_id", input.organisationId)
      .maybeSingle(),
  ]);

  if (adminUser?.role === "admin" || agentProfile?.role === "admin") {
    return { ...auth, agentProfileId: agentProfile?.id ?? null, role: "admin" as const, overdueShared: false };
  }
  if (!agentProfile || agentProfile.role !== "agent") {
    throw new Error("Agent Daily actif requis.");
  }
  if (assignment?.agent_profile_id === agentProfile.id) {
    return { ...auth, agentProfileId: agentProfile.id, role: "agent" as const, overdueShared: false };
  }

  const signaledAt = input.signaledAt ? new Date(input.signaledAt).getTime() : Number.NaN;
  const overdueShared = Number.isFinite(signaledAt) && Date.now() - signaledAt >= SLA_MS;
  if (overdueShared) {
    return { ...auth, agentProfileId: agentProfile.id, role: "agent" as const, overdueShared: true };
  }

  if (!assignment) {
    throw new Error("Cet organisme doit d’abord être assigné à un agent.");
  }
  throw new Error("Cette tâche appartient encore à l’agent assigné à l’organisme. Elle sera partageable après 72 h si elle reste non traitée.");
}
