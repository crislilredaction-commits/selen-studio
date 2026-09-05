import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const TYPE_LABELS: Record<string, string> = {
  complaint: "Réclamation",
  suggestion: "Suggestion",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Reçue",
  reviewed: "Revue par Selen",
  reviewed_by_selen: "Revue par Selen",
  forwarded_to_organisation: "Transmise à l’organisme",
  resolved: "Résolue",
};

function formatDate(value?: string | null) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isResolved(status?: string | null, resolvedAt?: string | null) {
  return status === "resolved" || Boolean(resolvedAt);
}

export default async function DailyStakeholderFeedbackPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const [{ data: feedback, error: feedbackError }, { data: organisations, error: organisationsError }] = await Promise.all([
    admin
      .from("daily_stakeholder_feedback")
      .select("id,organisation_id,session_id,enrolment_id,submission_type,stakeholder_type,submitter_name,submitter_email,subject,message,status,selen_review_note,selen_reviewed_at,forwarded_at,organisation_response,resolved_at,created_at,updated_at")
      .order("created_at", { ascending: false }),
    admin
      .from("organisations")
      .select("id,name,legal_name,status")
      .neq("status", "archived"),
  ]);

  if (feedbackError || organisationsError) {
    return <main style={s.page}><p style={s.error}>Impossible de charger les réclamations et suggestions Daily.</p></main>;
  }

  const organisationById = new Map((organisations ?? []).map((organisation) => [organisation.id, organisation]));
  const rows = (feedback ?? []).map((item) => ({
    item,
    organisation: organisationById.get(item.organisation_id),
    resolved: isResolved(item.status, item.resolved_at),
  }));

  const complaintCount = rows.filter(({ item }) => item.submission_type === "complaint").length;
  const suggestionCount = rows.filter(({ item }) => item.submission_type === "suggestion").length;
  const openCount = rows.filter(({ resolved }) => !resolved).length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Qualité</p>
          <h1 style={s.h1}>Réclamations & suggestions</h1>
          <p style={s.lead}>Vue de contrôle des retours déjà enregistrés dans Daily. Elle conserve <code>daily_stakeholder_feedback</code> comme source unique et permet aux agents d’identifier rapidement les retours encore ouverts.</p>
        </div>
        <Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link>
      </header>

      <section style={s.stats} aria-label="État des réclamations et suggestions">
        <div style={s.stat}><strong>{rows.length}</strong><span>retour(s)</span></div>
        <div style={complaintCount ? s.statDue : s.stat}><strong>{complaintCount}</strong><span>réclamation(s)</span></div>
        <div style={s.stat}><strong>{suggestionCount}</strong><span>suggestion(s)</span></div>
        <div style={openCount ? s.statDue : s.stat}><strong>{openCount}</strong><span>encore ouvert(s)</span></div>
      </section>

      <section style={s.notice}>
        <strong>Source de vérité conservée</strong>
        <p style={s.muted}>Cette vue n’ajoute ni table ni workflow parallèle. Elle expose les réclamations et suggestions déjà suivies par Daily, avec leur revue Selen, leur transmission éventuelle à l’organisme, sa réponse et leur résolution.</p>
      </section>

      {rows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucune réclamation ni suggestion enregistrée.</p></section>
      ) : (
        <section style={s.list}>
          {rows.map(({ item, organisation, resolved }) => {
            const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
            const statusLabel = STATUS_LABELS[item.status] || item.status || "Statut inconnu";
            return (
              <article key={item.id} style={resolved ? s.cardOk : s.cardDue}>
                <div style={s.rowHead}>
                  <div>
                    <div style={s.badges}>
                      <span style={item.submission_type === "complaint" ? s.badgeComplaint : s.badgeSuggestion}>{TYPE_LABELS[item.submission_type] || item.submission_type}</span>
                      <span style={resolved ? s.badgeResolved : s.badgeOpen}>{statusLabel}</span>
                    </div>
                    <h2 style={s.h2}>{item.subject}</h2>
                    <p style={s.org}>{organisationName} · {item.stakeholder_type || "partie prenante"}</p>
                  </div>
                  <span style={s.date}>{formatDate(item.created_at)}</span>
                </div>

                <p style={s.text}>{item.message}</p>
                <div style={s.metaGrid}>
                  <div><span>Déposant</span><strong>{item.submitter_name || "Non renseigné"}</strong></div>
                  <div><span>Revue Selen</span><strong>{item.selen_reviewed_at ? formatDate(item.selen_reviewed_at) : "À faire"}</strong></div>
                  <div><span>Transmission organisme</span><strong>{item.forwarded_at ? formatDate(item.forwarded_at) : "Non transmise"}</strong></div>
                  <div><span>Résolution</span><strong>{item.resolved_at ? formatDate(item.resolved_at) : resolved ? "Résolue" : "Ouverte"}</strong></div>
                </div>

                {item.selen_review_note ? <p style={s.note}><strong>Note Selen :</strong> {item.selen_review_note}</p> : null}
                {item.organisation_response ? <p style={s.note}><strong>Réponse organisme :</strong> {item.organisation_response}</p> : null}

                <div style={s.actions}>
                  <Link href={`/agent/daily/organisations/${item.organisation_id}`} style={s.secondary}>Voir l’organisme</Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 22, alignItems: "flex-start", marginBottom: 18 },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0 5px", fontFamily: "var(--font-display)", fontSize: 32 },
  h2: { margin: "5px 0", fontSize: 18 },
  lead: { margin: 0, maxWidth: 760, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 14 },
  back: { display: "inline-flex", minHeight: 38, alignItems: "center", padding: "0 12px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontSize: 13, fontWeight: 700 },
  stats: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 },
  stat: { display: "grid", gap: 3, padding: 14, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)" },
  statDue: { display: "grid", gap: 3, padding: 14, border: "1px solid rgba(180,78,70,.35)", borderRadius: 12, background: "rgba(180,78,70,.08)" },
  notice: { padding: 15, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", marginBottom: 14 },
  list: { display: "grid", gap: 12 },
  card: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  cardOk: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  cardDue: { padding: 18, border: "1px solid rgba(180,78,70,.28)", borderRadius: 14, background: "rgba(180,78,70,.045)" },
  rowHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" },
  badges: { display: "flex", gap: 7, flexWrap: "wrap" },
  badgeComplaint: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(180,78,70,.14)", color: "var(--selen-danger)", fontSize: 11, fontWeight: 800 },
  badgeSuggestion: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(83,132,166,.12)", color: "var(--selen-info)", fontSize: 11, fontWeight: 800 },
  badgeOpen: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  badgeResolved: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(75,140,100,.12)", color: "var(--selen-success)", fontSize: 11, fontWeight: 800 },
  org: { margin: 0, color: "var(--selen-text3)", fontSize: 12 },
  date: { fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap" },
  text: { margin: "14px 0", lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13, whiteSpace: "pre-wrap" },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12 },
  note: { margin: "12px 0 0", padding: 11, borderRadius: 10, background: "var(--selen-bg)", color: "var(--selen-text2)", lineHeight: 1.55, fontSize: 12 },
  actions: { display: "flex", gap: 9, marginTop: 14 },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 11px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 12 },
  muted: { margin: "6px 0 0", lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13 },
  error: { color: "var(--selen-danger)" },
};
