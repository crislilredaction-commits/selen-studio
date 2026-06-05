"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: "all", label: "Tous les statuts" },
  { value: "booking_pending", label: "À planifier" },
  { value: "partially_booked", label: "Partiellement réservé" },
  { value: "booked", label: "Réservé" },
  { value: "in_progress", label: "Audit en cours" },
  { value: "report_ready", label: "Rapport prêt" },
  { value: "completed", label: "Terminé" },
  { value: "cancelled", label: "Annulé" },
];

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatStatus(status?: string | null) {
  if (status === "paid") return "Paiement validé";
  if (status === "booking_pending") return "À planifier";
  if (status === "partially_booked") return "Part. réservé";
  if (status === "booked") return "Réservé";
  if (status === "in_progress") return "En cours";
  if (status === "report_ready") return "Rapport prêt";
  if (status === "completed") return "Terminé";
  if (status === "cancelled") return "Annulé";
  return "À vérifier";
}

function formatOffer(offer?: string | null) {
  if (offer === "direct") return "Direct";
  if (offer === "reserved_after_auto_audit") return "Après auto-audit";
  if (offer === "manual") return "Manuel";
  return "Inconnu";
}

function formatPrice(value?: number | null) {
  if (!value) return "—";
  return `${(value / 100).toFixed(2).replace(".", ",")} €`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateShort(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(value));
}

function getStatusConfig(status?: string | null) {
  if (status === "completed")
    return {
      color: "#7ec97e",
      bg: "rgba(126,201,126,0.1)",
      border: "rgba(126,201,126,0.25)",
      dot: "#7ec97e",
    };
  if (status === "report_ready")
    return {
      color: "#d4a843",
      bg: "rgba(212,168,67,0.12)",
      border: "rgba(212,168,67,0.3)",
      dot: "#d4a843",
    };
  if (status === "in_progress")
    return {
      color: "#c98a3a",
      bg: "rgba(201,138,58,0.12)",
      border: "rgba(201,138,58,0.28)",
      dot: "#c98a3a",
    };
  if (status === "booked")
    return {
      color: "#6aadcc",
      bg: "rgba(106,173,204,0.1)",
      border: "rgba(106,173,204,0.25)",
      dot: "#6aadcc",
    };
  if (status === "partially_booked")
    return {
      color: "#7a9fb8",
      bg: "rgba(122,159,184,0.1)",
      border: "rgba(122,159,184,0.2)",
      dot: "#7a9fb8",
    };
  if (status === "cancelled")
    return {
      color: "#c97a7a",
      bg: "rgba(201,122,122,0.1)",
      border: "rgba(201,122,122,0.25)",
      dot: "#c97a7a",
    };
  return {
    color: "#c4a96a",
    bg: "rgba(196,169,106,0.1)",
    border: "rgba(196,169,106,0.25)",
    dot: "#c4a96a",
  };
}

