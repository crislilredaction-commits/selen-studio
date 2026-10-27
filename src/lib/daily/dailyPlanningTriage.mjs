/**
 * File de vigilance du planning Studio.
 * Les lignes reçues doivent déjà être limitées aux organismes affectés à l'agent.
 * Ce module ne lit ni ne modifie les données métier.
 */
export function buildDailyPlanningPriorityRows(rows, today) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.flatMap((row) => {
    if (!row || row.dossierStatus !== "active") return [];
    let rank;
    let priorityLabel;
    let actionLabel;
    if (row.state === "À clôturer") {
      rank = 0;
      priorityLabel = "Clôture en retard";
      actionLabel = "Vérifier les pièces de fin et clôturer le dossier";
    } else if (row.state === "Dates à vérifier") {
      rank = 1;
      priorityLabel = "Dates manquantes";
      actionLabel = "Renseigner les dates de la session";
    } else if (row.state === "En cours" && row.openChecklist > 0) {
      rank = 2;
      priorityLabel = "Contrôles en session";
      actionLabel = "Traiter les points de contrôle ouverts";
    } else if (row.state === "À préparer") {
      rank = row.start && row.start <= addDays(today, 7) ? 3 : 4;
      priorityLabel = rank === 3 ? "Démarrage proche" : "Préparation à terminer";
      actionLabel = "Finaliser les points de préparation";
    } else {
      return [];
    }
    return [{ ...row, rank, priorityLabel, actionLabel }];
  }).sort((a, b) =>
    a.rank - b.rank ||
    (a.start ?? "9999-12-31").localeCompare(b.start ?? "9999-12-31") ||
    a.organisationName.localeCompare(b.organisationName, "fr") ||
    a.sessionId.localeCompare(b.sessionId)
  );
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "9999-12-31";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
