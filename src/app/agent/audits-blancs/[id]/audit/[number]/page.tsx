"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Answer = "yes" | "partial" | "no" | "unknown";
type Diagnostic = "a_verifier" | "majeure" | "mineure" | "conforme";

type DisplayCondition = {
  profile_question_key?: string;
  operator?: string;
  value?: unknown;
  values?: unknown[];
};

type Question = {
  id: string;
  question_order: number;
  question: string;
  help_text: string | null;
  is_critical: boolean;
  affects_major: boolean;
  affects_minor: boolean;
  display_condition: DisplayCondition | DisplayCondition[] | string | null;
};

type AuditBlancCase = {
  id: string;
  client_email: string;
  status: string;
  offer: string;
  report_status: string;
  profile_data: Record<string, unknown> | null;
};

type AgentProfile = {
  email: string;
  role: "agent" | "admin";
};

function computeDiagnostic(
  indicatorNumber: number,
  questions: Question[],
  answers: Record<string, Answer>,
): Diagnostic {
  let hasMajor = false;
  let hasMinor = false;
  let answered = 0;

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    answered++;

    if (answer === "no") {
      if (q.affects_major) hasMajor = true;
      else if (q.affects_minor) hasMinor = true;
    }

    if (answer === "partial") {
      if (
        [10, 11, 12, 14, 15, 16, 20, 21, 22, 26, 27, 28, 29, 31, 32].includes(
          indicatorNumber,
        ) &&
        q.affects_major
      ) {
        hasMajor = true;
      } else {
        hasMinor = true;
      }
    }
  });

  if (answered < Math.min(5, questions.length)) return "a_verifier";
  if (hasMajor) return "majeure";
  if (hasMinor) return "mineure";
  return "conforme";
}

function getIssues(questions: Question[], answers: Record<string, Answer>) {
  const issues: string[] = [];

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    if (answer === "no" && q.affects_major) {
      issues.push(`❌ ${q.question}`);
    }

    if (answer === "partial" && q.affects_major) {
      issues.push(`⚠️ ${q.question}`);
    }

    if (answer === "no" && q.affects_minor) {
      issues.push(`⚠️ ${q.question}`);
    }
  });

  return issues;
}

function normalizeBooleanLike(value: unknown) {
  if (value === true || value === "true" || value === "yes") return true;
  if (value === false || value === "false" || value === "no") return false;
  return value;
}

function parseDisplayCondition(
  condition: DisplayCondition | DisplayCondition[] | string | null,
): DisplayCondition | DisplayCondition[] | null {
  if (!condition) return null;

  if (typeof condition === "string") {
    try {
      return JSON.parse(condition) as DisplayCondition | DisplayCondition[];
    } catch {
      return null;
    }
  }

  return condition;
}

function matchSingleCondition(
  condition: DisplayCondition,
  profileData: Record<string, unknown> | null,
) {
  const key = condition.profile_question_key;

  if (!key) return true;

  const profileValue = profileData?.[key];
  const expectedValue = condition.value;
  const operator = condition.operator ?? "equals";

  if (operator === "equals") {
    return (
      normalizeBooleanLike(profileValue) === normalizeBooleanLike(expectedValue)
    );
  }

  if (operator === "not_equals") {
    return (
      normalizeBooleanLike(profileValue) !== normalizeBooleanLike(expectedValue)
    );
  }

  if (operator === "contains") {
    if (Array.isArray(profileValue)) {
      return profileValue.map(String).includes(String(expectedValue));
    }

    if (typeof profileValue === "string") {
      return profileValue.includes(String(expectedValue));
    }

    return false;
  }

  if (operator === "not_contains") {
    if (Array.isArray(profileValue)) {
      return !profileValue.map(String).includes(String(expectedValue));
    }

    if (typeof profileValue === "string") {
      return !profileValue.includes(String(expectedValue));
    }

    return true;
  }

  if (operator === "in") {
    const values = condition.values ?? [];
    return values.map(String).includes(String(profileValue));
  }

  return true;
}

