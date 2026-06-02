import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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

    if (!email) {
      return jsonResponse({
        tools: tools ?? [],
        client: null,
        accesses: [],
      });
    }

    const client = await findAuthUserByEmail(admin, email);

    if (!client) {
      return jsonResponse({
        tools: tools ?? [],
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
      tools: tools ?? [],
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

      if (!tool) {
        return jsonResponse(
          { error: "Cette prestation n’existe pas ou n’est pas active." },
          404,
        );
      }

      const { data: existingAccess, error: existingError } = await admin
        .from("selen_client_tool_access")
        .select("id")
        .eq("user_id", client.id)
        .eq("tool_slug", toolSlug)
        .maybeSingle();

      if (existingError) {
        return jsonResponse({ error: existingError.message }, 500);
      }

      const payload = {
        user_id: client.id,
        tool_slug: toolSlug,
        status: "active",
        access_type: accessType,
        starts_at: new Date().toISOString(),
        ends_at: accessType === "unlimited" ? null : endsAt,
        updated_at: new Date().toISOString(),
      };

      if (existingAccess?.id) {
        const { error: updateError } = await admin
          .from("selen_client_tool_access")
          .update(payload)
          .eq("id", existingAccess.id);

        if (updateError) {
          return jsonResponse({ error: updateError.message }, 500);
        }

        return jsonResponse({
          updated: true,
          message: "Accès mis à jour.",
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

      return jsonResponse({
        created: true,
        message: "Accès créé.",
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
