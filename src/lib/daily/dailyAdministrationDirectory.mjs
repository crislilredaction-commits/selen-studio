/** Filtrage purement local des outils déjà autorisés côté serveur. */
export const DAILY_ADMIN_CATEGORIES = ["Toutes", "Supervision", "Qualité", "Outils"];

export function normalizeDailyAdminQuery(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function normalizeDailyAdminCategory(value) {
  return DAILY_ADMIN_CATEGORIES.includes(value) ? value : "Toutes";
}

function fold(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function filterDailyAdministrationLinks(authorizedLinks, { query = "", category = "Toutes" } = {}) {
  const links = Array.isArray(authorizedLinks) ? authorizedLinks : [];
  const needle = fold(normalizeDailyAdminQuery(query));
  const selected = normalizeDailyAdminCategory(category);
  return links.filter((link) => {
    if (selected !== "Toutes" && link.category !== selected) return false;
    if (!needle) return true;
    return fold([link.label, link.description, link.category].join(" ")).includes(needle);
  });
}

export function dailyAdministrationCategoryCounts(authorizedLinks, query = "") {
  const links = filterDailyAdministrationLinks(authorizedLinks, { query });
  return Object.fromEntries(DAILY_ADMIN_CATEGORIES.map(category => [
    category,
    category === "Toutes" ? links.length : links.filter(link => link.category === category).length,
  ]));
}
