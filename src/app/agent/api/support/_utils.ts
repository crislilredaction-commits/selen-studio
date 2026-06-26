import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";

export async function requireSupportAgent() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim().toLowerCase();

  if (!email) return { ok: false as const, error: "Non authentifie.", status: 401 };

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
    return { ok: false as const, error: "Acces agent requis.", status: 403 };
  }

  return { ok: true as const, email };
}

export async function requireSupportAdmin() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: adminUser } = await supabase
    .from("selen_admin_users")
    .select("role, is_active")
    .eq("email", auth.email)
    .eq("is_active", true)
    .maybeSingle();

  if (adminUser?.role === "admin") return auth;

  const { data: profile, error } = await supabase
    .from("agent_profiles")
    .select("role, is_active")
    .eq("email", auth.email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message, status: 500 };
  if (profile?.role !== "admin") {
    return {
      ok: false as const,
      error: "Action reservee aux administrateurs Studio.",
      status: 403,
    };
  }

  return auth;
}

export async function requireLilOwner() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return auth;

  if (!isOwnerLil(auth.email)) {
    return {
      ok: false as const,
      error: "Acces reserve au compte proprietaire Selen.",
      status: 403,
    };
  }

  return auth;
}

export async function isActiveSupportAgentEmail(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: true as const, error: null };

  const { data, error } = await supabase
    .from("agent_profiles")
    .select("email")
    .eq("email", normalized)
    .eq("is_active", true)
    .in("role", ["agent", "admin"])
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  return { ok: Boolean(data), error: data ? null : "Agent traitant invalide." };
}
