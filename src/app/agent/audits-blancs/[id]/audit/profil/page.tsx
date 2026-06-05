"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    label: "Type d’audit concerné",
    help: "Cette information permettra d’adapter le niveau d’exigence attendu pendant l’audit blanc.",
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
    label: "Catégories d’actions concernées",
    help: "Cochez toutes les catégories qui concernent l’organisme audité.",
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
    label: "L’organisme est-il nouvel entrant ?",
    help: "Un nouvel entrant n’a pas encore tout l’historique attendu, mais doit montrer ce qu’il a prévu de suivre.",
    type: "yes_no",
    required: true,
  },
  {
    key: "certification_training",
    label: "L’organisme propose-t-il des formations certifiantes ?",
    help: "Cela peut avoir un impact sur certains indicateurs liés aux certifications et résultats.",
    type: "yes_no",
  },
  {
    key: "alternance_training",
    label:
      "L’organisme réalise-t-il des formations en alternance / apprentissage ?",
    help: "Cela concerne notamment les obligations spécifiques liées aux CFA et à l’accompagnement des apprentis.",
    type: "yes_no",
  },
  {
    key: "short_training_only",
    label: "L’organisme propose-t-il uniquement des formations courtes ?",
    help: "Cette information permet de contextualiser certains attendus, notamment sur le suivi et l’accompagnement.",
    type: "yes_no",
  },
  {
    key: "subcontracting_or_portage",
    label: "L’organisme intervient-il en sous-traitance ou portage ?",
    help: "Cela peut avoir un impact sur les preuves attendues et les responsabilités Qualiopi.",
    type: "yes_no",
  },
];

function getInitialProfileValue(field: ProfileField) {
  if (field.type === "multi_choice") return [];
  return "";
}

function computeDefaultIndicators() {
  // V1 agent : on laisse tous les indicateurs accessibles.
  // Le profil est enregistré pour contextualiser l’audit blanc.
  return {
    applicable: Array.from({ length: 32 }, (_, index) => index + 1),
    excluded: [],
  };
}

function isAnswered(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== "" && value !== null && value !== undefined;
}

export default function AgentAuditProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const caseId = params.id;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

      setProfile(initialProfile);
      setLoading(false);
    }

    loadProfilePage();
  }, [caseId, router, supabase]);

  function updateProfile(key: string, value: unknown) {
    setProfile((prev) => ({
      ...prev,
      [key]: value,
    }));
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

  async function saveProfileAndGoNext() {
    if (!auditCase?.id) {
      setError("Dossier audit blanc introuvable. Impossible de continuer.");
      return;
    }

    setSaving(true);
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
      setSaving(false);
      return;
    }

    const { applicable, excluded } = computeDefaultIndicators();

    const cleanProfile: Record<string, unknown> = {};

    PROFILE_FIELDS.forEach((field) => {
      const value = profile[field.key];

      if (Array.isArray(value)) {
        cleanProfile[field.key] = value;
      } else if (value === undefined || value === null) {
        cleanProfile[field.key] = "";
      } else {
        cleanProfile[field.key] = value;
      }
    });

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
      setSaving(false);
      return;
    }

    setSaving(false);

    router.push(`/agent/audits-blancs/${auditCase.id}/audit/marques`);
  }

  const answeredCount = PROFILE_FIELDS.filter((field) =>
    isAnswered(profile[field.key]),
  ).length;

  const progress = Math.round((answeredCount / PROFILE_FIELDS.length) * 100);

  if (loading) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--ink-faint)" }}>
            Chargement du profil d’audit blanc…
          </p>
        </div>      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Audit blanc · profil</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Profil du client
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Avant de démarrer l’audit blanc, renseignez le contexte du client
              : type d’audit, catégories d’actions et particularités
              importantes.
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
                {answeredCount} / {PROFILE_FIELDS.length} informations
                renseignées · {progress} %
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
          <>
            <section style={{ display: "grid", gap: "0.9rem" }}>
              {PROFILE_FIELDS.map((field) => {
                const value = profile[field.key];

                return (
                  <article
                    key={field.key}
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--sepia-mid)",
                      padding: "1rem",
                    }}
                  >
                    <p className="gazette-label">
                      {field.required ? "Obligatoire" : "Contexte"}
                    </p>

                    <h2
                      style={{
                        color: "var(--ink)",
                        fontSize: "1rem",
                        marginBottom: "0.35rem",
                      }}
                    >
                      {field.label}
                    </h2>

                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.86rem",
                        lineHeight: 1.5,
                        marginBottom: "0.8rem",
                      }}
                    >
                      {field.help}
                    </p>

                    {field.type === "choice" && (
                      <select
                        value={String(value ?? "")}
                        onChange={(event) =>
                          updateProfile(field.key, event.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.65rem",
                          border: "1px solid var(--sepia-mid)",
                          background: "rgba(255,255,255,0.55)",
                          color: "var(--ink)",
                        }}
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
                          { label: "Je ne sais pas", value: "unknown" },
                        ].map((option) => {
                          const selected = value === option.value;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                updateProfile(field.key, option.value)
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
                    )}

                    {field.type === "multi_choice" && (
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
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
                    )}
                  </article>
                );
              })}
            </section>

            <div
              style={{
                marginTop: "1.5rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "0.8rem",
                flexWrap: "wrap",
              }}
            >
              <Link
                href={`/agent/audits-blancs/${auditCase.id}`}
                className="btn-ink"
              >
                <span>← Retour fiche dossier</span>
              </Link>

              <button
                type="button"
                className="btn-ink"
                onClick={saveProfileAndGoNext}
                disabled={saving}
                style={{
                  opacity: saving ? 0.55 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <span>
                  {saving
                    ? "Sauvegarde du profil…"
                    : "Continuer vers usage des marques →"}
                </span>
              </button>
            </div>
          </>
        )}
      </div>    </main>
  );
}
