const DAY_MS = 24 * 60 * 60 * 1000;

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")), weekday: value("weekday") };
}

function easterSunday(year: number) {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKey(date: Date) {
  const { year, month, day } = parisParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function frenchPublicHolidayKeys(year: number) {
  const easter = easterSunday(year);
  return new Set([
    `${year}-01-01`,
    dateKey(addUtcDays(easter, 1)),
    `${year}-05-01`,
    `${year}-05-08`,
    dateKey(addUtcDays(easter, 39)),
    dateKey(addUtcDays(easter, 50)),
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
}

export function isFrenchBusinessDay(date: Date) {
  const parts = parisParts(date);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  return !frenchPublicHolidayKeys(parts.year).has(dateKey(date));
}

export function businessElapsedMs(startValue: string | Date | null, endValue: string | Date = new Date()) {
  if (!startValue) return 0;
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  const end = endValue instanceof Date ? endValue : new Date(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0;

  let cursor = start.getTime();
  const endMs = end.getTime();
  let elapsed = 0;
  while (cursor < endMs) {
    const next = Math.min(cursor + 60 * 60 * 1000, endMs);
    const midpoint = new Date(cursor + (next - cursor) / 2);
    if (isFrenchBusinessDay(midpoint)) elapsed += next - cursor;
    cursor = next;
  }
  return elapsed;
}

export function isOverdueAfterBusinessHours(startValue: string | Date | null, hours: number, now: string | Date = new Date()) {
  return businessElapsedMs(startValue, now) >= hours * 60 * 60 * 1000;
}
