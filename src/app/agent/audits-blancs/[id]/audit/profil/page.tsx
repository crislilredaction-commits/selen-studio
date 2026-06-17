"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuditGrimoire from "@/components/agent/AuditGrimoire";

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
  applicable_indicators: number[] | null;
  excluded_indicators: number[] | null;
};

const REVIEW_INDICATOR_NUMBERS = Array.from(
  { length: 32 },
  (_, index) => index + 1,
);
const REVIEW_CERTIFICATION_INDICATORS = [3, 7, 16];
const REVIEW_CFA_ALTERNANCE_INDICATORS = [13, 14, 15, 20, 28, 29];
const REVIEW_SUBCONTRACTING_INDICATORS = [27];
const REVIEW_LONG_TRAINING_INDICATORS = [12];

type ProfileField =
  | {
      key: string;
      label: string;
      help: string;
      type: "choice";
      options: { label: string; value: string }[];
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      help: string;
      type: "yes_no";
      required?: boolean;
    }
  | {
      key: string;
      label: string;
      help: string;
      type: "multi_choice";
      options: { label: string; value: string }[];
      required?: boolean;
    };

const PROFILE_FIELDS: ProfileField[] = [
  {
    key: "audit_type",
    label: "Type d’audit blanc à simuler",
    help: "Permet de contextualiser le niveau d’exigence attendu pendant la Review.",
    type: "choice",
    required: true,
    options: [
      { label: "Audit initial", value: "initial" },
      { label: "Audit de surveillance", value: "surveillance" },
      { label: "Audit de renouvellement", value: "renouvellement" },
      { label: "Je ne sais pas", value: "unknown" },
    ],
  },
  {
    key: "action_categories",
    label: "Activités couvertes par l’audit",
    help: "Sélectionnez toutes les activités réellement concernées par la Review.",
    type: "multi_choice",
    required: true,
    options: [
      { label: "Actions de formation", value: "AF" },
      { label: "Bilans de compétences", value: "BC" },
      { label: "VAE", value: "VAE" },
      { label: "CFA / apprentissage", value: "CFA" },
    ],
  },
  {
    key: "is_new_entrant",
    label: "L’organisme est-il nouvel entrant Qualiopi ?",
    help: "Oui si l’organisme a moins d’un an d’activité en tant qu’organisme de formation et n’a pas encore déclaré de BPF.",
    type: "yes_no",
    required: true,
  },
  {
    key: "certification_training",
    label: "Des formations RNCP ou RS sont-elles auditées ?",
    help: "Oui uniquement si la Review porte sur des formations rattachées à une certification RNCP ou RS. Les habilitations, SST, PSC, habilitations électriques ou simples attestations ne sont pas à cocher ici.",
    type: "yes_no",
  },
  {
    key: "alternance_training",
    label:
      "La Review concerne-t-elle de l’apprentissage ou de l’alternance ?",
    help: "Oui si l’organisme réalise des parcours en apprentissage ou en alternance, avec obligations spécifiques liées aux apprentis, au CFA ou au suivi en entreprise.",
    type: "yes_no",
  },
  {
    key: "short_training_only",
    label: "La Review porte-t-elle uniquement sur des formations courtes ?",
    help: "À cocher uniquement si toutes les prestations concernées par la Review durent moins de 14 heures.",
    type: "yes_no",
  },
  {
    key: "subcontracting_or_portage",
    label: "L’organisme est-il concerné par la sous-traitance ou le portage ?",
    help: "Oui si l’organisme intervient lui-même en sous-traitance/portage ou s’il fait appel à des sous-traitants. À distinguer ensuite dans l’analyse, car les impacts ne sont pas les mêmes.",
    type: "yes_no",
  },
];

function getInitialProfileValue(field: ProfileField) {
  if (field.type === "multi_choice") return [];
  return "";
}

function isAnswered(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== "" && value !== null && value !== undefined && value !== "unknown";
}

function normalizeBooleanLike(value: unknown) {
  const normalizedValue =
    typeof value === "string" ? value.trim().toLowerCase() : value;

  if (
    normalizedValue === true ||
    normalizedValue === "true" ||
    normalizedValue === "yes"
  )
    return true;
  if (
    normalizedValue === false ||
    normalizedValue === "false" ||
    normalizedValue === "no"
  )
    return false;
  return value;
}

function profileValueIsYes(value: unknown) {
  return normalizeBooleanLike(value) === true;
}

