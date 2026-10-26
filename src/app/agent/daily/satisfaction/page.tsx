import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { dailySatisfactionLearnerProgress } from "@/lib/daily/dailySatisfactionLearnerProgress.mjs";
import { filterDailySatisfactionRows, normalizeDailySatisfactionQuery, normalizeDailySatisfactionView } from "@/lib/daily/dailySatisfactionFilters.mjs";

type SessionRow = {
  id: string;
  organisation_id: string;
  internal_reference: string | null;
  start_date: string | null;
  end_date: string | null;
  organisations?: { name?: string | null } | { name?: string | null }[] | null;
  daily_formations?: { title?: string | null } | { title?: string | null }[] | null;
};

type EnrolmentRow = { id: string; session_id: string; status: string };
type LearnerFeedbackRow = { session_id: string; enrolment_id: string };
type StakeholderRow = { session_id: string; stakeholder_type: string };

function relationName(value: SessionRow["organisations"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? "Organisme";
}

function formationTitle(value: SessionRow["daily_formations"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.title ?? "Formation";
}

function frDate(value: string | null) {
  if (!value) return "Date à préciser";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(`${value}T12:00:00+02:00`));
}

function stakeholderCount(rows: StakeholderRow[], sessionId: string, types: string[]) {
  return rows.filter((row) => row.session_id === sessionId && types.includes(row.stakeholder_type)).length;
}

type Props = { searchParams?: Promise<{ q?: string | string[]; vue?: string | string[] }> };

export default async function DailySatisfactionTrackingPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  const admin = createSupabaseAdminClient();
  if (organisationIds.length === 0) {
    return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}><h1>Satisfaction</h1><p>Aucun organisme Daily affecté.</p></main>;
  }

  const [sessionRes, enrolmentRes, learnerRes, stakeholderRes] = await Promise.all([
    admin.from("daily_sessions")
      .select("id,organisation_id,internal_reference,start_date,end_date,organisations(name),daily_formations(title)")
      .in("organisation_id", organisationIds)
      .order("end_date", { ascending: false, nullsFirst: false }),
    admin.from("daily_session_enrolments")
      .select("id,session_id,status")
      .in("organisation_id", organisationIds),
    admin.from("daily_learner_feedback_responses")
      .select("session_id,enrolment_id")
      .in("organisation_id", organisationIds),
    admin.from("daily_stakeholder_satisfaction_responses")
      .select("session_id,stakeholder_type")
      .in("organisation_id", organisationIds),
  ]);

  const error = sessionRes.error ?? enrolmentRes.error ?? learnerRes.error ?? stakeholderRes.error;
  if (error) throw new Error(error.message);

  const sessions = (sessionRes.data ?? []) as SessionRow[];
  const enrolments = (enrolmentRes.data ?? []) as EnrolmentRow[];
  const learnerFeedback = (learnerRes.data ?? []) as LearnerFeedbackRow[];
  const stakeholders = (stakeholderRes.data ?? []) as StakeholderRow[];
  const rows = sessions.map((session) => {
    const { expectedLearners, learnerDone, missingLearners, learnerComplete } = dailySatisfactionLearnerProgress(enrolments, learnerFeedback, session.id);
    const companyDone = stakeholderCount(stakeholders, session.id, ["company", "enterprise"]);
    const trainerDone = stakeholderCount(stakeholders, session.id, ["trainer"]);
    const clientDone = stakeholderCount(stakeholders, session.id, ["client"]);
    const hasAnyResponse = learnerDone + companyDone + trainerDone + clientDone > 0;
    return { session, expectedLearners, learnerDone, missingLearners, companyDone, trainerDone, clientDone, learnerComplete, hasAnyResponse };
  });

  const sessionsWithMissingLearnerFeedback = rows.filter((row) => row.expectedLearners > row.learnerDone).length;
  const sessionsWithResponses = rows.filter((row) => row.hasAnyResponse).length;
  const missingLearnerResponses = rows.reduce((total, row) => total + row.missingLearners, 0);
  const params = await searchParams;
  const query = normalizeDailySatisfactionQuery(params?.q);
  const view = normalizeDailySatisfactionView(params?.vue);
  // Les filtres ne reçoivent que les sessions déjà bornées aux organismes affectés.
  const visibleRows = filterDailySatisfactionRows(rows, query, view, (row) =>
    [formationTitle(row.session.daily_formations), relationName(row.session.organisations), row.session.internal_reference].join(" "));
  const completedSessions = rows.filter((row) => row.expectedLearners > 0 && row.learnerComplete).length;
  const viewHref = (nextView: "all" | "missing" | "complete") => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (nextView !== "all") search.set("vue", nextView);
    return search.size ? `/agent/daily/satisfaction?${search.toString()}` : "/agent/daily/satisfaction";
  };

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 28px 60px" }}>
    <header style={{ marginBottom: 18 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "var(--selen-gold2)", textTransform: "uppercase", letterSpacing: ".16em" }}>Selen Studio · Daily</p>
      <h1 style={{ margin: "6px 0" }}>Satisfaction & évaluations</h1>
      <p style={{ margin: 0, color: "var(--selen-text2)" }}>Suivi centralisé des réponses réellement enregistrées. Les réponses apprenants et parties prenantes restent séparées par session et par répondant.</p>
    </header>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 18 }}>
      <SelenCard><SelenCardTitle>Sessions suivies</SelenCardTitle><strong style={{ fontSize: 26 }}>{rows.length}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Avec au moins une réponse</SelenCardTitle><strong style={{ fontSize: 26 }}>{sessionsWithResponses}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Satisfaction apprenant incomplète</SelenCardTitle><strong style={{ fontSize: 26 }}>{sessionsWithMissingLearnerFeedback}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Réponses apprenants manquantes</SelenCardTitle><strong style={{ fontSize: 26 }}>{missingLearnerResponses}</strong></SelenCard>
    </div>

    <SelenCard style={{ marginBottom: 18 }}>
      <form action="/agent/daily/satisfaction" method="get" role="search" aria-label="Filtrer les sessions de satisfaction" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        {view !== "all" ? <input type="hidden" name="vue" value={view} /> : null}
        <label htmlFor="satisfaction-search" style={{ display: "grid", gap: 5, flex: "1 1 260px", fontSize: 12, fontWeight: 700 }}>
          Rechercher une formation, un organisme ou une référence
          <input id="satisfaction-search" type="search" name="q" maxLength={80} defaultValue={query} placeholder="Nom, organisme, référence…" style={{ minHeight: 40, padding: "8px 11px", border: "1px solid var(--selen-border)", borderRadius: 9, background: "var(--selen-bg2)", color: "var(--selen-text)" }} />
        </label>
        <button type="submit" style={{ minHeight: 40, padding: "8px 14px", border: 0, borderRadius: 9, background: "var(--selen-gold2)", color: "var(--selen-bg)", fontWeight: 800, cursor: "pointer" }}>Rechercher</button>
        {query ? <Link href={viewHref(view)} style={{ fontSize: 12, color: "var(--selen-text2)" }}>Effacer la recherche</Link> : null}
      </form>
      <nav aria-label="Prioriser les sessions de satisfaction" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {([
          { key: "all", label: "Toutes", count: rows.length },
          { key: "missing", label: "À relancer", count: sessionsWithMissingLearnerFeedback },
          { key: "complete", label: "Complètes", count: completedSessions },
        ] as const).map((item) => <Link key={item.key} href={viewHref(item.key)} aria-current={view === item.key ? "page" : undefined} style={{ border: "1px solid var(--selen-border2)", borderRadius: 999, padding: "7px 12px", textDecoration: "none", fontSize: 12, fontWeight: 700, background: view === item.key ? "var(--selen-gold2)" : "transparent", color: view === item.key ? "var(--selen-bg)" : "var(--selen-text)" }}>{item.label} ({item.count})</Link>)}
      </nav>
      <p role="status" style={{ margin: "12px 0 0", fontSize: 12, color: "var(--selen-text2)" }}>{visibleRows.length} session{visibleRows.length > 1 ? "s" : ""} affichée{visibleRows.length > 1 ? "s" : ""}. {view === "missing" ? "Les dossiers avec le plus de réponses manquantes apparaissent en premier." : ""}</p>
    </SelenCard>

    <section style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 ? <SelenCard><SelenCardTitle>Aucune session Daily</SelenCardTitle></SelenCard> : visibleRows.length === 0 ? <SelenCard><SelenCardTitle>Aucune session pour ces filtres</SelenCardTitle><p style={{ fontSize: 13, color: "var(--selen-text2)" }}>Essayez une autre recherche ou affichez toutes les sessions.</p><Link href="/agent/daily/satisfaction">Voir toutes les sessions →</Link></SelenCard> : visibleRows.map((row) => <SelenCard key={row.session.id}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <SelenCardTitle>{formationTitle(row.session.daily_formations)}</SelenCardTitle>
            <p style={{ margin: "3px 0", color: "var(--selen-text2)", fontSize: 13 }}>{relationName(row.session.organisations)} · {row.session.internal_reference || "Sans référence"}</p>
            <p style={{ margin: "3px 0", color: "var(--selen-text2)", fontSize: 12 }}>{frDate(row.session.start_date)} → {frDate(row.session.end_date)}</p>
          </div>
          <Link href={`/agent/daily/session-dossiers/${row.session.id}/satisfaction`} style={{ border: "1px solid var(--selen-border2)", borderRadius: 9, padding: "8px 11px", color: "var(--selen-text)", textDecoration: "none", fontSize: 12, fontWeight: 800 }}>Ouvrir le détail</Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 12 }}>
          <div style={metricStyle}><span>Apprenants</span><strong>{row.learnerDone}/{row.expectedLearners}</strong><progress value={row.learnerDone} max={Math.max(1, row.expectedLearners)} aria-label={`Réponses apprenants : ${formationTitle(row.session.daily_formations)}`} style={{ width: "100%", accentColor: "var(--selen-gold2)" }} /><small>{row.learnerComplete ? "Complet" : row.expectedLearners === 0 ? "Aucun attendu" : `${row.missingLearners} réponse(s) à obtenir`}</small></div>
          <div style={metricStyle}><span>Commanditaire</span><strong>{row.companyDone}</strong><small>réponse(s)</small></div>
          <div style={metricStyle}><span>Formateur</span><strong>{row.trainerDone}</strong><small>réponse(s)</small></div>
          <div style={metricStyle}><span>OF · plateforme</span><strong>{row.clientDone}</strong><small>réponse(s)</small></div>
        </div>
      </SelenCard>)}
    </section>
  </main>;
}

const metricStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  border: "1px solid var(--selen-border)",
  borderRadius: 9,
  padding: 10,
  background: "var(--selen-bg3)",
  fontSize: 12,
};
