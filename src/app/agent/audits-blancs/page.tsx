"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuditBlancCase = {
  id: string;
  client_email: string;
  status: string;
  offer: string;
  price_paid: number | null;
  currency: string | null;
  calendly_mode: string | null;
  calendly_event_1_start: string | null;
  calendly_event_1_end: string | null;
  calendly_event_2_start: string | null;
  calendly_event_2_end: string | null;
  meeting_url: string | null;
  report_status: string;
  created_at: string;
  updated_at: string;
};

type AgentProfile = {
  email: string;
  role: "agent" | "admin";
};

function formatStatus(status?: string | null) {
  if (status === "paid") return "Paiement validé";
  if (status === "booking_pending") return "Rendez-vous à planifier";
  if (status === "partially_booked") return "Un rendez-vous sur deux réservé";
  if (status === "booked") return "Rendez-vous réservé";
  if (status === "in_progress") return "Audit en cours";
  if (status === "report_ready") return "Rapport prêt";
  if (status === "completed") return "Terminé";
  if (status === "cancelled") return "Annulé";
  return "À vérifier";
}

function formatOffer(offer?: string | null) {
  if (offer === "direct") return "Audit blanc direct — 397 €";
  if (offer === "reserved_after_auto_audit") {
    return "Audit blanc après auto-audit — 199 €";
  }
  if (offer === "manual") return "Dossier manuel";
  return "Offre inconnue";
}

