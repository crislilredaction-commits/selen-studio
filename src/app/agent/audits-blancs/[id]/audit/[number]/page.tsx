"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type PreauditDocumentModel = {
  id: string;
  name: string;
  description: string | null;
  related_indicators: number[] | null;
  file_url: string | null;
};

type AuditBlancDocument = {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  public_url: string | null;
  is_visible_to_client: boolean;
  uploaded_by_email: string | null;
  created_at: string;
  source_model_id: string | null;
};

// ─── Logic (unchanged) ───────────────────────────────────────────────────────

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
  const issues: { text: string; level: "major" | "minor" }[] = [];
  questions.forEach((q) => {
    const answer = answers[q.id];
    if (!answer) return;
    if (answer === "no" && q.affects_major)
      issues.push({ text: q.question, level: "major" });
    if (answer === "partial" && q.affects_major)
      issues.push({ text: q.question, level: "major" });
    if (answer === "no" && q.affects_minor)
      issues.push({ text: q.question, level: "minor" });
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
  if (operator === "equals")
    return (
      normalizeBooleanLike(profileValue) === normalizeBooleanLike(expectedValue)
    );
  if (operator === "not_equals")
    return (
      normalizeBooleanLike(profileValue) !== normalizeBooleanLike(expectedValue)
    );
  if (operator === "contains") {
    if (Array.isArray(profileValue))
      return profileValue.map(String).includes(String(expectedValue));
    if (typeof profileValue === "string")
      return profileValue.includes(String(expectedValue));
    return false;
  }
  if (operator === "not_contains") {
    if (Array.isArray(profileValue))
      return !profileValue.map(String).includes(String(expectedValue));
    if (typeof profileValue === "string")
      return !profileValue.includes(String(expectedValue));
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
  if (Array.isArray(parsedCondition))
    return parsedCondition.every((c) => matchSingleCondition(c, profileData));
  return matchSingleCondition(parsedCondition, profileData);
}

function extractStoragePathFromPublicUrl(value?: string | null) {
  if (!value) return "";

  const marker = "/storage/v1/object/public/selen-documents/";
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return decodeURIComponent(value.slice(markerIndex + marker.length));
  }

  return value;
}

// ─── Diagnostic helpers ───────────────────────────────────────────────────────

function diagnosticConfig(diagnostic: Diagnostic) {
  if (diagnostic === "majeure")
    return {
      label: "Non-conformité majeure probable",
      color: "#c97a7a",
      bg: "rgba(201,122,122,0.1)",
      border: "rgba(201,122,122,0.3)",
      icon: "✕",
    };
  if (diagnostic === "mineure")
    return {
      label: "Non-conformité mineure probable",
      color: "#d4a843",
      bg: "rgba(212,168,67,0.1)",
      border: "rgba(212,168,67,0.3)",
      icon: "△",
    };
  if (diagnostic === "conforme")
    return {
      label: "Conforme",
      color: "#7ec97e",
      bg: "rgba(126,201,126,0.1)",
      border: "rgba(126,201,126,0.3)",
      icon: "✓",
    };
  return {
    label: "En cours d'analyse…",
    color: "rgba(255,255,255,0.3)",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.1)",
    icon: "…",
  };
}

