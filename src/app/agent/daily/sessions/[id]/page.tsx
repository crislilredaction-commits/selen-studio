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
type RegistrationReviewRow = {
  prerequisites_validated?: boolean | null;
  prerequisites_comment?: string | null;
  positioning_result?: string | null;
  adaptation_required?: boolean | null;
  adaptation_details?: string | null;
  decision?: string | null;
  justification?: string | null;
  evaluator_name?: string | null;
  validated_at?: string | null;
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

function treatmentSignal(status: string | null | undefined, responseCount: number) {
  if (status === "summary_validated") return { tone: "ok", title: "Dossier traité", detail: "La synthèse a été validée. Consulte les éléments ci-dessous uniquement si un contrôle complémentaire est nécessaire." };
  if (status === "summary_to_review") return { tone: "action", title: "Analyse à relire", detail: "La synthèse est prête : relis l’analyse humaine et statue depuis le traitement canonique ci-dessous." };
  if (status === "responses_received" && responseCount > 0) return { tone: "action", title: "Contrôles à effectuer", detail: `${responseCount} réponse(s) reçue(s). Vérifie les pièces, les prérequis et l’analyse avant toute validation.` };
  if (status === "responses_received") return { tone: "warning", title: "Incohérence à contrôler", detail: "Le dossier est marqué comme reçu mais aucune réponse n’est retrouvée. Ne valide pas avant d’avoir contrôlé le dossier source." };
  if (status === "sent") return { tone: "waiting", title: "En attente du dossier", detail: "Le dossier a été envoyé. Les actions d’analyse ne deviennent pertinentes qu’après réception des réponses." };
  return { tone: "warning", title: "Dossier à préparer", detail: "Le dossier n’est pas encore dans une phase de contrôle. Utilise les actions canoniques ci-dessous pour poursuivre le parcours." };
}

function formatReviewDate(value?: string | null) {
  if (!value) return "Non validée";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("fr-FR") : value;
}

export default async function AgentDailySessionPage(props: PageProps) {
  const { id } = await props.params;
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const [{ data: sessionData }, { count: responseCount }, { data: reviewData }] = await Promise.all([
    admin.from("daily_sessions").select("id,organisation_id,registration_status,daily_formations(title)").eq("id", id).maybeSingle(),
    admin.from("daily_registration_responses").select("id", { count: "exact", head: true }).eq("session_id", id),
    admin.from("daily_registration_reviews").select("prerequisites_validated,prerequisites_comment,positioning_result,adaptation_required,adaptation_details,decision,justification,evaluator_name,validated_at").eq("session_id", id).maybeSingle(),
  ]);
  const session = sessionData as unknown as SessionRow | null;
  const review = reviewData as RegistrationReviewRow | null;
  const organisationId = session?.organisation_id ?? null;
  const { data: organisation } = organisationId
    ? await admin.from("organisations").select("name,legal_name").eq("id", organisationId).maybeSingle()
    : { data: null };

  const step = statusStep(session?.registration_status);
  const steps = ["Dossier reçu", "Pièces", "Prérequis", "Analyse", "Décision"];
  const responses = responseCount ?? 0;
  const signal = treatmentSignal(session?.registration_status, responses);
  const legacy = await LegacyAgentDailySessionPage(props);

  return (
    <>
      <section aria-label="Poste de traitement du dossier d'inscription" style={{ maxWidth: 1180, margin: "24px auto 0", padding: "0 28px" }}>
        <div style={{ border: "1px solid var(--selen-border)", borderRadius: 16, background: "var(--selen-bg2)", padding: 18 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--selen-gold2)" }}>Dossier d’inscription · poste de traitement</p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24 }}>{session?.daily_formations?.title || "Formation"}</h1>
              <p style={{ margin: "5px 0 0", color: "var(--selen-text2)" }}>{organisation?.legal_name || organisation?.name || "Organisme"} · {responses} réponse(s) reçue(s)</p>
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
          <div data-treatment-tone={signal.tone} style={{ marginTop: 14, borderRadius: 12, border: "1px solid var(--selen-border)", background: "var(--selen-bg)", padding: "12px 14px" }}>
            <strong style={{ display: "block" }}>{signal.title}</strong>
            <span style={{ display: "block", marginTop: 4, fontSize: 13, color: "var(--selen-text2)" }}>{signal.detail}</span>
            <a href="#traitement-canonique" style={{ display: "inline-block", marginTop: 9, fontSize: 13, fontWeight: 800, color: "var(--selen-gold2)" }}>Aller aux actions du dossier ↓</a>
          </div>
          <div aria-label="Analyse humaine du dossier" style={{ marginTop: 14, borderRadius: 12, border: "1px solid var(--selen-border)", background: "var(--selen-bg)", padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong>Analyse humaine</strong>
              <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>{review?.evaluator_name || "Aucun auteur"} · {formatReviewDate(review?.validated_at)}</span>
            </div>
            {review ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 10, fontSize: 13 }}>
                <div><b>Prérequis</b><br />{review.prerequisites_validated === true ? "Validés" : review.prerequisites_validated === false ? "Non validés" : "À contrôler"}{review.prerequisites_comment ? ` · ${review.prerequisites_comment}` : ""}</div>
                <div><b>Positionnement</b><br />{review.positioning_result || "À renseigner"}</div>
                <div><b>Adaptation</b><br />{review.adaptation_required ? review.adaptation_details || "Adaptation requise" : "Aucune adaptation signalée"}</div>
                <div><b>Décision</b><br />{review.decision || "À prendre"}{review.justification ? ` · ${review.justification}` : ""}</div>
              </div>
            ) : <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--selen-text2)" }}>Aucune analyse enregistrée. Utilise le formulaire canonique ci-dessous pour effectuer le contrôle.</p>}
            <a href="#traitement-canonique" style={{ display: "inline-block", marginTop: 10, fontSize: 13, fontWeight: 800, color: "var(--selen-gold2)" }}>Ouvrir l’analyse et les contrôles ↓</a>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--selen-text2)" }}>Les blocs ci-dessous restent les actions canoniques existantes. Cette synthèse n’ajoute aucun statut ni moteur parallèle : elle rend simplement le traitement lisible avant d’agir.</p>
        </div>
      </section>
      <div id="traitement-canonique">{patchSummaryValidationAction(legacy)}</div>
    </>
  );
}
