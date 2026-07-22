import { NextResponse } from "next/server";
import { isOwnerLil } from "@/lib/ownerLil";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type StudioRole = "agent" | "admin";

function forbiddenResponse(status: 401 | 403) {
  return NextResponse.json(
    { ok: false, error: status === 401 ? "unauthorized" : "forbidden" },
    { status },
  );
}

function isStudioRole(value: unknown): value is StudioRole {
  return value === "agent" || value === "admin";
}

export async function requireStudioAgent() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return {
      ok: true as const,
      userId: null as string | null,
      email: "local-dev-agent@selen.local",
      role: "admin" as const,
    };
  }

  const sessionClient = await createSessionClient();
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser();

  const email = user?.email?.trim().toLowerCase() ?? null;

  if (error || !user?.id || !email) {
    return {
      ok: false as const,
      response: forbiddenResponse(401),
    };
  }

  if (isOwnerLil(email)) {
    return {
      ok: true as const,
      userId: user.id,
      email,
      role: "admin" as const,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: adminUser, error: adminError } = await admin
    .from("selen_admin_users")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "access_check_failed" },
        { status: 500 },
      ),
    };
  }

  if (adminUser && isStudioRole(adminUser.role)) {
    return {
      ok: true as const,
      userId: user.id,
      email,
      role: adminUser.role,
    };
  }

  const { data: profile, error: profileError } = await admin
    .from("agent_profiles")
    .select("role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "access_check_failed" },
        { status: 500 },
      ),
    };
  }

  if (!profile || !isStudioRole(profile.role)) {
    return {
      ok: false as const,
      response: forbiddenResponse(403),
    };
  }

  return {
    ok: true as const,
    userId: user.id,
    email,
    role: profile.role,
  };
}

export async function requireStudioAdmin() {
  const auth = await requireStudioAgent();

  if (!auth.ok) {
    return auth;
  }

  if (auth.role !== "admin") {
    return {
      ok: false as const,
      response: forbiddenResponse(403),
    };
  }

  return auth;
}
