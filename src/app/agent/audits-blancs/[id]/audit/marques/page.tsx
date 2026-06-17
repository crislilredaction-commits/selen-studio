"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuditGrimoire from "@/components/agent/AuditGrimoire";

type BrandAnswer = "yes" | "no" | "";
type Diagnostic = "a_verifier" | "conforme" | "mineure" | "majeure";

type AgentProfile = {
  email: string;
  role: "agent" | "admin";
};

type AuditBlancCase = {
  id: string;
  client_email: string;
  status: string;
  offer: string;
  profile_data: Record<string, unknown> | null;
  brand_usage_answers: Record<string, BrandAnswer> | null;
  brand_usage_notes: string | null;
  brand_usage_diagnostic: Diagnostic | null;
};

type BrandQuestion = {
  key: string;
  question: string;
  help: string;
  expectedAnswer: "yes" | "no";
  severity: "minor" | "major";
  skipConformityCheck?: boolean;
  condition?: (answers: Record<string, BrandAnswer>) => boolean;
};

const INITIAL_AUDIT_BRAND_QUESTIONS: BrandQuestion[] = [
  {
    key: "displays_qualiopi_certificate_before_certification",
    question:
      "L’organisme affiche-t-il un certificat Qualiopi alors qu’il n’est pas encore certifié ?",
    help: "En audit initial, aucun certificat ne doit être présenté comme déjà obtenu.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "uses_qualiopi_logo_before_certification",
    question:
      "L’organisme utilise-t-il le logo Qualiopi avant certification ?",
    help: "Le logo Qualiopi ne doit pas être utilisé avant l’obtention effective de la certification.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "claims_qualiopi_certified_before_certification",
    question:
      "L’organisme se présente-t-il comme certifié Qualiopi avant obtention du certificat ?",
    help: "Rechercher les mentions “certifié Qualiopi”, “organisme certifié” ou équivalentes.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "mentions_cofrac_or_certifier_misleading",
    question:
      "Les mentions Cofrac ou certificateur peuvent-elles laisser croire que l’organisme est déjà certifié ?",
    help: "Le Cofrac accrédite les certificateurs, pas directement les organismes de formation.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "uses_pending_audit_as_certification",
    question:
      "La démarche de certification en cours est-elle présentée comme une certification acquise ?",
    help: "Une démarche en cours peut être mentionnée, mais sans laisser croire que la certification est déjà obtenue.",
    expectedAnswer: "no",
    severity: "major",
  },
];

