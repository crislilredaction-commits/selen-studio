import { revalidatePath } from "next/cache";
import { getDailyCorrectiveActionQuarterStatus } from "@/lib/daily/qualityActionCadence";
import { getDailyWatchCadenceStatus } from "@/lib/daily/watchCadence";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
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
  const watchId = String(formData.get("watch_id") ?? "");
  const improvement = String(formData.get("improvement") ?? "").trim();
  const target = String(formData.get("organisation_id") ?? "all");
  if (!watchId || !improvement) return;

  const admin = createSupabaseAdminClient();
  const dailyOrganisationIds = await getActiveDailyOrganisationIds();
  const organisationIds = target === "all"
    ? dailyOrganisationIds
    : dailyOrganisationIds.includes(target)
      ? [target]
      : [];

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

export default async function DailyQualityStudioPage() {
  const admin = createSupabaseAdminClient();
  const dailyOrganisationIds = await getActiveDailyOrganisationIds();
  const organisations = dailyOrganisationIds.length
    ? (await admin
        .from("organisations")
        .select("id,name,legal_name,status")
        .in("id", dailyOrganisationIds)
        .order("name")).data
    : [];
  const [{ data: watches }, { data: usages }, { data: qualityActions }] = await Promise.all([
    admin.from("daily_watch_entries").select("id,watch_type,title,article_url,analysis_and_improvement,published_at,status").order("published_at", { ascending: false }),
    admin.from("daily_organisation_watch_entries").select("watch_entry_id,interested,forced_by_studio,improvement_note,organisation_id"),
    admin.from("daily_quality_actions").select("category,status,created_at,updated_at"),
  ]);
  const usageRows = usages ?? [];
  const cadence = getDailyWatchCadenceStatus(watches ?? []);
  const watchReminderCount = cadence.filter((item) => !item.currentMonthCovered).length;
  const correctiveCadence = getDailyCorrectiveActionQuarterStatus(qualityActions ?? []);

  return (
    <main style={s.page}>
      <header>
        <p style={s.kicker}>Selen Studio · Daily</p>
        <h1 style={s.h1}>Qualité & veilles</h1>
        <p style={s.muted}>Publie les veilles communes, résume ce qu'il faut retenir et propose directement les améliorations utiles aux clients Daily.</p>
      </header>

      <section style={s.reminderCard} aria-label="Rappel mensuel des veilles">
        <div>
          <p style={s.reminderEyebrow}>Cadence qualité · mensuelle</p>
          <h2 style={s.reminderTitle}>{watchReminderCount === 0 ? "Veilles du mois à jour" : `${watchReminderCount} veille(s) à alimenter ce mois-ci`}</h2>
          <p style={s.muted}>Le contrôle est calculé à partir des veilles déjà publiées : au moins un apport par mois et par catégorie. Il sert d'aide-mémoire et ne crée pas de doublon documentaire.</p>
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
          <p style={s.muted}>Ce rappel réutilise les actions correctives existantes. Une action ouverte ou planifiée sans mise à jour pendant le trimestre est signalée à revoir ; aucune donnée de rappel parallèle n'est créée.</p>
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
          <p style={s.muted}>Tu peux réunir dans le même champ les points importants de l'article et les pistes d'amélioration que tu proposes. Pas besoin de découper artificiellement ton analyse.</p>
          <form action={createWatch} style={s.form}>
            <label>Type
              <select name="watch_type" style={s.input}>
                <option value="regulatory">Veille réglementaire</option>
                <option value="pedagogy_technology">Veille pédagogique & technologique</option>
              </select>
            </label>
            <label>Titre de l'article<input name="title" required style={s.input} /></label>
            <label>Lien de l'article<input name="article_url" type="url" required style={s.input} /></label>
            <label>Points importants & améliorations proposées
              <textarea
                name="analysis_and_improvement"
                required
                rows={8}
                style={s.input}
                placeholder="Résume ce qu'il faut retenir, puis indique les améliorations, adaptations ou décisions que cette veille peut inspirer."
              />
            </label>
            <button style={s.primary}>Publier dans les tableaux clients</button>
          </form>
        </article>

        <article style={s.card}>
          <h2>Appliquer une amélioration</h2>
          <p style={s.muted}>Utilise cette action lorsqu'une évolution a réellement été mise en œuvre pour un ou plusieurs organismes.</p>
          <form action={forceUsage} style={s.form}>
            <label>Veille
              <select name="watch_id" required style={s.input}>
                <option value="">Choisir</option>
                {(watches ?? []).filter((watch) => watch.status === "active").map((watch) => <option key={watch.id} value={watch.id}>{watch.title}</option>)}
              </select>
            </label>
            <label>Organismes
              <select name="organisation_id" style={s.input}>
                <option value="all">Tous les clients Daily actifs</option>
                {(organisations ?? []).map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.legal_name || organisation.name || organisation.id}</option>)}
              </select>
            </label>
            <label>Amélioration réellement mise en œuvre<textarea name="improvement" required rows={5} style={s.input} /></label>
            <button style={s.primary}>Enregistrer l'exploitation</button>
          </form>
        </article>
      </section>

      <section style={s.card}>
        <h2>Veilles publiées</h2>
        {(watches ?? []).length === 0 ? <p style={s.muted}>Aucune veille commune pour le moment.</p> : (
          <div style={s.list}>
            {(watches ?? []).map((watch) => {
              const rows = usageRows.filter((usage) => usage.watch_entry_id === watch.id);
              const interested = rows.filter((usage) => usage.interested).length;
              const forced = rows.filter((usage) => usage.forced_by_studio).length;
              return (
                <article key={watch.id} style={s.row}>
                  <div>
                    <span style={s.badge}>{watch.watch_type === "regulatory" ? "Réglementaire" : "Pédagogique & techno"}</span>
                    <h3 style={{ margin: "6px 0" }}>{watch.title}</h3>
                    {watch.analysis_and_improvement ? <p style={s.analysis}>{watch.analysis_and_improvement}</p> : null}
                    <a href={watch.article_url} target="_blank" rel="noreferrer" style={s.link}>Ouvrir l'article ↗</a>
                  </div>
                  <div style={s.stats}>
                    <strong>{interested}</strong><span>organisme(s) intéressé(s)</span>
                    <strong>{forced}</strong><span>amélioration(s) appliquée(s)</span>
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
  list: { display: "grid", gap: 10 },
  row: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 210px", gap: 16, border: "1px solid var(--selen-border)", borderRadius: 8, padding: 14, background: "var(--selen-bg3)" },
  badge: { fontSize: 10, textTransform: "uppercase", color: "var(--selen-gold2)" },
  analysis: { whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13, color: "var(--selen-text2)", padding: 12, borderLeft: "3px solid var(--selen-gold2)", background: "rgba(201,148,58,.06)" },
  link: { color: "var(--selen-gold2)", fontWeight: 700, textDecoration: "none" },
  stats: { display: "grid", gridTemplateColumns: "40px 1fr", gap: "4px 8px", alignContent: "start", fontSize: 12 },
};