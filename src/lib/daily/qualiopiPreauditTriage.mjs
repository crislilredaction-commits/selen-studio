// Triage en lecture seule : uniquement des cartes déjà bornées aux organismes de l'agent.
const fold = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

export function normalizePreauditQuery(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim().slice(0, 80) : "";
}

export function normalizePreauditView(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return ["all", "review", "soon", "complete"].includes(first) ? first : "all";
}

export function preauditDaysRemaining(deadline, now = Date.now()) {
  if (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return Infinity;
  const timestamp = Date.parse(`${deadline}T12:00:00Z`);
  return Number.isFinite(timestamp) ? Math.ceil((timestamp - now) / 86_400_000) : Infinity;
}

export function preauditNeedsReview(card) {
  const checks = [...(card.orgChecks ?? []), ...(card.sessionCards ?? []).flatMap(row => row.checks ?? [])];
  return checks.some(check => check.ok === false);
}

export function preauditSummary(cards, now = Date.now()) {
  return {
    total: cards.length,
    review: cards.filter(preauditNeedsReview).length,
    soon: cards.filter(card => preauditDaysRemaining(card.target.deadline, now) <= 30).length,
    complete: cards.filter(card => !preauditNeedsReview(card)).length,
  };
}

export function filterPreauditCards(cards, { query = "", view = "all" } = {}, now = Date.now()) {
  const search = fold(normalizePreauditQuery(query));
  const selected = normalizePreauditView(view);
  const priority = card => {
    const review = preauditNeedsReview(card);
    const soon = preauditDaysRemaining(card.target.deadline, now) <= 30;
    return review && soon ? 0 : review ? 1 : soon ? 2 : 3;
  };
  return cards.filter(card => {
    if (!card?.target) return false;
    // Ne jamais indexer le détail des preuves, documents, messages ou métadonnées.
    const labels = [card.target.name, card.target.deadlineKind,
      ...(card.sessionCards ?? []).map(row => row.session?.internal_reference ?? "")];
    if (!fold(labels.join(" ")).includes(search)) return false;
    const review = preauditNeedsReview(card);
    if (selected === "review") return review;
    if (selected === "complete") return !review;
    if (selected === "soon") return preauditDaysRemaining(card.target.deadline, now) <= 30;
    return true;
  }).sort((a, b) => priority(a) - priority(b)
    || preauditDaysRemaining(a.target.deadline, now) - preauditDaysRemaining(b.target.deadline, now)
    || String(a.target.name).localeCompare(String(b.target.name), "fr"));
}
