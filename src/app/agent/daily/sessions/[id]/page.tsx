import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { revalidatePath } from "next/cache";
import LegacyAgentDailySessionPage from "./legacyPage";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  buildDirectSessionPortalDefinitions,
  provisionDirectSessionPortalAccesses,
  type DirectSessionPortalSource,
} from "@/lib/server/dailyDirectSessionPortalAccess";

type PageProps = { params: Promise<{ id: string }> };
type SessionRow = DirectSessionPortalSource & {
  daily_formations?: { title?: string | null } | null;
};

async function summaryValidatedAction(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Session Daily introuvable.");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("daily_sessions")
    .select("id,user_id,individual_beneficiaries,beneficiaries,companies,daily_formations(title)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const session = data as unknown as SessionRow | null;
  if (!session) throw new Error("Session Daily introuvable.");

  const definitions = buildDirectSessionPortalDefinitions(session);
  await provisionDirectSessionPortalAccesses({
    supabase: admin,
    sessionId: session.id,
    formationTitle: session.daily_formations?.title ?? null,
    definitions,
  });

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("daily_sessions")
    .update({
      registration_status: "summary_validated",
      registration_summary_validated_at: now,
    })
    .eq("id", session.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/agent/daily/sessions/${session.id}`);
  revalidatePath("/agent/daily");
}

function patchSummaryValidationAction(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown> & { children?: ReactNode }>;
  const patchedChildren = Children.map(element.props.children, patchSummaryValidationAction);

  if (
    element.type === "button" &&
    element.props.name === "action" &&
    element.props.value === "summary_validated"
  ) {
    return cloneElement(element, { formAction: summaryValidatedAction }, patchedChildren);
  }

  return cloneElement(element, {}, patchedChildren);
}

export default async function AgentDailySessionPage(props: PageProps) {
  const page = await LegacyAgentDailySessionPage(props);
  return patchSummaryValidationAction(page);
}
