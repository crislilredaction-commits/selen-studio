"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      "Le client affiche-t-il déjà un certificat Qualiopi alors qu’il est en audit initial ?",
    help: "En audit initial, l’organisme n’est pas encore certifié. Il ne doit donc pas afficher un certificat Qualiopi comme s’il était déjà obtenu.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "uses_qualiopi_logo_before_certification",
    question:
      "Le client utilise-t-il déjà le logo Qualiopi dans sa communication ?",
    help: "Le logo Qualiopi ne doit pas être utilisé avant obtention effective de la certification.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "claims_qualiopi_certified_before_certification",
    question:
      "Le client indique-t-il qu’il est certifié Qualiopi alors que l’audit initial n’a pas encore abouti ?",
    help: "Attention aux mentions du type “certifié Qualiopi”, “organisme certifié” ou équivalent avant obtention réelle du certificat.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "mentions_cofrac_or_certifier_misleading",
    question:
      "Le client mentionne-t-il le Cofrac ou un certificateur d’une manière pouvant laisser croire qu’il est déjà certifié ?",
    help: "Le Cofrac accrédite les certificateurs, pas directement l’organisme de formation. Toute mention doit éviter de créer une confusion.",
    expectedAnswer: "no",
    severity: "major",
  },
  {
    key: "uses_pending_audit_as_certification",
    question:
      "Le client présente-t-il une démarche en cours comme une certification déjà acquise ?",
    help: "Il peut préparer une certification, mais ne doit pas transformer une démarche en cours en argument commercial trompeur.",
    expectedAnswer: "no",
    severity: "major",
  },
];

