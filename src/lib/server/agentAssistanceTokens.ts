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
