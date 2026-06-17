import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { notifyClientVisibleDocuments } from "@/lib/server/notifyClientVisibleDocuments";

export const dynamic = "force-dynamic";

const NDA_PHASE_KEYS = [
  "initial_reception",
  "program_analysis",
  "signing_documents",
  "final_return",
  "ready_for_deposit",
] as const;

type NdaPhaseKey = (typeof NDA_PHASE_KEYS)[number];

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

function isNdaPhaseKey(value: unknown): value is NdaPhaseKey {
  return (
    typeof value === "string" &&
    NDA_PHASE_KEYS.includes(value as NdaPhaseKey)
  );
}

async function requireAgent() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return {
      ok: true as const,
      userLabel: "dev-admin-bypass",
    };
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
    .select("id, role, is_active, user_id")
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

  return {
    ok: true as const,
    userLabel: user.email ?? user.id,
  };
}

function normalizeValidations(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAgent();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const dossierId =
      typeof body?.dossierId === "string" ? body.dossierId.trim() : "";
    const action = body?.action;

    if (!dossierId || !isNdaPhaseKey(body?.phaseKey)) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload" },
        { status: 400 },
      );
    }

    if (action !== "validate" && action !== "reopen") {
      return NextResponse.json(
        { ok: false, error: "invalid_action" },
        { status: 400 },
      );
    }

    const phaseKey = body.phaseKey as NdaPhaseKey;
    const admin = getAdminClient();
    const { data: dossier, error: dossierError } = await admin
      .from("dossiers")
      .select(
        `
        id,
        type,
        status,
        organisation_id,
        organisations:organisation_id (
          name,
          email
        )
      `,
      )
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

    const { data: currentVariables, error: variablesError } = await admin
      .from("nda_variables")
      .select("nda_phase_validations")
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (variablesError) {
      return NextResponse.json(
        { ok: false, error: variablesError.message },
        { status: 500 },
      );
    }

    const validations = normalizeValidations(
      currentVariables?.nda_phase_validations,
    );

    if (action === "validate") {
      validations[phaseKey] = {
        validated_at: new Date().toISOString(),
        validated_by: auth.userLabel,
      };
    } else {
      const phaseIndex = NDA_PHASE_KEYS.indexOf(phaseKey);
      NDA_PHASE_KEYS.slice(phaseIndex).forEach((key) => {
        delete validations[key];
      });
    }

    const { data: variables, error: upsertError } = await admin
      .from("nda_variables")
      .upsert(
        {
          dossier_id: dossierId,
          organisation_id: dossier.organisation_id,
          nda_phase_validations: validations,
        },
        { onConflict: "dossier_id" },
      )
      .select("nda_phase_validations")
      .single();

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message },
        { status: 500 },
      );
    }

    if (
      action === "validate" &&
      phaseKey === "ready_for_deposit" &&
      dossier.status !== "compliant"
    ) {
      const { error: statusError } = await admin
        .from("dossiers")
        .update({
          status: "compliant",
          updated_at: new Date().toISOString(),
        })
        .eq("id", dossierId);

      if (statusError) {
        return NextResponse.json(
          { ok: false, error: statusError.message },
          { status: 500 },
        );
      }

      const organisationRaw = Array.isArray(dossier.organisations)
        ? dossier.organisations[0]
        : dossier.organisations;

      await notifyClientVisibleDocuments({
        dossierId,
        dossierType: "nda",
        organisation: organisationRaw ?? null,
        subject: "Votre dossier NDA est prêt à être déposé",
        message:
          "Votre dossier NDA a été vérifié par Selen. Vous pouvez maintenant accéder à votre espace client pour consulter la procédure de dépôt et récupérer les documents à déposer sur la plateforme officielle.",
      }).catch((emailError) => {
        console.error(
          "Notification client dossier NDA prêt au dépôt échouée.",
          emailError,
        );
      });
    }

    return NextResponse.json({
      ok: true,
      nda_phase_validations: variables.nda_phase_validations,
    });
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
