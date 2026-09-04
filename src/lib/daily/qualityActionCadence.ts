type QualityActionLike = {
  category?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DailyCorrectiveActionQuarterStatus = {
  quarterLabel: string;
  openCount: number;
  reviewedThisQuarterCount: number;
  dueForReviewCount: number;
  lastActivityAt: string | null;
};

function quarterStart(now: Date) {
  const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1));
}

function quarterLabel(now: Date) {
  return `T${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`;
}

function validTimestamp(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getDailyCorrectiveActionQuarterStatus(
  actions: QualityActionLike[],
  now = new Date(),
): DailyCorrectiveActionQuarterStatus {
  const start = quarterStart(now).getTime();
  const openActions = actions.filter(
    (action) => action.category === "corrective_action" && ["open", "planned"].includes(action.status ?? ""),
  );

  const activities = openActions
    .map((action) => validTimestamp(action.updated_at) ?? validTimestamp(action.created_at))
    .filter((value): value is number => value !== null);

  const reviewedThisQuarterCount = activities.filter((value) => value >= start).length;
  const dueForReviewCount = openActions.reduce((count, action) => {
    const activity = validTimestamp(action.updated_at) ?? validTimestamp(action.created_at);
    return count + (activity === null || activity < start ? 1 : 0);
  }, 0);
  const lastActivityAt = activities.length ? new Date(Math.max(...activities)).toISOString() : null;

  return {
    quarterLabel: quarterLabel(now),
    openCount: openActions.length,
    reviewedThisQuarterCount,
    dueForReviewCount,
    lastActivityAt,
  };
}
