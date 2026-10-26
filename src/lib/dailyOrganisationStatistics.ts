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

export type DailyOrganisationDirectoryFilter = "all" | "attention" | "unassigned" | "validations" | "certifications";

export function filterDailyOrganisationDirectory<T extends {
  id: string; name: string; legal_name: string | null; siret: string | null; nda_number: string | null;
}>(organisations: T[], options: {
  query: string; filter: string; taskCounts: ReadonlyMap<string, number>;
  assignedIds: ReadonlySet<string>; validationCounts: ReadonlyMap<string, number>;
  certificationCounts: ReadonlyMap<string, number>;
}): T[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
  const query = normalize(options.query.slice(0, 80));
  return organisations.filter((organisation) => {
    if (query && ![organisation.name, organisation.legal_name, organisation.siret, organisation.nda_number]
      .some((value) => value && normalize(value).includes(query))) return false;
    if (options.filter === "attention") return (options.taskCounts.get(organisation.id) ?? 0) > 0;
    if (options.filter === "unassigned") return !options.assignedIds.has(organisation.id);
    if (options.filter === "validations") return (options.validationCounts.get(organisation.id) ?? 0) > 0;
    if (options.filter === "certifications") return (options.certificationCounts.get(organisation.id) ?? 0) > 0;
    return true;
  });
}