function getReportConfig(status?: string | null) {
  if (status === "sent") return { label: "Envoyé", color: "#7ec97e" };
  if (status === "ready") return { label: "Prêt", color: "#d4a843" };
  if (status === "draft") return { label: "Brouillon", color: "#c98a3a" };
  return { label: "—", color: "rgba(255,255,255,0.2)" };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AgentAuditsBlancsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [cases, setCases] = useState<AuditBlancCase[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const stats = useMemo(
    () => ({
      total: cases.length,
      toPlan: cases.filter(
        (c) => c.status === "paid" || c.status === "booking_pending",
      ).length,
      inProgress: cases.filter((c) => c.status === "in_progress").length,
      reportReady: cases.filter((c) => c.status === "report_ready").length,
      completed: cases.filter((c) => c.status === "completed").length,
    }),
    [cases],
  );

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      const matchSearch =
        !q ||
        c.client_email.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [cases, search, statusFilter]);

  if (loading) {
    return (
      <div style={s.page}>
        <style>{css}</style>
        <div style={s.loadingWrap}>
          <div className="selen-spinner" />
          <p style={s.loadingText}>Chargement du registre…</p>
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
          <p style={s.eyebrow}>Selen Studio</p>
          <div style={s.headerRow}>
            <h1 style={s.title}>Audits blancs Qualiopi</h1>
            {agent && (
              <div style={s.agentBadge}>
                <span style={s.agentOnline} />
                <span style={s.agentText}>
                  {agent.email}
                  <span style={s.agentRole}> — {agent.role}</span>
                </span>
              </div>
            )}
          </div>
          <p style={s.subtitle}>
            Pilotez les dossiers d'audit blanc, vérifiez les rendez-vous, ouvrez
            l'outil d'audit et suivez la préparation du rapport client.
          </p>
        </header>

        {/* ── Alerts ── */}
        {error && (
          <div
            style={{
              ...s.alert,
              borderLeftColor: "#c97a7a",
              color: "#c97a7a",
              background: "rgba(201,122,122,0.07)",
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              ...s.alert,
              borderLeftColor: "#7ec97e",
              color: "#7ec97e",
              background: "rgba(126,201,126,0.07)",
            }}
          >
            {success}
          </div>
        )}

        {!agent ? (
          <EmptyState
            label="Accès refusé"
            title="Vous n'avez pas accès à l'espace agent."
            body="Connectez-vous avec un compte agent Selen autorisé."
          />
        ) : (
          <>
            {/* ── Stats ── */}
            <section className="selen-stats-grid" style={s.statsGrid}>
              <StatCard
                label="Total dossiers"
                value={stats.total}
                color="#c4a96a"
              />
              <StatCard
                label="À planifier"
                value={stats.toPlan}
                color="#c98a3a"
                pulse={stats.toPlan > 0}
              />
              <StatCard
                label="En cours"
                value={stats.inProgress}
                color="#d4a843"
              />
              <StatCard
                label="Rapport prêt"
                value={stats.reportReady}
                color="#6aadcc"
              />
              <StatCard
                label="Terminés"
                value={stats.completed}
                color="#7ec97e"
              />
            </section>

            {/* ── Toolbar ── */}
            <section style={s.toolbar}>
              <div style={s.searchWrap}>
                <svg style={s.inputIcon} viewBox="0 0 20 20" fill="none">
                  <circle
                    cx="9"
                    cy="9"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M13.5 13.5L17 17"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par email ou identifiant…"
                  style={s.searchInput}
                  className="selen-input"
                />
              </div>

              <div style={s.selectWrap}>
                <svg style={s.inputIcon} viewBox="0 0 20 20" fill="none">
                  <path
                    d="M3 5h14M6 10h8M9 15h2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={s.selectInput}
                  className="selen-select"
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <span style={s.toolbarCount}>
                {filteredCases.length} / {cases.length} dossier
                {cases.length > 1 ? "s" : ""}
              </span>
            </section>

            {/* ── Content ── */}
            {cases.length === 0 ? (
              <EmptyState
                label="Registre vide"
                title="Aucun audit blanc n'a encore été créé."
                body="Les dossiers apparaîtront ici après paiement ou création manuelle."
              />
            ) : filteredCases.length === 0 ? (
              <EmptyState
                label="Aucun résultat"
                title="Aucun dossier ne correspond à votre recherche."
                body="Modifiez la recherche ou le filtre de statut."
              />
            ) : (
              <section style={s.tableCard}>
                <div style={s.tableScroll}>
                  <table style={s.table}>
                    <thead>
                      <tr style={s.theadRow}>
                        {[
                          "Client",
                          "Offre",
                          "Statut",
                          "Rendez-vous",
                          "Rapport",
                          "Màj",
                          "",
                        ].map((h, i) => (
                          <th
                            key={i}
                            style={{
                              ...s.th,
                              textAlign: i === 6 ? "right" : "left",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((c, i) => (
                        <CaseRow key={c.id} auditCase={c} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function CaseRow({
  auditCase,
  index,
}: {
  auditCase: AuditBlancCase;
  index: number;
}) {
  const sc = getStatusConfig(auditCase.status);
  const rc = getReportConfig(auditCase.report_status);

  return (
    <tr
      className="selen-row"
      style={{ ...s.row, animationDelay: `${index * 25}ms` }}
    >
      {/* Client */}
      <td style={s.td}>
        <span style={s.clientEmail}>{auditCase.client_email}</span>
        <span style={s.sub}>Créé {formatDateShort(auditCase.created_at)}</span>
      </td>

      {/* Offre */}
      <td style={s.td}>
        <span style={s.offerPill}>{formatOffer(auditCase.offer)}</span>
        <span style={s.sub}>{formatPrice(auditCase.price_paid)}</span>
      </td>

      {/* Statut */}
      <td style={s.td}>
        <span
          style={{
            ...s.statusBadge,
            color: sc.color,
            background: sc.bg,
            border: `1px solid ${sc.border}`,
          }}
        >
          <span style={{ ...s.statusDot, background: sc.dot }} />
          {formatStatus(auditCase.status)}
        </span>
      </td>

      {/* Rendez-vous */}
      <td style={s.td}>
        {auditCase.calendly_event_1_start ? (
          <>
            <span style={s.meetDate}>
              {formatDateTime(auditCase.calendly_event_1_start)}
            </span>
            {auditCase.calendly_mode === "split_2x1h45" && (
              <span style={s.sub}>
                +2 : {formatDateTime(auditCase.calendly_event_2_start)}
              </span>
            )}
          </>
        ) : (
          <span style={s.muted}>À planifier</span>
        )}
      </td>

      {/* Rapport */}
      <td style={s.td}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: rc.color }}>
          {rc.label}
        </span>
      </td>

      {/* Màj */}
      <td style={s.td}>
        <span style={s.sub}>{formatDateShort(auditCase.updated_at)}</span>
      </td>

      {/* Actions */}
      <td style={{ ...s.td, textAlign: "right" }}>
        <div style={s.actions}>
          <Link
            href={`/agent/audits-blancs/${auditCase.id}`}
            style={s.btnPrimary}
            className="selen-btn-primary"
          >
            Fiche
          </Link>
          <Link
            href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
            style={s.btnGhost}
            className="selen-btn-ghost"
          >
            Audit →
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <article
      style={{ ...s.statCard, borderTop: `2px solid ${color}` }}
      className="selen-stat-card"
    >
      <p style={s.statLabel}>{label}</p>
      <p
        style={{
          ...s.statValue,
          color: pulse && value > 0 ? color : "rgba(255,255,255,0.9)",
        }}
      >
        {value}
        {pulse && value > 0 && (
          <span
            style={{ ...s.pulseDot, background: color }}
            className="selen-pulse"
          />
        )}
      </p>
    </article>
  );
}

function EmptyState({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div style={s.emptyState}>
      <div style={s.emptyOrnament}>✦</div>
      <p style={s.emptyLabel}>{label}</p>
      <h2 style={s.emptyTitle}>{title}</h2>
      <p style={s.emptyBody}>{body}</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Palette extraite du screenshot
const C = {
  bg: "#1a1510", // fond principal très sombre brun-noir
  surface: "#221c14", // cartes
  surfaceHover: "#2a2218",
  border: "rgba(196,169,106,0.15)",
  borderStrong: "rgba(196,169,106,0.28)",
  gold: "#c4a96a", // accent principal
  goldBright: "#d4a843",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.5)",
  textFaint: "rgba(255,255,255,0.25)",
};

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  container: {
    maxWidth: 1340,
    margin: "0 auto",
    padding: "2.5rem 2rem 5rem",
  },

  // Loading
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    gap: "1.2rem",
  },
  loadingText: {
    color: C.textFaint,
    fontSize: "0.88rem",
    letterSpacing: "0.06em",
  },

  // Header
  header: { marginBottom: "2rem" },
  eyebrow: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: C.gold,
    marginBottom: "0.5rem",
    fontFamily: "Georgia, serif",
  },
  headerRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "0.6rem",
  },
  title: {
    fontSize: "clamp(1.7rem, 3.5vw, 2.6rem)",
    fontWeight: 700,
    color: C.text,
    letterSpacing: "0.01em",
    fontFamily: "Georgia, serif",
    lineHeight: 1.1,
    margin: 0,
  },
  subtitle: {
    color: C.textSoft,
    lineHeight: 1.65,
    maxWidth: 640,
    fontSize: "0.92rem",
    margin: 0,
  },
  agentBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    fontSize: "0.78rem",
    color: C.textSoft,
    background: "rgba(196,169,106,0.07)",
    border: `1px solid ${C.border}`,
    padding: "0.45rem 0.85rem",
    borderRadius: 6,
    flexShrink: 0,
  },
  agentOnline: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7ec97e",
    flexShrink: 0,
    boxShadow: "0 0 0 2.5px rgba(126,201,126,0.2)",
  },
  agentText: { color: "rgba(255,255,255,0.6)", fontFamily: "sans-serif" },
  agentRole: { color: C.gold, fontFamily: "sans-serif" },

  // Alert
  alert: {
    borderLeft: "3px solid",
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.87rem",
    lineHeight: 1.5,
    borderRadius: "0 6px 6px 0",
  },

  // Stats
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "0.8rem",
    marginBottom: "1rem",
  },
  statCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem 1.2rem 1rem",
    position: "relative",
    overflow: "hidden",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  },
  statLabel: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: C.textFaint,
    marginBottom: "0.5rem",
    fontFamily: "sans-serif",
  },
  statValue: {
    fontSize: "2.2rem",
    fontWeight: 700,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontFamily: "Georgia, serif",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },

  // Toolbar
  toolbar: {
    display: "flex",
    gap: "0.7rem",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: "0.9rem",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "0.85rem 1rem",
  },
  searchWrap: { position: "relative", flex: "1 1 280px" },
  selectWrap: { position: "relative", flex: "0 0 210px" },
  inputIcon: {
    position: "absolute",
    left: "0.7rem",
    top: "50%",
    transform: "translateY(-50%)",
    width: 15,
    height: 15,
    color: C.textFaint,
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    padding: "0.6rem 0.7rem 0.6rem 2.1rem",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.85rem",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "sans-serif",
  },
  selectInput: {
    width: "100%",
    padding: "0.6rem 0.7rem 0.6rem 2.1rem",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.85rem",
    outline: "none",
    appearance: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    fontFamily: "sans-serif",
  },
  toolbarCount: {
    marginLeft: "auto",
    fontSize: "0.75rem",
    color: C.textFaint,
    whiteSpace: "nowrap",
    fontFamily: "sans-serif",
    letterSpacing: "0.03em",
  },

  // Table
  tableCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  tableScroll: { overflowX: "auto" },
  table: {
    width: "100%",
    minWidth: 940,
    borderCollapse: "collapse",
    color: C.text,
  },
  theadRow: {
    borderBottom: `1px solid ${C.borderStrong}`,
    background: "rgba(196,169,106,0.06)",
  },
  th: {
    padding: "0.8rem 1rem",
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: C.gold,
    fontWeight: 600,
    whiteSpace: "nowrap",
    fontFamily: "sans-serif",
  },
  row: {
    borderBottom: `1px solid rgba(196,169,106,0.08)`,
    animation: "selFadeIn 0.22s ease both",
    transition: "background 0.12s ease",
  },
  td: {
    padding: "0.78rem 1rem",
    verticalAlign: "middle",
    fontSize: "0.85rem",
    lineHeight: 1.4,
    fontFamily: "sans-serif",
  },

  // Cell parts
  clientEmail: {
    display: "block",
    fontWeight: 600,
    color: "rgba(255,255,255,0.85)",
    fontSize: "0.85rem",
  },
  sub: {
    display: "block",
    color: C.textFaint,
    fontSize: "0.73rem",
    marginTop: "0.2rem",
  },
  offerPill: {
    display: "inline-block",
    fontSize: "0.73rem",
    padding: "0.18rem 0.55rem",
    background: "rgba(196,169,106,0.1)",
    border: `1px solid rgba(196,169,106,0.2)`,
    borderRadius: 4,
    color: C.gold,
    fontWeight: 600,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.25rem 0.65rem",
    borderRadius: 999,
    fontSize: "0.73rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    flexShrink: 0,
  },
  meetDate: {
    display: "block",
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "rgba(255,255,255,0.7)",
  },
  muted: {
    color: C.textFaint,
    fontSize: "0.8rem",
    fontStyle: "italic",
  },

  // Actions
  actions: {
    display: "flex",
    gap: "0.4rem",
    justifyContent: "flex-end",
  },
  btnPrimary: {
    display: "inline-block",
    fontSize: "0.75rem",
    padding: "0.4rem 0.85rem",
    background: C.gold,
    color: "#1a1510",
    borderRadius: 6,
    fontWeight: 700,
    textDecoration: "none",
    whiteSpace: "nowrap",
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    transition: "background 0.15s ease",
  },
  btnGhost: {
    display: "inline-block",
    fontSize: "0.75rem",
    padding: "0.4rem 0.85rem",
    background: "transparent",
    color: C.gold,
    borderRadius: 6,
    border: `1px solid rgba(196,169,106,0.3)`,
    textDecoration: "none",
    whiteSpace: "nowrap",
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    transition: "background 0.15s ease, border-color 0.15s ease",
  },

  // Empty state
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
    color: "rgba(255,255,255,0.75)",
    marginBottom: "0.5rem",
    fontSize: "1.1rem",
    fontFamily: "Georgia, serif",
  },
  emptyBody: {
    color: C.textFaint,
    lineHeight: 1.65,
    maxWidth: 380,
    margin: "0 auto",
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
  },
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
  @keyframes selFadeIn {
    from { opacity: 0; transform: translateY(3px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes selSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes selPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(1.4); }
  }

  .selen-spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(196,169,106,0.15);
    border-top-color: #c4a96a;
    animation: selSpin 0.75s linear infinite;
  }

  .selen-pulse {
    animation: selPulse 1.5s ease-in-out infinite;
  }

  .selen-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }

  .selen-row:hover {
    background: rgba(196,169,106,0.04) !important;
  }

  .selen-input:focus {
    border-color: rgba(196,169,106,0.5) !important;
    background: rgba(255,255,255,0.07) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.08);
  }

  .selen-select:focus {
    border-color: rgba(196,169,106,0.5) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.08);
  }

  .selen-btn-primary:hover {
    background: #d4a843 !important;
  }

  .selen-btn-ghost:hover {
    background: rgba(196,169,106,0.1) !important;
    border-color: rgba(196,169,106,0.5) !important;
  }

  @media (max-width: 900px) {
    .selen-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
  }
  @media (max-width: 600px) {
    .selen-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
`;
