import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";

export async function getStudioStaffRole() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return { role: "admin" as const, email: "local-dev-agent@selen.local" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const email = authData.user?.email?.trim().toLowerCase();
  if (!email) return { role: "agent" as const, email: null };

  const { data: adminUser } = await supabase
    .from("selen_admin_users")
    .select("role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (adminUser?.role === "admin") return { role: "admin" as const, email };

  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  return {
    role: profile?.role === "admin" ? ("admin" as const) : ("agent" as const),
    email,
  };
}

export async function isStudioAdmin() {
  const staff = await getStudioStaffRole();
  return staff.role === "admin";
}

export async function isLilOwner() {
  const staff = await getStudioStaffRole();
  return isOwnerLil(staff.email);
}
