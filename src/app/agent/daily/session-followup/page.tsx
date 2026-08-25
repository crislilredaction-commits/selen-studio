import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

const typeLabels: Record<string, string> = {
  note: "Note de suivi",
  incident: "Incident / cas particulier",
  adaptation: "Adaptation",
};

const levelLabels: Record<string, string> = {
  info: "Information",
  attention: "À suivre",
  critical: "Critique",
};

function learnerName(value: unknown) {
  const learner = Array.isArray(value) ? value[0] : value;
  if (!learner || typeof learner !== "object") return "";
  const row = learner as { first_name?: string | null; last_name?: string | null; email?: string | null };
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDay(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

export default async function SessionFollowupPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={styles.page}><p style={styles.error}>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const { data: entries, error } = await admin
    .from("daily_session_followup_entries")
    .select("id,session_id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,daily_sessions(id,internal_reference,start_date,end_date,daily_formations(title)),daily_session_enrolments(id,daily_learners(first_name,last_name,email))")
    .order("occurred_at", { ascending: false })
    .limit(250);

  if (error) {
    return <main style={styles.page}><p style={styles.error}>Impossible de charger le suivi des sessions.</p></main>;
  }

  const rows = entries ?? [];
  const operationalOpen = rows.filter((entry) => entry.entry_type !== "note" && entry.status === "open");
  const criticalOpen = operationalOpen.filter((entry) => entry.level === "critical");
  const notes = rows.filter((entry) => entry.entry_type === "note");

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Studio agent · Daily</p>
          <h1 style={styles.title}>Suivi pendant les sessions</h1>
          <p style={styles.subtitle}>
            Vue transverse des notes, incidents, cas particuliers et adaptations consignés par les formateurs. Les notes restent informatives ; les situations ouvertes nécessitant une intervention remontent aussi dans le centre d’actions Daily.
          </p>
        </div>
        <Link href="/agent/daily/actions" style={styles.headerLink}>Voir les actions Daily →</Link>
      </header>

      <section style={styles.statsGrid} aria-label="Synthèse du suivi des sessions">
        <Stat label="Situations ouvertes" value={operationalOpen.length} />
        <Stat label="Situations critiques" value={criticalOpen.length} variant={criticalOpen.length > 0 ? "danger" : "neutral"} />
        <Stat label="Notes consignées" value={notes.length} />
        <Stat label="Éléments consultables" value={rows.length} />
      </section>

      {criticalOpen.length > 0 ? (
        <div style={styles.alert} role="alert">
          <SelenBadge variant="danger" dot>Prioritaire</SelenBadge>
          <span>{criticalOpen.length} situation{criticalOpen.length > 1 ? "s" : ""} critique{criticalOpen.length > 1 ? "s" : ""} nécessite{criticalOpen.length > 1 ? "nt" : ""} une attention rapide.</span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <SelenCard style={styles.sectionCard}>
          <p style={styles.empty}>Aucun suivi de session enregistré pour le moment.</p>
        </SelenCard>
      ) : (
        <section style={styles.list} aria-label="Historique du suivi en session">
          {rows.map((entry) => {
            const session = Array.isArray(entry.daily_sessions) ? entry.daily_sessions[0] : entry.daily_sessions;
            const enrolment = Array.isArray(entry.daily_session_enrolments) ? entry.daily_session_enrolments[0] : entry.daily_session_enrolments;
            const formation = Array.isArray(session?.daily_formations) ? session?.daily_formations[0] : session?.daily_formations;
            const learner = learnerName(enrolment?.daily_learners);
            const isNote = entry.entry_type === "note";
            const isOpen = !isNote && entry.status === "open";
            const isCritical = isOpen && entry.level === "critical";

            return (
              <SelenCard key={entry.id} style={styles.sectionCard}>
                <div style={styles.itemHeader}>
                  <div style={styles.itemMain}>
                    <div style={styles.badges}>
                      <SelenBadge variant={isNote ? "neutral" : entry.entry_type === "adaptation" ? "info" : "warn"}>
                        {typeLabels[entry.entry_type] ?? entry.entry_type}
                      </SelenBadge>
                      {!isNote ? (
                        <SelenBadge variant={isCritical ? "danger" : entry.level === "attention" ? "warn" : "info"} dot={isCritical}>
                          {levelLabels[entry.level] ?? entry.level}
                        </SelenBadge>
                      ) : null}
                      <SelenBadge variant={isNote ? "neutral" : isOpen ? "warn" : "success"}>
                        {isNote ? "Consignée" : isOpen ? "Ouverte" : "Traitée"}
                      </SelenBadge>
                    </div>
                    <SelenCardTitle>{entry.summary}</SelenCardTitle>
                    <p style={styles.meta}>
                      {formatDate(entry.occurred_at)}{learner ? ` · ${learner}` : ""}
                    </p>
                  </div>
                  {session?.id ? (
                    <Link href={`/agent/daily/session-dossiers/${session.id}`} style={styles.link}>
                      Ouvrir le dossier →
                    </Link>
                  ) : null}
                </div>

                <div style={styles.contextBox}>
                  <strong>{formation?.title ?? session?.internal_reference ?? "Session Daily"}</strong>
                  {(session?.start_date || session?.end_date) ? (
                    <span style={styles.contextMeta}>
                      {session?.start_date ? formatDay(session.start_date) : ""}
                      {session?.end_date && session.end_date !== session.start_date ? ` → ${formatDay(session.end_date)}` : ""}
                    </span>
                  ) : null}
                </div>

                {entry.description ? <p style={styles.text}>{entry.description}</p> : null}
                {entry.action_taken ? (
                  <p style={styles.actionText}><strong>Action réalisée :</strong> {entry.action_taken}</p>
                ) : null}
              </SelenCard>
            );
          })}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, variant = "neutral" }: { label: string; value: number; variant?: "neutral" | "danger" }) {
  return (
    <article style={{ ...styles.stat, ...(variant === "danger" ? styles.statDanger : {}) }}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={{ ...styles.statValue, ...(variant === "danger" ? styles.statValueDanger : {}) }}>{value}</strong>
    </article>
  );
}

const styles = {
  page: { maxWidth: 1180, margin: "0 auto", padding: 28, color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 22, flexWrap: "wrap" as const },
  eyebrow: { margin: 0, fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: "var(--selen-gold)" },
  title: { margin: "8px 0 0", fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.15 },
  subtitle: { margin: "10px 0 0", maxWidth: 800, color: "var(--selen-text2)", fontSize: 14, lineHeight: 1.65 },
  headerLink: { color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700, textDecoration: "none", marginTop: 4 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  stat: { border: "1px solid var(--selen-border)", background: "var(--selen-bg2)", borderRadius: "var(--radius-md)", padding: 14, display: "grid", gap: 8 },
  statDanger: { borderColor: "var(--selen-danger)", background: "var(--selen-danger-bg)" },
  statLabel: { fontSize: 11, color: "var(--selen-text3)" },
  statValue: { fontFamily: "var(--font-display)", fontSize: 25, color: "var(--selen-gold2)" },
  statValueDanger: { color: "var(--selen-danger)" },
  alert: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const, padding: 13, marginBottom: 18, border: "1px solid var(--selen-danger)", borderRadius: "var(--radius-md)", background: "var(--selen-danger-bg)", color: "var(--selen-text2)", fontSize: 13 },
  list: { display: "grid", gap: 12 },
  sectionCard: { margin: 0 },
  itemHeader: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" as const },
  itemMain: { minWidth: 0, flex: "1 1 520px" },
  badges: { display: "flex", gap: 7, flexWrap: "wrap" as const, marginBottom: 10 },
  meta: { margin: "5px 0 0", color: "var(--selen-text3)", fontSize: 11, lineHeight: 1.5 },
  link: { color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700, textDecoration: "none" },
  contextBox: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginTop: 12, padding: "9px 11px", border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", background: "var(--selen-bg3)", fontSize: 12 },
  contextMeta: { color: "var(--selen-text3)" },
  text: { margin: "12px 0 0", color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.6 },
  actionText: { margin: "10px 0 0", color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.6 },
  empty: { margin: 0, color: "var(--selen-text3)", fontSize: 13 },
  error: { border: "1px solid var(--selen-danger)", background: "var(--selen-danger-bg)", borderRadius: "var(--radius-md)", padding: 14, color: "var(--selen-danger)", fontSize: 14 },
};
