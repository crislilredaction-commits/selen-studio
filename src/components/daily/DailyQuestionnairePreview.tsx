const TYPE_LABELS: Record<string, string> = {
  single_choice: "Choix unique", multiple_choice: "Choix multiple",
  free_text: "Réponse libre", scale_1_5: "Échelle de 1 à 5",
};

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export default function DailyQuestionnairePreview({ questions, assessment = false }: { questions: unknown; assessment?: boolean }) {
  const rows = Array.isArray(questions) ? questions : [];
  if (!rows.length) return <p style={{ color: "var(--selen-text2)" }}>Aucune question configurée.</p>;

  return (
    <ol style={{ margin: "12px 0", paddingLeft: 24, display: "grid", gap: 12 }}>
      {rows.map((raw, index) => {
        const question = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
        const options = Array.isArray(question.options) ? question.options.map(text).filter(Boolean) : [];
        const answers = Array.isArray(question.correct_answers) ? question.correct_answers.map(text).filter(Boolean) : [];
        return (
          <li key={index} style={{ padding: 14, border: "1px solid var(--selen-border)", borderRadius: 10, background: "var(--selen-bg3)", overflowWrap: "anywhere" }}>
            <strong style={{ whiteSpace: "pre-wrap" }}>{text(question.label) || "Question sans intitulé"}</strong>
            <p style={{ margin: "6px 0", color: "var(--selen-text2)", fontSize: 12 }}>
              {TYPE_LABELS[text(question.type)] || "Type non renseigné"} · {question.required === false ? "Facultative" : "Obligatoire"}
              {assessment ? ` · ${text(question.points) ? `${text(question.points)} point(s)` : "Barème non renseigné"}` : ""}
            </p>
            {options.length ? <ul style={{ display: "grid", gap: 5, paddingLeft: 20 }}>{options.map((option, optionIndex) => <li key={optionIndex} style={{ whiteSpace: "pre-wrap" }}>{option}</li>)}</ul> : null}
            {assessment && answers.length ? <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 13 }}><strong>Réponses attendues : </strong>{answers.join(" ; ")}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