const CERTIFIED_BRAND_QUESTIONS: BrandQuestion[] = [
  {
    key: "has_qualiopi_certificate",
    question: "Le client dispose-t-il bien de son certificat Qualiopi ?",
    help: "Pour un audit de surveillance ou de renouvellement, le certificat doit être disponible et cohérent.",
    expectedAnswer: "yes",
    severity: "major",
  },
  {
    key: "certificate_is_current",
    question: "Le certificat présenté est-il en cours de validité ?",
    help: "Vérifiez la date de validité, l’organisme certificateur et le périmètre certifié.",
    expectedAnswer: "yes",
    severity: "major",
  },
  {
    key: "certificate_scope_matches_activity",
    question:
      "Le périmètre affiché sur le certificat correspond-il bien aux activités réalisées ?",
    help: "Les catégories d’actions certifiées doivent correspondre à ce que l’organisme communique et vend.",
    expectedAnswer: "yes",
    severity: "major",
  },
  {
    key: "certificate_on_website",
    question:
      "Le certificat Qualiopi est-il diffusé sur le site internet du client ?",
    help: "La diffusion sur le site est une bonne pratique. Si ce n’est pas le cas, vérifiez s’il est transmis autrement.",
    expectedAnswer: "yes",
    severity: "minor",
  },
  {
    key: "certificate_by_email_or_social",
    question:
      "Si le certificat n’est pas sur le site, est-il communiqué par un autre moyen ?",
    help: "Exemples : email, devis, plaquette, réseau social professionnel, espace client.",
    expectedAnswer: "yes",
    severity: "minor",
    condition: (answers) => answers.certificate_on_website === "no",
  },
  {
    key: "certificate_diffusion_proof",
    question:
      "Le client peut-il prouver la diffusion ou la transmission de son certificat ?",
    help: "Capture du site, lien public, modèle d’email, plaquette, preuve de remise ou autre trace exploitable.",
    expectedAnswer: "yes",
    severity: "minor",
  },
  {
    key: "uses_qualiopi_logo",
    question: "Le client utilise-t-il le logo Qualiopi ?",
    help: "L’utilisation du logo n’est pas obligatoire. Cette question sert uniquement à afficher les contrôles associés.",
    expectedAnswer: "no",
    severity: "minor",
    skipConformityCheck: true,
  },
  {
    key: "logo_is_official",
    question: "Le logo utilisé est-il le logo officiel Qualiopi ?",
    help: "Il ne doit pas s’agir d’un logo recomposé, déformé ou repris depuis une source douteuse.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
  {
    key: "logo_not_modified",
    question: "Le logo n’a-t-il pas été modifié, déformé ou recoloré ?",
    help: "Le logo Qualiopi doit respecter la charte d’usage applicable.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
  {
    key: "logo_use_not_misleading",
    question:
      "L’usage du logo ne laisse-t-il pas croire que toutes les activités sont certifiées si ce n’est pas le cas ?",
    help: "Attention aux organismes ayant plusieurs activités ou plusieurs catégories d’actions.",
    expectedAnswer: "yes",
    severity: "major",
    condition: (answers) => answers.uses_qualiopi_logo === "yes",
  },
  {
    key: "logo_not_on_training_certificate",
    question:
      "Le logo n’est-il pas utilisé sur des attestations ou certificats remis aux bénéficiaires de manière trompeuse ?",
    help: "Le logo certifie l’organisme ou les catégories d’actions, pas la réussite individuelle du bénéficiaire.",
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

function diagnosticLabel(diagnostic: Diagnostic) {
  if (diagnostic === "conforme") return "✅ Usage des marques conforme";
  if (diagnostic === "mineure") return "⚠️ Point de vigilance mineur";
  if (diagnostic === "majeure") return "🚨 Risque de non-conformité majeure";
  return "… À vérifier";
}

function diagnosticColor(diagnostic: Diagnostic) {
  if (diagnostic === "conforme") return "#6a8a4a";
  if (diagnostic === "mineure") return "var(--ocre-gold)";
  if (diagnostic === "majeure") return "var(--rust)";
  return "var(--ink-faint)";
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

export default function AgentAuditMarquesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const caseId = params.id;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

      setAnswers(initialAnswers);
      setNotes(caseData.brand_usage_notes ?? "");
      setLoading(false);
    }

    loadMarquesPage();
  }, [caseId, router, supabase]);

  function updateAnswer(key: string, value: BrandAnswer) {
    setAnswers((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveMarquesAndGoNext() {
    if (!auditCase) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("audit_blanc_cases")
      .update({
        brand_usage_answers: answers,
        brand_usage_notes: notes,
        brand_usage_diagnostic: diagnostic,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess("Usage des marques sauvegardé.");
    setSaving(false);

    router.push(`/agent/audits-blancs/${auditCase.id}/audit/1`);
  }

  async function saveOnly() {
    if (!auditCase) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("audit_blanc_cases")
      .update({
        brand_usage_answers: answers,
        brand_usage_notes: notes,
        brand_usage_diagnostic: diagnostic,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess("Usage des marques sauvegardé.");
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--ink-faint)" }}>
            Chargement de l’usage des marques…
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
            <p className="gazette-label">Audit blanc · marques Qualiopi</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Usage des marques
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Vérifiez la diffusion du certificat Qualiopi et l’usage éventuel
              du logo avant de commencer les indicateurs.
            </p>

            {auditCase && (
              <p
                style={{
                  color: "rgba(240,220,190,0.75)",
                  fontSize: "0.9rem",
                  marginTop: "0.8rem",
                }}
              >
                Client : {auditCase.client_email} ·{" "}
                {formatAuditType(auditCase.profile_data)} · Catégories :{" "}
                {formatCategories(auditCase.profile_data)}
              </p>
            )}

            <div style={{ marginTop: "1.2rem" }}>
              <div
                style={{
                  height: "6px",
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(178,138,98,0.2)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background:
                      "linear-gradient(90deg, var(--ocre-dark), var(--ocre-gold))",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>

              <p
                style={{
                  marginTop: "0.4rem",
                  color: "rgba(240,220,190,0.72)",
                  fontSize: "0.82rem",
                }}
              >
                {answeredCount} / {visibleQuestions.length} réponses ·{" "}
                {progress} %
              </p>
            </div>
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

            <Link href="/agent/audits-blancs" className="btn-ink">
              <span>Retour aux dossiers</span>
            </Link>
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
            <section style={{ display: "grid", gap: "0.9rem" }}>
              {visibleQuestions.map((question) => {
                const value = answers[question.key] ?? "";

                return (
                  <article
                    key={question.key}
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--sepia-mid)",
                      padding: "1rem",
                    }}
                  >
                    <p className="gazette-label">
                      {question.severity === "major"
                        ? "Point sensible"
                        : "Point de contrôle"}
                    </p>

                    <h2
                      style={{
                        color: "var(--ink)",
                        fontSize: "1rem",
                        marginBottom: "0.35rem",
                      }}
                    >
                      {question.question}
                    </h2>

                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.86rem",
                        lineHeight: 1.5,
                        marginBottom: "0.8rem",
                      }}
                    >
                      {question.help}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        { label: "Oui", value: "yes" },
                        { label: "Non", value: "no" },
                      ].map((option) => {
                        const selected = value === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              updateAnswer(
                                question.key,
                                option.value as BrandAnswer,
                              )
                            }
                            style={{
                              padding: "0.45rem 0.9rem",
                              border: "1px solid var(--sepia-mid)",
                              background: selected
                                ? "var(--ocre-gold)"
                                : "transparent",
                              color: selected ? "#1a1410" : "var(--ink-soft)",
                              cursor: "pointer",
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">Notes agent</p>

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  onBlur={saveOnly}
                  placeholder="Notes sur l’usage des marques, preuves observées, corrections à demander..."
                  style={{
                    width: "100%",
                    minHeight: "130px",
                    padding: "0.7rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.55)",
                    resize: "vertical",
                  }}
                />
              </article>
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
                <p className="gazette-label">Diagnostic marques</p>

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
                    {issues.map((issue, index) => (
                      <p key={index}>
                        {issue.severity === "major" ? "🚨" : "⚠️"}{" "}
                        {issue.question}
                      </p>
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

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-ink"
                  onClick={saveMarquesAndGoNext}
                  disabled={saving}
                  style={{
                    opacity: saving ? 0.55 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span>
                    {saving ? "Sauvegarde…" : "Continuer vers indicateur 1 →"}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn-ink"
                  onClick={saveOnly}
                  disabled={saving}
                  style={{
                    opacity: saving ? 0.55 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span>Sauvegarder</span>
                </button>

                <Link
                  href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
                  className="btn-ink"
                >
                  <span>← Retour profil</span>
                </Link>

                <Link
                  href={`/agent/audits-blancs/${auditCase.id}`}
                  className="btn-ink"
                >
                  <span>Retour fiche dossier</span>
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>    </main>
  );
}
