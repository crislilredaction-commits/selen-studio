/** Recherche locale sur les seules sessions déjà autorisées de l'organisme.
 * Aucun accès réseau, mutation, enrichissement ni changement de périmètre.
 */
function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
}

export function filterDailyOrganisationSessionGroups(groups, { query = "", phase = "all" } = {}) {
  const text = normalize(String(query).slice(0, 80));
  const allowed = new Set(["all", "planned", "current", "closing", "history"]);
  const selected = allowed.has(phase) ? phase : "all";
  return (Array.isArray(groups) ? groups : [])
    .filter(group => selected === "all" || group.id === selected)
    .map(group => ({
      ...group,
      sessions: (Array.isArray(group.sessions) ? group.sessions : []).filter(session => {
        if (!text) return true;
        const formation = Array.isArray(session.daily_formations)
          ? session.daily_formations[0] : session.daily_formations;
        return [formation?.title, session.internal_reference, session.start_date, session.end_date]
          .some(value => normalize(value).includes(text));
      }),
    }));
}