function computeReviewIndicatorScope(profileData: Record<string, unknown>) {
  const categories = Array.isArray(profileData.action_categories)
    ? profileData.action_categories.map(String)
    : [];
  const hasCfaCategory = categories.includes("CFA");
  const hasVaeCategory = categories.includes("VAE");
  const hasAlternance = profileValueIsYes(profileData.alternance_training);
  const hasCertification =
    profileValueIsYes(profileData.certification_training) ||
    hasCfaCategory ||
    hasVaeCategory ||
    hasAlternance;
  const hasCfaOrAlternance = hasCfaCategory || hasAlternance;
  const hasSubcontracting = profileValueIsYes(
    profileData.subcontracting_or_portage,
  );
  const shortTrainingOnly = profileValueIsYes(profileData.short_training_only);

  const excluded = new Set<number>();

  if (!hasCfaOrAlternance) {
    REVIEW_CFA_ALTERNANCE_INDICATORS.forEach((indicator) =>
      excluded.add(indicator),
    );
  }

  if (!hasCertification) {
    REVIEW_CERTIFICATION_INDICATORS.forEach((indicator) =>
      excluded.add(indicator),
    );
  }

  if (!hasSubcontracting) {
    REVIEW_SUBCONTRACTING_INDICATORS.forEach((indicator) =>
      excluded.add(indicator),
    );
  }

  if (shortTrainingOnly) {
    REVIEW_LONG_TRAINING_INDICATORS.forEach((indicator) =>
      excluded.add(indicator),
    );
  }

  const applicable = REVIEW_INDICATOR_NUMBERS.filter(
    (indicator) => !excluded.has(indicator),
  );

  return {
    applicable,
    excluded: REVIEW_INDICATOR_NUMBERS.filter((indicator) =>
      excluded.has(indicator),
    ),
  };
}

function formatProfileValue(field: ProfileField, value: unknown) {
  if (!isAnswered(value)) return "Non renseigné";

  if (field.type === "multi_choice" && Array.isArray(value)) {
    return value
      .map(
        (item) =>
          field.options.find((option) => option.value === item)?.label ?? item,
      )
      .join(", ");
  }

  if (field.type === "choice") {
    return (
      field.options.find((option) => option.value === value)?.label ??
      String(value)
    );
  }

  if (field.type === "yes_no") {
    if (value === "yes") return "Oui";
    if (value === "no") return "Non";
    if (value === "unknown") return "Je ne sais pas";
  }

  return String(value);
}

function optionLabel(value: string) {
  if (value === "yes") return "Oui";
  if (value === "no") return "Non";
  if (value === "unknown") return "Je ne sais pas";
  return value;
}

