import { SupabaseClient } from "@supabase/supabase-js";

type CreateAgentNotificationInput = {
  supabase: SupabaseClient;
  dossierId: string;
  type:
    | "client_message"
    | "client_step_completed"
    | "client_uploaded_essential_documents"
    | "client_uploaded_proofs"
    | "client_validated_reformulation"
    | "client_requested_call";
  title: string;
  content?: string | null;
  sourceMessageId?: string | null;
};

export async function getAssignedAgentId(
  supabase: SupabaseClient,
  dossierId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("dossier_assignments")
    .select("agent_id, is_primary")
    .eq("dossier_id", dossierId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.agent_id ?? null;
}

export async function getDossierSnapshot(
  supabase: SupabaseClient,
  dossierId: string,
) {
  const { data } = await supabase
    .from("dossiers")
    .select(
      `
      id,
      title,
      organisations:organisation_id (
        name
      )
    `,
    )
    .eq("id", dossierId)
    .maybeSingle();

  const organisationRaw = Array.isArray(data?.organisations)
    ? data?.organisations?.[0]
    : data?.organisations;

  return {
    dossierTitle: data?.title ?? "Dossier",
    organisationName: organisationRaw?.name ?? "Client",
    linkPath: `/agent/dossiers/${dossierId}`,
  };
}

export async function createAgentNotification({
  supabase,
  dossierId,
  type,
  title,
  content = null,
  sourceMessageId = null,
}: CreateAgentNotificationInput) {
  const assignedAgentId = await getAssignedAgentId(supabase, dossierId);
  const snapshot = await getDossierSnapshot(supabase, dossierId);

  const { error } = await supabase.from("notifications").insert({
    type,
    title,
    content,
    dossier_id: dossierId,
    dossier_title: snapshot.dossierTitle,
    organisation_name: snapshot.organisationName,
    link_path: snapshot.linkPath,
    source_message_id: sourceMessageId,
    target_role: "agent",
    target_user_id: assignedAgentId,
    escalation_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.error("Erreur création notification agent:", error);
  }
}
