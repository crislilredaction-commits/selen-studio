import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["", "CDD", "CDI", "bénévole", "associé"]);

type InterneRow = {
  nom_prenom?: string;
  date_embauche?: string;
  statut?: string;
  titres_experience?: string;
};

type SoustraitantRow = {
  nom_prenom?: string;
  organisme_nom?: string;
  adresse?: string;
  titres_experience?: string;
};

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

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function cleanTextForJson(value: unknown) {
  return cleanText(value) ?? "";
}

function normalizeInternes(value: unknown): InterneRow[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 5).map((row) => {
    const source = row && typeof row === "object" ? row : {};
    const statut = cleanTextForJson((source as InterneRow).statut);

    return {
      nom_prenom: cleanTextForJson((source as InterneRow).nom_prenom),
      date_embauche: cleanTextForJson((source as InterneRow).date_embauche),
      statut: ALLOWED_STATUSES.has(statut) ? statut : "",
      titres_experience: cleanTextForJson(
        (source as InterneRow).titres_experience,
      ),
    };
  });
}

function normalizeSoustraitants(value: unknown): SoustraitantRow[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 5).map((row) => {
    const source = row && typeof row === "object" ? row : {};

    return {
      nom_prenom: cleanTextForJson((source as SoustraitantRow).nom_prenom),
      organisme_nom: cleanTextForJson(
        (source as SoustraitantRow).organisme_nom,
      ),
      adresse: cleanTextForJson((source as SoustraitantRow).adresse),
      titres_experience: cleanTextForJson(
        (source as SoustraitantRow).titres_experience,
      ),
    };
  });
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAgent();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";

    if (!dossierId) {
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

    const { data: variables, error: upsertError } = await admin
      .from("nda_variables")
      .upsert(
        {
          dossier_id: dossierId,
          organisation_id: dossier.organisation_id,
          liste_formateurs_internes: normalizeInternes(body?.internes),
          liste_formateurs_soustraitants: normalizeSoustraitants(
            body?.soustraitants,
          ),
          liste_formateurs_dirigeant_resume: cleanText(
            body?.dirigeant_resume,
          ),
          liste_formateurs_fait_a: cleanText(body?.fait_a),
          liste_formateurs_date_signature: cleanText(body?.date_signature),
          liste_formateurs_nom_signataire: cleanText(body?.nom_signataire),
          liste_formateurs_qualite_signataire: cleanText(
            body?.qualite_signataire,
          ),
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