function questionMatchesProfile(
  question: Question,
  profileData: Record<string, unknown> | null,
) {
  const parsedCondition = parseDisplayCondition(question.display_condition);

  if (!parsedCondition) return true;

  if (Array.isArray(parsedCondition)) {
    return parsedCondition.every((condition) =>
      matchSingleCondition(condition, profileData),
    );
  }

  return matchSingleCondition(parsedCondition, profileData);
}

function diagnosticLabel(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "⚠️ Non-conformité majeure probable";
  if (diagnostic === "mineure") return "⚠️ Non-conformité mineure probable";
  if (diagnostic === "conforme") return "✅ Conforme";
  return "… En cours d’analyse";
}

function diagnosticColor(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "var(--rust)";
  if (diagnostic === "mineure") return "var(--ocre-gold)";
  if (diagnostic === "conforme") return "#6a8a4a";
  return "var(--ink-faint)";
}

export default function AgentAuditToolPage() {
  const router = useRouter();
  const params = useParams<{ id: string; number: string }>();
  const supabase = useMemo(() => createClient(), []);

  const caseId = params.id;
  const indicatorNumber = Number(params.number);

  const [loading, setLoading] = useState(true);
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [auditCase, setAuditCase] = useState<AuditBlancCase | null>(null);
  const [title, setTitle] = useState(`Indicateur ${indicatorNumber}`);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [note, setNote] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const diagnostic = computeDiagnostic(indicatorNumber, questions, answers);
  const issues = getIssues(questions, answers);

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const totalQuestions = questions.length;
  const progress =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const previousIndicatorNumber =
    indicatorNumber > 1 ? indicatorNumber - 1 : null;
  const nextIndicatorNumber = indicatorNumber < 32 ? indicatorNumber + 1 : null;

  async function loadPage() {
    setLoading(true);
    setError("");
    setSuccess("");

    if (!indicatorNumber || Number.isNaN(indicatorNumber)) {
      setError("Numéro d’indicateur invalide.");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      router.replace("/client/login");
      return;
    }

    const userEmail = authData.user.email ?? "";

    const { data: agentData, error: agentError } = await supabase
      .from("agent_profiles")
      .select("email, role")
      .eq("email", userEmail.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (agentError) {
      setError(`Impossible de vérifier l’accès agent. ${agentError.message}`);
      setLoading(false);
      return;
    }

    if (!agentData) {
      setError("Accès agent non autorisé pour ce compte.");
      setLoading(false);
      return;
    }

    setAgent(agentData as AgentProfile);

    const { data: caseData, error: caseError } = await supabase
      .from("audit_blanc_cases")
      .select("id, client_email, status, offer, report_status, profile_data")
      .eq("id", caseId)
      .maybeSingle();

    if (caseError) {
      setError(`Impossible de charger le dossier. ${caseError.message}`);
      setLoading(false);
      return;
    }

    if (!caseData) {
      setError("Dossier audit blanc introuvable.");
      setLoading(false);
      return;
    }

    setAuditCase(caseData as AuditBlancCase);

    const { data: indicatorData } = await supabase
      .from("preaudit_indicators")
      .select("title, simplified_title")
      .eq("number", indicatorNumber)
      .maybeSingle();

    setTitle(
      indicatorData?.simplified_title ||
        indicatorData?.title ||
        `Indicateur ${indicatorNumber}`,
    );

    const { data: questionData, error: questionError } = await supabase
      .from("preaudit_questions")
      .select(
        "id, question_order, question, help_text, is_critical, affects_major, affects_minor, display_condition",
      )
      .eq("indicator_number", indicatorNumber)
      .order("question_order", { ascending: true });

    if (questionError) {
      setError(questionError.message);
      setLoading(false);
      return;
    }

    const loadedQuestions = ((questionData ?? []) as Question[]).filter(
      (question) =>
        questionMatchesProfile(
          question,
          (caseData.profile_data as Record<string, unknown> | null) ?? null,
        ),
    );

    setQuestions(loadedQuestions);

    const { data: answerData, error: answerError } = await supabase
      .from("audit_blanc_indicator_answers")
      .select("question_id, answer")
      .eq("case_id", caseId);

    if (answerError) {
      setError(answerError.message);
      setLoading(false);
      return;
    }

    const initialAnswers: Record<string, Answer> = {};

    (answerData ?? []).forEach(
      (row: { question_id: string; answer: string }) => {
        if (["yes", "partial", "no", "unknown"].includes(row.answer)) {
          initialAnswers[row.question_id] = row.answer as Answer;
        }
      },
    );

    setAnswers(initialAnswers);

    const { data: noteData, error: noteError } = await supabase
      .from("audit_blanc_indicator_notes")
      .select("user_notes")
      .eq("case_id", caseId)
      .eq("indicator_number", indicatorNumber)
      .maybeSingle();

    if (noteError) {
      setError(noteError.message);
      setLoading(false);
      return;
    }

    setNote(noteData?.user_notes ?? "");

    setLoading(false);
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, indicatorNumber]);

  async function saveAnswer(questionId: string, answer: Answer) {
    if (!agent) return;

    setSavingAnswerId(questionId);
    setError("");
    setSuccess("");

    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));

    const { error: saveError } = await supabase
      .from("audit_blanc_indicator_answers")
      .upsert(
        {
          case_id: caseId,
          question_id: questionId,
          answer,
          answered_by_email: agent.email,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "case_id,question_id",
        },
      );

    if (saveError) {
      setError(saveError.message);
      setSavingAnswerId(null);
      return;
    }

    setSavingAnswerId(null);
  }

  async function saveIndicatorNote() {
    setSavingNote(true);
    setError("");
    setSuccess("");

    const { error: saveError } = await supabase
      .from("audit_blanc_indicator_notes")
      .upsert(
        {
          case_id: caseId,
          indicator_number: indicatorNumber,
          user_notes: note,
          agent_diagnostic: diagnostic,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "case_id,indicator_number",
        },
      );

    if (saveError) {
      setError(saveError.message);
      setSavingNote(false);
      return;
    }

    setSuccess("Note indicateur sauvegardée.");
    setSavingNote(false);
  }

  function goToIndicator(targetNumber: number) {
    void saveIndicatorNote();
    router.push(`/agent/audits-blancs/${caseId}/audit/${targetNumber}`);
  }

  if (loading) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>        <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--ink-faint)" }}>
            Chargement de l’outil d’audit…
          </p>
        </div>      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Audit blanc · outil agent</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              {title}
            </h1>

            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.65 }}>
              Indicateur {indicatorNumber} · {answeredCount}/{totalQuestions}{" "}
              réponses · {progress} %
            </p>

            {auditCase && (
              <p
                style={{
                  color: "rgba(240,220,190,0.75)",
                  fontSize: "0.9rem",
                  marginTop: "0.8rem",
                }}
              >
                Client : {auditCase.client_email}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              background: "rgba(138,75,36,0.06)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              border: "1px solid #6a8a4a",
              borderLeft: "4px solid #6a8a4a",
              background: "rgba(106,138,74,0.08)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "#4f6f36",
            }}
          >
            {success}
          </div>
        )}

        {!agent || !auditCase ? (
          <section
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.4rem",
            }}
          >
            <p className="gazette-label">Accès impossible</p>
            <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
              Le dossier est introuvable ou votre accès agent n’est pas
              autorisé.
            </p>
          </section>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 340px",
              gap: "1.25rem",
              alignItems: "start",
            }}
            className="preaudit-grid"
          >
            <section style={{ display: "grid", gap: "1rem" }}>
              {questions.length === 0 ? (
                <article
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--sepia-mid)",
                    padding: "1.4rem",
                  }}
                >
                  <p className="gazette-label">Aucune question</p>
                  <p style={{ color: "var(--ink-soft)" }}>
                    Aucune question n’est enregistrée pour cet indicateur.
                  </p>
                </article>
              ) : (
                questions.map((q) => (
                  <article
                    key={q.id}
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--sepia-mid)",
                      padding: "1rem",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-cinzel, serif)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ocre-dark)",
                      }}
                    >
                      Question {q.question_order}
                    </p>

                    <h2
                      style={{
                        fontSize: "1rem",
                        color: "var(--ink)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {q.question}
                    </h2>

                    {q.help_text && (
                      <p
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--ink-faint)",
                          fontStyle: "italic",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {q.help_text}
                      </p>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        ["yes", "Oui"],
                        ["partial", "Partiellement"],
                        ["no", "Non"],
                        ["unknown", "Je ne sais pas"],
                      ].map(([value, label]) => {
                        const selected = answers[q.id] === value;

                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => saveAnswer(q.id, value as Answer)}
                            disabled={savingAnswerId === q.id}
                            style={{
                              padding: "0.45rem 0.85rem",
                              border: "1px solid var(--sepia-mid)",
                              background: selected
                                ? "var(--ocre-gold)"
                                : "transparent",
                              color: selected ? "#1a1410" : "var(--ink-soft)",
                              cursor:
                                savingAnswerId === q.id
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: savingAnswerId === q.id ? 0.6 : 1,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))
              )}
            </section>

            <aside
              style={{
                position: "sticky",
                top: "1.5rem",
                display: "grid",
                gap: "0.9rem",
              }}
            >
              <article
                style={{
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: `4px solid ${diagnosticColor(diagnostic)}`,
                  background: "var(--paper)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">Diagnostic agent</p>

                <p
                  style={{
                    fontWeight: 700,
                    color: diagnosticColor(diagnostic),
                    marginTop: "0.5rem",
                  }}
                >
                  {diagnosticLabel(diagnostic)}
                </p>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">Points à corriger</p>

                {issues.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "0.4rem",
                      marginTop: "0.7rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {issues.slice(0, 6).map((issue, index) => (
                      <p key={index}>{issue}</p>
                    ))}
                  </div>
                ) : (
                  <p
                    style={{
                      color: "var(--ink-faint)",
                      fontSize: "0.92rem",
                      marginTop: "0.7rem",
                    }}
                  >
                    Aucun point bloquant détecté pour l’instant.
                  </p>
                )}
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">Note indicateur</p>

                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onBlur={() => saveIndicatorNote()}
                  placeholder="Note agent : preuves observées, écarts, correction à demander..."
                  style={{
                    width: "100%",
                    minHeight: "140px",
                    marginTop: "0.7rem",
                    padding: "0.7rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.55)",
                    resize: "vertical",
                  }}
                />

                <button
                  type="button"
                  className="btn-ink"
                  onClick={saveIndicatorNote}
                  disabled={savingNote}
                  style={{
                    marginTop: "0.7rem",
                    width: "100%",
                    opacity: savingNote ? 0.55 : 1,
                    cursor: savingNote ? "not-allowed" : "pointer",
                  }}
                >
                  <span>
                    {savingNote ? "Sauvegarde…" : "Sauvegarder la note"}
                  </span>
                </button>
              </article>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                {previousIndicatorNumber && (
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => goToIndicator(previousIndicatorNumber)}
                  >
                    <span>← Indicateur {previousIndicatorNumber}</span>
                  </button>
                )}

                {nextIndicatorNumber ? (
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => goToIndicator(nextIndicatorNumber)}
                  >
                    <span>Indicateur {nextIndicatorNumber} →</span>
                  </button>
                ) : (
                  <Link
                    href={`/agent/audits-blancs/${caseId}`}
                    className="btn-ink"
                  >
                    <span>Terminer l’audit</span>
                  </Link>
                )}

                <Link
                  href={`/agent/audits-blancs/${caseId}`}
                  className="btn-ink"
                >
                  <span>Retour fiche dossier</span>
                </Link>

                <Link href="/agent/audits-blancs" className="btn-ink">
                  <span>Retour liste dossiers</span>
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>    </main>
  );
}
