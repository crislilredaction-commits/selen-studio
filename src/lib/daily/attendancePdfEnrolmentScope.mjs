/**
 * Ne conserve que les inscriptions reliées à une fiche apprenant du même organisme.
 * Le client admin contourne la RLS : cette vérification est donc obligatoire avant tout PDF.
 *
 * @template {{id: string, organisation_id: string, learner_id: string, status: string | null, daily_learners: {id?: string | null, organisation_id?: string | null} | Array<{id?: string | null, organisation_id?: string | null}> | null}} T
 * @param {T[]} enrolments
 * @param {string} organisationId
 * @param {string} [requestedEnrolmentId]
 * @returns {T[]}
 */
export function filterScopedAttendancePdfEnrolments(enrolments, organisationId, requestedEnrolmentId = "") {
  const inactiveStatuses = new Set(["declined", "cancelled", "abandoned"]);
  return enrolments.filter(enrolment => {
    if (enrolment.organisation_id !== organisationId) return false;
    const learner = Array.isArray(enrolment.daily_learners)
      ? enrolment.daily_learners[0]
      : enrolment.daily_learners;
    if (!learner || learner.id !== enrolment.learner_id || learner.organisation_id !== organisationId) return false;
    return !requestedEnrolmentId ||
      (enrolment.id === requestedEnrolmentId && !inactiveStatuses.has(enrolment.status ?? ""));
  });
}
