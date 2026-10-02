export const DAILY_FORMATION_CREATION_MODES = ["program_import", "selen_form"] as const;
export const DAILY_PREREQUISITE_MODES = ["none", "required"] as const;

export type DailyFormationCreationMode = (typeof DAILY_FORMATION_CREATION_MODES)[number];
export type DailyPrerequisiteMode = (typeof DAILY_PREREQUISITE_MODES)[number];
export type DailyPrerequisiteRequirement = { id: string; label: string; description: string; required: true };

const SELEN_FORM_REQUIRED_FIELDS = ["title", "global_objective", "target_audience", "duration_hours", "duration_days", "modality", "access_delays", "price", "pedagogical_resources", "evaluation_methods", "contact_phone", "contact_email"] as const;
const PROGRAM_IMPORT_REQUIRED_COMPLEMENTS = ["title", "duration_hours", "duration_days", "modality", "contact_phone", "contact_email"] as const;

export function parseDailyFormationCreationMode(value: unknown): DailyFormationCreationMode {
  return value === "program_import" ? "program_import" : "selen_form";
}
export function parseDailyPrerequisiteMode(value: unknown): DailyPrerequisiteMode {
  return value === "required" ? "required" : "none";
}
export function requiredFormationFields(mode: DailyFormationCreationMode): readonly string[] {
  return mode === "program_import" ? PROGRAM_IMPORT_REQUIRED_COMPLEMENTS : SELEN_FORM_REQUIRED_FIELDS;
}
export function cleanPrerequisiteRequirements(value: unknown): DailyPrerequisiteRequirement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw, index) => {
    const source: Record<string, unknown> = raw !== null && typeof raw === "object" ? raw as Record<string, unknown> : { label: raw };
    const label = String(source.label ?? "").trim();
    if (!label) return [];
    const key = label.toLocaleLowerCase("fr");
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: String(source.id ?? `prerequisite_${index + 1}`).trim() || `prerequisite_${index + 1}`, label, description: String(source.description ?? "").trim(), required: true as const }];
  });
}
export function validatePrerequisiteDeclaration(mode: DailyPrerequisiteMode, requirements: DailyPrerequisiteRequirement[]): string | null {
  if (mode === "required" && requirements.length === 0) return "Définissez au moins un justificatif attendu pour les prérequis obligatoires.";
  if (mode === "none" && requirements.length > 0) return "Des justificatifs ne peuvent pas être demandés lorsque la formation est déclarée sans prérequis.";
  return null;
}
export function validateFormationCreationSource(mode: DailyFormationCreationMode, detailedProgramDocumentUrl: string | null | undefined): string | null {
  if (mode === "program_import" && !String(detailedProgramDocumentUrl ?? "").trim()) return "Importez le programme original de la formation avant d’enregistrer ce parcours.";
  return null;
}
export function requiresStructuredLearningObjectives(mode: DailyFormationCreationMode): boolean {
  return mode === "selen_form";
}
