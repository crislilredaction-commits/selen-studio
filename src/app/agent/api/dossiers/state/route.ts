import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireAgent() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return { ok: true as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("selen_admin_users")
    .select("id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (
    adminError ||
    !adminUser ||
    (adminUser.role !== "agent" && adminUser.role !== "admin")
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

export async function GET(req: Request) {
  const auth = await requireAgent();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dossierId = searchParams.get("dossierId")?.trim();

  if (!dossierId) {
    return NextResponse.json(
      { ok: false, error: "dossierId manquant." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: dossier, error } = await supabase
    .from("dossiers")
    .select("id, status, updated_at")
    .eq("id", dossierId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  if (!dossier) {
    return NextResponse.json(
      { ok: false, error: "dossier_not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    dossier: {
      id: dossier.id,
      status: dossier.status,
      updated_at: dossier.updated_at,
    },
  });
}