const CERTIFIED_BRAND_QUESTIONS: BrandQuestion[] = [
  {
    key: "has_qualiopi_certificate",
    question: "Le certificat Qualiopi est-il disponible ?",
    help: "Vérifier que l’organisme peut présenter son certificat.",
    expectedAnswer: "yes",
    severity: "major",
  },
  {
    key: "certificate_is_current",
    question: "Le certificat présenté est-il en cours de validité ?",
    help: "Vérifier les dates, le certificateur et l’absence d’expiration.",
    expectedAnswer: "yes",
    severity: "major",
  },
  {
    key: "certificate_scope_matches_activity",
    question:
      "Le périmètre du certificat correspond-il aux activités auditées ?",
    help: "Les catégories certifiées doivent correspondre aux activités communiquées et vendues.",
    expectedAnswer: "yes",
    severity: "major",
  },
  {
    key: "certificate_on_website",
    question:
      "Le certificat est-il accessible sur le site internet ?",
    help: "Si le certificat n’est pas publié sur le site, vérifier un autre mode de transmission.",
    expectedAnswer: "yes",
    severity: "minor",
  },
  {
    key: "certificate_by_email_or_social",
    question:
      "Le certificat est-il transmis par un autre canal ?",
    help: "Exemples : email, devis, plaquette, réseau social professionnel, espace client.",
    expectedAnswer: "yes",
    severity: "minor",
    condition: (answers) => answers.certificate_on_website === "no",
  },
  {
    key: "certificate_diffusion_proof",
    question:
      "Une preuve de diffusion ou de transmission du certificat existe-t-elle ?",
    help: "Capture, lien public, modèle d’email, plaquette ou trace de remise.",
    expectedAnswer: "yes",
    severity: "minor",
  },
  {
    key: "uses_qualiopi_logo",
    question: "L’organisme utilise-t-il le logo Qualiopi ?",
    help: "Question de contexte : si oui, contrôler l’usage du logo.",
    expectedAnswer: "no",
    severity: "minor",
    skipConformityCheck: true,
  },
  {
    key: "logo_is_official",
    question: "Le logo utilisé est-il le logo officiel ?",
    help: "Vérifier qu’il ne s’agit pas d’une version recomposée ou douteuse.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
  {
    key: "logo_not_modified",
    question: "Le logo respecte-t-il la charte graphique ?",
    help: "Vérifier qu’il n’est pas déformé, modifié ou recoloré.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
  {
    key: "logo_use_not_misleading",
    question:
      "L’usage du logo respecte-t-il le périmètre certifié ?",
    help: "Le logo ne doit pas laisser croire que des activités non certifiées sont couvertes.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
  {
    key: "logo_not_on_training_certificate",
    question:
      "Le logo est-il absent des attestations ou certificats bénéficiaires trompeurs ?",
    help: "Le logo concerne la certification de l’organisme, pas la réussite individuelle d’un bénéficiaire.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
];

function isInitialAudit(profileData?: Record<string, unknown> | null) {
  return profileData?.audit_type === "initial";
}

function getBrandQuestions(profileData?: Record<string, unknown> | null) {
  if (isInitialAudit(profileData)) {
    return INITIAL_AUDIT_BRAND_QUESTIONS;
  }

  return CERTIFIED_BRAND_QUESTIONS;
}

function getVisibleQuestions(
  questions: BrandQuestion[],
  answers: Record<string, BrandAnswer>,
) {
  return questions.filter((question) => {
    if (!question.condition) return true;
    return question.condition(answers);
  });
}

function computeDiagnostic(
  questions: BrandQuestion[],
  answers: Record<string, BrandAnswer>,
): Diagnostic {
  const visibleQuestions = getVisibleQuestions(questions, answers);

  const hasUnanswered = visibleQuestions.some((question) => {
    const answer = answers[question.key];
    return !answer;
  });

  if (hasUnanswered) return "a_verifier";

  const hasMajorIssue = visibleQuestions
    .filter((question) => !question.skipConformityCheck)
    .some(
      (question) =>
        question.severity === "major" &&
        answers[question.key] !== question.expectedAnswer,
    );

  if (hasMajorIssue) return "majeure";

  const hasMinorIssue = visibleQuestions
    .filter((question) => !question.skipConformityCheck)
    .some(
      (question) =>
        question.severity === "minor" &&
        answers[question.key] !== question.expectedAnswer,
    );

  if (hasMinorIssue) return "mineure";

  return "conforme";
}

function diagnosticConfig(diagnostic: Diagnostic) {
  if (diagnostic === "conforme") {
    return {
      label: "Usage des marques conforme",
      color: "#7ec97e",
      bg: "rgba(126,201,126,0.1)",
      border: "rgba(126,201,126,0.3)",
      icon: "✓",
    };
  }

  if (diagnostic === "mineure") {
    return {
      label: "Point de vigilance mineur",
      color: "#d4a843",
      bg: "rgba(212,168,67,0.1)",
      border: "rgba(212,168,67,0.3)",
      icon: "△",
    };
  }

  if (diagnostic === "majeure") {
    return {
      label: "Risque de non-conformité majeure",
      color: "#c97a7a",
      bg: "rgba(201,122,122,0.1)",
      border: "rgba(201,122,122,0.3)",
      icon: "!",
    };
  }

  return {
    label: "À vérifier",
    color: C.textFaint,
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.1)",
    icon: "…",
  };
}

function getIssues(
  questions: BrandQuestion[],
  answers: Record<string, BrandAnswer>,
) {
  return getVisibleQuestions(questions, answers)
    .filter(
      (question) =>
        !question.skipConformityCheck &&
        answers[question.key] &&
        answers[question.key] !== question.expectedAnswer,
    )
    .map((question) => ({
      question: question.question,
      severity: question.severity,
    }));
}

function formatAuditType(profileData?: Record<string, unknown> | null) {
  const auditType = profileData?.audit_type;

  if (auditType === "initial") return "Audit initial";
  if (auditType === "surveillance") return "Audit de surveillance";
  if (auditType === "renouvellement") return "Audit de renouvellement";
  if (auditType === "unknown") return "Type d’audit à vérifier";

  return "Non renseigné";
}

function formatCategories(profileData?: Record<string, unknown> | null) {
  const categories = Array.isArray(profileData?.action_categories)
    ? profileData.action_categories.map(String)
    : [];

  if (categories.length === 0) return "Non renseignées";

  return categories.join(", ");
}

function answerLabel(answer: BrandAnswer) {
  if (answer === "yes") return "Oui";
  if (answer === "no") return "Non";
  return "Sans réponse";
}

function expectedLabel(answer: "yes" | "no") {
  return answer === "yes" ? "Réponse attendue : oui" : "Réponse attendue : non";
}

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
    fontWeight: 800,
  };
}

export default function AgentAuditMarquesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const caseId = params.id;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [marquesLoaded, setMarquesLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const skipNextAutoSaveRef = useRef(true);

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [auditCase, setAuditCase] = useState<AuditBlancCase | null>(null);
  const [answers, setAnswers] = useState<Record<string, BrandAnswer>>({});
  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const brandQuestions = useMemo(
    () => getBrandQuestions(auditCase?.profile_data),
    [auditCase?.profile_data],
  );

  const diagnostic = computeDiagnostic(brandQuestions, answers);
  const visibleQuestions = getVisibleQuestions(brandQuestions, answers);
  const issues = getIssues(brandQuestions, answers);
  const dc = diagnosticConfig(diagnostic);

  const answeredCount = visibleQuestions.filter((question) =>
    Boolean(answers[question.key]),
  ).length;

  const progress =
    visibleQuestions.length > 0
      ? Math.round((answeredCount / visibleQuestions.length) * 100)
      : 0;

  useEffect(() => {
    async function loadMarquesPage() {
      setLoading(true);
      setError("");
      setSuccess("");

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

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
        .select(
          "id, client_email, status, offer, profile_data, brand_usage_answers, brand_usage_notes, brand_usage_diagnostic",
        )
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

      const storedAnswers =
        (caseData.brand_usage_answers as Record<string, BrandAnswer> | null) ??
        {};

      const initialAnswers: Record<string, BrandAnswer> = {};

      const currentBrandQuestions = getBrandQuestions(
        (caseData.profile_data as Record<string, unknown> | null) ?? null,
      );

      currentBrandQuestions.forEach((question) => {
        initialAnswers[question.key] = storedAnswers[question.key] ?? "";
      });

      skipNextAutoSaveRef.current = true;
      setAnswers(initialAnswers);
      setNotes(caseData.brand_usage_notes ?? "");
      setMarquesLoaded(true);
      setSaveStatus("saved");
      setLoading(false);
    }

    loadMarquesPage();
  }, [caseId, router, supabase]);

  useEffect(() => {
    if (!marquesLoaded || !auditCase?.id) return;

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    setSaveStatus("idle");

    const timeout = window.setTimeout(() => {
      void saveMarquesDraft(answers, notes);
    }, 800);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, notes, marquesLoaded, auditCase?.id]);

  function updateAnswer(key: string, value: BrandAnswer) {
    setAnswers((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveMarquesDraft(
    answersToSave = answers,
    notesToSave = notes,
  ) {
    if (!auditCase) return false;

    const nextDiagnostic = computeDiagnostic(brandQuestions, answersToSave);

    setSaving(true);
    setSaveStatus("saving");
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("audit_blanc_cases")
      .update({
        brand_usage_answers: answersToSave,
        brand_usage_notes: notesToSave,
        brand_usage_diagnostic: nextDiagnostic,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (updateError) {
      setError(updateError.message);
      setSaveStatus("error");
      setSaving(false);
      return false;
    }

    setSaveStatus("saved");
    setSaving(false);
    return true;
  }

  async function saveMarquesAndGoNext() {
    if (!auditCase) return;

    const saved = await saveMarquesDraft(answers, notes);

    if (!saved) return;

    router.push(`/agent/audits-blancs/${auditCase.id}/audit/1`);
  }

  if (loading) {
    return (
      <div style={s.page}>
        <style>{css}</style>

        <div style={s.loadingWrap}>
          <div className="sel-spinner" />
          <p style={s.loadingText}>Chargement de l’usage des marques…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{css}</style>
      <AuditGrimoire />

      <div style={s.container}>
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
            <Link
              href={`/agent/audits-blancs/${caseId}/audit/profil`}
              style={s.breadcrumbLink}
              className="sel-breadcrumb"
            >
              Profil
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <span style={s.breadcrumbCurrent}>Usage des marques</span>
          </div>

          <div style={s.headerBody}>
            <div style={s.headerLeft}>
              <p style={s.eyebrow}>Selen Studio · Audit blanc</p>

              <h1 style={s.title}>Usage des marques</h1>

              <p style={s.subtitle}>
                Vérifiez la diffusion du certificat Qualiopi, les mentions
                commerciales et l’usage éventuel du logo avant de démarrer les
                indicateurs.
              </p>

              {auditCase && (
                <p style={s.clientLine}>
                  <span style={s.clientDot} />
                  {auditCase.client_email} ·{" "}
                  {formatAuditType(auditCase.profile_data)} · Catégories :{" "}
                  {formatCategories(auditCase.profile_data)}
                </p>
              )}
            </div>

            <div style={s.progressCard}>
              <p style={s.progressLabel}>Contrôle complété</p>
              <p style={s.progressValue}>{progress}%</p>
              <div style={s.progressBar}>
                <div
                  style={{
                    ...s.progressFill,
                    width: `${progress}%`,
                    background: progress === 100 ? "#7ec97e" : C.gold,
                  }}
                />
              </div>
              <p style={s.progressSub}>
                {answeredCount} / {visibleQuestions.length} réponses
              </p>
            </div>
          </div>
        </header>

        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {!agent || !auditCase ? (
          <EmptyState
            label="Accès impossible"
            title="Le dossier est introuvable ou votre accès agent n’est pas autorisé."
            body="Revenez à la liste des audits blancs pour vérifier le dossier."
            href="/agent/audits-blancs"
            action="Retour aux dossiers"
          />
        ) : (
          <div style={s.layout} className="sel-layout">
            <section style={s.questionsList}>
              {visibleQuestions.map((question, index) => {
                const value = answers[question.key] ?? "";
                const answered = Boolean(value);
                const isMismatch =
                  answered &&
                  !question.skipConformityCheck &&
                  value !== question.expectedAnswer;

                return (
                  <article
                    key={question.key}
                    style={{
                      ...s.questionCard,
                      animationDelay: `${index * 35}ms`,
                      borderColor: isMismatch
                        ? question.severity === "major"
                          ? "rgba(201,122,122,0.38)"
                          : "rgba(212,168,67,0.38)"
                        : answered
                          ? "rgba(126,201,126,0.24)"
                          : C.border,
                    }}
                    className="sel-question-card"
                  >
                    <div style={s.questionTop}>
                      <div>
                        <p style={s.cardLabel}>
                          {question.severity === "major"
                            ? "Point sensible"
                            : "Point de contrôle"}
                        </p>

                        <h2 style={s.questionTitle}>{question.question}</h2>
                      </div>

                      <span
                        style={{
                          ...s.answerState,
                          color: answered
                            ? isMismatch
                              ? question.severity === "major"
                                ? "#c97a7a"
                                : "#d4a843"
                              : "#7ec97e"
                            : C.textFaint,
                          borderColor: answered
                            ? isMismatch
                              ? question.severity === "major"
                                ? "rgba(201,122,122,0.35)"
                                : "rgba(212,168,67,0.35)"
                              : "rgba(126,201,126,0.32)"
                            : C.border,
                          background: answered
                            ? isMismatch
                              ? question.severity === "major"
                                ? "rgba(201,122,122,0.08)"
                                : "rgba(212,168,67,0.08)"
                              : "rgba(126,201,126,0.08)"
                            : "rgba(255,255,255,0.03)",
                        }}
                      >
                        {answered ? answerLabel(value) : "À renseigner"}
                      </span>
                    </div>

                    <p style={s.helpText}>{question.help}</p>

                    <p style={s.expectedText}>
                      {question.skipConformityCheck
                        ? "Question de contexte : elle permet d’afficher les contrôles associés."
                        : expectedLabel(question.expectedAnswer)}
                    </p>

                    <div style={s.answerRow}>
                      {[
                        { label: "Oui", value: "yes" as BrandAnswer },
                        { label: "Non", value: "no" as BrandAnswer },
                      ].map((option) => {
                        const selected = value === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              updateAnswer(question.key, option.value)
                            }
                            style={{
                              ...s.answerButton,
                              background: selected
                                ? C.gold
                                : "rgba(255,255,255,0.03)",
                              borderColor: selected
                                ? C.gold
                                : "rgba(196,169,106,0.18)",
                              color: selected ? "var(--selen-ink)" : C.textSoft,
                              fontWeight: selected ? 700 : 400,
                            }}
                            className={selected ? "" : "sel-answer"}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}

              <article style={s.notesCard}>
                <p style={s.cardLabel}>Notes agent</p>

                <h2 style={s.notesTitle}>Constats sur l’usage des marques</h2>

                <p style={s.helpText}>
                  Notez ici les preuves observées, les captures à demander, les
                  mentions à corriger ou les points à confirmer avec le client.
                </p>

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ex : certificat présent sur le site, logo non utilisé, mention à corriger sur la page d’accueil..."
                  style={s.textarea}
                  className="sel-textarea"
                />
              </article>
            </section>

            <aside style={s.sidebar}>
              <div
                style={{
                  ...s.diagnosticCard,
                  background: dc.bg,
                  border: `1px solid ${dc.border}`,
                }}
              >
                <div style={diagnosticIconStyle(dc.color)}>{dc.icon}</div>

                <div>
                  <p style={s.cardLabel}>Diagnostic marques</p>
                  <p style={{ ...s.diagnosticLabel, color: dc.color }}>
                    {dc.label}
                  </p>
                </div>
              </div>

              <div style={s.sideCard}>
                <p style={s.cardLabel}>Points à corriger</p>

                {issues.length > 0 ? (
                  <div style={s.issuesList}>
                    {issues.map((issue, index) => (
                      <div key={index} style={s.issueItem}>
                        <span
                          style={{
                            ...s.issueDot,
                            background:
                              issue.severity === "major"
                                ? "#c97a7a"
                                : "#d4a843",
                          }}
                        />
                        <span style={s.issueText}>{issue.question}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={s.cardBody}>
                    Aucun point bloquant détecté pour l’instant.
                  </p>
                )}
              </div>

              <div style={s.sideCard}>
                <p style={s.cardLabel}>Parcours audit blanc</p>

                <div style={s.steps}>
                  <StepItem done label="1. Profil audité" />
                  <StepItem active done label="2. Usage des marques" />
                  <StepItem label="3. Indicateurs" />
                  <StepItem label="4. Synthèse & rapport" />
                </div>
              </div>

              <div style={s.navCard}>
                <p
                  style={{
                    fontSize: 12,
                    color:
                      saveStatus === "error"
                        ? "#c97a7a"
                        : saveStatus === "saved"
                          ? "#7ec97e"
                          : C.textFaint,
                    fontFamily: "sans-serif",
                    marginBottom: 4,
                  }}
                >
                  {saveStatus === "saving"
                    ? "Sauvegarde automatique…"
                    : saveStatus === "saved"
                      ? "Sauvegardé automatiquement"
                      : saveStatus === "error"
                        ? "Erreur de sauvegarde"
                        : "Les modifications sont sauvegardées automatiquement."}
                </p>

                <button
                  type="button"
                  onClick={saveMarquesAndGoNext}
                  disabled={saving}
                  style={{
                    ...s.btnPrimary,
                    opacity: saving ? 0.55 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                  className="sel-btn-primary"
                >
                  {saving ? "Sauvegarde…" : "Continuer vers l’indicateur 1 →"}
                </button>

                <Link
                  href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
                  style={s.btnGhost}
                  className="sel-btn-ghost"
                >
                  ← Retour profil
                </Link>

                <Link
                  href={`/agent/audits-blancs/${auditCase.id}`}
                  style={s.navLink}
                  className="sel-nav-link"
                >
                  ← Retour fiche dossier
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

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

function EmptyState({
  label,
  title,
  body,
  href,
  action,
}: {
  label: string;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div style={s.emptyState}>
      <div style={s.emptyOrnament}>✦</div>
      <p style={s.emptyLabel}>{label}</p>
      <h2 style={s.emptyTitle}>{title}</h2>
      <p style={s.emptyBody}>{body}</p>

      <Link href={href} style={s.btnPrimary} className="sel-btn-primary">
        {action}
      </Link>
    </div>
  );
}

function StepItem({
  label,
  active,
  done,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div style={s.stepItem}>
      <span
        style={{
          ...s.stepDot,
          background: done ? "#7ec97e" : active ? C.gold : "transparent",
          borderColor: done || active ? "transparent" : C.borderStrong,
        }}
      />
      <span
        style={{
          ...s.stepLabel,
          color: active || done ? C.text : C.textFaint,
        }}
      >
        {label}
      </span>
    </div>
  );
}

const C = {
  bg: "var(--selen-bg)",
  surface: "var(--selen-card-texture), var(--selen-card)",
  surfaceDeep: "var(--selen-card2)",
  border: "var(--selen-border)",
  borderStrong: "var(--selen-border2)",
  gold: "var(--selen-gold)",
  text: "var(--selen-text-oncard)",
  textSoft: "var(--selen-text2-oncard)",
  textFaint: "var(--selen-text3-oncard)",
};

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: "var(--selen-text)",
    fontFamily: "var(--font-body)",
  },
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "0 2rem 5rem",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70vh",
    gap: "1.2rem",
  },
  loadingText: {
    color: C.textFaint,
    fontSize: "0.88rem",
    letterSpacing: "0.06em",
  },
  header: {
    paddingTop: "2rem",
    marginBottom: "2rem",
  },
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.75rem",
    marginBottom: "1.4rem",
    fontFamily: "sans-serif",
  },
  breadcrumbLink: {
    color: C.gold,
    textDecoration: "none",
    opacity: 0.7,
  },
  breadcrumbSep: {
    color: C.textFaint,
  },
  breadcrumbCurrent: {
    color: C.textSoft,
  },
  headerBody: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 220px",
    gap: "1.5rem",
    alignItems: "start",
  },
  headerLeft: {
    minWidth: 0,
  },
  eyebrow: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: C.gold,
    marginBottom: "0.5rem",
    fontFamily: "sans-serif",
  },
  title: {
    fontSize: "clamp(1.7rem, 3.4vw, 2.5rem)",
    fontWeight: 700,
    color: C.text,
    lineHeight: 1.1,
    margin: "0 0 0.7rem",
    fontFamily: "Georgia, serif",
  },
  subtitle: {
    color: C.textSoft,
    lineHeight: 1.65,
    maxWidth: 720,
    fontSize: "0.92rem",
    margin: "0 0 0.8rem",
    fontFamily: "sans-serif",
  },
  clientLine: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.82rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
    flexWrap: "wrap",
  },
  clientDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7ec97e",
    flexShrink: 0,
    boxShadow: "0 0 0 2.5px rgba(126,201,126,0.2)",
  },
  progressCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1rem",
  },
  progressLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: C.textFaint,
    marginBottom: "0.4rem",
    fontFamily: "sans-serif",
  },
  progressValue: {
    fontSize: "2rem",
    color: C.text,
    fontWeight: 800,
    lineHeight: 1,
    marginBottom: "0.7rem",
  },
  progressBar: {
    height: 4,
    background: "rgba(196,169,106,0.1)",
    borderRadius: 99,
    overflow: "hidden",
    marginBottom: "0.5rem",
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    transition: "width 0.4s ease",
  },
  progressSub: {
    color: C.textFaint,
    fontSize: "0.73rem",
    fontFamily: "sans-serif",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: "1.25rem",
    alignItems: "start",
  },
  questionsList: {
    display: "grid",
    gap: "0.85rem",
  },
  questionCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem",
    animation: "selFadeIn 0.25s ease both",
  },
  questionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "0.55rem",
  },
  cardLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.35rem",
    fontFamily: "sans-serif",
  },
  questionTitle: {
    color: C.text,
    fontSize: "1rem",
    lineHeight: 1.35,
    margin: 0,
    fontFamily: "Georgia, serif",
  },
  answerState: {
    flexShrink: 0,
    border: "1px solid",
    borderRadius: 999,
    padding: "0.18rem 0.55rem",
    fontSize: "0.68rem",
    fontFamily: "sans-serif",
    fontWeight: 700,
  },
  helpText: {
    color: C.textFaint,
    fontSize: "0.82rem",
    lineHeight: 1.55,
    marginBottom: "0.75rem",
    fontFamily: "sans-serif",
  },
  expectedText: {
    color: C.gold,
    fontSize: "0.75rem",
    lineHeight: 1.45,
    marginBottom: "0.9rem",
    fontFamily: "sans-serif",
  },
  answerRow: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap",
  },
  answerButton: {
    padding: "0.45rem 0.85rem",
    border: "1px solid",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontFamily: "sans-serif",
    transition: "all 0.15s ease",
  },
  notesCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem",
  },
  notesTitle: {
    color: C.text,
    fontSize: "1rem",
    lineHeight: 1.35,
    margin: "0 0 0.55rem",
    fontFamily: "Georgia, serif",
  },
  textarea: {
    width: "100%",
    minHeight: 140,
    padding: "0.75rem",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.83rem",
    lineHeight: 1.55,
    resize: "vertical",
    fontFamily: "sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "0.85rem",
  },
  diagnosticCard: {
    borderRadius: 10,
    padding: "1rem 1.1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.85rem",
  },
  diagnosticLabel: {
    fontSize: "0.88rem",
    fontWeight: 700,
    marginTop: "0.2rem",
    fontFamily: "sans-serif",
  },
  sideCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  },
  cardBody: {
    color: C.textFaint,
    fontSize: "0.85rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  },
  issuesList: {
    display: "grid",
    gap: "0.55rem",
    marginTop: "0.3rem",
  },
  issueItem: {
    display: "flex",
    gap: "0.55rem",
    alignItems: "flex-start",
  },
  issueDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    marginTop: "0.35rem",
  },
  issueText: {
    fontSize: "0.79rem",
    color: C.textSoft,
    lineHeight: 1.5,
    fontFamily: "sans-serif",
  },
  steps: {
    display: "grid",
    gap: "0.65rem",
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
  },
  stepDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    border: "1px solid",
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
  },
  navCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
    display: "grid",
    gap: "0.55rem",
  },
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "0.65rem 1rem",
    background: C.gold,
    color: "var(--selen-ink)",
    border: "none",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s ease",
    boxSizing: "border-box",
  },
  btnGhost: {
    display: "block",
    width: "100%",
    padding: "0.65rem 1rem",
    background: "transparent",
    color: C.gold,
    border: `1px solid rgba(196,169,106,0.3)`,
    borderRadius: 6,
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease",
    boxSizing: "border-box",
  },
  navLink: {
    fontSize: "0.78rem",
    color: C.textFaint,
    textDecoration: "none",
    fontFamily: "sans-serif",
    padding: "0.25rem 0",
    textAlign: "center",
  },
  alert: {
    borderLeft: "3px solid",
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    borderRadius: "0 6px 6px 0",
    fontFamily: "sans-serif",
  },
  emptyState: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "4rem 2rem",
    textAlign: "center",
  },
  emptyOrnament: {
    fontSize: "1.5rem",
    color: "rgba(196,169,106,0.25)",
    marginBottom: "1.2rem",
  },
  emptyLabel: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: C.gold,
    marginBottom: "0.6rem",
    fontFamily: "sans-serif",
  },
  emptyTitle: {
    color: C.text,
    marginBottom: "0.5rem",
    fontSize: "1.1rem",
    fontFamily: "Georgia, serif",
  },
  emptyBody: {
    color: C.textFaint,
    lineHeight: 1.65,
    maxWidth: 420,
    margin: "0 auto 1rem",
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
  },
};

const css = `
  @keyframes selFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .sel-question-card:hover {
    border-color: rgba(196,169,106,0.3) !important;
  }

  .sel-answer:hover {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(196,169,106,0.08) !important;
    color: rgba(255,255,255,0.75) !important;
  }

  .sel-textarea:focus {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(255,255,255,0.05) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.07);
  }

  .sel-btn-primary:hover {
    background: #d4a843 !important;
  }

  .sel-btn-ghost:hover {
    background: rgba(196,169,106,0.09) !important;
    border-color: rgba(196,169,106,0.5) !important;
  }

  .sel-breadcrumb:hover {
    opacity: 1 !important;
  }

  .sel-nav-link:hover {
    color: rgba(196,169,106,0.7) !important;
  }

  .sel-spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(196,169,106,0.15);
    border-top-color: #c4a96a;
    animation: selSpin 0.75s linear infinite;
  }

  @keyframes selSpin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 900px) {
    .sel-layout {
      grid-template-columns: 1fr !important;
    }
  }
`;
