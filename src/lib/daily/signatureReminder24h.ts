export const DAILY_SIGNATURE_REMINDER_TYPE = "daily_signature_pending_24h";
export const ACTIVE_SIGNATURE_REMINDER_STATUSES = ["draft", "ready", "postponed"] as const;
export const TERMINAL_SIGNATURE_STATUSES = new Set([
  "signed",
  "expired",
  "cancelled",
  "revoked",
  "refused",
  "error",
]);

function atUtcMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

function easterSundayUtc(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return atUtcMidnight(year, month, day);
}

function isoDateUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function frenchPublicHolidayDates(year: number) {
  const easter = easterSundayUtc(year);
  const easterMonday = new Date(easter.getTime() + 24 * 60 * 60 * 1000);
  const ascension = new Date(easter.getTime() + 39 * 24 * 60 * 60 * 1000);
  const whitMonday = new Date(easter.getTime() + 50 * 24 * 60 * 60 * 1000);

  return new Set([
    `${year}-01-01`,
    isoDateUtc(easterMonday),
    `${year}-05-01`,
    `${year}-05-08`,
    isoDateUtc(ascension),
    isoDateUtc(whitMonday),
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
}

export function isFrenchWorkingDay(date: Date) {
  const parisParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parisParts.find((item) => item.type === type)?.value ?? "";
  const year = Number(part("year"));
  const dateKey = `${part("year")}-${part("month")}-${part("day")}`;
  const weekday = part("weekday");
  return weekday !== "Sat" && weekday !== "Sun" && !frenchPublicHolidayDates(year).has(dateKey);
}

/**
 * Règle canonique Selen « 24 h ouvrées » : prochaine journée ouvrée à la même heure,
 * en sautant samedi, dimanche et jours fériés nationaux français.
 */
export function signatureReminderDueAt(sentAt: Date) {
  const candidate = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000);
  while (!isFrenchWorkingDay(candidate)) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

export function signatureReminderDedupeKey(signatureId: string) {
  return `${DAILY_SIGNATURE_REMINDER_TYPE}:${signatureId}`;
}

export function isSignatureTerminal(status: string | null | undefined, signedAt?: string | null) {
  if (signedAt) return true;
  return TERMINAL_SIGNATURE_STATUSES.has((status ?? "").trim().toLowerCase());
}