const ANSWER_CONFIG = [
  { value: "yes", label: "Oui", color: "#7ec97e", activeText: "#0e2010" },
  {
    value: "partial",
    label: "Partiellement",
    color: "#d4a843",
    activeText: "#1a1000",
  },
  { value: "no", label: "Non", color: "#c97a7a", activeText: "#200a0a" },
  {
    value: "unknown",
    label: "Ne sais pas",
    color: "rgba(255,255,255,0.3)",
    activeText: "#1a1510",
  },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

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
  const [documentModels, setDocumentModels] = useState<PreauditDocumentModel[]>(
    [],
  );
  const [publishedDocuments, setPublishedDocuments] = useState<
    AuditBlancDocument[]
  >([]);
  const [publishingModelId, setPublishingModelId] = useState<string | null>(
    null,
  );

  const diagnostic = computeDiagnostic(indicatorNumber, questions, answers);
  const issues = getIssues(questions, answers);
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const totalQuestions = questions.length;
  const progress =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const prevNum = indicatorNumber > 1 ? indicatorNumber - 1 : null;
  const nextNum = indicatorNumber < 32 ? indicatorNumber + 1 : null;
  const dc = diagnosticConfig(diagnostic);
  const indicatorDocumentModels = useMemo(() => {
    return documentModels.filter((model) => {
      if (!Array.isArray(model.related_indicators)) return false;

      return model.related_indicators
        .map((value) => Number(value))
        .includes(indicatorNumber);
    });
  }, [documentModels, indicatorNumber]);

  async function loadPage() {
    setLoading(true);
    setError("");
    setSuccess("");

    if (!indicatorNumber || Number.isNaN(indicatorNumber)) {
      setError("Numéro d'indicateur invalide.");
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
      router.replace("/login");
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
      setError(`Impossible de vérifier l'accès agent. ${agentError.message}`);
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

    const loadedQuestions = ((questionData ?? []) as Question[]).filter((q) =>
      questionMatchesProfile(
        q,
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

    const { data: modelData, error: modelError } = await supabase
      .from("preaudit_document_models")
      .select("id, name, description, related_indicators, file_url")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (modelError) {
      setError(
        `Impossible de charger les modèles de documents. ${modelError.message}`,
      );
      setLoading(false);
      return;
    }

    setDocumentModels((modelData ?? []) as PreauditDocumentModel[]);

    const { data: documentData, error: documentError } = await supabase
      .from("audit_blanc_documents")
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      )
      .eq("case_id", caseId);

    if (documentError) {
      setError(`Impossible de charger les documents. ${documentError.message}`);
      setLoading(false);
      return;
    }

    setPublishedDocuments((documentData ?? []) as AuditBlancDocument[]);

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
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));

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
        { onConflict: "case_id,question_id" },
      );

    if (saveError) {
      setError(saveError.message);
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
        { onConflict: "case_id,indicator_number" },
      );

    if (saveError) {
      setError(saveError.message);
      setSavingNote(false);
      return;
    }
    setSuccess("Note sauvegardée.");
    setSavingNote(false);
  }

  async function publishDocumentModelToClient(model: PreauditDocumentModel) {
    if (!auditCase || !agent) {
      setError("Dossier ou agent introuvable.");
      return;
    }

    if (!model.file_url) {
      setError("Ce modèle n’a pas de fichier associé.");
      return;
    }

    const alreadyPublished = publishedDocuments.some(
      (document) => document.source_model_id === model.id,
    );

    if (alreadyPublished) {
      setError("Ce document est déjà visible dans l’espace client.");
      return;
    }

    const storagePath = extractStoragePathFromPublicUrl(model.file_url);

    if (!storagePath) {
      setError("Impossible de retrouver le chemin du fichier modèle.");
      return;
    }

    setPublishingModelId(model.id);
    setError("");
    setSuccess("");

    const { data: publicUrlData } = supabase.storage
      .from("selen-documents")
      .getPublicUrl(storagePath);

    const { data: documentData, error: insertError } = await supabase
      .from("audit_blanc_documents")
      .insert({
        case_id: auditCase.id,
        name: model.name,
        document_type: "document_correctif",
        storage_bucket: "selen-documents",
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        uploaded_by_email: agent.email,
        is_visible_to_client: true,
        source_model_id: model.id,
      })
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      )
      .single();

    if (insertError) {
      setError(`Impossible de publier le document : ${insertError.message}`);
      setPublishingModelId(null);
      return;
    }

    setPublishedDocuments((prev) => [
      documentData as AuditBlancDocument,
      ...prev,
    ]);

    setSuccess(`Document “${model.name}” rendu visible dans l’espace client.`);
    setPublishingModelId(null);
  }

  function goToIndicator(targetNumber: number) {
    void saveIndicatorNote();
    router.push(`/agent/audits-blancs/${caseId}/audit/${targetNumber}`);
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={s.page}>
        <style>{css}</style>
        <div style={s.loadingWrap}>
          <div className="sel-spinner" />
          <p style={s.loadingText}>Chargement de l'outil d'audit…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{css}</style>

      <div style={s.container}>
        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.breadcrumb}>
            <Link
              href="/agent/audits-blancs"
              style={s.breadcrumbLink}
              className="sel-breadcrumb"
            >
              Dossiers
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <Link
              href={`/agent/audits-blancs/${caseId}`}
              style={s.breadcrumbLink}
              className="sel-breadcrumb"
            >
              Fiche dossier
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <span style={s.breadcrumbCurrent}>
              Indicateur {indicatorNumber}
            </span>
          </div>

          <div style={s.headerBody}>
            <div style={s.headerLeft}>
              <p style={s.eyebrow}>Selen Studio · Outil audit</p>
              <h1 style={s.title}>{title}</h1>
              {auditCase && (
                <p style={s.clientLine}>
                  <span style={s.clientDot} />
                  {auditCase.client_email}
                </p>
              )}
            </div>

            {/* Progress ring */}
            <div style={s.progressWrap}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke="rgba(196,169,106,0.12)"
                  strokeWidth="5"
                />
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke={progress === 100 ? "#7ec97e" : "#c4a96a"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 30}`}
                  strokeDashoffset={`${2 * Math.PI * 30 * (1 - progress / 100)}`}
                  transform="rotate(-90 36 36)"
                  style={{ transition: "stroke-dashoffset 0.4s ease" }}
                />
                <text
                  x="36"
                  y="40"
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.85)"
                  fontSize="14"
                  fontWeight="700"
                  fontFamily="Georgia, serif"
                >
                  {progress}%
                </text>
              </svg>
              <p style={s.progressSub}>
                {answeredCount}/{totalQuestions}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={s.progressBar}>
            <div
              style={{
                ...s.progressFill,
                width: `${progress}%`,
                background: progress === 100 ? "#7ec97e" : "#c4a96a",
              }}
            />
          </div>
        </header>

        {/* ── Alerts ── */}
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {!agent || !auditCase ? (
          <div style={s.card}>
            <p style={s.cardLabel}>Accès impossible</p>
            <p style={s.cardBody}>
              Le dossier est introuvable ou votre accès agent n'est pas
              autorisé.
            </p>
          </div>
        ) : (
          <div style={s.layout} className="sel-layout">
            {/* ── Questions ── */}
            <section style={s.questionsList}>
              {questions.length === 0 ? (
                <div style={s.card}>
                  <p style={s.cardLabel}>Aucune question</p>
                  <p style={s.cardBody}>
                    Aucune question n'est enregistrée pour cet indicateur.
                  </p>
                </div>
              ) : (
                questions.map((q, i) => {
                  const isSaving = savingAnswerId === q.id;
                  const currentAnswer = answers[q.id];
                  return (
                    <article
                      key={q.id}
                      style={{
                        ...s.questionCard,
                        animationDelay: `${i * 35}ms`,
                      }}
                      className="sel-question-card"
                    >
                      {/* Card top row */}
                      <div style={s.questionMeta}>
                        <span style={s.questionNum}>Q{q.question_order}</span>
                        {q.is_critical && (
                          <span style={s.criticalBadge}>Critique</span>
                        )}
                        {q.affects_major && !q.is_critical && (
                          <span style={s.majorBadge}>Majeur</span>
                        )}
                        {isSaving && (
                          <span style={s.savingBadge}>Sauvegarde…</span>
                        )}
                        {currentAnswer && !isSaving && (
                          <span
                            style={{
                              ...s.answeredBadge,
                              color:
                                ANSWER_CONFIG.find(
                                  (a) => a.value === currentAnswer,
                                )?.color ?? C.gold,
                            }}
                          >
                            ✓{" "}
                            {
                              ANSWER_CONFIG.find(
                                (a) => a.value === currentAnswer,
                              )?.label
                            }
                          </span>
                        )}
                      </div>

                      <h2 style={s.questionText}>{q.question}</h2>

                      {q.help_text && <p style={s.helpText}>{q.help_text}</p>}

                      {/* Answer buttons */}
                      <div style={s.answerRow}>
                        {ANSWER_CONFIG.map(
                          ({ value, label, color, activeText }) => {
                            const selected = currentAnswer === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  saveAnswer(q.id, value as Answer)
                                }
                                disabled={isSaving}
                                style={{
                                  ...s.answerBtn,
                                  border: `1px solid ${selected ? color : "rgba(196,169,106,0.18)"}`,
                                  background: selected
                                    ? color
                                    : "rgba(255,255,255,0.03)",
                                  color: selected
                                    ? activeText
                                    : "rgba(255,255,255,0.5)",
                                  opacity: isSaving ? 0.5 : 1,
                                  cursor: isSaving ? "not-allowed" : "pointer",
                                  fontWeight: selected ? 700 : 400,
                                  boxShadow: selected
                                    ? `0 0 12px ${color}33`
                                    : "none",
                                }}
                                className={selected ? "" : "sel-answer-btn"}
                              >
                                {label}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            {/* ── Sidebar ── */}
            <aside style={s.sidebar}>
              {/* Diagnostic */}
              <div
                style={{
                  ...s.diagnosticCard,
                  background: dc.bg,
                  border: `1px solid ${dc.border}`,
                }}
              >
                <div style={diagnosticIconStyle(dc.color)}>{dc.icon}</div>
                <div>
                  <p style={s.cardLabel}>Diagnostic agent</p>
                  <p style={{ ...s.diagnosticLabel, color: dc.color }}>
                    {dc.label}
                  </p>
                </div>
              </div>

              {/* Issues */}
              <div style={s.card}>
                <p style={s.cardLabel}>Points à corriger</p>
                {issues.length > 0 ? (
                  <div style={s.issuesList}>
                    {issues.slice(0, 6).map((issue, i) => (
                      <div key={i} style={s.issueItem}>
                        <span
                          style={{
                            ...s.issueDot,
                            background:
                              issue.level === "major" ? "#c97a7a" : "#d4a843",
                          }}
                        />
                        <span style={s.issueText}>{issue.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={s.cardBody}>Aucun point bloquant détecté.</p>
                )}
              </div>

              {/* Documents correctifs */}
              <div style={s.card}>
                <p style={s.cardLabel}>Documents correctifs</p>

                {diagnostic === "conforme" ? (
                  <p style={s.cardBody}>
                    Aucun document correctif n’est proposé tant que l’indicateur
                    est conforme.
                  </p>
                ) : indicatorDocumentModels.length === 0 ? (
                  <p style={s.cardBody}>
                    Aucun modèle actif n’est associé à cet indicateur pour le
                    moment.
                  </p>
                ) : (
                  <div style={s.documentList}>
                    {indicatorDocumentModels.map((model) => {
                      const alreadyPublished = publishedDocuments.some(
                        (document) => document.source_model_id === model.id,
                      );

                      const isPublishing = publishingModelId === model.id;

                      return (
                        <div key={model.id} style={s.documentItem}>
                          <div>
                            <p style={s.documentTitle}>{model.name}</p>

                            {model.description && (
                              <p style={s.documentDescription}>
                                {model.description}
                              </p>
                            )}

                            {!model.file_url && (
                              <p style={s.documentWarning}>
                                Aucun fichier associé à ce modèle.
                              </p>
                            )}

                            {alreadyPublished && (
                              <p style={s.documentVisible}>
                                Déjà visible dans l’espace client
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => publishDocumentModelToClient(model)}
                            disabled={
                              alreadyPublished ||
                              !model.file_url ||
                              isPublishing
                            }
                            style={{
                              ...s.btnGhost,
                              opacity:
                                alreadyPublished ||
                                !model.file_url ||
                                isPublishing
                                  ? 0.55
                                  : 1,
                              cursor:
                                alreadyPublished ||
                                !model.file_url ||
                                isPublishing
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                            className="sel-btn-ghost"
                          >
                            {isPublishing
                              ? "Publication…"
                              : alreadyPublished
                                ? "Publié"
                                : "Publier client"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Note */}
              <div style={s.card}>
                <p style={s.cardLabel}>Note indicateur</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => saveIndicatorNote()}
                  placeholder="Preuves observées, écarts, corrections à demander…"
                  style={s.textarea}
                  className="sel-textarea"
                />
                <button
                  type="button"
                  onClick={saveIndicatorNote}
                  disabled={savingNote}
                  style={{
                    ...s.btnPrimary,
                    opacity: savingNote ? 0.55 : 1,
                    cursor: savingNote ? "not-allowed" : "pointer",
                  }}
                  className="sel-btn-primary"
                >
                  {savingNote ? "Sauvegarde…" : "Sauvegarder la note"}
                </button>
              </div>

              {/* Navigation */}
              <div style={s.navGroup}>
                <p style={s.navGroupLabel}>Navigation</p>
                <div style={s.navBtns}>
                  {prevNum && (
                    <button
                      type="button"
                      onClick={() => goToIndicator(prevNum)}
                      style={s.btnGhost}
                      className="sel-btn-ghost"
                    >
                      ← Indicateur {prevNum}
                    </button>
                  )}
                  {nextNum ? (
                    <button
                      type="button"
                      onClick={() => goToIndicator(nextNum)}
                      style={s.btnPrimary}
                      className="sel-btn-primary"
                    >
                      Indicateur {nextNum} →
                    </button>
                  ) : (
                    <Link
                      href={`/agent/audits-blancs/${caseId}`}
                      style={s.btnPrimary}
                      className="sel-btn-primary"
                    >
                      Terminer l'audit ✓
                    </Link>
                  )}
                </div>

                <div style={s.navLinks}>
                  <Link
                    href={`/agent/audits-blancs/${caseId}`}
                    style={s.navLink}
                    className="sel-nav-link"
                  >
                    ← Retour fiche dossier
                  </Link>
                  <Link
                    href="/agent/audits-blancs"
                    style={s.navLink}
                    className="sel-nav-link"
                  >
                    ← Retour liste dossiers
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Alert({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  const isError = type === "error";
  return (
    <div
      style={{
        ...s.alert,
        borderLeftColor: isError ? "#c97a7a" : "#7ec97e",
        color: isError ? "#c97a7a" : "#7ec97e",
        background: isError
          ? "rgba(201,122,122,0.07)"
          : "rgba(126,201,126,0.07)",
      }}
    >
      {message}
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: "#1a1510",
  surface: "#221c14",
  surfaceDeep: "#1d1810",
  border: "rgba(196,169,106,0.15)",
  borderStrong: "rgba(196,169,106,0.28)",
  gold: "#c4a96a",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.5)",
  textFaint: "rgba(255,255,255,0.22)",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
function diagnosticIconStyle(color: string): CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: `${color}18`,
    border: `1px solid ${color}44`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1rem",
    color,
    flexShrink: 0,
  };
}
const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "Georgia, 'Times New Roman', serif",
  } as React.CSSProperties,
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "0 2rem 5rem",
  } as React.CSSProperties,

  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70vh",
    gap: "1.2rem",
  } as React.CSSProperties,
  loadingText: {
    color: C.textFaint,
    fontSize: "0.88rem",
    letterSpacing: "0.06em",
  } as React.CSSProperties,

  // Header
  header: { paddingTop: "2rem", marginBottom: "2rem" } as React.CSSProperties,
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.75rem",
    marginBottom: "1.4rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  breadcrumbLink: {
    color: C.gold,
    textDecoration: "none",
    opacity: 0.7,
  } as React.CSSProperties,
  breadcrumbSep: { color: C.textFaint } as React.CSSProperties,
  breadcrumbCurrent: { color: C.textSoft } as React.CSSProperties,
  headerBody: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "1.5rem",
    marginBottom: "1.2rem",
  } as React.CSSProperties,
  headerLeft: { flex: 1 } as React.CSSProperties,
  eyebrow: {
    fontSize: "0.68rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
    color: C.gold,
    marginBottom: "0.5rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  title: {
    fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
    fontWeight: 700,
    color: C.text,
    lineHeight: 1.15,
    margin: "0 0 0.6rem",
    fontFamily: "Georgia, serif",
  } as React.CSSProperties,
  clientLine: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.82rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  clientDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7ec97e",
    flexShrink: 0,
    boxShadow: "0 0 0 2.5px rgba(126,201,126,0.2)",
  } as React.CSSProperties,
  progressWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.3rem",
    flexShrink: 0,
  } as React.CSSProperties,
  progressSub: {
    fontSize: "0.7rem",
    color: C.textFaint,
    fontFamily: "sans-serif",
    letterSpacing: "0.04em",
  } as React.CSSProperties,
  progressBar: {
    height: 3,
    background: "rgba(196,169,106,0.1)",
    borderRadius: 99,
  } as React.CSSProperties,
  progressFill: {
    height: "100%",
    borderRadius: 99,
    transition: "width 0.4s ease",
  } as React.CSSProperties,

  // Layout
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 300px",
    gap: "1.25rem",
    alignItems: "start",
  } as React.CSSProperties,
  questionsList: { display: "grid", gap: "0.8rem" } as React.CSSProperties,

  // Question card
  questionCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem 1.3rem",
    animation: "selFadeIn 0.25s ease both",
  } as React.CSSProperties,
  questionMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.7rem",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  questionNum: {
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    fontFamily: "sans-serif",
    fontWeight: 600,
  } as React.CSSProperties,
  criticalBadge: {
    fontSize: "0.65rem",
    padding: "0.15rem 0.5rem",
    background: "rgba(201,122,122,0.15)",
    border: "1px solid rgba(201,122,122,0.3)",
    borderRadius: 4,
    color: "#c97a7a",
    fontFamily: "sans-serif",
    fontWeight: 700,
  } as React.CSSProperties,
  majorBadge: {
    fontSize: "0.65rem",
    padding: "0.15rem 0.5rem",
    background: "rgba(212,168,67,0.12)",
    border: "1px solid rgba(212,168,67,0.28)",
    borderRadius: 4,
    color: "#d4a843",
    fontFamily: "sans-serif",
    fontWeight: 700,
  } as React.CSSProperties,
  savingBadge: {
    marginLeft: "auto",
    fontSize: "0.72rem",
    color: C.textFaint,
    fontFamily: "sans-serif",
    fontStyle: "italic",
  } as React.CSSProperties,
  answeredBadge: {
    marginLeft: "auto",
    fontSize: "0.72rem",
    fontFamily: "sans-serif",
    fontWeight: 600,
  } as React.CSSProperties,
  questionText: {
    fontSize: "0.97rem",
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.55,
    fontWeight: 400,
    margin: "0 0 0.55rem",
  } as React.CSSProperties,
  helpText: {
    fontSize: "0.8rem",
    color: C.textFaint,
    fontStyle: "italic",
    lineHeight: 1.55,
    margin: "0 0 0.85rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  answerRow: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  answerBtn: {
    padding: "0.42rem 0.9rem",
    borderRadius: 6,
    fontSize: "0.8rem",
    fontFamily: "sans-serif",
    transition: "all 0.15s ease",
    letterSpacing: "0.01em",
  } as React.CSSProperties,

  // Sidebar
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "0.85rem",
  } as React.CSSProperties,
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  } as React.CSSProperties,
  cardLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.6rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  cardBody: {
    color: C.textFaint,
    fontSize: "0.85rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  // Diagnostic
  diagnosticCard: {
    borderRadius: 10,
    padding: "1rem 1.1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.85rem",
  } as React.CSSProperties,

  diagnosticLabel: {
    fontSize: "0.88rem",
    fontWeight: 700,
    marginTop: "0.2rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  // Issues
  issuesList: {
    display: "grid",
    gap: "0.55rem",
    marginTop: "0.3rem",
  } as React.CSSProperties,
  issueItem: {
    display: "flex",
    gap: "0.55rem",
    alignItems: "flex-start",
  } as React.CSSProperties,
  issueDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    marginTop: "0.35rem",
  } as React.CSSProperties,
  issueText: {
    fontSize: "0.79rem",
    color: C.textSoft,
    lineHeight: 1.5,
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  documentList: {
    display: "grid",
    gap: "0.65rem",
    marginTop: "0.4rem",
  } as React.CSSProperties,
  documentItem: {
    display: "grid",
    gap: "0.55rem",
    padding: "0.75rem",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: "rgba(255,255,255,0.025)",
  } as React.CSSProperties,
  documentTitle: {
    color: C.text,
    fontSize: "0.82rem",
    fontWeight: 700,
    lineHeight: 1.35,
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  documentDescription: {
    color: C.textFaint,
    fontSize: "0.76rem",
    lineHeight: 1.45,
    marginTop: "0.25rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  documentWarning: {
    color: "#c97a7a",
    fontSize: "0.74rem",
    marginTop: "0.3rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  documentVisible: {
    color: "#7ec97e",
    fontSize: "0.74rem",
    marginTop: "0.3rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  // Textarea
  textarea: {
    width: "100%",
    minHeight: 120,
    marginTop: "0.2rem",
    marginBottom: "0.7rem",
    padding: "0.75rem",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.83rem",
    lineHeight: 1.55,
    resize: "vertical" as const,
    fontFamily: "sans-serif",
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  // Buttons
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "0.6rem 1rem",
    background: C.gold,
    color: "#1a1510",
    border: "none",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    textAlign: "center" as const,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s ease",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  btnGhost: {
    display: "block",
    width: "100%",
    padding: "0.6rem 1rem",
    background: "transparent",
    color: C.gold,
    border: `1px solid rgba(196,169,106,0.3)`,
    borderRadius: 6,
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    textAlign: "center" as const,
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  // Nav
  navGroup: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  } as React.CSSProperties,
  navGroupLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.8rem",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
  navBtns: {
    display: "grid",
    gap: "0.45rem",
    marginBottom: "0.8rem",
  } as React.CSSProperties,
  navLinks: {
    display: "grid",
    gap: "0.3rem",
    borderTop: `1px solid ${C.border}`,
    paddingTop: "0.7rem",
    marginTop: "0.1rem",
  } as React.CSSProperties,
  navLink: {
    fontSize: "0.78rem",
    color: C.textFaint,
    textDecoration: "none",
    fontFamily: "sans-serif",
    padding: "0.25rem 0",
  } as React.CSSProperties,

  // Alert
  alert: {
    borderLeft: "3px solid",
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    borderRadius: "0 6px 6px 0",
    fontFamily: "sans-serif",
  } as React.CSSProperties,
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
  @keyframes selFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes selSpin {
    to { transform: rotate(360deg); }
  }

  .sel-spinner {
    width: 34px; height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(196,169,106,0.15);
    border-top-color: #c4a96a;
    animation: selSpin 0.75s linear infinite;
  }

  .sel-question-card:hover {
    border-color: rgba(196,169,106,0.28) !important;
  }

  .sel-answer-btn:hover {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(196,169,106,0.07) !important;
    color: rgba(255,255,255,0.75) !important;
  }

  .sel-btn-primary:hover {
    background: #d4a843 !important;
  }

  .sel-btn-ghost:hover {
    background: rgba(196,169,106,0.09) !important;
    border-color: rgba(196,169,106,0.5) !important;
  }

  .sel-textarea:focus {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(255,255,255,0.05) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.07);
  }

  .sel-breadcrumb:hover {
    opacity: 1 !important;
  }

  .sel-nav-link:hover {
    color: rgba(196,169,106,0.7) !important;
  }

  @media (max-width: 860px) {
    .sel-layout {
      grid-template-columns: 1fr !important;
    }
  }
`;
