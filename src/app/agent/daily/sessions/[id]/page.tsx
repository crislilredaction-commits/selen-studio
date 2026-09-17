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
  registration_status?: string | null;
  organisation_id?: string | null;
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
  await provisionDirectSessionPortalAccesses({ supabase: admin, sessionId: session.id, formationTitle: session.daily_formations?.title ?? null, definitions });
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("daily_sessions").update({ registration_status: "summary_validated", registration_summary_validated_at: now }).eq("id", session.id);
  if (updateError) throw new Error(updateError.message);
  revalidatePath(`/agent/daily/sessions/${session.id}`);
  revalidatePath("/agent/daily");
}

function patchSummaryValidationAction(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<Record<string, unknown> & { children?: ReactNode }>;
  const patchedChildren = Children.map(element.props.children, patchSummaryValidationAction);
  if (element.type === "button" && element.props.name === "action" && element.props.value === "summary_validated") {
    return cloneElement(element, { formAction: summaryValidatedAction }, patchedChildren);
  }
  return cloneElement(element, {}, patchedChildren);
}

function statusStep(status?: string | null) {
  if (status === "summary_validated") return 5;
  if (status === "summary_to_review") return 4;
  if (status === "responses_received") return 3;
  if (status === "sent") return 2;
  return 1;
}

export default async function AgentDailySessionPage(props: PageProps) {
  const { id } = await props.params;
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const [{ data: sessionData }, { count: responseCount }] = await Promise.all([
    admin.from("daily_sessions").select("id,organisation_id,registration_status,daily_formations(title)").eq("id", id).maybeSingle(),
    admin.from("daily_registration_responses").select("id", { count: "exact", head: true }).eq("session_id", id),
  ]);
  const session = sessionData as unknown as SessionRow | null;
  const organisationId = session?.organisation_id ?? null;
  const { data: organisation } = organisationId
    ? await admin.from("organisations").select("name,legal_name").eq("id", organisationId).maybeSingle()
    : { data: null };

  const step = statusStep(session?.registration_status);
  const steps = ["Dossier reçu", "Pièces", "Prérequis", "Analyse", "Décision"];
  const legacy = await LegacyAgentDailySessionPage(props);

  return (
    <>
      <section aria-label="Poste de traitement du dossier d'inscription" style={{ maxWidth: 1180, margin: "24px auto 0", padding: "0 28px" }}>
        <div style={{ border: "1px solid var(--selen-border)", borderRadius: 16, background: "var(--selen-bg2)", padding: 18 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--selen-gold2)" }}>Dossier d’inscription · poste de traitement</p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24 }}>{session?.daily_formations?.title || "Formation"}</h1>
              <p style={{ margin: "5px 0 0", color: "var(--selen-text2)" }}>{organisation?.legal_name || organisation?.name || "Organisme"} · {responseCount ?? 0} réponse(s) reçue(s)</p>
            </div>
            <span style={{ alignSelf: "flex-start", borderRadius: 999, padding: "7px 11px", background: "var(--selen-bg)", border: "1px solid var(--selen-border)", fontWeight: 700 }}>{session?.registration_status || "à préparer"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 16 }}>
            {steps.map((label, index) => {
              const done = index + 1 < step;
              const current = index + 1 === step;
              return <div key={label} style={{ borderRadius: 10, padding: "10px 12px", border: `1px solid ${current ? "var(--selen-gold2)" : "var(--selen-border)"}`, background: done ? "var(--selen-bg)" : "transparent", fontWeight: current ? 800 : 600, opacity: index + 1 > step ? .58 : 1 }}>{done ? "✓ " : current ? "→ " : ""}{label}</div>;
            })}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--selen-text2)" }}>Les blocs ci-dessous restent les actions canoniques existantes. Cette synthèse n’ajoute aucun statut ni moteur parallèle : elle rend simplement le traitement lisible avant d’agir.</p>
        </div>
      </section>
      {patchSummaryValidationAction(legacy)}
    </>
  );
}
