import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function requireAgent() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return { ok: true as const };
  }

  const sessionClient = await createSessionClient();
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser();

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  const admin = getAdminClient();
  const { data: adminUser, error: adminError } = await admin
    .from("selen_admin_users")
    .select("id, user_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 500 },
      ),
    };
  }

  if (
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

export async function POST(req: Request) {
  try {
    const auth = await requireAgent();

    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const documentId =
      typeof body?.documentId === "string"
        ? body.documentId
        : typeof body?.id === "string"
          ? body.id
          : "";

    if (!documentId.trim()) {
      return NextResponse.json(
        { ok: false, error: "document_not_found" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const { data: doc, error: fetchError } = await admin
      .from("documents")
      .select(
        "id, name, storage_path, dossier_id, organisation_id, source, document_role, review_status, document_type",
      )
      .eq("id", documentId.trim())
      .maybeSingle();

    if (fetchError || !doc) {
      return NextResponse.json(
        { ok: false, error: "document_not_found" },
        { status: 404 },
      );
    }

    const storagePath = String(doc.storage_path ?? "").trim();

    if (!storagePath) {
      return NextResponse.json(
        { ok: false, error: "missing_storage_path" },
        { status: 422 },
      );
    }

    const { data, error } = await admin.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 10);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: "signed_url_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (error) {
    console.error("OPEN DOCUMENT ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "signed_url_failed" },
      { status: 500 },
    );
  }
}
