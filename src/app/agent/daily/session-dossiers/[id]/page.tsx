import DailyFormationReview from "@/components/daily/DailyFormationReview";
import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function SessionPreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  const admin = createSupabaseAdminClient();
  const { data: session } = organisationIds.length
    ? await admin.from("daily_sessions").select("id,organisation_id").eq("id", id).in("organisation_id", organisationIds).maybeSingle()
    : { data: null };
  if (!session) return <main style={{ padding: 28 }}>Session Daily introuvable dans votre périmètre.</main>;
  const { data: enrolments, error } = await admin
    .from("daily_session_enrolments")
    .select("id,learner_id,status,positioning_status,prerequisites_status,daily_learners(id,organisation_id,first_name,last_name,email)")
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", id)
    .order("created_at");
  if (error) throw new Error("Lecture des inscrits indisponible.");
  const safeEnrolments = (enrolments ?? []).filter((enrolment) => {
    const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
    return learner?.organisation_id === session.organisation_id && enrolment.learner_id === learner.id;
  });
  return <>
    <DailyFormationReview sessionId={id} />
    <section style={{ maxWidth: 1040, margin: "0 auto 32px", padding: "0 28px" }}>
      <nav aria-label="Suivi de fin de session" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Link href={`/agent/daily/session-dossiers/${id}/evaluation`}>Évaluation finale des acquis →</Link>
        <Link href={`/agent/daily/session-dossiers/${id}/satisfaction`}>Satisfaction et retours →</Link>
      </nav>
      <div style={{ border: "1px solid var(--selen-border)", borderRadius: 14, padding: 18, background: "var(--selen-bg2)" }}>
        <h2 style={{ marginTop: 0 }}>Apprenants inscrits ({safeEnrolments.length})</h2>
        {safeEnrolments.length === 0 ? <p style={{ color: "var(--selen-text2)" }}>Aucun apprenant inscrit dans cette session.</p> : <div style={{ display: "grid", gap: 10 }}>
          {safeEnrolments.map((enrolment) => {
            const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
            const name = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
            return <article key={enrolment.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 12, border: "1px solid var(--selen-border)", borderRadius: 10 }}>
              <div><strong>{name}</strong>{learner?.email ? <p style={{ margin: "4px 0 0", color: "var(--selen-text2)", fontSize: 12 }}>{learner.email}</p> : null}<p style={{ margin: "4px 0 0", fontSize: 12 }}>Inscription : {enrolment.status} · Positionnement : {enrolment.positioning_status} · Prérequis : {enrolment.prerequisites_status}</p></div>
              <Link href={`/agent/daily/learners/${learner?.id}?session=${encodeURIComponent(id)}`}>Ouvrir la fiche apprenant →</Link>
            </article>;
          })}
        </div>}
      </div>
    </section>
  </>;
}
