import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  invited: "Invité", pending: "En attente", confirmed: "Confirmé", declined: "Refusé",
  cancelled: "Annulé", abandoned: "Abandon", completed: "Terminé", not_started: "Non démarré",
  sent: "Envoyé", submitted: "Répondu", reviewed: "Relu", not_reviewed: "Non vérifiés",
  met: "Validés", not_met: "Non remplis", to_clarify: "À clarifier",
};
const label = (value: unknown) => labels[String(value ?? "")] ?? String(value ?? "À préciser");
const related = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] ?? null : value ?? null;
const date = (value: unknown) => value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(String(value))) : "À préciser";

export default async function DailyLearnerFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;
  const { id } = await params;
  const { session: requestedSessionId = "" } = await searchParams;
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (!organisationIds.length) notFound();

  const admin = createSupabaseAdminClient();
  const { data: learner, error: learnerError } = await admin
    .from("daily_learners")
    .select("id,organisation_id,first_name,last_name,email,phone,company_name,job_title,status,created_at,organisations(name,legal_name)")
    .eq("id", id)
    .in("organisation_id", organisationIds)
    .maybeSingle();
  if (learnerError) throw new Error("Lecture de la fiche apprenant indisponible.");
  if (!learner) notFound();

  const { data: enrolments, error: enrolmentsError } = await admin
    .from("daily_session_enrolments")
    .select("id,organisation_id,session_id,status,positioning_status,prerequisites_status,funding_type,contracting_party_type,company_name,created_at,daily_sessions(id,organisation_id,internal_reference,start_date,end_date,daily_formations(title))")
    .eq("learner_id", id)
    .eq("organisation_id", learner.organisation_id)
    .order("created_at", { ascending: false });
  if (enrolmentsError) throw new Error("Lecture des inscriptions indisponible.");

  const safeEnrolments = (enrolments ?? []).filter((enrolment) => {
    const session = related(enrolment.daily_sessions);
    return session?.organisation_id === learner.organisation_id && enrolment.organisation_id === learner.organisation_id;
  });
  if (requestedSessionId && !safeEnrolments.some((enrolment) => enrolment.session_id === requestedSessionId)) notFound();
  const enrolmentIds = safeEnrolments.map((enrolment) => enrolment.id);
  const [{ data: supportNeeds }, { data: notes }, { data: documents }] = enrolmentIds.length ? await Promise.all([
    admin.from("daily_enrolment_support_needs").select("enrolment_id,has_specific_needs,needs_description,planned_accommodations,contact_requested").eq("organisation_id", learner.organisation_id).in("enrolment_id", enrolmentIds),
    admin.from("daily_session_followup_entries").select("id,enrolment_id,summary,description,occurred_at,author_role,author_name,status").eq("organisation_id", learner.organisation_id).in("enrolment_id", enrolmentIds).order("occurred_at", { ascending: false }),
    admin.from("daily_documents").select("id,enrolment_id,logical_name,document_type,status,created_at").eq("organisation_id", learner.organisation_id).in("enrolment_id", enrolmentIds).eq("is_current", true).order("created_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const organisation = related(learner.organisations);
  const name = [learner.first_name, learner.last_name].filter(Boolean).join(" ") || learner.email || "Apprenant";

  return <main style={s.page}>
    <div style={s.backRow}><Link href="/agent/daily/learners">← Apprenants</Link>{requestedSessionId ? <Link href={`/agent/daily/session-dossiers/${requestedSessionId}`}>Dossier de session</Link> : null}</div>
    <header style={s.header}><p style={s.eyebrow}>FICHE APPRENANT · {organisation?.legal_name || organisation?.name || "Organisme Daily"}</p><h1 style={s.title}>{name}</h1><p style={s.muted}>{[learner.email, learner.phone, learner.job_title, learner.company_name].filter(Boolean).join(" · ") || "Coordonnées non renseignées"}</p></header>
    <section style={s.grid}>
      {safeEnrolments.map((enrolment) => {
        const session = related(enrolment.daily_sessions);
        const formation = related(session?.daily_formations);
        const need = (supportNeeds ?? []).find((item) => item.enrolment_id === enrolment.id);
        const enrolmentNotes = (notes ?? []).filter((item) => item.enrolment_id === enrolment.id);
        const enrolmentDocuments = (documents ?? []).filter((item) => item.enrolment_id === enrolment.id);
        return <article key={enrolment.id} style={{ ...s.card, ...(requestedSessionId === enrolment.session_id ? s.selected : {}) }}>
          <div style={s.cardHeader}><div><h2 style={s.h2}>{formation?.title || "Session Daily"}</h2><p style={s.muted}>{session?.internal_reference || date(session?.start_date)} · {date(session?.start_date)} → {date(session?.end_date)}</p></div><Link href={`/agent/daily/session-dossiers/${enrolment.session_id}`}>Ouvrir la session →</Link></div>
          <dl style={s.facts}><Fact title="Inscription" value={label(enrolment.status)} /><Fact title="Positionnement" value={label(enrolment.positioning_status)} /><Fact title="Prérequis" value={label(enrolment.prerequisites_status)} /><Fact title="Partie contractante" value={label(enrolment.contracting_party_type)} /><Fact title="Financement" value={label(enrolment.funding_type)} /></dl>
          {need?.has_specific_needs ? <div style={s.notice}><strong>Adaptation signalée</strong><p>{need.needs_description || "Besoin à préciser"}</p>{need.planned_accommodations ? <p>Prévu : {need.planned_accommodations}</p> : null}{need.contact_requested ? <p>Un échange complémentaire est demandé.</p> : null}</div> : null}
          <details><summary>Suivi ({enrolmentNotes.length})</summary>{enrolmentNotes.map((item) => <p key={item.id} style={s.row}><strong>{item.summary}</strong> · {date(item.occurred_at)}{item.author_name ? ` · ${item.author_name}` : ""}</p>)}</details>
          <details><summary>Documents ({enrolmentDocuments.length})</summary>{enrolmentDocuments.map((item) => <p key={item.id} style={s.row}><strong>{item.logical_name}</strong> · {label(item.status)} · {date(item.created_at)}</p>)}</details>
        </article>;
      })}
      {safeEnrolments.length === 0 ? <p style={s.card}>Aucune inscription rattachée à cet apprenant.</p> : null}
    </section>
  </main>;
}

function Fact({ title, value }: { title: string; value: string }) {
  return <div><dt style={s.dt}>{title}</dt><dd style={s.dd}>{value}</dd></div>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1060, margin: "0 auto", padding: "28px", display: "grid", gap: 18 },
  backRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  header: { padding: 20, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 800, color: "var(--selen-text2)" },
  title: { margin: "6px 0", overflowWrap: "anywhere" },
  muted: { margin: "4px 0", color: "var(--selen-text2)", overflowWrap: "anywhere" },
  grid: { display: "grid", gap: 14 },
  card: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  selected: { borderColor: "var(--selen-gold2)", boxShadow: "0 0 0 2px rgba(201,160,85,.15)" },
  cardHeader: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  h2: { margin: 0, fontSize: 18 },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, margin: "16px 0" },
  dt: { fontSize: 11, color: "var(--selen-text2)" },
  dd: { margin: "3px 0 0", fontWeight: 750 },
  notice: { padding: 12, borderRadius: 10, background: "rgba(210,145,65,.10)", marginBottom: 12 },
  row: { padding: "8px 0", borderBottom: "1px solid var(--selen-border)", fontSize: 13 },
};
