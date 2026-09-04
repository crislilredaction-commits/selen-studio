export const DAILY_WATCH_CADENCE = [
  { type: "regulatory", label: "Veille réglementaire" },
  { type: "pedagogy_technology", label: "Veille pédagogique & technologique" },
] as const;

export type DailyWatchType = (typeof DAILY_WATCH_CADENCE)[number]["type"];

type WatchEntryLike = {
  watch_type?: string | null;
  published_at?: string | null;
  status?: string | null;
};

export type DailyWatchCadenceStatus = {
  type: DailyWatchType;
  label: string;
  currentMonthCovered: boolean;
  lastPublishedAt: string | null;
};

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getDailyWatchCadenceStatus(
  entries: WatchEntryLike[],
  now = new Date(),
): DailyWatchCadenceStatus[] {
  const currentMonth = monthKey(now);

  return DAILY_WATCH_CADENCE.map(({ type, label }) => {
    const candidates = entries
      .filter((entry) => entry.watch_type === type && entry.status !== "archived" && entry.published_at)
      .map((entry) => entry.published_at as string)
      .filter((value) => Number.isFinite(new Date(value).getTime()))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const lastPublishedAt = candidates[0] ?? null;
    const currentMonthCovered = candidates.some((value) => monthKey(new Date(value)) === currentMonth);

    return { type, label, currentMonthCovered, lastPublishedAt };
  });
}
