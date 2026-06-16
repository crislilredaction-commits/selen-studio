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
        { success: false, error: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  const admin = getAdminClient();

  const { data: adminUser, error: adminError } = await admin
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
        { success: false, error: "unauthorized" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

function normalizeText(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export async function POST(req: Request) {
  try {
    const auth = await requireAgent();

    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);

    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";

    if (!dossierId) {
      return NextResponse.json(
        { success: false, error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const { data: dossier, error: dossierError } = await admin
      .from("dossiers")
      .select("id, type")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError) {
      return NextResponse.json(
        { success: false, error: dossierError.message },
        { status: 500 },
      );
    }

    if (!dossier) {
      return NextResponse.json(
        { success: false, error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const payload = {
      source_analysis_id: normalizeText(body?.sourceAnalysisId),
      version_type: "agent_draft",
      status: "draft",
      title: normalizeText(body?.title),
      target_audience: normalizeText(body?.targetAudience),
      overall_objective: normalizeText(body?.overallObjective),
      recommended_positioning: normalizeText(body?.recommendedPositioning),
      justification: normalizeText(body?.justification),
      agent_comment: normalizeText(body?.agentComment),
      vigilance_points: normalizeArray(body?.vigilancePoints),
      modules: normalizeArray(body?.modules),
      updated_at: new Date().toISOString(),
    };

    const { data: latestDraft, error: latestDraftError } = await admin
      .from("dossier_program_versions")
      .select("id")
      .eq("dossier_id", dossierId)
      .eq("version_type", "agent_draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestDraftError) {
      return NextResponse.json(
        { success: false, error: latestDraftError.message },
        { status: 500 },
      );
    }

    if (latestDraft?.id) {
      const { data, error } = await admin
        .from("dossier_program_versions")
        .update(payload)
        .eq("id", latestDraft.id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        mode: "updated",
        version: data,
      });
    }

    const { data, error } = await admin
      .from("dossier_program_versions")
      .insert({
        dossier_id: dossierId,
        ...payload,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      mode: "inserted",
      version: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
