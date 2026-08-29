export type DailySessionPhase = "before" | "during" | "after";
type SessionDates = { start_date?: string | null; end_date?: string | null };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export function toParisDateKey(date: Date = new Date()): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function normaliseDateKey(value?: string | null): string | null { if (!value) return null; const dateOnly = value.slice(0, 10); return DATE_ONLY.test(dateOnly) ? dateOnly : null; }
export function getDailySessionPhase(session: SessionDates, now: Date = new Date()): DailySessionPhase { const today = toParisDateKey(now); const start = normaliseDateKey(session.start_date); const end = normaliseDateKey(session.end_date) ?? start; if (!start) return "before"; if (today < start) return "before"; if (end && today > end) return "after"; return "during"; }
export function phaseLabel(phase: DailySessionPhase): string { return phase === "before" ? "Avant la session" : phase === "during" ? "Pendant la session" : "Après la session"; }
export function isCurrentPhaseItem(itemPhase: string | null | undefined, phase: DailySessionPhase): boolean { return itemPhase === phase; }
