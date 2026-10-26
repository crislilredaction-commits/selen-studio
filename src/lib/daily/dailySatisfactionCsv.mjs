/**
 * Export CSV en lecture seule. Appelé uniquement sur les lignes déjà autorisées
 * et filtrées côté serveur ; ne contient aucune donnée personnelle apprenant.
 */
const HEADERS = [
  "Formation", "Organisme", "Référence", "Début", "Fin",
  "Apprenants attendus", "Réponses apprenants", "Réponses manquantes",
  "Réponses commanditaire", "Réponses formateur", "Réponses OF",
];

function csvCell(value) {
  let text = String(value ?? "");
  // Les tableurs interprètent parfois les cellules =, +, -, @ comme formules,
  // y compris après des espaces. Le guillemet CSV seul ne les neutralise pas.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function createDailySatisfactionCsv(rows) {
  const data = rows.map(row => [
    row.formation, row.organisation, row.reference, row.startDate, row.endDate,
    row.expectedLearners, row.learnerDone, row.missingLearners,
    row.companyDone, row.trainerDone, row.clientDone,
  ]);
  return "\uFEFF" + [HEADERS, ...data].map(line => line.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
