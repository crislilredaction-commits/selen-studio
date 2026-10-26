/** @typedef {{id:string,session_id:string,status:string}} Enrolment */
/** @typedef {{session_id:string,enrolment_id:string}} Feedback */

/**
 * Calcule l'avancement à partir des inscriptions encore actives.
 * Une réponse d'une inscription annulée, d'une autre session ou en doublon
 * ne peut ni gonfler le compteur ni masquer une relance à effectuer.
 * @param {Enrolment[]} enrolments
 * @param {Feedback[]} feedback
 * @param {string} sessionId
 */
export function dailySatisfactionLearnerProgress(enrolments, feedback, sessionId) {
  const inactive = new Set(["declined", "cancelled", "canceled", "abandoned"]);
  const eligibleIds = new Set(enrolments
    .filter(row => row.session_id === sessionId && row.id && !inactive.has(String(row.status ?? "").trim().toLowerCase()))
    .map(row => row.id));
  const answeredIds = new Set(feedback
    .filter(row => row.session_id === sessionId && eligibleIds.has(row.enrolment_id))
    .map(row => row.enrolment_id));
  const expectedLearners = eligibleIds.size;
  const learnerDone = answeredIds.size;
  const missingLearners = expectedLearners - learnerDone;
  return { expectedLearners, learnerDone, missingLearners, learnerComplete: expectedLearners > 0 && missingLearners === 0 };
}