function formatPrice(value?: number | null) {
  if (!value) return "Non renseigné";
  return `${(value / 100).toFixed(2).replace(".", ",")} €`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isoToLocalInput(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  const pad = (num: number) => String(num).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localInputToIso(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export default function AgentAuditsBlancsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [cases, setCases] = useState<AuditBlancCase[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadAgentCases() {
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

      const { data: casesData, error: casesError } = await supabase
        .from("audit_blanc_cases")
        .select(
          "id, client_email, status, offer, price_paid, currency, calendly_mode, calendly_event_1_start, calendly_event_1_end, calendly_event_2_start, calendly_event_2_end, meeting_url, report_status, created_at, updated_at",
        )
        .order("created_at", { ascending: false });

      if (casesError) {
        setError(`Impossible de charger les dossiers. ${casesError.message}`);
        setLoading(false);
        return;
      }

      setCases((casesData ?? []) as AuditBlancCase[]);
      setLoading(false);
    }

    loadAgentCases();
  }, [router, supabase]);

  function updateLocalCase(
    caseId: string,
    field: keyof AuditBlancCase,
    value: string | null,
  ) {
    setCases((prev) =>
      prev.map((item) =>
        item.id === caseId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  async function saveCase(auditCase: AuditBlancCase) {
    setSavingId(auditCase.id);
    setError("");
    setSuccess("");

    const status =
      auditCase.status === "cancelled"
        ? "cancelled"
        : auditCase.calendly_mode === "split_2x1h45" &&
            auditCase.calendly_event_1_start &&
            !auditCase.calendly_event_2_start
          ? "partially_booked"
          : auditCase.calendly_event_1_start
            ? "booked"
            : "booking_pending";

    const { error: updateError } = await supabase
      .from("audit_blanc_cases")
      .update({
        status,
        calendly_mode: auditCase.calendly_mode,
        calendly_event_1_start: auditCase.calendly_event_1_start,
        calendly_event_1_end: auditCase.calendly_event_1_end,
        calendly_event_2_start: auditCase.calendly_event_2_start,
        calendly_event_2_end: auditCase.calendly_event_2_end,
        meeting_url: auditCase.meeting_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (updateError) {
      setError(updateError.message);
      setSavingId(null);
      return;
    }

    setCases((prev) =>
      prev.map((item) =>
        item.id === auditCase.id
          ? {
              ...item,
              status,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    );

    setSuccess("Dossier mis à jour.");
    setSavingId(null);
  }

  if (loading) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--ink-faint)" }}>
            Chargement des dossiers audit blanc…
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
            <p className="gazette-label">Espace agent</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Audits blancs Qualiopi
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Retrouvez les dossiers d’audit blanc, renseignez les rendez-vous
              réservés via Calendly et préparez le suivi côté client.
            </p>

            {agent && (
              <p
                style={{
                  color: "rgba(240,220,190,0.75)",
                  fontSize: "0.9rem",
                  marginTop: "0.8rem",
                }}
              >
                Connecté comme {agent.email} · rôle : {agent.role}
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

        {!agent ? (
          <section
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.4rem",
            }}
          >
            <p className="gazette-label">Accès refusé</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
              Vous n’avez pas accès à l’espace agent.
            </h2>

            <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
              Connectez-vous avec un compte agent Selen autorisé.
            </p>
          </section>
        ) : cases.length === 0 ? (
          <section
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.4rem",
            }}
          >
            <p className="gazette-label">Aucun dossier</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
              Aucun audit blanc n’a encore été créé.
            </h2>

            <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
              Les dossiers apparaîtront ici après paiement ou création manuelle.
            </p>
          </section>
        ) : (
          <section style={{ display: "grid", gap: "1rem" }}>
            {cases.map((auditCase) => (
              <article
                key={auditCase.id}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-dark)",
                  padding: "1.2rem",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 280px",
                    gap: "1rem",
                    alignItems: "start",
                  }}
                  className="preaudit-grid"
                >
                  <div>
                    <p className="gazette-label">Dossier audit blanc</p>

                    <h2
                      style={{
                        color: "var(--ink)",
                        marginBottom: "0.35rem",
                      }}
                    >
                      {auditCase.client_email}
                    </h2>

                    <p
                      style={{
                        color: "var(--ink-soft)",
                        lineHeight: 1.5,
                        marginBottom: "0.6rem",
                      }}
                    >
                      {formatOffer(auditCase.offer)} ·{" "}
                      {formatPrice(auditCase.price_paid)}
                    </p>

                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                      }}
                    >
                      Statut actuel : {formatStatus(auditCase.status)}
                      <br />
                      Créé le : {formatDateTime(auditCase.created_at)}
                      <br />
                      Rapport :{" "}
                      {auditCase.report_status === "ready" ||
                      auditCase.report_status === "sent"
                        ? "disponible"
                        : "en attente"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "0.5rem",
                    }}
                  >
                    <Link
                      href={`/agent/audits-blancs/${auditCase.id}`}
                      className="btn-ink"
                    >
                      <span>Ouvrir le dossier complet</span>
                    </Link>

                    <Link
                      href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
                      className="btn-ink"
                    >
                      <span>Ouvrir l’outil d’audit</span>
                    </Link>

                    <Link href="/client/audit-blanc" className="btn-ink">
                      <span>Voir rendu client</span>
                    </Link>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1.2rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid var(--sepia-mid)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.8rem",
                  }}
                >
                  <label
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Format du rendez-vous
                    <select
                      value={auditCase.calendly_mode ?? ""}
                      onChange={(event) =>
                        updateLocalCase(
                          auditCase.id,
                          "calendly_mode",
                          event.target.value || null,
                        )
                      }
                      style={{
                        padding: "0.55rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.45)",
                        color: "var(--ink)",
                      }}
                    >
                      <option value="">Non renseigné</option>
                      <option value="single_3h30">1 créneau de 3h30</option>
                      <option value="split_2x1h45">2 créneaux d’1h45</option>
                    </select>
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Début créneau 1
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_1_start)}
                      onChange={(event) =>
                        updateLocalCase(
                          auditCase.id,
                          "calendly_event_1_start",
                          localInputToIso(event.target.value),
                        )
                      }
                      style={{
                        padding: "0.55rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.45)",
                        color: "var(--ink)",
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Fin créneau 1
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_1_end)}
                      onChange={(event) =>
                        updateLocalCase(
                          auditCase.id,
                          "calendly_event_1_end",
                          localInputToIso(event.target.value),
                        )
                      }
                      style={{
                        padding: "0.55rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.45)",
                        color: "var(--ink)",
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Début créneau 2
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_2_start)}
                      onChange={(event) =>
                        updateLocalCase(
                          auditCase.id,
                          "calendly_event_2_start",
                          localInputToIso(event.target.value),
                        )
                      }
                      disabled={auditCase.calendly_mode !== "split_2x1h45"}
                      style={{
                        padding: "0.55rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.45)",
                        color: "var(--ink)",
                        opacity:
                          auditCase.calendly_mode === "split_2x1h45" ? 1 : 0.45,
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Fin créneau 2
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_2_end)}
                      onChange={(event) =>
                        updateLocalCase(
                          auditCase.id,
                          "calendly_event_2_end",
                          localInputToIso(event.target.value),
                        )
                      }
                      disabled={auditCase.calendly_mode !== "split_2x1h45"}
                      style={{
                        padding: "0.55rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.45)",
                        color: "var(--ink)",
                        opacity:
                          auditCase.calendly_mode === "split_2x1h45" ? 1 : 0.45,
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      color: "var(--ink-soft)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Lien visio
                    <input
                      type="url"
                      value={auditCase.meeting_url ?? ""}
                      onChange={(event) =>
                        updateLocalCase(
                          auditCase.id,
                          "meeting_url",
                          event.target.value || null,
                        )
                      }
                      placeholder="https://..."
                      style={{
                        padding: "0.55rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.45)",
                        color: "var(--ink)",
                      }}
                    />
                  </label>
                </div>

                <div
                  style={{
                    marginTop: "1rem",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={() => saveCase(auditCase)}
                    disabled={savingId === auditCase.id}
                    style={{
                      opacity: savingId === auditCase.id ? 0.55 : 1,
                      cursor:
                        savingId === auditCase.id ? "not-allowed" : "pointer",
                    }}
                  >
                    <span>
                      {savingId === auditCase.id
                        ? "Sauvegarde…"
                        : "Enregistrer les rendez-vous"}
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>    </main>
  );
}
