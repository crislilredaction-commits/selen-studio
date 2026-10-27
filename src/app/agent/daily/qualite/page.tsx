import { revalidatePath } from "next/cache";
import Link from "next/link";
import { buildWatchPublicationRows, filterWatchPublicationRows, normalizeWatchPublicationQuery, normalizeWatchPublicationCategory, normalizeWatchPublicationView, watchPublicationMetrics } from "@/lib/daily/watchPublicationTriage.mjs";
import { getDailyCorrectiveActionQuarterStatus } from "@/lib/daily/qualityActionCadence";
import { getDailyWatchCadenceStatus } from "@/lib/daily/watchCadence";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createClient } from "@/lib/supabase/server";

async function currentAgentProfileId() {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("agent_profiles")
    .select("id")
    .or(`user_id.eq.${user.id}${user.email ? `,email.eq.${user.email}` : ""}`)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function createWatch(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) return;
  const type = String(formData.get("watch_type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("article_url") ?? "").trim();
  const analysis = String(formData.get("analysis_and_improvement") ?? "").trim();
  if (!["regulatory", "pedagogy_technology"].includes(type) || !title || !url || !analysis) return;

  const admin = createSupabaseAdminClient();
  await admin.from("daily_watch_entries").insert({
    watch_type: type,
    title,
    article_url: url,
    analysis_and_improvement: analysis,
    published_at: new Date().toISOString(),
    created_by: await currentAgentProfileId(),
  });
  revalidatePath("/agent/daily/qualite");
}

async function forceUsage(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) return;
  const watchId = String(formData.get("watch_id") ?? "");
  const improvement = String(formData.get("improvement") ?? "").trim();
  const target = String(formData.get("organisation_id") ?? "all");
  if (!watchId || !improvement) return;

  // Le service-role ne doit jamais contourner les affectations de l’agent.
  const dailyOrganisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  const organisationIds = target === "all"
    ? dailyOrganisationIds
    : dailyOrganisationIds.includes(target)
      ? [target]
      : [];
  if (organisationIds.length === 0) return;

  const admin = createSupabaseAdminClient();
  const { data: activeWatch, error: watchError } = await admin.from("daily_watch_entries")
    .select("id").eq("id", watchId).eq("status", "active").maybeSingle();
  if (watchError || !activeWatch) return;

  const agentId = await currentAgentProfileId();
  const now = new Date().toISOString();
  if (organisationIds.length) {
    await admin.from("daily_organisation_watch_entries").upsert(
      organisationIds.map((organisation_id) => ({
        organisation_id,
        watch_entry_id: watchId,
        interested: true,
        interested_at: now,
        improvement_note: improvement,
        forced_by_studio: true,
        forced_by_agent_profile_id: agentId,
        forced_at: now,
        updated_at: now,
      })),
      { onConflict: "organisation_id,watch_entry_id" },
    );
  }
  revalidatePath("/agent/daily/qualite");
}

function frDate(value?: string | null) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

type Props = { searchParams?: Promise<{ q?: string | string[]; categorie?: string | string[]; vue?: string | string[] }> };

export default async function DailyQualityStudioPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;
  let dailyOrganisationIds: string[];
  try {
    dailyOrganisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main role="alert" style={s.page}>Impossible de vérifier votre périmètre Daily.</main>;
  }
  const admin = createSupabaseAdminClient();
  const { data: organisations, error: organisationsError } = dailyOrganisationIds.length
    ? await admin.from("organisations")
        .select("id,name,legal_name,status")
        .in("id", dailyOrganisationIds)
        .order("name")
    : { data: [], error: null };
  if (organisationsError) return <main role="alert" style={s.page}>Impossible de charger les organismes autorisés.</main>;
  const [{ data: watches, error: watchesError }, { data: usages, error: usagesError }, { data: qualityActions, error: actionsError }] = await Promise.all([
    admin.from("daily_watch_entries").select("id,watch_type,title,article_url,analysis_and_improvement,published_at,status").order("published_at", { ascending: false }),
    dailyOrganisationIds.length
      ? admin.from("daily_organisation_watch_entries").select("watch_entry_id,interested,forced_by_studio,improvement_note,organisation_id").in("organisation_id", dailyOrganisationIds)
      : Promise.resolve({ data: [], error: null }),
    dailyOrganisationIds.length
      ? admin.from("daily_quality_actions").select("category,status,created_at,updated_at,organisation_id").in("organisation_id", dailyOrganisationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (watchesError || usagesError || actionsError) return <main role="alert" style={s.page}>Impossible de charger la qualité Daily.</main>;
  const usageRows = usages ?? [];
  const cadence = getDailyWatchCadenceStatus(watches ?? []);
  const watchReminderCount = cadence.filter((item) => !item.currentMonthCovered).length;
  const correctiveCadence = getDailyCorrectiveActionQuarterStatus(qualityActions ?? []);
  // Recherche et triage uniquement après les lectures déjà bornées aux affectations.
  const params = await searchParams;
  const q = normalizeWatchPublicationQuery(params?.q);
  const categorie = normalizeWatchPublicationCategory(params?.categorie);
  const vue = normalizeWatchPublicationView(params?.vue);
  const publicationRows = buildWatchPublicationRows(watches ?? [], usageRows) as Array<{ watch: NonNullable<typeof watches>[number]; interested: number; applied: number; pending: number }>;
  const visibleRows: typeof publicationRows = filterWatchPublicationRows(publicationRows, { q, categorie, vue });
  const publicationMetrics = watchPublicationMetrics(publicationRows);

  return (
    <main style={s.page}>
      <header>
        <p style={s.kicker}>Selen Studio · Daily</p>
        <h1 style={s.h1}>Qualité & veilles</h1>
        <p style={s.muted}>Publie les veilles communes, résume ce qu’il faut retenir et propose directement les améliorations utiles aux clients Daily.</p>
      </header>

      <section style={s.reminderCard} aria-label="Rappel mensuel des veilles">
        <div>
          <p style={s.reminderEyebrow}>Cadence qualité · mensuelle</p>
          <h2 style={s.reminderTitle}>{watchReminderCount === 0 ? "Veilles du mois à jour" : `${watchReminderCount} veille(s) à alimenter ce mois-ci`}</h2>
          <p style={s.muted}>Le contrôle est calculé à partir des veilles déjà publiées : au moins un apport par mois et par catégorie. Il sert d’aide-mémoire et ne crée pas de doublon documentaire.</p>
        </div>
        <div style={s.cadenceGrid}>
          {cadence.map((item) => (
            <div key={item.type} style={item.currentMonthCovered ? s.cadenceOk : s.cadenceDue}>
              <strong>{item.label}</strong>
              <span style={s.cadenceStatus}>{item.currentMonthCovered ? "À jour ce mois-ci" : "À alimenter"}</span>
              <small style={s.cadenceDate}>Dernière publication : {frDate(item.lastPublishedAt)}</small>
            </div>
          ))}
        </div>
      </section>

      <section style={s.reminderCard} aria-label="Rappel trimestriel des actions correctives">
        <div>
          <p style={s.reminderEyebrow}>Cadence qualité · {correctiveCadence.quarterLabel}</p>
          <h2 style={s.reminderTitle}>
            {correctiveCadence.dueForReviewCount === 0
              ? "Actions correctives suivies ce trimestre"
              : `${correctiveCadence.dueForReviewCount} action(s) corrective(s) à revoir`}
          </h2>
          <p style={s.muted}>Ce rappel réutilise les actions correctives existantes. Une action ouverte ou planifiée sans mise à jour pendant le trimestre est signalée à revoir ; aucune donnée de rappel parallèle n’est créée.</p>
        </div>
        <div style={correctiveCadence.dueForReviewCount === 0 ? s.cadenceOk : s.cadenceDue}>
          <strong>{correctiveCadence.openCount} action(s) ouverte(s) ou planifiée(s)</strong>
          <span style={s.cadenceStatus}>{correctiveCadence.reviewedThisQuarterCount} avec activité ce trimestre</span>
          <small style={s.cadenceDate}>Dernière activité : {frDate(correctiveCadence.lastActivityAt)}</small>
        </div>
      </section>

      <section style={s.grid}>
        <article style={s.card}>
          <h2>Publier une veille commune</h2>
          <p style={s.muted}>Tu peux réunir dans le même champ les points importants de l’article et les pistes d’amélioration que tu proposes. Pas besoin de découper artificiellement ton analyse.</p>
          <form action={createWatch} style={s.form}>
            <label>Type
              <select name="watch_type" style={s.input}>
                <option value="regulatory">Veille réglementaire</option>
                <option value="pedagogy_technology">Veille pédagogique & technologique</option>
              </select>
            </label>
            <label>Titre de l’article<input name="title" required style={s.input} /></label>
            <label>Lien de l’article<input name="article_url" type="url" required style={s.input} /></label>
            <label>Points importants & améliorations proposées
              <textarea
                name="analysis_and_improvement"
                required
                rows={8}
                style={s.input}
                placeholder="Résume ce qu’il faut retenir, puis indique les améliorations, adaptations ou décisions que cette veille peut inspirer."
              />
            </label>
            <button style={s.primary}>Publier dans les tableaux clients</button>
          </form>
        </article>

        <article style={s.card}>
          <h2>Appliquer une amélioration</h2>
          <p style={s.muted}>Utilise cette action lorsqu’une évolution a réellement été mise en œuvre pour un ou plusieurs organismes.</p>
          <form action={forceUsage} style={s.form}>
            <label>Veille
              <select name="watch_id" required style={s.input}>
                <option value="">Choisir</option>
                {(watches ?? []).filter((watch) => watch.status === "active").map((watch) => <option key={watch.id} value={watch.id}>{watch.title}</option>)}
              </select>
            </label>
            <label>Organismes
              <select name="organisation_id" style={s.input}>
                <option value="all">{auth.role === "admin" ? "Tous les clients Daily actifs" : "Tous mes organismes Daily affectés"}</option>
                {(organisations ?? []).map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.legal_name || organisation.name || organisation.id}</option>)}
              </select>
            </label>
            <label>Amélioration réellement mise en œuvre<textarea name="improvement" required rows={5} style={s.input} /></label>
            <button style={s.primary}>Enregistrer l’exploitation</button>
          </form>
        </article>
      </section>

      <section style={s.card}>
        <h2>Veilles publiées</h2>
        <p style={s.muted}>Retrouve les veilles communes, les organismes intéressés et les améliorations restant à appliquer. Les compteurs ne portent que sur tes organismes autorisés.</p>
        <div style={s.summary} aria-label="État des veilles publiées">
          <span><strong>{publicationMetrics.total}</strong> veille(s)</span>
          <span><strong>{publicationMetrics.toApply}</strong> à exploiter</span>
          <span><strong>{publicationMetrics.applied}</strong> déjà appliquée(s)</span>
          <span><strong>{publicationMetrics.archived}</strong> archivée(s)</span>
        </div>
        <form method="get" role="search" style={s.filters}>
          <label>Rechercher
            <input name="q" type="search" maxLength={80} defaultValue={q} placeholder="Titre ou source" style={s.input} />
          </label>
          <label>Catégorie
            <select name="categorie" defaultValue={categorie} style={s.input}>
              <option value="all">Toutes les catégories</option>
              <option value="regulatory">Réglementaire</option>
              <option value="pedagogy_technology">Pédagogique et technologique</option>
            </select>
          </label>
          <label>Suivi
            <select name="vue" defaultValue={vue} style={s.input}>
              <option value="all">Toutes les veilles</option>
              <option value="to_apply">Intéressés, amélioration à appliquer</option>
              <option value="applied">Amélioration appliquée</option>
              <option value="archived">Archives</option>
            </select>
          </label>
          <div style={s.filterActions}>
            <button type="submit" style={s.primary}>Filtrer</button>
            <Link href="/agent/daily/qualite" style={s.link}>Réinitialiser</Link>
          </div>
        </form>
        <p aria-live="polite" style={s.muted}>{visibleRows.length} veille(s) affichée(s) sur {publicationMetrics.total}. Les veilles à exploiter apparaissent en premier.</p>
        {publicationMetrics.total === 0 ? <p style={s.muted}>Aucune veille commune pour le moment.</p> : visibleRows.length === 0 ? (
          <p style={s.muted}>Aucune veille ne correspond à ces filtres. <Link href="/agent/daily/qualite">Afficher toutes les veilles</Link></p>
        ) : (
          <div style={s.list}>
            {visibleRows.map((row) => {
              const watch = row.watch;
              return (
                <article key={watch.id} style={s.row}>
                  <div>
                    <span style={s.badge}>{watch.watch_type === "regulatory" ? "Réglementaire" : "Pédagogique & techno"}</span>
                    {watch.status === "archived" ? <strong style={s.attention}> · Archivée</strong> : row.pending > 0 ? <strong style={s.attention}> · À exploiter</strong> : null}
                    <h3 style={{ margin: "6px 0" }}>{watch.title}</h3>
                    <small style={s.muted}>Publication : {frDate(watch.published_at)}</small>
                    {watch.analysis_and_improvement ? <p style={s.analysis}>{watch.analysis_and_improvement}</p> : null}
                    <a href={watch.article_url} target="_blank" rel="noopener noreferrer" style={s.link}>Ouvrir l’article ↗</a>
                  </div>
                  <div style={s.stats}>
                    <strong>{row.interested}</strong><span>organisme(s) intéressé(s)</span>
                    <strong>{row.pending}</strong><span>intéressé(s), à exploiter</span>
                    <strong>{row.applied}</strong><span>amélioration(s) appliquée(s)</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 60px", color: "var(--selen-text)" },
  kicker: { fontSize: 10, textTransform: "uppercase", letterSpacing: ".2em", color: "var(--selen-gold)" },
  h1: { fontFamily: "var(--font-display)", fontSize: 32, margin: "6px 0" },
  muted: { color: "var(--selen-text2)", lineHeight: 1.6, fontSize: 13 },
  reminderCard: { border: "1px solid var(--selen-border)", borderRadius: "var(--radius-md)", background: "var(--selen-bg2)", padding: 18, margin: "22px 0 14px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(360px,1.15fr)", gap: 18, alignItems: "start" },
  reminderEyebrow: { margin: 0, fontSize: 10, textTransform: "uppercase", letterSpacing: ".18em", color: "var(--selen-gold2)", fontWeight: 800 },
  reminderTitle: { margin: "6px 0 4px", fontFamily: "var(--font-display)", fontSize: 22 },
  cadenceGrid: { display: "grid", gap: 8 },
  cadenceOk: { display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 10px", border: "1px solid rgba(74,150,104,.38)", background: "rgba(74,150,104,.08)", borderRadius: 8, padding: 12, fontSize: 12 },
  cadenceDue: { display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 10px", border: "1px solid rgba(201,148,58,.45)", background: "rgba(201,148,58,.08)", borderRadius: 8, padding: 12, fontSize: 12 },
  cadenceStatus: { fontWeight: 800, color: "var(--selen-gold2)" },
  cadenceDate: { gridColumn: "1 / -1", color: "var(--selen-text2)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, margin: "22px 0" },
  card: { border: "1px solid var(--selen-border)", borderRadius: "var(--radius-md)", background: "var(--selen-bg2)", padding: 18, marginBottom: 14 },
  form: { display: "grid", gap: 10 },
  input: { display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, border: "1px solid var(--selen-border)", borderRadius: 6, background: "var(--selen-bg3)", color: "var(--selen-text)", padding: 10 },
  primary: { width: "fit-content", border: "1px solid var(--selen-gold2)", borderRadius: 6, background: "var(--selen-gold2)", color: "var(--selen-bg)", padding: "9px 12px", fontWeight: 800, cursor: "pointer" },
  summary: { display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0", fontSize: 13 },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", alignItems: "end", gap: 12, margin: "16px 0" },
  filterActions: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  attention: { color: "var(--selen-gold2)", fontSize: 12 },
  list: { display: "grid", gap: 10 },
  row: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 210px", gap: 16, border: "1px solid var(--selen-border)", borderRadius: 8, padding: 14, background: "var(--selen-bg3)" },
  badge: { fontSize: 10, textTransform: "uppercase", color: "var(--selen-gold2)" },
  analysis: { whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13, color: "var(--selen-text2)", padding: 12, borderLeft: "3px solid var(--selen-gold2)", background: "rgba(201,148,58,.06)" },
  link: { color: "var(--selen-gold2)", fontWeight: 700, textDecoration: "none" },
  stats: { display: "grid", gridTemplateColumns: "40px 1fr", gap: "4px 8px", alignContent: "start", fontSize: 12 },
};
