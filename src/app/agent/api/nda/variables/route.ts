import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "client_nom",
  "client_siret",
  "client_adresse",
  "client_representant_prenom",
  "client_representant_nom",
  "stagiaire_prenom",
  "stagiaire_nom",
  "stagiaire_fonction",
  "stagiaire_adresse",
  "stagiaire_email",
  "stagiaire_telephone",
  "intitule_formation",
  "duree_formation",
  "modalite",
  "date_formation_prevue",
  "date_fin_formation",
  "lieu_formation",
  "tarif_formation",
  "prerequis_formation",
  "lieu_signature_convention",
  "date_signature_convention",
  "representant_prenom",
  "representant_nom",
  "formateur_prenom",
  "formateur_nom",
  "formateur_email",
  "nb_formateurs",
  "siret",
  "organisme_adresse",
  "region",
]);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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

function normalizeFieldValue(key: string, value: unknown) {
  if (key === "nb_formateurs") {
    if (value === "" || value === null || value === undefined) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  if (value === undefined) return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  return text === "" ? null : text;
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAgent();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";
    const values =
      body?.values && typeof body.values === "object"
        ? (body.values as Record<string, unknown>)
        : null;

    if (!dossierId || !values) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const { data: dossier, error: dossierError } = await admin
      .from("dossiers")
      .select("id, type, organisation_id")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { ok: false, error: "dossier_not_found" },
        { status: 404 },
      );
    }

    if (dossier.type !== "nda") {
      return NextResponse.json(
        { ok: false, error: "not_nda_dossier" },
        { status: 400 },
      );
    }

    if (!dossier.organisation_id) {
      return NextResponse.json(
        { ok: false, error: "missing_organisation" },
        { status: 422 },
      );
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      const normalizedValue = normalizeFieldValue(key, value);
      if (normalizedValue !== undefined) updates[key] = normalizedValue;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "no_allowed_fields" },
        { status: 400 },
      );
    }

    const { data: variables, error: upsertError } = await admin
      .from("nda_variables")
      .upsert(
        {
          dossier_id: dossierId,
          organisation_id: dossier.organisation_id,
          ...updates,
        },
        { onConflict: "dossier_id" },
      )
      .select("*")
      .single();

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, variables });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
