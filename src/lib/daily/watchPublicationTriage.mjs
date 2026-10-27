// Présentation uniquement : les usages reçus ont déjà été bornés aux organismes affectés.
const one = (value) => Array.isArray(value) ? value[0] : value;
const fold = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

export function normalizeWatchPublicationQuery(value) {
  const text = one(value);
  return typeof text === "string" ? text.trim().slice(0, 80) : "";
}

export function normalizeWatchPublicationCategory(value) {
  const text = one(value);
  return ["all", "regulatory", "pedagogy_technology"].includes(text) ? text : "all";
}

export function normalizeWatchPublicationView(value) {
  const text = one(value);
  return ["all", "to_apply", "applied", "archived"].includes(text) ? text : "all";
}

export function buildWatchPublicationRows(watches, usages) {
  const byWatch = new Map();
  for (const usage of usages) {
    if (!usage.watch_entry_id || !usage.organisation_id) continue;
    if (!byWatch.has(usage.watch_entry_id)) byWatch.set(usage.watch_entry_id, new Map());
    const organisations = byWatch.get(usage.watch_entry_id);
    const previous = organisations.get(usage.organisation_id) ?? { interested: false, applied: false };
    organisations.set(usage.organisation_id, {
      interested: previous.interested || usage.interested === true,
      applied: previous.applied || usage.forced_by_studio === true,
    });
  }
  return watches.map((watch) => {
    const organisations = [...(byWatch.get(watch.id)?.values() ?? [])];
    return {
      watch,
      interested: organisations.filter((entry) => entry.interested).length,
      applied: organisations.filter((entry) => entry.applied).length,
      pending: organisations.filter((entry) => entry.interested && !entry.applied).length,
    };
  });
}

export function watchPublicationMetrics(rows) {
  return {
    total: rows.length,
    toApply: rows.filter((row) => row.watch.status === "active" && row.pending > 0).length,
    applied: rows.filter((row) => row.applied > 0).length,
    archived: rows.filter((row) => row.watch.status === "archived").length,
  };
}

function priority(row) {
  if (row.watch.status === "archived") return 3;
  if (row.pending > 0) return 0;
  if (row.applied > 0) return 2;
  return 1;
}

export function filterWatchPublicationRows(rows, options = {}) {
  const needle = fold(normalizeWatchPublicationQuery(options.q));
  const category = normalizeWatchPublicationCategory(options.categorie);
  const view = normalizeWatchPublicationView(options.vue);
  return rows.filter((row) => {
    if (category !== "all" && row.watch.watch_type !== category) return false;
    if (view === "to_apply" && (row.watch.status !== "active" || row.pending === 0)) return false;
    if (view === "applied" && row.applied === 0) return false;
    if (view === "archived" && row.watch.status !== "archived") return false;
    if (needle && !fold([row.watch.title, row.watch.article_url].join(" ")).includes(needle)) return false;
    return true;
  }).sort((a, b) => {
    const difference = priority(a) - priority(b);
    if (difference) return difference;
    const dateA = Date.parse(a.watch.published_at ?? "") || 0;
    const dateB = Date.parse(b.watch.published_at ?? "") || 0;
    return dateB - dateA || String(a.watch.title).localeCompare(String(b.watch.title), "fr");
  });
}
