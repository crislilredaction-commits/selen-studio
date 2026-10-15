export type LearnerPortalAccess = {
  session_id: string;
  portal_type: string;
  entity_key?: string | null;
  entity_email?: string | null;
  token?: string | null;
  status?: string | null;
  expires_at?: string | null;
};

const ACTIVE_ACCESS_STATUSES = new Set(["pending", "viewed"]);

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isUsable(access: LearnerPortalAccess, sessionId: string, now: Date) {
  if (access.session_id !== sessionId || access.portal_type !== "learner") return false;
  if (!ACTIVE_ACCESS_STATUSES.has(normalize(access.status)) || !String(access.token ?? "").trim()) return false;
  if (!access.expires_at) return false;
  const expiresAt = new Date(access.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function resolveLearnerAttendanceAccess(input: {
  accesses: LearnerPortalAccess[];
  sessionId: string;
  learnerId: string;
  learnerEmail?: string | null;
  now?: Date;
}) {
  const active = input.accesses.filter((access) => isUsable(access, input.sessionId, input.now ?? new Date()));
  const stableKey = `learner:${input.learnerId}`;
  const stable = active.find((access) => access.entity_key === stableKey);
  if (stable) return stable;

  // Le secours par email ne concerne que les accès historiques sans clé
  // apprenant. Une clé stable différente ne doit jamais être contournée.
  const learnerEmail = normalize(input.learnerEmail);
  if (!learnerEmail) return null;
  return active.find((access) => !normalize(access.entity_key).startsWith("learner:") && normalize(access.entity_email) === learnerEmail) ?? null;
}

export function buildAttendanceRegularizationUrl(baseUrl: string, access: LearnerPortalAccess | null, slotId: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const token = String(access?.token ?? "").trim();
  const slot = slotId.trim();
  if (!base || !token || !slot) return null;
  return `${base}/daily/portail/learner/${encodeURIComponent(token)}/presence/${encodeURIComponent(slot)}/rattrapage`;
}
