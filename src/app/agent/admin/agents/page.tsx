"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AgentRole = "agent" | "admin";

type AgentProfile = {
  id: string;
  user_id: string | null;
  email: string;
  role: AgentRole;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
  billing_email: string | null;
};

function getAgentDisplayName(agent: AgentProfile) {
  return (
    [agent.first_name, agent.last_name].filter(Boolean).join(" ").trim() ||
    agent.email
  );
}

export default function AgentAdminAgentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentAgent, setCurrentAgent] = useState<AgentProfile | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgentRole>("agent");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadPage() {
    setLoading(true);
    setError("");
    setSuccess("");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user?.email) {
      router.replace("/login");
      return;
    }

    const userEmail = authData.user.email.toLowerCase();

    const { data: profileData, error: profileError } = await supabase
      .from("agent_profiles")
      .select(
        "id, user_id, email, role, is_active, created_at, updated_at, first_name, last_name, phone, company_name, billing_email",
      )
      .eq("email", userEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      setError(`Impossible de vérifier votre accès : ${profileError.message}`);
      setLoading(false);
      return;
    }

    if (!profileData || profileData.role !== "admin") {
      setError("Cette page est réservée aux administrateurs Studio.");
      setLoading(false);
      return;
    }

    setCurrentAgent(profileData as AgentProfile);

    const { data: agentData, error: agentError } = await supabase
      .from("agent_profiles")
      .select(
        "id, user_id, email, role, is_active, created_at, updated_at, first_name, last_name, phone, company_name, billing_email",
      )
      .order("email", { ascending: true });

    if (agentError) {
      setError(`Impossible de charger les agents : ${agentError.message}`);
      setLoading(false);
      return;
    }

    setAgents((agentData ?? []) as AgentProfile[]);
    setLoading(false);
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function inviteAgent() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Renseignez une adresse email valide.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session?.access_token) {
      setError("Session admin introuvable. Reconnectez-vous.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/agents/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        email: cleanEmail,
        role,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? "Impossible de créer l’accès agent.");
      setSaving(false);
      return;
    }

    setSuccess(result.message ?? "Invitation envoyée.");
    setEmail("");
    setRole("agent");
    setSaving(false);

    await loadPage();
  }

  if (loading) {
    return (
      <div style={s.page}>
        <style>{css}</style>

        <div style={s.loadingWrap}>
          <div className="sel-spinner" />
          <p style={s.loadingText}>Chargement des accès agents…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{css}</style>

      <div style={s.container}>
        <header style={s.header}>
          <div style={s.breadcrumb}>
            <Link href="/agent" style={s.breadcrumbLink} className="sel-link">
              Studio
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <span style={s.breadcrumbCurrent}>Accès agents</span>
          </div>

          <p style={s.eyebrow}>Selen Studio · Administration</p>

          <h1 style={s.title}>Créer un accès agent</h1>

          <p style={s.subtitle}>
            Invitez un agent ou un administrateur à rejoindre Studio. L’accès
            sera créé dans Supabase Auth et dans la table agent_profiles.
          </p>

          {currentAgent && (
            <p style={s.agentLine}>
              <span style={s.onlineDot} />
              Connecté comme {currentAgent.email} · rôle : {currentAgent.role}
            </p>
          )}
        </header>

        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {!currentAgent || currentAgent.role !== "admin" ? (
          <section style={s.card}>
            <p style={s.cardLabel}>Accès refusé</p>
            <p style={s.cardBody}>
              Cette page est réservée aux administrateurs Studio.
            </p>

            <Link
              href="/agent"
              style={s.btnPrimary}
              className="sel-btn-primary"
            >
              Retour Studio
            </Link>
          </section>
        ) : (
          <div style={s.layout} className="sel-layout">
            <section style={s.mainColumn}>
              <article style={s.card}>
                <p style={s.cardLabel}>Nouvel accès</p>

                <h2 style={s.sectionTitle}>Inviter un agent</h2>

                <p style={s.cardBody}>
                  L’agent recevra un email d’invitation. Une fois son compte
                  activé, il pourra accéder à Studio selon son rôle.
                </p>

                <div style={s.formGrid}>
                  <label style={s.fieldLabel}>
                    Email de l’agent
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="agent@email.fr"
                      style={s.input}
                      className="sel-input"
                    />
                  </label>

                  <label style={s.fieldLabel}>
                    Rôle
                    <select
                      value={role}
                      onChange={(event) =>
                        setRole(event.target.value as AgentRole)
                      }
                      style={s.input}
                      className="sel-input"
                    >
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={inviteAgent}
                  disabled={saving}
                  style={{
                    ...s.btnPrimary,
                    marginTop: "1rem",
                    opacity: saving ? 0.55 : 1,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                  className="sel-btn-primary"
                >
                  {saving ? "Invitation en cours…" : "Envoyer l’invitation"}
                </button>
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Agents Studio</p>

                <h2 style={s.sectionTitle}>Accès existants</h2>

                {agents.length === 0 ? (
                  <p style={s.emptyInline}>Aucun agent enregistré.</p>
                ) : (
                  <div style={s.agentList}>
                    {agents.map((agent) => {
                      const displayName = getAgentDisplayName(agent);

                      return (
                        <div key={agent.id} style={s.agentRow}>
                          <div>
                            <p style={s.agentEmail}>{displayName}</p>

                            <p style={s.mutedSmall}>
                              {agent.email} · rôle : {agent.role} ·{" "}
                              {agent.is_active ? "actif" : "désactivé"}
                            </p>

                            {(agent.company_name ||
                              agent.billing_email ||
                              agent.phone) && (
                              <p style={s.mutedSmall}>
                                {agent.company_name
                                  ? `${agent.company_name} · `
                                  : ""}
                                {agent.billing_email
                                  ? `Facturation : ${agent.billing_email} · `
                                  : ""}
                                {agent.phone ?? ""}
                              </p>
                            )}
                          </div>

                          <div style={s.agentActions}>
                            <span
                              style={{
                                ...s.badge,
                                color:
                                  agent.role === "admin"
                                    ? "#d4a843"
                                    : "#7ec97e",
                                borderColor:
                                  agent.role === "admin"
                                    ? "rgba(212,168,67,0.35)"
                                    : "rgba(126,201,126,0.35)",
                              }}
                            >
                              {agent.role}
                            </span>

                            <Link
                              href={`/agent/admin/agents/${agent.id}`}
                              style={s.smallActionLink}
                              className="sel-btn-ghost"
                            >
                              Gérer
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>

            <aside style={s.sidebar}>
              <article style={s.sideCard}>
                <p style={s.cardLabel}>À retenir</p>

                <p style={s.cardBody}>
                  Le rôle <strong>agent</strong> donne accès aux outils métier.
                  Le rôle <strong>admin</strong> donne accès aux réglages et à
                  la gestion des agents.
                </p>
              </article>

              <article style={s.sideCard}>
                <p style={s.cardLabel}>Actions rapides</p>

                <div style={s.sideActions}>
                  <Link
                    href="/agent"
                    style={s.btnGhost}
                    className="sel-btn-ghost"
                  >
                    Retour Studio
                  </Link>

                  <Link
                    href="/agent/audits-blancs"
                    style={s.btnPrimary}
                    className="sel-btn-primary"
                  >
                    Voir les audits blancs
                  </Link>

                  <button
                    type="button"
                    onClick={loadPage}
                    style={s.btnGhost}
                    className="sel-btn-ghost"
                  >
                    Rafraîchir
                  </button>
                </div>
              </article>
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

const C = {
  bg: "#1a1510",
  surface: "#221c14",
  border: "rgba(196,169,106,0.15)",
  borderStrong: "rgba(196,169,106,0.28)",
  gold: "#c4a96a",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.25)",
};

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  container: {
    maxWidth: 1180,
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
  eyebrow: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: C.gold,
    marginBottom: "0.5rem",
    fontFamily: "sans-serif",
  },
  title: {
    fontSize: "clamp(1.8rem, 3.4vw, 2.7rem)",
    fontWeight: 700,
    color: C.text,
    lineHeight: 1.1,
    margin: "0 0 0.7rem",
    fontFamily: "Georgia, serif",
  },
  subtitle: {
    color: C.textSoft,
    lineHeight: 1.65,
    maxWidth: 760,
    fontSize: "0.92rem",
    margin: "0 0 0.8rem",
    fontFamily: "sans-serif",
  },
  agentLine: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.82rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7ec97e",
    boxShadow: "0 0 0 2.5px rgba(126,201,126,0.2)",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 300px",
    gap: "1.25rem",
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: "1rem",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem",
  },
  sideCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  },
  cardLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.6rem",
    fontFamily: "sans-serif",
  },
  sectionTitle: {
    color: C.text,
    fontSize: "1.12rem",
    margin: "0 0 0.5rem",
    fontFamily: "Georgia, serif",
  },
  cardBody: {
    color: C.textFaint,
    fontSize: "0.85rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 180px",
    gap: "0.8rem",
    marginTop: "1rem",
  },
  fieldLabel: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontSize: "0.8rem",
    fontFamily: "sans-serif",
  },
  input: {
    width: "100%",
    padding: "0.65rem",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    borderRadius: 6,
    outline: "none",
    fontFamily: "sans-serif",
    boxSizing: "border-box",
  },
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "0.65rem 1rem",
    background: C.gold,
    color: "#1a1510",
    border: "none",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
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
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "0.85rem",
  },
  sideActions: {
    display: "grid",
    gap: "0.55rem",
  },
  agentList: {
    display: "grid",
    gap: "0.65rem",
    marginTop: "1rem",
  },
  agentRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "0.8rem",
    alignItems: "center",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "0.75rem",
    background: "rgba(255,255,255,0.025)",
  },
  agentActions: {
    display: "grid",
    gap: "0.45rem",
    justifyItems: "end",
  },
  smallActionLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.35rem 0.65rem",
    background: "transparent",
    color: C.gold,
    border: `1px solid rgba(196,169,106,0.3)`,
    borderRadius: 6,
    fontSize: "0.74rem",
    fontFamily: "sans-serif",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  agentEmail: {
    color: C.text,
    fontWeight: 800,
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
  },
  mutedSmall: {
    color: C.textFaint,
    fontSize: "0.76rem",
    lineHeight: 1.45,
    marginTop: "0.3rem",
    fontFamily: "sans-serif",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${C.border}`,
    borderRadius: 999,
    color: C.gold,
    background: "rgba(196,169,106,0.06)",
    padding: "0.25rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
  },
  emptyInline: {
    border: `1px dashed ${C.border}`,
    borderRadius: 8,
    color: C.textFaint,
    padding: "0.85rem",
    fontSize: "0.84rem",
    lineHeight: 1.5,
    fontFamily: "sans-serif",
    marginTop: "1rem",
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
};

const css = `
  @keyframes selSpin {
    to { transform: rotate(360deg); }
  }

  .sel-spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(196,169,106,0.15);
    border-top-color: #c4a96a;
    animation: selSpin 0.75s linear infinite;
  }

  .sel-input:focus {
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

  .sel-link:hover {
    opacity: 1 !important;
  }

  @media (max-width: 840px) {
    .sel-layout {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 640px) {
    input,
    select,
    button {
      font-size: 16px !important;
    }
  }
`;
