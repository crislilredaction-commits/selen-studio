import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyPilotageTasks, canTreatDailyPilotageTask } from "@/lib/server/dailyPilotageVisibility";
import { getStudioClientFollowups } from "@/lib/server/studioClientFollowups";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { presentDailyTask } from "@/lib/dailyTaskPresentation";
import { prioritizeDailyPilotageTasks, paginateDailyPilotageTasks } from "@/lib/daily/pilotageTaskQueue.mjs";
import { normalizeDailyPilotageQuery, searchDailyPilotageTasks } from "@/lib/daily/pilotageTaskSearch.mjs";
import { countDailyPilotageViews, filterDailyPilotageTasks, normalizeDailyPilotageView } from "@/lib/daily/pilotageTaskFilters.mjs";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Date inconnue";
}

type Props = { searchParams?: Promise<{ vue?: string | string[]; q?: string | string[]; page?: string | string[] }> };

export default async function AgentDailyPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main className="daily-page" style={s.page}><p>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: adminUser }] = await Promise.all([
    admin.from("agent_profiles").select("id,role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  const role = (adminUser?.role === "admin" || profile?.role === "admin" ? "admin" : "agent") as "admin" | "agent";
  const staff = { id: profile?.id ?? null, role };

  let tasks;
  let followups;
  try {
    [tasks, followups] = await Promise.all([getDailyPilotageTasks(), getStudioClientFollowups(staff, { dailyOnly: true })]);
  } catch (error) {
    const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (selectedView !== "all") query.set("vue", selectedView);
    if (searchQuery) query.set("q", searchQuery);
    if (page > 1) query.set("page", String(page));
    return query.size ? `/agent/daily?${query.toString()}#taches-daily` : "/agent/daily#taches-daily";
  };

  return <main className="daily-page" style={s.page}><p style={s.error}>Impossible de charger le pilotage Daily : {error instanceof Error ? error.message : "erreur inconnue"}</p></main>;
  }

  const params = await searchParams;
  const selectedView = normalizeDailyPilotageView(params?.vue);
  const searchQuery = normalizeDailyPilotageQuery(params?.q);
  const searchedTasks = searchDailyPilotageTasks(tasks, searchQuery, item => [item.title, item.reason, item.detail, presentDailyTask(item).context].join(" "));
  const access = { canTreat: (item: (typeof tasks)[number]) => canTreatDailyPilotageTask(item, staff) };
  const viewCounts = countDailyPilotageViews(searchedTasks, access);
  const allSortedTasks = prioritizeDailyPilotageTasks(filterDailyPilotageTasks(searchedTasks, selectedView, access));
  const pagination = paginateDailyPilotageTasks(allSortedTasks, params?.page);
  const sortedTasks = pagination.items;
  const urgentCount = viewCounts.urgent;
  const views = [
    { key: "all", label: "Toutes", count: viewCounts.all },
    { key: "urgent", label: "Urgences", count: viewCounts.urgent },
    { key: "overdue", label: "En retard", count: viewCounts.overdue },
    { key: "actionable", label: "Traitables", count: viewCounts.actionable },
  ] as const;
  const filterHref = (view: (typeof views)[number]["key"]) => {
    const query = new URLSearchParams();
    if (view !== "all") query.set("vue", view);
    if (searchQuery) query.set("q", searchQuery);
    return query.size ? `/agent/daily?${query.toString()}` : "/agent/daily";
  };

  return <main className="daily-page" style={s.page}>
    <header className="daily-hero" style={s.header}>
      <div><p style={s.eyebrow}>Selen Daily</p><h1 style={s.h1}>Pilotage Daily</h1><p style={s.lead}>Les actions qui nécessitent une intervention humaine sont regroupées ici, tous organismes confondus. Chaque carte indique simplement ce qu’il faut traiter et permet d’ouvrir directement le dossier concerné.</p></div>
      <div style={s.counters}><div className="daily-counter" style={s.counter}><strong>{urgentCount}</strong><span>urgences</span></div><div className="daily-counter" style={s.counter}><strong>{tasks.length}</strong><span>tâches</span></div><div className="daily-counter" style={s.counter}><strong>{followups.length}</strong><span>relances</span></div></div>
    </header>

    <SelenCard style={s.controlCard}><strong>Contrôles qualité complémentaires</strong><p style={s.ruleText}>Les files de pilotage restent limitées aux interventions et relances, sans rendre inaccessibles les écrans de contrôle V1.</p><div style={s.controlLinks}><Link href="/agent/daily/candidatures" style={s.secondary}>Candidatures à analyser</Link><Link href="/agent/daily/revues-formateurs" style={s.secondary}>Bilan annuel des compétences formateurs</Link><Link href="/agent/daily/procedures-internes" style={s.secondary}>Procédures internes</Link><Link href="/agent/daily/reclamations" style={s.secondary}>Réclamations & suggestions</Link><Link href="/agent/daily/suivi-sessions" style={s.secondary}>Suivi sessions & incidents</Link><Link href="/agent/daily/escalations" style={s.secondary}>Escalades admin</Link></div></SelenCard>

    <section style={s.columns}>
      <div id="taches-daily">
        <div style={s.sectionHead}><h2 style={s.h2}>Tâches à faire</h2><span style={s.pill}>{pagination.total}</span></div>
        <form action="/agent/daily" method="get" role="search" aria-label="Rechercher une tâche Daily" style={s.searchForm}>
          {selectedView !== "all" ? <input type="hidden" name="vue" value={selectedView} /> : null}
          <label htmlFor="daily-task-search" style={s.searchLabel}>Rechercher une tâche ou un dossier</label>
          <div style={s.searchControls}>
            <input id="daily-task-search" name="q" type="search" maxLength={80} defaultValue={searchQuery} placeholder="Organisme, formation, action…" style={s.searchInput} />
            <button type="submit" style={s.searchButton}>Rechercher</button>
            {searchQuery ? <Link href={selectedView === "all" ? "/agent/daily" : `/agent/daily?vue=${selectedView}`} style={s.secondary}>Effacer la recherche</Link> : null}
          </div>
          {searchQuery ? <p style={s.searchResults} role="status">{searchedTasks.length} résultat{searchedTasks.length > 1 ? "s" : ""} pour « {searchQuery} »</p> : null}
        </form>
        <nav aria-label="Filtrer les tâches Daily" style={s.filters}>
          {views.map(view => <Link key={view.key} href={filterHref(view.key)} aria-current={selectedView === view.key ? "page" : undefined} style={{ ...s.filterLink, ...(selectedView === view.key ? s.filterActive : {}) }}>{view.label} <span>{view.count}</span></Link>)}
        </nav>
        {tasks.length > 0 ? <p style={s.queueHint}>Les urgences d’abord, puis les échéances les plus proches. « Traitables » respecte les droits de l’agent connecté. Les autres vues restent consultables en lecture seule.</p> : null}
        {pagination.total > 0 ? <p style={s.queueHint} role="status">Tâches {pagination.from} à {pagination.to} sur {pagination.total}</p> : null}
        {sortedTasks.length === 0 ? <SelenCard style={s.empty}><SelenCardTitle>{tasks.length === 0 ? "Aucune tâche humaine ouverte" : searchQuery && searchedTasks.length === 0 ? "Aucun résultat de recherche" : "Aucune tâche dans cette vue"}</SelenCardTitle><p style={s.muted}>{tasks.length === 0 ? "Aucune action Daily agent n’est actuellement ouverte." : searchQuery && searchedTasks.length === 0 ? "Essayez un autre terme ou effacez la recherche. Aucun dossier n’a été modifié." : "Aucune tâche ne correspond à ce filtre. Les autres tâches restent accessibles."}</p>{tasks.length > 0 ? <Link href="/agent/daily" style={s.secondary}>Voir toutes les tâches →</Link> : null}</SelenCard> : <div style={s.list}>{sortedTasks.map((item) => {
          const canTreat = canTreatDailyPilotageTask(item, staff);
          const daily = presentDailyTask(item);
          return <SelenCard key={item.id} style={s.card}>
            <div className="daily-task-head" style={s.cardHead}><div><div style={s.badges}><span style={s.badge}>{item.reason}</span><span style={s.badge}>Statut : {daily.statusLabel}</span><span style={s.badge}>Priorité : {daily.priorityLabel}</span>{item.escalatedToAdmin ? <span style={{ ...s.badge, ...s.badgeEscalated }}>Escaladé à un administrateur</span> : null}{!canTreat && item.assignedAgentProfileId ? <span style={{ ...s.badge, ...s.badgeReadonly }}>Assignée à un autre agent</span> : null}</div><Link href={item.href} style={s.titleLink}><SelenCardTitle>{item.title}</SelenCardTitle></Link><p style={s.org}>Contexte : {daily.context}</p></div><span style={s.date}>Échéance : {daily.dueAt ? formatDate(daily.dueAt) : "non renseignée"}</span></div>
            <p style={s.detail}>{item.detail}</p>
            <p style={s.detail}><strong>Action attendue :</strong> {daily.expectedAction}</p>
            <div className="daily-task-actions" style={s.actions}>
              {item.kind === "assignment" ? (role === "admin" ? <Link href={item.href} style={s.primary}>Assigner un agent →</Link> : <form method="post" action="/agent/api/daily/organisation-assignment"><input type="hidden" name="organisation_id" value={item.organisationId}/><button type="submit" style={s.primaryButton}>Me l’assigner →</button></form>) : canTreat ? <><Link href={item.href} style={s.primary}>Traiter maintenant →</Link><Link href={`/agent/daily/escalations?task_key=${encodeURIComponent(item.id)}`} style={s.secondary}>{item.escalatedToAdmin ? "Voir l’escalade" : "Escalader à un admin"}</Link></> : <span style={s.readonlyText}>Traitement réservé à l’agent assigné.</span>}
            </div>
          </SelenCard>;
        })}</div>}
        {pagination.totalPages > 1 ? <nav aria-label="Pages des tâches Daily" style={s.pageNavigation}>
          {pagination.page > 1 ? <Link href={pageHref(pagination.page - 1)} style={s.secondary}>← Page précédente</Link> : null}
          <span style={s.pageStatus}>Page {pagination.page} sur {pagination.totalPages}</span>
          {pagination.page < pagination.totalPages ? <Link href={pageHref(pagination.page + 1)} style={s.secondary}>Page suivante →</Link> : null}
        </nav> : null}
      </div>

      <div><div style={s.sectionHead}><h2 style={s.h2}>Clients à relancer</h2><span style={s.pill}>{followups.length}</span></div>{followups.length === 0 ? <SelenCard style={s.empty}><SelenCardTitle>Aucune relance Daily</SelenCardTitle><p style={s.muted}>Aucune action n’est actuellement attendue d’un apprenant, formateur, entreprise ou autre partie prenante.</p></SelenCard> : <div style={s.list}>{followups.map((item) => <SelenCard key={item.id} style={s.card}><div className="daily-task-head" style={s.cardHead}><div><div style={s.badges}><span style={{ ...s.badge, ...s.badgeClient }}>Partie prenante</span></div><SelenCardTitle>{item.title}</SelenCardTitle></div><span style={s.date}>{formatDate(item.dueAt)}</span></div><p style={s.detail}>{item.detail}</p><div className="daily-task-actions" style={s.actions}><Link href={item.href} style={s.secondary}>Ouvrir le dossier →</Link></div></SelenCard>)}</div>}</div>
    </section>
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  pageNavigation:{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:14},pageStatus:{fontSize:12,color:"var(--selen-text2)"},page:{maxWidth:1180,margin:"0 auto",padding:"28px 28px 70px",color:"var(--selen-text)"},header:{display:"flex",justifyContent:"space-between",gap:22,alignItems:"center",marginBottom:18,flexWrap:"wrap"},eyebrow:{margin:0,fontSize:10,fontWeight:800,letterSpacing:".18em",textTransform:"uppercase",color:"var(--selen-gold2)"},h1:{margin:"6px 0 5px",fontFamily:"var(--font-display)",fontSize:32},h2:{margin:0,fontSize:18},lead:{margin:0,maxWidth:760,lineHeight:1.65,color:"var(--selen-text2)",fontSize:14},counters:{display:"flex",gap:8,flexWrap:"wrap"},counter:{minWidth:82,display:"grid",justifyItems:"center",padding:"11px 14px",border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)"},controlCard:{marginBottom:16,padding:15},searchForm:{marginBottom:12},searchLabel:{display:"block",fontWeight:700,fontSize:12,marginBottom:6},searchControls:{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"},searchInput:{flex:"1 1 220px",minWidth:0,minHeight:38,borderRadius:8,border:"1px solid var(--selen-border)",background:"var(--selen-bg2)",color:"var(--selen-text)",padding:"8px 12px",fontSize:13},searchButton:{minHeight:38,padding:"7px 12px",border:0,borderRadius:8,background:"var(--selen-gold2)",color:"var(--selen-bg)",fontWeight:800,cursor:"pointer"},searchResults:{margin:"8px 0 0",fontSize:12,color:"var(--selen-text2)"},controlLinks:{display:"flex",gap:8,flexWrap:"wrap",marginTop:10},ruleText:{margin:"5px 0 0",color:"var(--selen-text2)",fontSize:12,lineHeight:1.55},queueHint:{margin:"0 0 12px",color:"var(--selen-text2)",fontSize:12,lineHeight:1.55},filters:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12},filterLink:{display:"inline-flex",alignItems:"center",gap:7,minHeight:34,padding:"6px 11px",border:"1px solid var(--selen-border)",borderRadius:999,textDecoration:"none",fontSize:12,fontWeight:700,color:"var(--selen-text)"},filterActive:{background:"var(--selen-gold2)",color:"var(--selen-bg)",borderColor:"var(--selen-gold2)"},columns:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16},sectionHead:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,margin:"4px 0 10px"},pill:{minWidth:30,height:30,borderRadius:999,display:"grid",placeItems:"center",padding:"0 8px",border:"1px solid var(--selen-border)",color:"var(--selen-gold2)",fontWeight:800},list:{display:"grid",gap:10},card:{padding:16,minWidth:0},cardHead:{display:"flex",justifyContent:"space-between",gap:14,alignItems:"flex-start"},badges:{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8},badge:{display:"inline-block",padding:"4px 8px",borderRadius:999,background:"rgba(201,148,58,.14)",color:"var(--selen-gold2)",fontSize:10,fontWeight:800},badgeClient:{background:"rgba(83,132,166,.12)",color:"var(--selen-info)"},badgeReadonly:{background:"var(--selen-bg3)",color:"var(--selen-text3)"},badgeEscalated:{background:"rgba(192,85,85,.13)",color:"var(--selen-danger)"},titleLink:{color:"inherit",textDecoration:"none"},org:{margin:"5px 0 0",fontSize:12,color:"var(--selen-text3)",overflowWrap:"anywhere"},date:{fontSize:10,color:"var(--selen-text3)",whiteSpace:"nowrap"},detail:{margin:"12px 0",lineHeight:1.55,fontSize:12,color:"var(--selen-text2)",overflowWrap:"anywhere"},actions:{display:"flex",gap:8,flexWrap:"wrap"},primary:{display:"inline-flex",alignItems:"center",minHeight:34,padding:"0 11px",borderRadius:8,background:"var(--selen-gold2)",color:"var(--selen-bg)",textDecoration:"none",fontWeight:800,fontSize:12},primaryButton:{display:"inline-flex",alignItems:"center",minHeight:34,padding:"0 11px",borderRadius:8,border:0,background:"var(--selen-gold2)",color:"var(--selen-bg)",fontWeight:800,fontSize:12,cursor:"pointer"},secondary:{display:"inline-flex",alignItems:"center",minHeight:34,padding:"0 11px",borderRadius:8,border:"1px solid var(--selen-border)",color:"var(--selen-text)",textDecoration:"none",fontWeight:700,fontSize:12},readonlyText:{display:"inline-flex",alignItems:"center",minHeight:34,color:"var(--selen-text3)",fontSize:11,lineHeight:1.4},empty:{padding:22},muted:{margin:"6px 0 0",lineHeight:1.55,color:"var(--selen-text2)",fontSize:12},error:{color:"var(--selen-danger)"}
};
