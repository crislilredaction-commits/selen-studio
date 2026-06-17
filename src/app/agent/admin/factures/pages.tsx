"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AgentProfile = {
  id: string;
  email: string;
  role: "agent" | "admin";
  is_active: boolean;
};

type AgentInvoice = {
  id: string;
  agent_email: string;
  invoice_number: string | null;
  invoice_period: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: "submitted" | "approved" | "paid" | "rejected";
  storage_path: string;
  public_url: string | null;
  admin_note: string | null;
  submitted_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
};

function formatPrice(amountCents?: number | null) {
  if (!amountCents) return "Montant non renseigné";
  return `${(amountCents / 100).toFixed(2).replace(".", ",")} €`;
}

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status?: string | null) {
  if (status === "submitted") return "Déposée";
  if (status === "approved") return "Validée";
  if (status === "paid") return "Payée";
  if (status === "rejected") return "Refusée";
  return "À vérifier";
}

function statusColor(status?: string | null) {
  if (status === "paid") return "#7ec97e";
  if (status === "approved") return "#d4a843";
  if (status === "rejected") return "#c97a7a";
  return "rgba(255,255,255,0.45)";
}

export default function AdminAgentInvoicesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [savingInvoiceId, setSavingInvoiceId] = useState<string | null>(null);

  const [staff, setStaff] = useState<AgentProfile | null>(null);
  const [invoices, setInvoices] = useState<AgentInvoice[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

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

    const { data: staffData, error: staffError } = await supabase
      .from("agent_profiles")
      .select("id, email, role, is_active")
      .or(`user_id.eq.${authData.user.id},email.eq.${userEmail}`)
      .eq("is_active", true)
      .maybeSingle();

    if (staffError) {
      setError(`Impossible de vérifier votre accès. ${staffError.message}`);
      setLoading(false);
      return;
    }

    if (!staffData || staffData.role !== "admin") {
      setError("Accès réservé aux administrateurs.");
      setLoading(false);
      return;
    }

    setStaff(staffData as AgentProfile);

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("agent_invoices")
      .select(
        "id, agent_email, invoice_number, invoice_period, amount_cents, currency, status, storage_path, public_url, admin_note, submitted_at, approved_at, paid_at, rejected_at",
      )
      .order("submitted_at", { ascending: false });

    if (invoiceError) {
      setError(`Impossible de charger les factures. ${invoiceError.message}`);
      setLoading(false);
      return;
    }

    setInvoices((invoiceData ?? []) as AgentInvoice[]);
    setLoading(false);
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getInvoiceHref(invoice: AgentInvoice) {
    if (invoice.public_url) return invoice.public_url;

    return supabase.storage
      .from("selen-documents")
      .getPublicUrl(invoice.storage_path).data.publicUrl;
  }

  async function updateInvoiceStatus(
    invoice: AgentInvoice,
    nextStatus: AgentInvoice["status"],
  ) {
    setSavingInvoiceId(invoice.id);
    setError("");
    setSuccess("");

    const now = new Date().toISOString();

    const updatePayload: Record<string, string | null> = {
      status: nextStatus,
      updated_at: now,
    };

    if (nextStatus === "approved") {
      updatePayload.approved_at = now;
      updatePayload.rejected_at = null;
    }

    if (nextStatus === "paid") {
      updatePayload.paid_at = now;
      updatePayload.approved_at = invoice.approved_at ?? now;
      updatePayload.rejected_at = null;
    }

    if (nextStatus === "rejected") {
      updatePayload.rejected_at = now;
    }

    if (nextStatus === "submitted") {
      updatePayload.approved_at = null;
      updatePayload.paid_at = null;
      updatePayload.rejected_at = null;
    }

    const { error: updateError } = await supabase
      .from("agent_invoices")
      .update(updatePayload)
      .eq("id", invoice.id);

    if (updateError) {
      setError(updateError.message);
      setSavingInvoiceId(null);
      return;
    }

    setInvoices((prev) =>
      prev.map((item) =>
        item.id === invoice.id
          ? {
              ...item,
              status: nextStatus,
              approved_at:
                nextStatus === "approved" || nextStatus === "paid"
                  ? (invoice.approved_at ?? now)
                  : nextStatus === "submitted"
                    ? null
                    : item.approved_at,
              paid_at:
                nextStatus === "paid"
                  ? now
                  : nextStatus === "submitted"
                    ? null
                    : item.paid_at,
              rejected_at:
                nextStatus === "rejected"
                  ? now
                  : nextStatus === "submitted" ||
                      nextStatus === "approved" ||
                      nextStatus === "paid"
                    ? null
                    : item.rejected_at,
            }
          : item,
      ),
    );

    setSuccess("Statut de la facture mis à jour.");
    setSavingInvoiceId(null);
  }

  async function updateAdminNote(invoice: AgentInvoice, note: string) {
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("agent_invoices")
      .update({
        admin_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setInvoices((prev) =>
      prev.map((item) =>
        item.id === invoice.id
          ? {
              ...item,
              admin_note: note,
            }
          : item,
      ),
    );

    setSuccess("Note admin enregistrée.");
  }

  const filteredInvoices =
    statusFilter === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === statusFilter);

  if (loading) {
    return (
      <main style={s.page}>
        <div style={s.loadingBox}>Chargement des factures…</div>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <p style={s.eyebrow}>Selen Studio · Admin</p>
            <h1 style={s.title}>Factures agents</h1>
            <p style={s.subtitle}>
              Consultez, validez et suivez les factures déposées par les agents
              et administrateurs.
            </p>

            {staff && (
              <p style={s.muted}>
                Connecté comme {staff.email} · rôle : {staff.role}
              </p>
            )}
          </div>

          <Link href="/agent" style={s.btnGhost}>
            ← Retour dashboard
          </Link>
        </header>

        {error && <div style={s.errorBox}>{error}</div>}
        {success && <div style={s.successBox}>{success}</div>}

        {!staff || staff.role !== "admin" ? (
          <section style={s.card}>
            <p style={s.cardLabel}>Accès refusé</p>
            <p style={s.text}>Cette page est réservée aux administrateurs.</p>
          </section>
        ) : (
          <>
            <section style={s.toolbar}>
              <label style={s.field}>
                Filtrer par statut
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  style={s.input}
                >
                  <option value="all">Toutes les factures</option>
                  <option value="submitted">Déposées</option>
                  <option value="approved">Validées</option>
                  <option value="paid">Payées</option>
                  <option value="rejected">Refusées</option>
                </select>
              </label>

              <button type="button" onClick={loadPage} style={s.btnPrimary}>
                Rafraîchir
              </button>
            </section>

            <section style={s.list}>
              {filteredInvoices.length === 0 ? (
                <div style={s.card}>
                  <p style={s.cardLabel}>Aucune facture</p>
                  <p style={s.text}>
                    Aucune facture ne correspond au filtre sélectionné.
                  </p>
                </div>
              ) : (
                filteredInvoices.map((invoice) => {
                  const saving = savingInvoiceId === invoice.id;

                  return (
                    <article key={invoice.id} style={s.invoiceCard}>
                      <div style={s.invoiceHeader}>
                        <div>
                          <p style={s.cardLabel}>{invoice.agent_email}</p>

                          <h2 style={s.invoiceTitle}>
                            {invoice.invoice_number || "Facture sans numéro"}
                          </h2>

                          <p style={s.muted}>
                            {invoice.invoice_period || "Période non renseignée"}{" "}
                            · {formatPrice(invoice.amount_cents)} · déposée le{" "}
                            {formatDate(invoice.submitted_at)}
                          </p>
                        </div>

                        <span
                          style={{
                            ...s.statusBadge,
                            color: statusColor(invoice.status),
                            borderColor: statusColor(invoice.status),
                          }}
                        >
                          {formatStatus(invoice.status)}
                        </span>
                      </div>

                      <div style={s.invoiceActions}>
                        <a
                          href={getInvoiceHref(invoice)}
                          target="_blank"
                          rel="noreferrer"
                          style={s.btnGhost}
                        >
                          Ouvrir la facture
                        </a>

                        <button
                          type="button"
                          onClick={() =>
                            updateInvoiceStatus(invoice, "approved")
                          }
                          disabled={saving}
                          style={s.btnGhost}
                        >
                          Valider
                        </button>

                        <button
                          type="button"
                          onClick={() => updateInvoiceStatus(invoice, "paid")}
                          disabled={saving}
                          style={s.btnGhost}
                        >
                          Marquer payée
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateInvoiceStatus(invoice, "rejected")
                          }
                          disabled={saving}
                          style={s.btnGhostDanger}
                        >
                          Refuser
                        </button>
                      </div>

                      <label style={s.fieldWide}>
                        Note admin
                        <textarea
                          defaultValue={invoice.admin_note ?? ""}
                          onBlur={(event) =>
                            updateAdminNote(invoice, event.target.value)
                          }
                          style={s.textarea}
                          placeholder="Ex : facture vérifiée, paiement prévu, anomalie..."
                        />
                      </label>
                    </article>
                  );
                })
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const C = {
  bg: "var(--selen-bg)",
  surface: "var(--selen-card-texture), var(--selen-card)",
  border: "var(--selen-border)",
  borderStrong: "var(--selen-border2)",
  gold: "var(--selen-gold)",
  text: "var(--selen-text-oncard)",
  textSoft: "var(--selen-text2-oncard)",
  textFaint: "var(--selen-text3-oncard)",
  error: "var(--selen-danger)",
  success: "var(--selen-success)",
};

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: "var(--selen-text)",
    fontFamily: "var(--font-body)",
  },
  container: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "2rem 2rem 5rem",
  },
  loadingBox: {
    minHeight: "70vh",
    display: "grid",
    placeItems: "center",
    color: C.textFaint,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "1.5rem",
  },
  eyebrow: {
    color: C.gold,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontSize: "0.68rem",
    fontFamily: "sans-serif",
    marginBottom: "0.4rem",
  },
  title: {
    fontSize: "2rem",
    margin: 0,
    color: C.text,
  },
  subtitle: {
    color: C.textSoft,
    marginTop: "0.55rem",
    fontFamily: "sans-serif",
    lineHeight: 1.6,
    maxWidth: 720,
  },
  toolbar: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1rem",
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "end",
    flexWrap: "wrap",
    marginBottom: "1rem",
  },
  list: {
    display: "grid",
    gap: "1rem",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.15rem",
  },
  invoiceCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.15rem",
  },
  invoiceHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "1rem",
  },
  invoiceTitle: {
    margin: 0,
    color: C.text,
    fontSize: "1.1rem",
  },
  invoiceActions: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
    marginBottom: "1rem",
  },
  cardLabel: {
    color: C.gold,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "0.66rem",
    fontFamily: "sans-serif",
    marginBottom: "0.5rem",
  },
  field: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
    fontSize: "0.82rem",
    minWidth: 240,
  },
  fieldWide: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
    fontSize: "0.82rem",
  },
  input: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 90,
    padding: "0.65rem",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 6,
    padding: "0.65rem 1rem",
    background: C.gold,
    color: "var(--selen-ink)",
    fontWeight: 800,
    fontFamily: "sans-serif",
    textDecoration: "none",
    cursor: "pointer",
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${C.borderStrong}`,
    borderRadius: 6,
    padding: "0.6rem 0.85rem",
    background: "transparent",
    color: C.gold,
    fontWeight: 700,
    fontFamily: "sans-serif",
    textDecoration: "none",
    cursor: "pointer",
  },
  btnGhostDanger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid rgba(201,122,122,0.45)`,
    borderRadius: 6,
    padding: "0.6rem 0.85rem",
    background: "transparent",
    color: C.error,
    fontWeight: 700,
    fontFamily: "sans-serif",
    textDecoration: "none",
    cursor: "pointer",
  },
  statusBadge: {
    border: "1px solid",
    borderRadius: 999,
    padding: "0.3rem 0.7rem",
    fontSize: "0.76rem",
    fontWeight: 800,
    fontFamily: "sans-serif",
    whiteSpace: "nowrap",
  },
  text: {
    color: C.textFaint,
    fontFamily: "sans-serif",
    lineHeight: 1.6,
    fontSize: "0.86rem",
  },
  muted: {
    color: C.textFaint,
    fontFamily: "sans-serif",
    lineHeight: 1.5,
    fontSize: "0.8rem",
    marginTop: "0.25rem",
  },
  errorBox: {
    borderLeft: `4px solid ${C.error}`,
    background: "rgba(201,122,122,0.07)",
    color: C.error,
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontFamily: "sans-serif",
    borderRadius: "0 6px 6px 0",
  },
  successBox: {
    borderLeft: `4px solid ${C.success}`,
    background: "rgba(126,201,126,0.07)",
    color: C.success,
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontFamily: "sans-serif",
    borderRadius: "0 6px 6px 0",
  },
};
