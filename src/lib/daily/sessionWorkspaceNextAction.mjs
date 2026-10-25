/**
 * Choisit une action lisible dans le dossier unifié, sans déclencher de mutation.
 * Les compteurs fournis doivent déjà être bornés aux inscriptions actives de l'OF.
 *
 * @typedef {{
 *   sessionId: string,
 *   dossierClosed: boolean,
 *   programNeedsReview: boolean,
 *   documentsNeedReview: boolean,
 *   documentsUnavailable: boolean,
 *   registrationNeedsReview: boolean,
 *   adaptationNeeded: boolean,
 *   responsesCount: number,
 *   waitingForRegistration: boolean,
 *   pendingAttendanceReviews: number,
 *   regularizationCount: number,
 *   portalAccessUnavailable: boolean,
 *   openFollowups: number,
 *   sessionFinished: boolean,
 *   activeLearners: number,
 *   afterUnavailable: boolean,
 *   completedAssessments: number,
 *   satisfactionCount: number
 * }} SessionWorkspaceNextActionInput
 */

/** @param {SessionWorkspaceNextActionInput} state */
export function resolveSessionWorkspaceNextAction(state) {
  const base = `/agent/daily/session-dossiers/${encodeURIComponent(state.sessionId)}`;
  /** @param {string} title @param {string} text @param {string|null} href @param {string|null} label @param {string} indicator */
  const result = (title, text, href, label, indicator = "À traiter") => ({ title, text, href, label, indicator });

  if (state.dossierClosed) return result("Dossier clôturé", "Ce dossier est clôturé. Consulte la clôture avant toute nouvelle intervention.", `${base}/closure`, "Consulter la clôture →", "Clôturé");
  if (state.programNeedsReview) return result("Programme à vérifier", "Le programme transmis attend un contrôle humain avant de poursuivre.", base, "Vérifier le programme →");
  if (state.documentsNeedReview) return state.documentsUnavailable
    ? result("Préparation documentaire indisponible", "L'état documentaire ne peut pas être confirmé. Vérifie les pièces avant de conclure que la préparation est terminée.", `${base}/full#documents-avant-formation`, "Contrôler les documents →", "État inconnu")
    : result("Documents avant formation à préparer", "Des candidatures ont été acceptées. Relis, valide et publie les pièces nécessaires ; une candidature acceptée ne confirme pas toutes les inscriptions.", `${base}/full#documents-avant-formation`, "Ouvrir les documents →");
  if (state.registrationNeedsReview) return result(
    state.adaptationNeeded ? "Inscription avec adaptation à traiter" : "Dossier d'inscription à traiter",
    `${state.responsesCount} réponse${state.responsesCount > 1 ? "s" : ""} reçue${state.responsesCount > 1 ? "s" : ""}. Vérifie les prérequis, les besoins et les positionnements.`,
    `/agent/daily/sessions/${encodeURIComponent(state.sessionId)}`, "Contrôler les inscriptions →",
  );
  if (state.pendingAttendanceReviews > 0) return result("Preuves de présence à valider", `${state.pendingAttendanceReviews} preuve${state.pendingAttendanceReviews > 1 ? "s" : ""} tardive${state.pendingAttendanceReviews > 1 ? "s" : ""} en attente d'une décision humaine. Aucun émargement n'est validé automatiquement.`, `${base}/full#presences-a-valider`, "Examiner les preuves →");
  if (state.portalAccessUnavailable) return result("Liens apprenants indisponibles", "La lecture des accès personnels a échoué. Ne transmets aucun lien de régularisation avant vérification.", `${base}/full#pendant-formation`, "Consulter les présences →", "État inconnu");
  if (state.regularizationCount > 0) return result("Présences à régulariser", `${state.regularizationCount} présence${state.regularizationCount > 1 ? "s" : ""} nécessite${state.regularizationCount > 1 ? "nt" : ""} un contrôle du destinataire et du créneau avant toute relance.`, `${base}/full#pendant-formation`, "Vérifier les régularisations →");
  if (state.openFollowups > 0) return result("Suivis pendant formation ouverts", `${state.openFollowups} suivi${state.openFollowups > 1 ? "s" : ""} à examiner avant de considérer le déroulement terminé.`, `${base}/followup`, "Examiner les suivis →");
  if (state.sessionFinished && state.activeLearners > 0) {
    if (state.afterUnavailable) return result("Résultats de fin de formation indisponibles", "Les évaluations ou satisfactions n'ont pas pu être lues. Ne les considère pas comme absentes.", `${base}/full#apres-formation`, "Contrôler les résultats →", "État inconnu");
    if (state.completedAssessments < state.activeLearners) return result("Évaluations finales à contrôler", `${state.completedAssessments}/${state.activeLearners} apprenant(s) avec une évaluation finalisée. Vérifie les dossiers restants avant clôture.`, `${base}/evaluation`, "Contrôler les évaluations →");
    if (state.satisfactionCount < state.activeLearners) return result("Satisfactions à suivre", `${state.satisfactionCount}/${state.activeLearners} satisfaction(s) reçue(s). Vérifie les réponses et les éventuelles relances.`, `${base}/satisfaction`, "Contrôler les satisfactions →");
    return result("Clôture à contrôler", "Les suivis individuels sont renseignés. La clôture reste une décision humaine.", `${base}/closure`, "Vérifier la clôture →", "À vérifier");
  }
  if (state.waitingForRegistration) return result("En attente d'une inscription", "Le programme est validé, mais aucune candidature, inscription ou réponse n'est encore reçue.", null, null, "En attente");
  return result("Dossier en suivi", "Aucune action prioritaire détectée. Les étapes restent consultables et nécessitent leur contrôle habituel.", null, null, "À surveiller");
}
