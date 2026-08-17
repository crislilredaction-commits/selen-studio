import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import ReviewFeedbackForm from "./ReviewFeedbackForm";
import ForwardFeedbackButton from "./ForwardFeedbackButton";
import ResolveFeedbackButton from "./ResolveFeedbackButton";

const STATUS_LABELS: Record<string, string> = {
  received: "À examiner par Selen",
  selen_reviewed: "Revue Selen effectuée",
  forwarded_to_organisation: "Transmise à l’OF",
  resolved: "Résolue",
};

const TYPE_LABELS: Record<string, string> = {
  complaint: "Réclamation",
  suggestion: "Suggestion",
};

const STAKEHOLDER_LABELS: Record<string, string> = {
  learner: "Apprenant",
  trainer: "Formateur",
  company: "Entreprise",
  client: "Client",
  other: "Autre partie prenante",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function DailyStakeholderFeedbackPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const { data: feedback, error } = await admin
    .from("daily_stakeholder_feedback")
    .select(
      "id,organisation_id,session_id,enrolment_id,submission_type,stakeholder_type,submitter_name,submitter_email,subject,message,status,selen_review_note,selen_reviewed_at,forwarded_at,organisation_response,resolved_at,created_at,organisations(name)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const rows = feedback ?? [];
  const receivedCount = rows.filter((item) => item.status === "received").length;
  const reviewedCount = rows.filter((item) => item.status === "selen_reviewed").length;
  const forwardedCount = rows.filter((item) => item.status === "forwarded_to_organisation").length;
  const resolvedCount = rows.filter((item) => item.status === "resolved").length;

  const orderedRows = [...rows].sort((a, b) => {
    const rank = (status: string) => {
      if (status === "received") return 0;
      if (status === "selen_reviewed") return 1;
      if (status === "forwarded_to_organisation") return 2;
      return 3;
    };
    const statusDelta = rank(a.status) - rank(b.status);
    if (statusDelta !== 0) return statusDelta;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <p style={{ fontSize: 12, fontWeight: 700 }}>SELEN DAILY</p>
      <h1 style={{ marginBottom: 4 }}>Réclamations & suggestions</h1>
      <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
        File privée de revue Selen. Une demande reste invisible pour l’organisme tant que Selen ne l’a pas examinée et transmise.
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          margin: "18px 0",
        }}
      >
        <Metric value={receivedCount} label="À examiner" />
        <Metric value={reviewedCount} label="Revue Selen faite" />
        <Metric value={forwardedCount} label="Transmises à l’OF" />
        <Metric value={resolvedCount} label="Résolues" />
      </section>

      <div style={{ display: "grid", gap: 12 }}>
        {orderedRows.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucune demande reçue</SelenCardTitle>
            <p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>
              Les réclamations et suggestions apparaîtront ici dès que les espaces parties prenantes commenceront à les transmettre.
            </p>
          </SelenCard>
        ) : (
          orderedRows.map((item) => {
            const organisation = Array.isArray(item.organisations)
              ? item.organisations[0]
              : item.organisations;

            return (
              <SelenCard key={item.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <SelenCardTitle>{item.subject}</SelenCardTitle>
                    <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                      {TYPE_LABELS[item.submission_type] ?? item.submission_type} · {STAKEHOLDER_LABELS[item.stakeholder_type] ?? item.stakeholder_type} · {organisation?.name ?? "Organisme"}
                    </div>
                  </div>
                  <span style={badgeStyle(item.status)}>{STATUS_LABELS[item.status] ?? item.status}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
                    gap: 10,
                    marginTop: 14,
                    fontSize: 13,
                  }}
                >
                  <Info label="Émetteur" value={item.submitter_name} />
                  <Info label="Contact" value={item.submitter_email || "Non renseigné"} />
                  <Info label="Reçue le" value={formatDateTime(item.created_at)} />
                  <Info label="Revue Selen" value={formatDateTime(item.selen_reviewed_at)} />
                  <Info label="Transmise à l’OF" value={formatDateTime(item.forwarded_at)} />
                  <Info label="Résolue le" value={formatDateTime(item.resolved_at)} />
                </div>

                <div style={{ marginTop: 14, fontSize: 13, whiteSpace: "pre-wrap" }}>
                  <strong>Message</strong>
                  <p style={{ marginBottom: 0 }}>{item.message}</p>
                </div>

                {item.selen_review_note ? (
                  <div style={{ marginTop: 12, fontSize: 13 }}>
                    <strong>Note de revue Selen</strong>
                    <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{item.selen_review_note}</p>
                  </div>
                ) : null}

                {item.organisation_response ? (
                  <div style={{ marginTop: 12, fontSize: 13 }}>
                    <strong>Réponse de l’organisme</strong>
                    <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{item.organisation_response}</p>
                  </div>
                ) : null}

                <div style={{ marginTop: 12, fontSize: 11, color: "var(--selen-text2)" }}>
                  Référence : {item.id}{item.session_id ? ` · Session ${item.session_id}` : ""}{item.enrolment_id ? ` · Inscription ${item.enrolment_id}` : ""}
                </div>

                {item.status === "received" ? <ReviewFeedbackForm id={item.id} /> : null}
                {item.status === "selen_reviewed" ? <ForwardFeedbackButton id={item.id} /> : null}
                {item.status === "forwarded_to_organisation" && String(item.organisation_response ?? "").trim() ? (
                  <ResolveFeedbackButton id={item.id} />
                ) : null}
              </SelenCard>
            );
          })
        )}
      </div>
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <SelenCard>
      <strong style={{ display: "block", fontSize: 26 }}>{value}</strong>
      <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>{label}</span>
    </SelenCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{label}</strong>
      <div style={{ marginTop: 3, color: "var(--selen-text2)" }}>{value}</div>
    </div>
  );
}

function badgeStyle(status: string) {
  const background =
    status === "received"
      ? "rgba(180, 110, 35, .12)"
      : status === "selen_reviewed"
        ? "rgba(65, 105, 180, .12)"
        : status === "forwarded_to_organisation"
          ? "rgba(120, 85, 160, .12)"
          : "rgba(62, 122, 76, .11)";

  return {
    padding: "5px 8px",
    borderRadius: 999,
    background,
    fontWeight: 700,
    fontSize: 12,
  };
}
