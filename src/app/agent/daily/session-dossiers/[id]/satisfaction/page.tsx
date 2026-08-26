import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = { params: Promise<{ id: string }> };

const stakeholderLabels: Record<string, string> = {
  enterprise: "Commanditaire",
  trainer: "Formateur",
};

function rating(value: number | null) {
  return value == null ? "–" : `${value}/5`;
}

export default async function StakeholderSatisfactionPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [{ data: session }, { data: responses, error }] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,organisation_id,formation_id,internal_reference,start_date,end_date")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("daily_stakeholder_satisfaction_responses")
      .select("id,stakeholder_type,entity_name,entity_email,overall_rating,objectives_rating,trainer_rating,organisation_rating,would_recommend,strengths,improvements,free_comment,submitted_at")
      .eq("session_id", id)
      .order("submitted_at", { ascending: false }),
  ]);

  if (!session) return <main style={{ padding: 28 }}>Session introuvable.</main>;
  if (error) throw new Error(error.message);

  const [{ data: organisation }, { data: formation }] = await Promise.all([
    admin.from("organisations").select("name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("title").eq("id", session.formation_id).maybeSingle(),
  ]);

  const items = responses ?? [];
  const enterpriseCount = items.filter((item) => item.stakeholder_type === "enterprise").length;
  const trainerCount = items.filter((item) => item.stakeholder_type === "trainer").length;
  const rated = items.filter((item) => item.overall_rating != null);
  const average = rated.length
    ? (rated.reduce((sum, item) => sum + Number(item.overall_rating), 0) / rated.length).toFixed(1)
    : null;

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 28 }}>
      <Link href={`/agent/daily/session-dossiers/${id}`} style={{ color: "var(--selen-text2)" }}>
        ← Retour au dossier de session
      </Link>
      <h1 style={{ marginBottom: 4 }}>Satisfaction des parties prenantes</h1>
      <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
        {formation?.title ?? "Formation"} · {organisation?.name ?? "Organisme"} · {session.internal_reference || "Sans référence"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "18px 0" }}>
        <SelenCard><SelenCardTitle>Réponses</SelenCardTitle><strong style={{ fontSize: 26 }}>{items.length}</strong></SelenCard>
        <SelenCard><SelenCardTitle>Commanditaire</SelenCardTitle><strong style={{ fontSize: 26 }}>{enterpriseCount}</strong></SelenCard>
        <SelenCard><SelenCardTitle>Formateur</SelenCardTitle><strong style={{ fontSize: 26 }}>{trainerCount}</strong></SelenCard>
        <SelenCard><SelenCardTitle>Satisfaction moyenne</SelenCardTitle><strong style={{ fontSize: 26 }}>{average ? `${average}/5` : "–"}</strong></SelenCard>
      </div>

      {items.length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucune réponse reçue</SelenCardTitle>
          <p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>Les réponses commanditaire et formateur apparaîtront ici dès leur enregistrement.</p>
        </SelenCard>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((item) => (
            <SelenCard key={item.id}>
              <SelenCardTitle>{stakeholderLabels[item.stakeholder_type] ?? item.stakeholder_type} · {item.entity_name || item.entity_email || "Répondant"}</SelenCardTitle>
              <p style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                Reçue le {new Date(item.submitted_at).toLocaleString("fr-FR")} {item.entity_email ? `· ${item.entity_email}` : ""}
              </p>
              <p style={{ fontSize: 13 }}>
                <strong>Global :</strong> {rating(item.overall_rating)} · <strong>Objectifs :</strong> {rating(item.objectives_rating)} · <strong>Organisation :</strong> {rating(item.organisation_rating)}
                {item.stakeholder_type !== "trainer" ? <> · <strong>Formateur :</strong> {rating(item.trainer_rating)}</> : null}
                {item.would_recommend == null ? null : <> · <strong>Recommande :</strong> {item.would_recommend ? "oui" : "non"}</>}
              </p>
              {item.strengths ? <p style={{ fontSize: 13 }}><strong>Points forts :</strong> {item.strengths}</p> : null}
              {item.improvements ? <p style={{ fontSize: 13 }}><strong>Améliorations :</strong> {item.improvements}</p> : null}
              {item.free_comment ? <p style={{ fontSize: 13 }}><strong>Commentaire :</strong> {item.free_comment}</p> : null}
            </SelenCard>
          ))}
        </div>
      )}
    </main>
  );
}
