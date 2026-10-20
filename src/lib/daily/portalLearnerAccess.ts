type PortalAccessIdentity = {
  session_id?: unknown;
  portal_type?: unknown;
  entity_key?: unknown;
  entity_email?: unknown;
};

type EnrolmentIdentity = {
  session_id?: unknown;
  learner_id?: unknown;
};

type LearnerIdentity = {
  id?: unknown;
  email?: unknown;
};

const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();

export const CLOSED_DAILY_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "abandoned"]);

export function isClosedDailyEnrolment(status: unknown) {
  return CLOSED_DAILY_ENROLMENT_STATUSES.has(text(status).toLowerCase());
}

export function findDailyLearnerPortalAccess<T extends PortalAccessIdentity>(
  accesses: readonly T[],
  enrolment: EnrolmentIdentity,
  learner: LearnerIdentity | null | undefined,
) {
  const sessionId = text(enrolment.session_id);
  const learnerId = text(enrolment.learner_id);
  const candidates = accesses.filter((access) =>
    access.portal_type === "learner" && text(access.session_id) === sessionId,
  );

  const canonical = candidates.find((access) =>
    text(access.entity_key) === `learner:${learnerId}`,
  );
  if (canonical) return canonical;

  const learnerEmail = email(learner?.email);
  if (!learnerEmail || text(learner?.id) !== learnerId) return undefined;
  return candidates.find((access) => {
    const entityKey = email(access.entity_key);
    const entityEmail = email(access.entity_email);
    if (entityEmail !== learnerEmail) return false;
    return !entityKey || entityKey === entityEmail;
  });
}
