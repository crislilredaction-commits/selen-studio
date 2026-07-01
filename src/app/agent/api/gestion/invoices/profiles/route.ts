import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function GET(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const admin = createSupabaseAdminClient();
  const request = admin
    .from("lil_billing_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);

  const { data, error } = query
    ? await request.ilike("name", `%${query}%`)
    : await request;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profiles: data ?? [] });
}
