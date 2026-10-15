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

export function buildAttendanceRegularizationEmail(input: {
  learnerName: string;
  slotLabel: string;
  url: string | null;
  expiresAt?: string | null;
}) {
  if (!input.url) return null;
  const learnerName = input.learnerName.trim() || "Madame, Monsieur";
  const slotLabel = input.slotLabel.trim() || "le créneau concerné";
  const expiry = input.expiresAt
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(input.expiresAt))
    : null;
  const subject = "Action requise : régulariser votre émargement";
  const body = [
    `Bonjour ${learnerName},`,
    "",
    `Votre émargement reste à régulariser pour ${slotLabel}.`,
    "Utilisez le lien personnel et sécurisé ci-dessous :",
    input.url,
    expiry ? `Ce lien est valable jusqu’au ${expiry}.` : null,
    "",
    "La signature conservera sa date et son heure réelles. Elle ne modifiera pas rétroactivement la date du créneau de formation.",
    "Si vous avez déjà régularisé cet émargement, vous pouvez ignorer ce message.",
    "",
    "Cordialement,",
    "L’équipe Selen",
  ].filter((line): line is string => line !== null).join("\n");
  return { subject, body, clipboard: `Objet : ${subject}\n\n${body}` };
}
