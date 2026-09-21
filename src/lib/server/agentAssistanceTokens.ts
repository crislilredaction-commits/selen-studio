import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

export const AGENT_ASSISTANCE_TOKEN_MINUTES = 30;

export function hashAssistanceToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientIp(headersList?: Headers) {
  return (
    headersList?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList?.get("x-real-ip") ||
    null
  );
}

export async function createAgentAssistanceToken({
  agentUserId,
  agentEmail,
  organisationId,
  dossierId = null,
  headersList,
}: {
  agentUserId?: string | null;
  agentEmail?: string | null;
  organisationId: string;
  dossierId?: string | null;
  headersList?: Headers;
}) {
  const admin = createSupabaseAdminClient();

  // Defense in depth: server actions live under /agent, but token issuance must
  // independently prove that the actor is still an active Studio agent/admin.
  const normalizedEmail = agentEmail?.trim().toLowerCase() ?? null;
  const profileQuery = admin
    .from("agent_profiles")
    .select("id")
    .eq("is_active", true)
    .limit(1);
  const [{ data: agentProfile }, { data: adminUser }, { data: organisation }] =
    await Promise.all([
      agentUserId
        ? normalizedEmail
          ? profileQuery.or(`user_id.eq.${agentUserId},email.eq.${normalizedEmail}`).maybeSingle()
          : profileQuery.eq("user_id", agentUserId).maybeSingle()
        : Promise.resolve({ data: null }),
      normalizedEmail
        ? admin
            .from("selen_admin_users")
            .select("email")
            .eq("email", normalizedEmail)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("organisations")
        .select("id")
        .eq("id", organisationId)
        .maybeSingle(),
    ]);

  if (!agentProfile && !adminUser) {
    throw new Error("Accès assistance refusé : agent Studio non autorisé.");
  }
  if (!organisation) {
    throw new Error("Accès assistance refusé : organisme introuvable.");
  }

  if (dossierId) {
    const { data: dossier } = await admin
      .from("dossiers")
      .select("id")
      .eq("id", dossierId)
      .eq("organisation_id", organisationId)
      .maybeSingle();
    if (!dossier) {
      throw new Error("Accès assistance refusé : dossier hors organisme.");
    }
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashAssistanceToken(token);
  const expiresAt = new Date(
    Date.now() + AGENT_ASSISTANCE_TOKEN_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await admin
    .from("selen_agent_assistance_tokens")
    .insert({
      token_hash: tokenHash,
      agent_user_id: agentUserId ?? null,
      agent_email: agentEmail ?? null,
      organisation_id: organisationId,
      dossier_id: dossierId,
      expires_at: expiresAt,
      created_ip: getClientIp(headersList),
      created_user_agent: headersList?.get("user-agent") ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await admin.from("selen_agent_assistance_logs").insert({
    assistance_token_id: data.id,
    agent_user_id: agentUserId ?? null,
    agent_email: agentEmail ?? null,
    organisation_id: organisationId,
    dossier_id: dossierId,
    action: "assistance_token_created",
    action_label: "Token d'assistance agent créé",
    ip: getClientIp(headersList),
    user_agent: headersList?.get("user-agent") ?? null,
  });

  const targetPath = dossierId
    ? `/client/dossier/${dossierId}`
    : "/client";
  const url = new URL(targetPath, getVitrineBaseUrl());
  url.searchParams.set("assistanceToken", token);

  return {
    tokenId: data.id as string,
    expiresAt,
    url: url.toString(),
  };
}
