import { NextRequest, NextResponse } from "next/server";
import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  renderSelenEmailFromText,
} from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

export const dynamic = "force-dynamic";

type AdminClient = SupabaseClient;

type OrganisationAccessRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type DossierAccessRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
};

type ReviewCaseAccessRow = {
  id: string;
  dossier_id: string | null;
  client_email: string;
  status: string;
  report_status: string;
};

type ClientToolAccessRow = {
  id: string;
  status: string | null;
  access_type: string | null;
  ends_at: string | null;
};

type GrantableTool = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
};

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getAdminClient(): AdminClient {
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
  }) as AdminClient;
}

async function requireAgentAdmin() {
  // Autorisé uniquement en local pour continuer les tests sans vraie connexion agent
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SELEN_DEV_ADMIN_BYPASS === "true"
  ) {
    return {
      ok: true as const,
      user: {
        id: "local-dev-agent",
        email: "local-dev-agent@selen.local",
      },
    };
  }

  const supabase = await createSessionClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false as const,
      response: jsonResponse(
        {
          error:
            "Vous devez être connecté côté agent pour utiliser cette action.",
        },
        401,
      ),
    };
  }

  const admin = getAdminClient();

  const { data: adminUser, error: adminError } = await admin
    .from("selen_admin_users")
    .select("id, user_id, email, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false as const,
      response: jsonResponse(
        {
          error: `Impossible de vérifier les droits admin. ${adminError.message}`,
        },
        500,
      ),
    };
  }

  if (!adminUser) {
    return {
      ok: false as const,
      response: jsonResponse(
        { error: "Votre compte n’est pas autorisé à gérer les accès clients." },
        403,
      ),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

function generateTemporaryPassword() {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 14);
  return `Selen-${random}!`;
}

const TOOL_DOSSIER_CONFIG: Record<
  string,
  {
    dossierType: string;
    title: string;
    status: string;
  }
> = {
  preaudit: {
    dossierType: "preaudit",
    title: "Préaudit Qualiopi",
    status: "assignable",
  },
  "preaudit-qualiopi": {
    dossierType: "preaudit",
    title: "Préaudit Qualiopi",
    status: "assignable",
  },
  nda: {
    dossierType: "nda",
    title: "Accompagnement Numéro de Déclaration d’Activité",
    status: "assignable",
  },
  audit_blanc: {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  "audit-blanc": {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  "audit-blanc-qualiopi": {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  audit_blanc_qualiopi: {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },
};

function getDossierConfigFromToolSlug(toolSlug: string) {
  return TOOL_DOSSIER_CONFIG[toolSlug] ?? null;
}

const FALLBACK_GRANTABLE_TOOLS: GrantableTool[] = [
  {
    id: "fallback-nda",
    slug: "nda",
    name: "NDA",
    description: "Accompagnement Numéro de Déclaration d’Activité",
    is_active: true,
    display_order: 30,
    created_at: "2026-06-26T00:00:00.000Z",
  },
];

function withFallbackGrantableTools(tools: GrantableTool[]) {
  const slugs = new Set(tools.map((tool) => tool.slug));
  return [
    ...tools,
    ...FALLBACK_GRANTABLE_TOOLS.filter((tool) => !slugs.has(tool.slug)),
  ].sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
}

function getFallbackGrantableTool(slug: string) {
  return FALLBACK_GRANTABLE_TOOLS.find((tool) => tool.slug === slug) ?? null;
}

function normalizeDateTime(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

function shouldSendAccessActivationEmail(
  existingAccess: ClientToolAccessRow | null,
  payload: { status: string; access_type: string; ends_at: string | null },
) {
  if (!existingAccess) return true;

  return (
    existingAccess.status !== payload.status ||
    existingAccess.access_type !== payload.access_type ||
    normalizeDateTime(existingAccess.ends_at) !== normalizeDateTime(payload.ends_at)
  );
}

async function notifyClientAccessActivated({
  admin,
  email,
  toolName,
}: {
  admin: AdminClient;
  email: string;
  toolName: string;
}) {
  const clientUrl = `${getVitrineBaseUrl()}/client`;
  const bodyText = [
    "Bonjour,",
    "",
    `Votre accès à la prestation ${toolName} vient d'être activé gratuitement dans votre espace Selen.`,
    "",
    "Vous pouvez accéder à votre espace client ici :",
    clientUrl,
    "",
    "Si vous n'avez pas encore créé votre accès, suivez le lien reçu ou utilisez la procédure d'activation prévue.",
  ].join("\n");
  const emailContent = renderSelenEmailFromText({
    title: "Votre accès Selen est activé",
    bodyText,
    ctaLabel: "Accéder à mon espace client",
    ctaUrl: clientUrl,
  });

  return sendClientEmailWithSilence({
    supabase: admin,
    email,
    to: email,
    subject: "Votre accès Selen est activé",
    html: emailContent.html,
    text: emailContent.text,
  });
}

async function ensureOrganisationForClient({
  admin,
  email,
  fullName,
}: {
  admin: AdminClient;
  email: string;
  fullName?: string | null;
}) {
  const cleanEmail = email.trim().toLowerCase();

  const { data: existingOrganisationRaw, error: existingOrganisationError } =
    await admin
      .from("organisations")
      .select("id, name, email")
      .eq("email", cleanEmail)
      .maybeSingle();

  const existingOrganisation =
    existingOrganisationRaw as OrganisationAccessRow | null;

  if (existingOrganisationError) {
    throw new Error(
      `Impossible de vérifier le client Studio. ${existingOrganisationError.message}`,
    );
  }

  if (existingOrganisation?.id) {
    return existingOrganisation;
  }

  const fallbackName = fullName?.trim() || cleanEmail;

  const { data: newOrganisationRaw, error: organisationError } = await admin
    .from("organisations")
    .insert({
      name: fallbackName,
      email: cleanEmail,
      status: "active",
    })
    .select("id, name, email")
    .single();

  const newOrganisation = newOrganisationRaw as OrganisationAccessRow | null;

  if (organisationError || !newOrganisation) {
    throw new Error(
      `Impossible de créer le client Studio. ${
        organisationError?.message ?? ""
      }`,
    );
  }

  return newOrganisation;
}

async function ensureDossierForClientAccess({
  admin,
  organisationId,
  toolSlug,
}: {
  admin: AdminClient;
  organisationId: string;
  toolSlug: string;
}) {
  const config = getDossierConfigFromToolSlug(toolSlug);

  if (!config) {
    return null;
  }

  const { data: existingDossierRaw, error: existingDossierError } = await admin
    .from("dossiers")
    .select("id, title, type, status")
    .eq("organisation_id", organisationId)
    .eq("type", config.dossierType)
    .neq("status", "archived")
    .maybeSingle();

  const existingDossier = existingDossierRaw as DossierAccessRow | null;

  if (existingDossierError) {
    throw new Error(
      `Impossible de vérifier les dossiers existants. ${existingDossierError.message}`,
    );
  }

  if (existingDossier?.id) {
    return existingDossier;
  }

  const { data: dossierRaw, error: dossierError } = await admin
    .from("dossiers")
    .insert({
      title: config.title,
      type: config.dossierType,
      organisation_id: organisationId,
      status: config.status,
    })
    .select("id, title, type, status")
    .single();

  const dossier = dossierRaw as DossierAccessRow | null;

  if (dossierError || !dossier) {
    throw new Error(
      `Accès créé, mais impossible de créer le dossier Studio. ${
        dossierError?.message ?? ""
      }`,
    );
  }

  return dossier;
}

async function ensureReviewCaseForClientAccess({
  admin,
  email,
  clientUserId,
  dossierId,
  toolSlug,
}: {
  admin: AdminClient;
  email: string;
  clientUserId: string;
  dossierId: string | null;
  toolSlug: string;
}) {
  if (
    ![
      "audit_blanc",
      "audit-blanc",
      "audit-blanc-qualiopi",
      "audit_blanc_qualiopi",
    ].includes(toolSlug)
  ) {
    return null;
  }

  const cleanEmail = email.trim().toLowerCase();

  const { data: existingCaseRaw, error: existingCaseError } = await admin
    .from("audit_blanc_cases")
    .select("id, dossier_id, client_email, status, report_status")
    .eq("client_email", cleanEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingCase = existingCaseRaw as ReviewCaseAccessRow | null;

  if (existingCaseError) {
    throw new Error(
      `Impossible de vérifier la fiche Review existante. ${existingCaseError.message}`,
    );
  }

  if (existingCase?.id) {
    if (dossierId && !existingCase.dossier_id) {
      const { data: updatedCaseRaw, error: updateCaseError } = await admin
        .from("audit_blanc_cases")
        .update({
          dossier_id: dossierId,
          client_user_id: clientUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingCase.id)
        .select("id, dossier_id, client_email, status, report_status")
        .single();

      if (updateCaseError) {
        throw new Error(
          `Fiche Review trouvée, mais impossible de la relier au dossier Studio. ${updateCaseError.message}`,
        );
      }

      return updatedCaseRaw as ReviewCaseAccessRow;
    }

    return existingCase;
  }

  const { data: newCaseRaw, error: newCaseError } = await admin
    .from("audit_blanc_cases")
    .insert({
      client_email: cleanEmail,
      client_user_id: clientUserId,
      dossier_id: dossierId,
      status: "booking_pending",
      offer: "manual",
      price_paid: null,
      currency: "eur",
      calendly_mode: null,
      meeting_url: null,
      agent_id: null,
      agent_email: null,
      report_status: "not_started",
      profile_data: {},
      applicable_indicators: [],
      excluded_indicators: [],
      brand_usage_answers: {},
      brand_usage_diagnostic: "a_verifier",
      brand_usage_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, dossier_id, client_email, status, report_status")
    .single();

  if (newCaseError) {
    throw new Error(
      `Dossier Studio créé, mais impossible de créer la fiche Review. ${newCaseError.message}`,
    );
  }

  return newCaseRaw as ReviewCaseAccessRow;
}

async function findAuthUserByEmail(admin: AdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );

    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAgentAdmin();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  try {
    const admin = getAdminClient();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim() ?? "";

    const { data: tools, error: toolsError } = await admin
      .from("selen_tools_catalog")
      .select(
        "id, slug, name, description, is_active, display_order, created_at",
      )
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (toolsError) {
      return jsonResponse({ error: toolsError.message }, 500);
    }

    const grantableTools = withFallbackGrantableTools(
      (tools ?? []) as GrantableTool[],
    );

    if (!email) {
      return jsonResponse({
        tools: grantableTools,
        client: null,
        accesses: [],
      });
    }

    const client = await findAuthUserByEmail(admin, email);

    if (!client) {
      return jsonResponse({
        tools: grantableTools,
        client: null,
        accesses: [],
        message: "Aucun utilisateur Supabase Auth trouvé avec cet email.",
      });
    }

    const { data: accesses, error: accessError } = await admin
      .from("selen_client_tool_access")
      .select(
        "id, user_id, tool_slug, status, access_type, starts_at, ends_at, created_at, updated_at",
      )
      .eq("user_id", client.id)
      .order("created_at", { ascending: false });

    if (accessError) {
      return jsonResponse({ error: accessError.message }, 500);
    }

    return jsonResponse({
      tools: grantableTools,
      client: {
        id: client.id,
        email: client.email,
        created_at: client.created_at,
        last_sign_in_at: client.last_sign_in_at,
      },
      accesses: accesses ?? [],
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant le chargement des accès.",
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAgentAdmin();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  try {
    const admin = getAdminClient();
    const body = await request.json();

    const action = String(body.action ?? "");

    if (action === "create_user") {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const fullName = String(body.fullName ?? "").trim();
      const password =
        String(body.password ?? "").trim() || generateTemporaryPassword();

      if (!email) {
        return jsonResponse({ error: "Email obligatoire." }, 400);
      }

      const existingUser = await findAuthUserByEmail(admin, email);

      if (existingUser) {
        return jsonResponse({
          created: false,
          temporaryPassword: null,
          client: {
            id: existingUser.id,
            email: existingUser.email,
          },
          message: "Cet utilisateur existe déjà.",
        });
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || null,
        },
      });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({
        created: true,
        temporaryPassword: password,
        client: {
          id: data.user.id,
          email: data.user.email,
        },
        message:
          "Utilisateur créé. Notez le mot de passe temporaire maintenant, il ne sera plus affiché ensuite.",
      });
    }

    if (action === "grant_access") {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const toolSlug = String(body.toolSlug ?? "").trim();
      const accessType = String(body.accessType ?? "limited").trim();
      const endsAt = body.endsAt ? String(body.endsAt) : null;

      if (!email) {
        return jsonResponse({ error: "Email obligatoire." }, 400);
      }

      if (!toolSlug) {
        return jsonResponse({ error: "Prestation obligatoire." }, 400);
      }

      if (!["limited", "unlimited"].includes(accessType)) {
        return jsonResponse(
          { error: "Type d’accès invalide. Utilisez limited ou unlimited." },
          400,
        );
      }

      if (accessType === "limited" && !endsAt) {
        return jsonResponse(
          { error: "Une date de fin est obligatoire pour un accès limité." },
          400,
        );
      }

      const client = await findAuthUserByEmail(admin, email);

      if (!client) {
        return jsonResponse(
          {
            error:
              "Aucun utilisateur Supabase Auth trouvé avec cet email. Créez d’abord le client.",
          },
          404,
        );
      }

      const { data: tool, error: toolError } = await admin
        .from("selen_tools_catalog")
        .select("slug, name, is_active")
        .eq("slug", toolSlug)
        .eq("is_active", true)
        .maybeSingle();

      if (toolError) {
        return jsonResponse({ error: toolError.message }, 500);
      }

      const fallbackTool = getFallbackGrantableTool(toolSlug);

      if (!tool && !fallbackTool) {
        return jsonResponse(
          { error: "Cette prestation n’existe pas ou n’est pas active." },
          404,
        );
      }

      const { data: existingAccess, error: existingError } = await admin
        .from("selen_client_tool_access")
        .select("id, status, access_type, ends_at")
        .eq("user_id", client.id)
        .eq("tool_slug", toolSlug)
        .maybeSingle();

      if (existingError) {
        return jsonResponse({ error: existingError.message }, 500);
      }

      const toolName =
        typeof tool?.name === "string" && tool.name.trim()
          ? tool.name.trim()
          : fallbackTool?.name || toolSlug;
      const existingAccessRow =
        (existingAccess as ClientToolAccessRow | null) ?? null;
      const payload = {
        user_id: client.id,
        tool_slug: toolSlug,
        status: "active",
        access_type: accessType,
        starts_at: new Date().toISOString(),
        ends_at: accessType === "unlimited" ? null : endsAt,
        updated_at: new Date().toISOString(),
      };
      const shouldNotifyClient = shouldSendAccessActivationEmail(
        existingAccessRow,
        {
          status: payload.status,
          access_type: payload.access_type,
          ends_at: payload.ends_at,
        },
      );

      if (existingAccessRow?.id) {
        const { error: updateError } = await admin
          .from("selen_client_tool_access")
          .update(payload)
          .eq("id", existingAccessRow.id);

        if (updateError) {
          return jsonResponse({ error: updateError.message }, 500);
        }

        const organisation = await ensureOrganisationForClient({
          admin,
          email,
          fullName:
            typeof client.user_metadata?.full_name === "string"
              ? client.user_metadata.full_name
              : null,
        });

        const dossier = await ensureDossierForClientAccess({
          admin,
          organisationId: organisation.id,
          toolSlug,
        });

        const reviewCase = await ensureReviewCaseForClientAccess({
          admin,
          email,
          clientUserId: client.id,
          dossierId: dossier?.id ?? null,
          toolSlug,
        });
        const emailResult = shouldNotifyClient
          ? await notifyClientAccessActivated({ admin, email, toolName })
          : { sent: false, error: null };

        return jsonResponse({
          updated: true,
          dossier,
          reviewCase,
          email: emailResult,
          message: reviewCase
            ? "Accès mis à jour, dossier Studio vérifié et fiche Review reliée."
            : dossier
              ? "Accès mis à jour et dossier Studio vérifié."
              : "Accès mis à jour.",
        });
      }

      const { error: insertError } = await admin
        .from("selen_client_tool_access")
        .insert({
          ...payload,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        return jsonResponse({ error: insertError.message }, 500);
      }

      const organisation = await ensureOrganisationForClient({
        admin,
        email,
        fullName:
          typeof client.user_metadata?.full_name === "string"
            ? client.user_metadata.full_name
            : null,
      });

      const dossier = await ensureDossierForClientAccess({
        admin,
        organisationId: organisation.id,
        toolSlug,
      });

      const reviewCase = await ensureReviewCaseForClientAccess({
        admin,
        email,
        clientUserId: client.id,
        dossierId: dossier?.id ?? null,
        toolSlug,
      });
      const emailResult = shouldNotifyClient
        ? await notifyClientAccessActivated({ admin, email, toolName })
        : { sent: false, error: null };

      return jsonResponse({
        created: true,
        dossier,
        reviewCase,
        email: emailResult,
        message: reviewCase
          ? "Accès créé, dossier Studio créé et fiche Review reliée."
          : dossier
            ? "Accès créé et dossier Studio créé."
            : "Accès créé.",
      });
    }

    if (action === "deactivate_access") {
      const accessId = String(body.accessId ?? "").trim();

      if (!accessId) {
        return jsonResponse({ error: "ID d’accès obligatoire." }, 400);
      }

      const { error } = await admin
        .from("selen_client_tool_access")
        .update({
          status: "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accessId);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({
        updated: true,
        message: "Accès désactivé.",
      });
    }

    return jsonResponse({ error: "Action inconnue." }, 400);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant l’action admin.",
      },
      500,
    );
  }
}
