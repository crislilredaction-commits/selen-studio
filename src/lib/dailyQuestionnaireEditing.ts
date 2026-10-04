export type DailyEditableQuestion = {
  id: string; label: string; type: string; options: string[]; required: boolean; order: number;
  help_text?: string; correct_answers?: string[]; points?: number;
};

export function parseDailyQuestionnaire(input: string, assessment = false): DailyEditableQuestion[] {
  let rows: unknown;
  try { rows = JSON.parse(input); } catch { throw new Error("Questionnaire invalide. Recharge le dossier."); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error("Le questionnaire doit contenir entre 1 et 100 questions.");
  const ids = new Set<string>();
  const types = new Set(["free_text", "single_choice", "multiple_choice", ...(assessment ? [] : ["scale_1_5"])]);
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Question invalide.");
    const row = raw as Record<string, unknown>;
    const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const id = str(row.id), label = str(row.label), type = str(row.type);
    if (!id || ids.has(id) || !label || !types.has(type)) throw new Error("Chaque question doit avoir un identifiant distinct, un intitulé et un type valide.");
    ids.add(id);
    const choices = type === "single_choice" || type === "multiple_choice";
    const options = choices && Array.isArray(row.options) ? row.options.map(str).filter(Boolean) : [];
    if (choices && (options.length < (assessment ? 2 : 1) || new Set(options).size !== options.length)) throw new Error("Les questions à choix doivent proposer des réponses distinctes.");
    const question: DailyEditableQuestion = { id, label, type, options, required: row.required !== false, order: index + 1 };
    if (!assessment) question.help_text = str(row.help_text);
    else {
      const answers = choices && Array.isArray(row.correct_answers) ? row.correct_answers.map(str).filter(Boolean) : [];
      if (choices && (!answers.length || new Set(answers).size !== answers.length || answers.some(answer => !options.includes(answer)) || (type === "single_choice" && answers.length !== 1))) throw new Error("Indique les bonnes réponses parmi les choix proposés (une seule pour un choix unique).");
      const points = Number(row.points);
      if (!Number.isFinite(points) || points <= 0) throw new Error("Le barème de chaque question doit être supérieur à zéro.");
      question.correct_answers = answers; question.points = points;
    }
    return question;
  });
}

// Some browsers leave File.type empty for Word files. Only supported extensions
// may fill an absent or generic MIME type; an explicit incompatible type fails.
export function dailyQuestionnaireSourceMime(name: string, mime: string) {
  const extensions: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  const expected = extension ? extensions[extension] : undefined;
  if (!expected) return null;
  if (!mime || ["application/octet-stream", "binary/octet-stream"].includes(mime.toLowerCase())) return expected;
  return mime.toLowerCase() === expected ? expected : null;
}
