import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function isDue(value?: string | null) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const time = new Date(`${value}T23:59:59.999Z`).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

export default async function DailyTrainerAnnualFollowUpPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const year = new Date().getUTCFullYear();

  const [{ data: trainers, error: trainerError }, { data: reviews, error: reviewError }] = await Promise.all([
    admin
      .from("daily_trainer_profiles")
      .select("id,organisation_id,display_name,professional_email,status,specialties,cv_updated_at,cv_review_due_at,cv_last_reminder_at,cv_reminder_count,cv_next_reminder_at,organisations(name)")
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("daily_trainer_annual_reviews")
      .select("id,trainer_profile_id,review_year,status,submitted_at,manager_notified_at,last_reminder_at,reminder_count,next_reminder_at")
      .eq("review_year", year),
  ]);

  const error = trainerError ?? reviewError;
  if (error) throw new Error(error.message);

  const trainerIds = (trainers ?? []).map((trainer) => trainer.id);
  const { data: certifications, error: certificationError } = trainerIds.length
    ? await admin
        .from("daily_trainer_certifications")
        .select("id,trainer_profile_id,title,validity_mode,valid_until")
        .in("trainer_profile_id", trainerIds)
    : { data: [], error: null };
  if (certificationError) throw new Error(certificationError.message);

  const reviewByTrainer = new Map((reviews ?? []).map((review) => [review.trainer_profile_id, review]));
  const certificationsByTrainer = new Map<string, Array<{ id: string; title: string; validity_mode?: string | null; valid_until?: string | null }>>();
  for (const certification of certifications ?? []) {
    const list = certificationsByTrainer.get(certification.trainer_profile_id) ?? [];
    list.push(certification);
    certificationsByTrainer.set(certification.trainer_profile_id, list);
  }

  const activeTrainers = (trainers ?? []).filter((trainer) => trainer.status === "active" || trainer.status == null);
  const submittedCount = activeTrainers.filter((trainer) => reviewByTrainer.get(trainer.id)?.status === "submitted").length;
  const cvDueCount = activeTrainers.filter((trainer) => isDue(trainer.cv_review_due_at)).length;
  const expiredCertificationCount = activeTrainers.reduce((count, trainer) => {
    return count + (certificationsByTrainer.get(trainer.id) ?? []).filter((certification) => isExpired(certification.valid_until)).length;
  }, 0);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <p style={{ fontSize: 12, fontWeight: 700 }}>SELEN DAILY</p>
      <h1 style={{ marginBottom: 4 }}>Suivi annuel des formateurs</h1>
      <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
        Vue de contrôle Studio pour les CV, auto-évaluations annuelles, relances et échéances de certifications. Lecture seule en V1.
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "18px 0" }}>
        <Metric value={activeTrainers.length} label="Formateurs suivis" />
        <Metric value={submittedCount} label={`Auto-évaluations ${year} reçues`} />
        <Metric value={Math.max(0, activeTrainers.length - submittedCount)} label="Auto-évaluations à compléter" />
        <Metric value={cvDueCount} label="CV à actualiser" />
        <Metric value={expiredCertificationCount} label="Certifications expirées" />
      </section>

      <div style={{ display: "grid", gap: 12 }}>
        {activeTrainers.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucun formateur enregistré</SelenCardTitle>
            <p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>Le suivi annuel apparaîtra ici dès qu’un organisme aura créé une fiche formateur.</p>
          </SelenCard>
        ) : activeTrainers.map((trainer) => {
          const review = reviewByTrainer.get(trainer.id);
          const certs = certificationsByTrainer.get(trainer.id) ?? [];
          const expired = certs.filter((certification) => isExpired(certification.valid_until));
          const organisation = Array.isArray(trainer.organisations) ? trainer.organisations[0] : trainer.organisations;

          return (
            <SelenCard key={trainer.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <SelenCardTitle>{trainer.display_name || "Formateur"}</SelenCardTitle>
                  <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                    {organisation?.name ?? "Organisme"}{trainer.professional_email ? ` · ${trainer.professional_email}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                  <span style={badgeStyle(review?.status === "submitted" ? "ok" : "wait")}>Auto-évaluation : {review?.status === "submitted" ? "reçue" : review ? "en cours" : "non commencée"}</span>
                  <span style={badgeStyle(isDue(trainer.cv_review_due_at) ? "warn" : "neutral")}>CV : {trainer.cv_updated_at ? (isDue(trainer.cv_review_due_at) ? "à actualiser" : "à jour") : "à déposer"}</span>
                  {expired.length ? <span style={badgeStyle("danger")}>{expired.length} certification{expired.length > 1 ? "s" : ""} expirée{expired.length > 1 ? "s" : ""}</span> : null}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 14, fontSize: 13 }}>
                <Info label="Dernier CV" value={formatDate(trainer.cv_updated_at)} />
                <Info label="Prochaine échéance CV" value={formatDate(trainer.cv_review_due_at)} />
                <Info label="Relances CV" value={String(trainer.cv_reminder_count ?? 0)} />
                <Info label={`Auto-évaluation ${year}`} value={review?.status === "submitted" ? `Transmise le ${formatDate(review.submitted_at)}` : review ? "Brouillon en cours" : "Non commencée"} />
                <Info label="Relances auto-évaluation" value={String(review?.reminder_count ?? 0)} />
                <Info label="Dirigeant informé" value={review?.manager_notified_at ? formatDate(review.manager_notified_at) : "Non"} />
              </div>

              {trainer.specialties?.length ? <p style={{ fontSize: 13, marginBottom: 0 }}><strong>Compétences :</strong> {trainer.specialties.join(", ")}</p> : null}
              {certs.length ? (
                <details style={{ marginTop: 10 }}>
                  <summary>{certs.length} certification{certs.length > 1 ? "s" : ""} déclarée{certs.length > 1 ? "s" : ""}</summary>
                  <ul style={{ marginBottom: 0 }}>
                    {certs.map((certification) => (
                      <li key={certification.id} style={isExpired(certification.valid_until) ? { color: "#a33a2b", fontWeight: 700 } : undefined}>
                        {certification.title} · {certification.validity_mode === "unlimited" ? "sans date de fin" : certification.valid_until ? `valable jusqu’au ${formatDate(certification.valid_until)}` : "validité à préciser"}{isExpired(certification.valid_until) ? " · expirée" : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </SelenCard>
          );
        })}
      </div>
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <SelenCard><strong style={{ display: "block", fontSize: 26 }}>{value}</strong><span style={{ fontSize: 12, color: "var(--selen-text2)" }}>{label}</span></SelenCard>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><strong>{label}</strong><div style={{ marginTop: 3, color: "var(--selen-text2)" }}>{value}</div></div>;
}

function badgeStyle(kind: "ok" | "wait" | "warn" | "danger" | "neutral") {
  const backgrounds = {
    ok: "rgba(62, 122, 76, .11)",
    wait: "rgba(180, 140, 60, .12)",
    warn: "rgba(180, 110, 35, .12)",
    danger: "rgba(170, 55, 45, .12)",
    neutral: "rgba(120, 120, 120, .09)",
  };
  return { padding: "5px 8px", borderRadius: 999, background: backgrounds[kind], fontWeight: 700 };
}