export default function AgentAuditProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const caseId = params.id;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const skipNextAutoSaveRef = useRef(true);

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [auditCase, setAuditCase] = useState<AuditBlancCase | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown>>({});

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadProfilePage() {
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
          "id, client_email, status, offer, profile_data, applicable_indicators, excluded_indicators",
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

      const existingProfile =
        (caseData.profile_data as Record<string, unknown> | null) ?? {};

      const initialProfile: Record<string, unknown> = {};

      PROFILE_FIELDS.forEach((field) => {
        initialProfile[field.key] =
          existingProfile[field.key] ?? getInitialProfileValue(field);
      });

      skipNextAutoSaveRef.current = true;
      setProfile(initialProfile);
      setProfileLoaded(true);
      setSaveStatus("saved");
      setLoading(false);
    }

    loadProfilePage();
  }, [caseId, router, supabase]);

  useEffect(() => {
    if (!profileLoaded || !auditCase?.id) return;

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    setSaveStatus("idle");

    const timeout = window.setTimeout(() => {
      void saveProfileDraft(profile);
    }, 800);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileLoaded, auditCase?.id]);

  function updateProfile(key: string, value: unknown) {
    setProfile((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function buildCleanProfile(profileToClean: Record<string, unknown>) {
    const cleanProfile: Record<string, unknown> = {};

    PROFILE_FIELDS.forEach((field) => {
      const value = profileToClean[field.key];

      if (Array.isArray(value)) {
        cleanProfile[field.key] = value;
      } else if (value === undefined || value === null) {
        cleanProfile[field.key] = "";
      } else {
        cleanProfile[field.key] = value;
      }
    });

    return cleanProfile;
  }

  function toggleMultiChoice(key: string, option: string) {
    const current = Array.isArray(profile[key])
      ? (profile[key] as string[])
      : [];

    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];

    updateProfile(key, next);
  }

  async function saveProfileDraft(profileToSave = profile) {
    if (!auditCase?.id) {
      return false;
    }

    setSaving(true);
    setSaveStatus("saving");
    setError("");
    setSuccess("");

    const cleanProfile = buildCleanProfile(profileToSave);
    const missingRequired = PROFILE_FIELDS.filter((field) => {
      if (!field.required) return false;
      return !isAnswered(cleanProfile[field.key]);
    });

    let applicable: number[] = [];
    let excluded: number[] = [];

    if (missingRequired.length === 0) {
      const indicatorScope = computeReviewIndicatorScope(cleanProfile);
      applicable = indicatorScope.applicable;
      excluded = indicatorScope.excluded;
    }

    const { error: updateError } = await supabase
      .from("audit_blanc_cases")
      .update({
        profile_data: cleanProfile,
        applicable_indicators: applicable,
        excluded_indicators: excluded,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (updateError) {
      console.error("Erreur sauvegarde profil audit blanc :", updateError);
      setError(`Erreur sauvegarde profil : ${updateError.message}`);
      setSaveStatus("error");
      setSaving(false);
      return false;
    }

    setSaveStatus("saved");
    setSaving(false);
    return true;
  }

  async function saveProfileAndGoNext() {
    if (!auditCase?.id) {
      setError("Dossier audit blanc introuvable. Impossible de continuer.");
      return;
    }

    setError("");
    setSuccess("");

    const missingRequired = PROFILE_FIELDS.filter((field) => {
      if (!field.required) return false;
      return !isAnswered(profile[field.key]);
    });

    if (missingRequired.length > 0) {
      setError(
        `Veuillez compléter les champs obligatoires avant de continuer (${missingRequired.length} manquant${
          missingRequired.length > 1 ? "s" : ""
        }).`,
      );
      return;
    }

    const saved = await saveProfileDraft(profile);

    if (!saved) {
      return;
    }

    router.push(`/agent/audits-blancs/${auditCase.id}/audit/marques`);
  }

  const answeredCount = PROFILE_FIELDS.filter((field) =>
    isAnswered(profile[field.key]),
  ).length;

  const progress = Math.round((answeredCount / PROFILE_FIELDS.length) * 100);

  if (loading) {
    return (
      <div style={s.page}>
        <style>{css}</style>

        <div style={s.loadingWrap}>
          <div className="sel-spinner" />
          <p style={s.loadingText}>Chargement du profil d’audit blanc…</p>
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
            <span style={s.breadcrumbCurrent}>Profil audité</span>
          </div>

          <div style={s.headerBody}>
            <div style={s.headerLeft}>
              <p style={s.eyebrow}>Selen Studio · Audit blanc</p>

              <h1 style={s.title}>Profil du client</h1>

              <p style={s.subtitle}>
                Renseignez le contexte de l’organisme pour adapter la lecture du
                référentiel et préparer l’audit blanc dans de bonnes conditions.
              </p>

              {auditCase && (
                <p style={s.clientLine}>
                  <span style={s.clientDot} />
                  {auditCase.client_email}
                </p>
              )}
            </div>

            <div style={s.progressCard}>
              <p style={s.progressLabel}>Profil complété</p>
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
                {answeredCount} / {PROFILE_FIELDS.length} informations
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
            <section style={s.fieldsList}>
              {PROFILE_FIELDS.map((field, index) => {
                const value = profile[field.key];
                const completed = isAnswered(value);

                return (
                  <article
                    key={field.key}
                    style={{
                      ...s.fieldCard,
                      animationDelay: `${index * 35}ms`,
                      borderColor: completed
                        ? "rgba(126,201,126,0.24)"
                        : C.border,
                    }}
                    className="sel-field-card"
                  >
                    <div style={s.fieldTop}>
                      <div>
                        <p style={s.cardLabel}>
                          {field.required ? "Obligatoire" : "Contexte"}
                        </p>

                        <h2 style={s.fieldTitle}>{field.label}</h2>
                      </div>

                      <span
                        style={{
                          ...s.fieldState,
                          color: completed ? "#7ec97e" : C.textFaint,
                          borderColor: completed
                            ? "rgba(126,201,126,0.32)"
                            : C.border,
                          background: completed
                            ? "rgba(126,201,126,0.08)"
                            : "rgba(255,255,255,0.03)",
                        }}
                      >
                        {completed ? "Renseigné" : "À compléter"}
                      </span>
                    </div>

                    <p style={s.helpText}>{field.help}</p>

                    {field.type === "choice" && (
                      <select
                        value={String(value ?? "")}
                        onChange={(event) =>
                          updateProfile(field.key, event.target.value)
                        }
                        style={s.selectInput}
                        className="sel-input"
                      >
                        <option value="">Sélectionner</option>

                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type === "yes_no" && (
                      <div style={s.optionRow}>
                        {["yes", "no", "unknown"].map((optionValue) => {
                          const selected = value === optionValue;

                          return (
                            <button
                              key={optionValue}
                              type="button"
                              onClick={() =>
                                updateProfile(field.key, optionValue)
                              }
                              style={{
                                ...s.optionButton,
                                background: selected
                                  ? C.gold
                                  : "rgba(255,255,255,0.03)",
                                borderColor: selected
                                  ? C.gold
                                  : "rgba(196,169,106,0.18)",
                                color: selected ? "var(--selen-ink)" : C.textSoft,
                                fontWeight: selected ? 700 : 400,
                              }}
                              className={selected ? "" : "sel-option"}
                            >
                              {optionLabel(optionValue)}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {field.type === "multi_choice" && (
                      <div style={s.optionRow}>
                        {field.options.map((option) => {
                          const selected =
                            Array.isArray(value) &&
                            value.includes(option.value);

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                toggleMultiChoice(field.key, option.value)
                              }
                              style={{
                                ...s.optionButton,
                                background: selected
                                  ? C.gold
                                  : "rgba(255,255,255,0.03)",
                                borderColor: selected
                                  ? C.gold
                                  : "rgba(196,169,106,0.18)",
                                color: selected ? "var(--selen-ink)" : C.textSoft,
                                fontWeight: selected ? 700 : 400,
                              }}
                              className={selected ? "" : "sel-option"}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            <aside style={s.sidebar}>
              <div style={s.sideCard}>
                <p style={s.cardLabel}>Résumé du profil</p>

                <div style={s.summaryList}>
                  {PROFILE_FIELDS.map((field) => (
                    <div key={field.key} style={s.summaryItem}>
                      <span style={s.summaryLabel}>{field.label}</span>
                      <span
                        style={{
                          ...s.summaryValue,
                          color: isAnswered(profile[field.key])
                            ? C.textSoft
                            : C.textFaint,
                        }}
                      >
                        {formatProfileValue(field, profile[field.key])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={s.sideCard}>
                <p style={s.cardLabel}>Parcours audit blanc</p>

                <div style={s.steps}>
                  <StepItem active done label="1. Profil audité" />
                  <StepItem label="2. Usage des marques" />
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

                <Link
                  href={`/agent/audits-blancs/${auditCase.id}`}
                  style={s.btnGhost}
                  className="sel-btn-ghost"
                >
                  ← Retour fiche dossier
                </Link>

                <button
                  type="button"
                  onClick={saveProfileAndGoNext}
                  disabled={saving}
                  style={{
                    ...s.btnPrimary,
                    opacity: saving ? 0.55 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                  className="sel-btn-primary"
                >
                  {saving ? "Sauvegarde…" : "Continuer vers les marques →"}
                </button>
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
    maxWidth: 680,
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
  fieldsList: {
    display: "grid",
    gap: "0.85rem",
  },
  fieldCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem",
    animation: "selFadeIn 0.25s ease both",
  },
  fieldTop: {
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
  fieldTitle: {
    color: C.text,
    fontSize: "1rem",
    lineHeight: 1.35,
    margin: 0,
    fontFamily: "Georgia, serif",
  },
  fieldState: {
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
    marginBottom: "0.9rem",
    fontFamily: "sans-serif",
  },
  selectInput: {
    width: "100%",
    padding: "0.7rem",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    borderRadius: 6,
    outline: "none",
    fontFamily: "sans-serif",
    fontSize: "0.85rem",
  },
  optionRow: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap",
  },
  optionButton: {
    padding: "0.45rem 0.85rem",
    border: "1px solid",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontFamily: "sans-serif",
    transition: "all 0.15s ease",
  },
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "0.85rem",
  },
  sideCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  },
  summaryList: {
    display: "grid",
    gap: "0.75rem",
  },
  summaryItem: {
    display: "grid",
    gap: "0.25rem",
    paddingBottom: "0.75rem",
    borderBottom: `1px solid ${C.border}`,
  },
  summaryLabel: {
    color: C.textFaint,
    fontSize: "0.72rem",
    fontFamily: "sans-serif",
  },
  summaryValue: {
    fontSize: "0.82rem",
    lineHeight: 1.35,
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

  .sel-field-card:hover {
    border-color: rgba(196,169,106,0.3) !important;
  }

  .sel-input:focus {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(255,255,255,0.06) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.07);
  }

  .sel-option:hover {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(196,169,106,0.08) !important;
    color: rgba(255,255,255,0.75) !important;
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
