import Link from "next/link";

import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import styles from "./daily-organisation-sessions.module.css";

export type DailyOrganisationSessionSummary = {
  id: string;
  internal_reference?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  dossier_status?: string | null;
  enrolment_count?: number;
  daily_formations?: { title?: string | null } | Array<{ title?: string | null }> | null;
};

type SessionGroup = {
  id: "planned" | "current" | "closing" | "history";
  title: string;
  description: string;
  sessions: DailyOrganisationSessionSummary[];
};

type DailyOrganisationSessionsProps = {
  organisationId: string;
  planned: DailyOrganisationSessionSummary[];
  current: DailyOrganisationSessionSummary[];
  closing: DailyOrganisationSessionSummary[];
  history: DailyOrganisationSessionSummary[];
  mode?: "summary" | "workspace";
};

const phases = [
  { id: "overview", label: "Vue d’ensemble", fragment: "vue-ensemble" },
  { id: "before", label: "Avant", fragment: "documents-avant-formation" },
  { id: "during", label: "Pendant", fragment: "pendant-formation" },
  { id: "after", label: "Après", fragment: "apres-formation" },
] as const;

const activePhaseByGroup: Record<SessionGroup["id"], (typeof phases)[number]["id"]> = {
  planned: "before",
  current: "during",
  closing: "after",
  history: "overview",
};

function formationTitle(session: DailyOrganisationSessionSummary) {
  const formation = Array.isArray(session.daily_formations)
    ? session.daily_formations[0]
    : session.daily_formations;
  return formation?.title || session.internal_reference || "Session";
}

function dateLabel(session: DailyOrganisationSessionSummary) {
  if (!session.start_date) return "Dates à préciser";
  if (!session.end_date || session.end_date === session.start_date) return session.start_date;
  return `${session.start_date} → ${session.end_date}`;
}

function badgeVariant(groupId: SessionGroup["id"]) {
  if (groupId === "current") return "success" as const;
  if (groupId === "closing") return "warn" as const;
  if (groupId === "planned") return "info" as const;
  return "neutral" as const;
}

function SessionCard({ session, groupId }: { session: DailyOrganisationSessionSummary; groupId: SessionGroup["id"] }) {
  const base = `/agent/daily/session-dossiers/${encodeURIComponent(session.id)}/full`;
  const activePhase = activePhaseByGroup[groupId];
  return <article className={styles.sessionCard}>
    <div className={styles.sessionHead}>
      <div>
        <h3>{formationTitle(session)}</h3>
        <p>{dateLabel(session)}{session.internal_reference ? ` · ${session.internal_reference}` : ""}</p>
      </div>
      <SelenBadge variant={badgeVariant(groupId)}>{groupId === "planned" ? "À venir" : groupId === "current" ? "En cours" : groupId === "closing" ? "À clôturer" : "Historique"}</SelenBadge>
    </div>
    <p className={styles.sessionMeta}>{session.enrolment_count ?? 0} inscription(s) · dossier {session.dossier_status || "à préparer"}</p>
    <nav aria-label={`Phases de ${formationTitle(session)}`} className={styles.phaseLinks}>
      {phases.map((phase) => <Link key={phase.id} href={`${base}#${phase.fragment}`} className={phase.id === activePhase ? styles.activePhase : undefined}>
        <span aria-hidden="true">{phase.id === activePhase ? "●" : "○"}</span>{phase.label}
      </Link>)}
    </nav>
    <Link className={styles.openAction} href={`${base}#vue-ensemble`}>Ouvrir le dossier de session →</Link>
  </article>;
}

export default function DailyOrganisationSessions({ organisationId, planned, current, closing, history, mode = "workspace" }: DailyOrganisationSessionsProps) {
  const groups: SessionGroup[] = [
    { id: "planned", title: "À venir", description: "Préparer les inscriptions, positionnements et documents.", sessions: planned },
    { id: "current", title: "En cours", description: "Suivre les présences, incidents et régularisations.", sessions: current },
    { id: "closing", title: "À clôturer", description: "Finaliser évaluations, satisfaction et pièces de sortie.", sessions: closing },
    { id: "history", title: "Terminées", description: "Retrouver les dossiers clos sans perdre leur historique.", sessions: history },
  ];

  if (mode === "summary") return <SelenCard style={{ gridColumn: "1 / -1" }}>
    <div className={styles.summaryHead}>
      <div><SelenCardTitle>Sessions de cet organisme</SelenCardTitle><p>Choisis une session avant d’agir sur Avant, Pendant ou Après.</p></div>
      <Link href={`/agent/daily/organisations/${encodeURIComponent(organisationId)}?tab=sessions`}>Voir toutes les sessions →</Link>
    </div>
    <div className={styles.summaryGrid}>{groups.slice(0, 3).map((group) => <section key={group.id}><strong>{group.title}</strong><span>{group.sessions.length}</span></section>)}</div>
  </SelenCard>;

  return <section className={styles.workspace} aria-labelledby="organisation-sessions-title">
    <header className={styles.workspaceHead}>
      <div><p className={styles.eyebrow}>Organisme → sessions → dossier</p><h2 id="organisation-sessions-title">Sessions de formation</h2><p>Ouvre la session concernée, puis travaille dans sa phase métier sans perdre le contexte de l’organisme.</p></div>
      <span>{planned.length + current.length + closing.length + history.length} session(s)</span>
    </header>
    <div className={styles.groups}>{groups.map((group) => <section key={group.id} className={styles.group}>
      <header><div><h3>{group.title}</h3><p>{group.description}</p></div><strong>{group.sessions.length}</strong></header>
      {group.sessions.length === 0 ? <p className={styles.empty}>Aucune session dans cette étape.</p> : <div className={styles.cards}>{group.sessions.map((session) => <SessionCard key={session.id} session={session} groupId={group.id}/>)}</div>}
    </section>)}</div>
  </section>;
}
