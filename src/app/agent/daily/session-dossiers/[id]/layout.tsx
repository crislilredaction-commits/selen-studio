import Link from "next/link";
import type { ReactNode } from "react";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import SessionWorkspaceNavigation from "./SessionWorkspaceNavigation";
import styles from "./session-workspace.module.css";

export default async function SessionDossierLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date").eq("id", id).maybeSingle();
  if (sessionError || !session?.organisation_id) return <main style={{ padding: 28 }}>Dossier de session introuvable.</main>;
  if (!(await isDailyOrganisationInAgentScope(auth.email, session.organisation_id))) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const [{ data: organisation }, { data: formation }] = await Promise.all([
    admin.from("organisations").select("name,legal_name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("title").eq("id", session.formation_id).eq("organisation_id", session.organisation_id).maybeSingle(),
  ]);
  const organisationName = organisation?.legal_name || organisation?.name || "Organisme de formation";
  const sessionTitle = formation?.title || session.internal_reference || "Session Daily";
  return <>
    <section className={styles.shell} aria-label="Contexte du dossier de session">
      <nav aria-label="Fil d’Ariane" className={styles.breadcrumbs}><Link href="/agent/daily/organisations">Organismes</Link><span aria-hidden="true">›</span><Link href={`/agent/daily/organisations/${encodeURIComponent(session.organisation_id)}?tab=sessions`}>{organisationName}</Link><span aria-hidden="true">›</span><span aria-current="page">Dossier de session</span></nav>
      <header className={styles.sessionHeader}><div><p className={styles.eyebrow}>Organisme → session → dossier</p><h1>{sessionTitle}</h1><p>{organisationName}{session.internal_reference ? ` · ${session.internal_reference}` : ""}{session.start_date ? ` · ${session.start_date}${session.end_date && session.end_date !== session.start_date ? ` → ${session.end_date}` : ""}` : ""}</p></div><div className={styles.headerActions}><Link className={styles.primaryAction} href={`/agent/daily/session-dossiers/${id}/full#vue-ensemble`}>Ouvrir le dossier unifié</Link><Link href={`/agent/daily/escalations?session_id=${encodeURIComponent(id)}`}>Escalader ce dossier à un admin</Link></div></header>
      <SessionWorkspaceNavigation sessionId={id}/>
    </section>
    {children}
  </>;
}
