import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { notifyClientVisibleDocuments } from "@/lib/server/notifyClientVisibleDocuments";
import { buildNdaEmailGreetingName } from "@/lib/server/ndaEmailRecipient";

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
    typeof value === "string" && NDA_PHASE_KEYS.includes(value as NdaPhaseKey)
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

async function openDepositProcedureForClient(args: {
  admin: ReturnType<typeof getAdminClient>;
  dossierId: string;
  organisation: { name?: string | null; email?: string | null } | null;
  variables?: {
    client_representant_prenom?: string | null;
    client_representant_nom?: string | null;
    stagiaire_prenom?: string | null;
    stagiaire_nom?: string | null;
  } | null;
}) {
  const { admin, dossierId, organisation, variables } = args;
  const now = new Date().toISOString();

  const { error: statusError } = await admin
    .from("dossiers")
    .update({
      status: "compliant",
      updated_at: now,
    })
    .eq("id", dossierId);

  if (statusError) {
    return { ok: false as const, error: statusError.message };
  }

  const { error: variablesError } = await admin
    .from("nda_variables")
    .update({
      nda_deposit_status: "ready_for_deposit",
      updated_at: now,
    })
    .eq("dossier_id", dossierId);

  if (variablesError) {
    return { ok: false as const, error: variablesError.message };
  }

  const { error: documentsError } = await admin
    .from("documents")
    .update({
      requires_client_action: false,
      visible_to_client_at: now,
    })
    .eq("dossier_id", dossierId)
    .eq("is_visible_to_client", true);

  if (documentsError) {
    return { ok: false as const, error: documentsError.message };
  }

  const emailNotification = await notifyClientVisibleDocuments({
    dossierId,
    dossierType: "nda",
    organisation,
    greetingName: buildNdaEmailGreetingName({ organisation, variables }),
    subject: "Votre dossier NDA est pret pour le depot",
    message:
      "La verification finale de votre dossier NDA est terminee. Vous pouvez maintenant consulter la procedure de depot, telecharger uniquement les documents selectionnes par Selen et deposer votre demande sur la plateforme officielle.",
    buttonLabel: "Ouvrir la procedure de depot",
  });

  if (!emailNotification.sent) {
    console.error(
      "Email ouverture dépôt NDA non envoyé:",
      emailNotification.error,
    );
  }

  await admin.from("messages").insert({
    dossier_id: dossierId,
    sender_type: "agent",
    content:
      "Procedure de depot ouverte au client avec les documents selectionnes comme visibles. Email de depot envoye.",
    read_by_agent_at: now,
    read_by_client_at: null,
  });

  return { ok: true as const };
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
      .select(
        "nda_phase_validations, nda_deposit_status, client_representant_prenom, client_representant_nom, stagiaire_prenom, stagiaire_nom",
      )
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
      const validatedAt = new Date().toISOString();
      validations[phaseKey] = {
        validated_at: validatedAt,
        validated_by: auth.userLabel,
      };

      if (phaseKey === "final_return") {
        validations.ready_for_deposit = {
          validated_at: validatedAt,
          validated_by: auth.userLabel,
        };
      }
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
      (phaseKey === "final_return" || phaseKey === "ready_for_deposit") &&
      currentVariables?.nda_deposit_status !== "ready_for_deposit"
    ) {
      const organisationRaw = Array.isArray(dossier.organisations)
        ? dossier.organisations[0]
        : dossier.organisations;

      const depositOpening = await openDepositProcedureForClient({
        admin,
        dossierId,
        organisation: organisationRaw ?? null,
        variables: currentVariables ?? null,
      });

      if (!depositOpening.ok) {
        return NextResponse.json(
          {
            ok: false,
            phaseValidated: true,
            error: depositOpening.error,
          },
          { status: 502 },
        );
      }
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
