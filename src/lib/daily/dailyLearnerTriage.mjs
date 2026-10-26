// Les tris s'appliquent uniquement aux inscriptions déjà bornées au périmètre agent côté serveur.
export const LEARNER_VIEWS = Object.freeze({
  all: "Toutes les inscriptions actives",
  adaptations: "Adaptations à préparer",
  prerequisites: "Prérequis à clarifier",
  positioning: "Positionnements à suivre",
  confirmed: "Inscriptions confirmées",
});

const POSITIONING_TO_FOLLOW = new Set(["not_started", "sent", "submitted"]);
const PREREQUISITES_TO_FOLLOW = new Set(["not_met", "to_clarify", "not_reviewed", "pending", "submitted"]);

function text(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function normalizeLearnerSearch(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim().slice(0, 80) : "";
}

export function normalizeLearnerView(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && Object.hasOwn(LEARNER_VIEWS, raw) ? raw : "all";
}

function related(row, name) {
  const relation = row?.[name];
  return Array.isArray(relation) ? relation[0] : relation;
}

export function matchesLearnerSearch(row, query) {
  const needle = text(normalizeLearnerSearch(query));
  if (!needle) return true;
  const learner = related(row, "daily_learners");
  const session = related(row, "daily_sessions");
  const formation = session?.daily_formations;
  const organisation = related(row, "organisations");
  const haystack = [
    learner?.first_name, learner?.last_name, learner?.email,
    organisation?.name, session?.internal_reference, session?.start_date,
    (Array.isArray(formation) ? formation[0] : formation)?.title,
  ].map(text).join(" ");
  return haystack.includes(needle);
}

export function learnerNeedsAttention(row, needsMap = new Map()) {
  return {
    adaptations: needsMap.has(row.id),
    prerequisites: PREREQUISITES_TO_FOLLOW.has(text(row.prerequisites_status)),
    positioning: POSITIONING_TO_FOLLOW.has(text(row.positioning_status)),
    confirmed: text(row.status) === "confirmed",
  };
}

export function countLearnerViews(rows, needsMap = new Map()) {
  const counts = { all: rows.length, adaptations: 0, prerequisites: 0, positioning: 0, confirmed: 0 };
  for (const row of rows) {
    const flags = learnerNeedsAttention(row, needsMap);
    for (const key of ["adaptations", "prerequisites", "positioning", "confirmed"]) {
      if (flags[key]) counts[key]++;
    }
  }
  return counts;
}

export function filterLearnerEnrolments(rows, query, view, needsMap = new Map()) {
  const selected = normalizeLearnerView(view);
  return rows.filter((row) => {
    if (!matchesLearnerSearch(row, query)) return false;
    return selected === "all" || learnerNeedsAttention(row, needsMap)[selected];
  });
}

export function prioritizeLearnerEnrolments(rows, needsMap = new Map()) {
  const priority = (row) => {
    const flags = learnerNeedsAttention(row, needsMap);
    if (flags.adaptations) return 0;
    if (flags.prerequisites) return 1;
    if (flags.positioning) return 2;
    return 3;
  };
  return rows.map((row, index) => ({ row, index }))
    .sort((a, b) => priority(a.row) - priority(b.row) || a.index - b.index)
    .map(({ row }) => row);
}
