export type DailyFormationStatusRow = {
  organisation_id: string;
  status: string;
};

export type DailyOrganisationProgramStats = {
  total: number;
  validated: number;
  toFinalize: number;
  progress: number;
};

export function dailyOrganisationProgramStats(
  formations: Array<Pick<DailyFormationStatusRow, "status">>,
): DailyOrganisationProgramStats {
  const active = formations.filter((formation) => formation.status !== "archived");
  const validated = active.filter((formation) => formation.status === "validated").length;
  const total = active.length;

  return {
    total,
    validated,
    toFinalize: total - validated,
    progress: total === 0 ? 0 : Math.round((validated / total) * 100),
  };
}

export function dailyOrganisationTaskCounts(
  tasks: Array<{ organisationId: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    counts.set(task.organisationId, (counts.get(task.organisationId) ?? 0) + 1);
  }
  return counts;
}
