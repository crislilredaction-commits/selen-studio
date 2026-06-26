"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

export type SupportTicketDetail = {
  id: string;
  client_email: string;
  client_name: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  resolution_type: string | null;
  assigned_agent_email: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  closed_at?: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_type: string | null;
  sender_email: string | null;
  message: string | null;
  created_at: string | null;
};

export type SupportNote = {
  id: string;
  ticket_id: string;
  agent_email: string | null;
  note: string | null;
  created_at: string | null;
};

export type SupportAgentOption = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

export type SupportDiscountCode = {
  id: string;
  code: string;
  client_email: string;
  ticket_id: string | null;
  discount_type: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  currency: string | null;
  status: string;
  expires_at: string | null;
  used_at: string | null;
  created_by_agent_email: string | null;
  created_at: string | null;
};

export type SupportRefundRequest = {
  id: string;
  ticket_id: string | null;
  client_email: string;
  amount_cents: number | null;
  currency: string | null;
  reason: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  processed_by_agent_email: string | null;
  processed_at: string | null;
  created_by_agent_email: string | null;
  created_at: string | null;
};

const CATEGORY_OPTIONS = [
  ["question", "Question"],
  ["reclamation", "Réclamation"],
  ["paiement", "Paiement"],
  ["acces", "Accès"],
  ["bug", "Bug"],
  ["audit", "Audit"],
  ["nda", "NDA"],
  ["autre", "Autre"],
];

const STATUS_OPTIONS = [
  ["open", "Ouvert"],
  ["waiting_agent", "À traiter"],
  ["waiting_client", "En attente client"],
  ["resolved", "Résolu"],
  ["closed", "Clôturé"],
];

const PRIORITY_OPTIONS = [
  ["low", "Basse"],
  ["normal", "Normale"],
  ["high", "Haute"],
  ["urgent", "Urgente"],
];

const RESOLUTION_OPTIONS = [
  ["", "Aucune"],
  ["resolved", "Résolu"],
  ["access_resent", "Accès renvoyé"],
  ["commercial_gesture", "Geste commercial"],
  ["refund", "Remboursement"],
  ["duplicate", "Doublon"],
  ["other", "Autre"],
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status;
}

function statusVariant(
  status: string,
): "info" | "warn" | "success" | "neutral" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "waiting_client") return "info";
  if (status === "waiting_agent" || status === "open") return "warn";
  return "neutral";
}

function priorityLabel(priority: string) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "Haute";
  if (priority === "low") return "Basse";
  return "Normale";
}

function formatAmount(cents?: number | null, currency = "eur") {
  if (!cents) return "-";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function discountLabel(discount: SupportDiscountCode) {
  if (discount.discount_type === "percent") return `${discount.percent_off ?? 0}%`;
  return formatAmount(discount.amount_off_cents, discount.currency ?? "eur");
}

export default function SupportTicketClient({
  ticket,
  messages,
  notes,
  agents,
  discounts,
  refunds,
}: {
  ticket: SupportTicketDetail;
  messages: SupportMessage[];
  notes: SupportNote[];
  agents: SupportAgentOption[];
  discounts: SupportDiscountCode[];
  refunds: SupportRefundRequest[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState(ticket.category || "question");
  const [status, setStatus] = useState(ticket.status || "open");
  const [priority, setPriority] = useState(ticket.priority || "normal");
  const [resolutionType, setResolutionType] = useState(
    ticket.resolution_type ?? "",
  );
  const [assignedAgentEmail, setAssignedAgentEmail] = useState(
    ticket.assigned_agent_email ?? "",
  );
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountExpiresAt, setDiscountExpiresAt] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundPaymentIntent, setRefundPaymentIntent] = useState("");
  const [refundIds, setRefundIds] = useState<Record<string, string>>({});

  const appointmentUrl = "https://www.selen-editions.fr/prendre-rendez-vous";
  const lastActivity = ticket.last_message_at || ticket.updated_at;

  async function postJson(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    setError("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return null;
    }

    return result;
  }

  async function sendReply() {
    const result = await postJson("/agent/api/support/reply", {
      ticketId: ticket.id,
      message: reply,
    });
    if (!result) return;
    setReply("");
    setNotice(
      result.email?.sent
        ? "Réponse envoyée au client."
        : result.email?.error ??
            "Réponse enregistrée. Email non envoyé, configuration Resend absente.",
    );
    router.refresh();
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copie.`);
      setError("");
    } catch {
      setError("Copie impossible dans ce navigateur.");
    }
  }

  function insertIntoReply(value: string) {
    setReply((current) => {
      const separator = current.trim().length > 0 ? "\n\n" : "";
      return `${current}${separator}${value}`;
    });
  }

  async function saveQualification(nextStatus = status) {
    const result = await postJson("/agent/api/support/update", {
      ticketId: ticket.id,
      category,
      status: nextStatus,
      priority,
      resolutionType,
      assignedAgentEmail,
    });
    if (!result) return;
    setStatus(nextStatus);
    setNotice("Qualification enregistrée.");
    router.refresh();
  }

  async function addNote() {
    const result = await postJson("/agent/api/support/note", {
      ticketId: ticket.id,
      note,
    });
    if (!result) return;
    setNote("");
    setNotice("Note interne ajoutée.");
    router.refresh();
  }

  async function createDiscount() {
    const numericValue = Number(discountValue.replace(",", "."));
    const result = await postJson("/agent/api/support/discount/create", {
      ticketId: ticket.id,
      clientEmail: ticket.client_email,
      discountType,
      percentOff: discountType === "percent" ? numericValue : null,
      amountOffCents:
        discountType === "amount" ? Math.round(numericValue * 100) : null,
      expiresAt: discountExpiresAt || null,
    });
    if (!result) return;
    setDiscountValue("");
    setDiscountExpiresAt("");
    setNotice(`Code ${result.code} cree.`);
    router.refresh();
  }

  async function createRefund() {
    const amountCents = refundAmount
      ? Math.round(Number(refundAmount.replace(",", ".")) * 100)
      : null;
    const result = await postJson("/agent/api/support/refund", {
      action: "create",
      ticketId: ticket.id,
      clientEmail: ticket.client_email,
      amountCents,
      reason: refundReason,
      stripePaymentIntentId: refundPaymentIntent || null,
    });
    if (!result) return;
    setRefundAmount("");
    setRefundReason("");
    setRefundPaymentIntent("");
    setNotice("Demande de remboursement creee.");
    router.refresh();
  }

  async function updateRefund(
    refundId: string,
    status: "processed" | "refused" | "cancelled",
  ) {
    const result = await postJson("/agent/api/support/refund", {
      action: "update",
      refundId,
      status,
      stripeRefundId: refundIds[refundId] || null,
    });
    if (!result) return;
    setNotice("Demande de remboursement mise a jour.");
    router.refresh();
  }

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at ?? 0).getTime() -
          new Date(b.created_at ?? 0).getTime(),
      ),
    [messages],
  );

  return (
    <main style={s.page}>
      <div style={s.backRow}>
        <Link href="/agent/support" style={{ textDecoration: "none" }}>
          <SelenButton type="button" variant="ghost">
            ← Retour au support
          </SelenButton>
        </Link>
      </div>

      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Support client</p>
          <h1 style={s.title}>{ticket.subject}</h1>
          <p style={s.subtitle}>
            {ticket.client_name || "Client"} · {ticket.client_email}
          </p>
        </div>
        <div style={s.headerActions}>
          <SelenButton
            type="button"
            variant="danger"
            disabled={busy || status === "closed"}
            onClick={() => void saveQualification("closed")}
          >
            Clôturer
          </SelenButton>
        </div>
      </header>

      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}

      <section style={s.topGrid}>
        <SelenCard>
          <SelenCardTitle>Informations ticket</SelenCardTitle>
          <div style={s.badges}>
            <SelenBadge variant="type" dot>
              {category || "question"}
            </SelenBadge>
            <SelenBadge variant={statusVariant(status)} dot>
              {statusLabel(status)}
            </SelenBadge>
            <SelenBadge variant="neutral" dot>
              {priorityLabel(priority)}
            </SelenBadge>
          </div>
          <div style={s.infoGrid}>
            <Info label="Créé le" value={formatDate(ticket.created_at)} />
            <Info label="Dernière activité" value={formatDate(lastActivity)} />
            <Info
              label="Agent traitant"
              value={assignedAgentEmail || "Non attribué"}
            />
            <Info label="Résolution" value={resolutionType || "Aucune"} />
            <Info label="Clôture" value={formatDate(ticket.closed_at)} />
          </div>
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Lien a transmettre au client</SelenCardTitle>
          <p style={s.linkBox}>{appointmentUrl}</p>
          <div style={s.inlineActions}>
            <SelenButton
              type="button"
              variant="secondary"
              onClick={() => void copyText(appointmentUrl, "Lien RDV")}
            >
              Copier le lien
            </SelenButton>
            <SelenButton
              type="button"
              variant="ghost"
              onClick={() => insertIntoReply(appointmentUrl)}
            >
              Inserer dans la reponse
            </SelenButton>
          </div>
        </SelenCard>
      </section>

      <section style={s.mainGrid}>
        <div style={s.leftColumn}>
          <SelenCard>
            <SelenCardTitle>Conversation</SelenCardTitle>
            {sortedMessages.length === 0 ? (
              <p style={s.muted}>Aucun message enregistré sur ce ticket.</p>
            ) : (
              <div style={s.thread}>
                {sortedMessages.map((message) => {
                  const isAgent = message.sender_type === "agent";
                  return (
                    <article
                      key={message.id}
                      style={{
                        ...s.bubble,
                        ...(isAgent ? s.agentBubble : s.clientBubble),
                      }}
                    >
                      <div style={s.bubbleMeta}>
                        <strong>{isAgent ? "Agent Selen" : "Client"}</strong>
                        <span>{message.sender_email || "—"}</span>
                        <span>{formatDate(message.created_at)}</span>
                      </div>
                      <p style={s.bubbleText}>{message.message}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Répondre au client</SelenCardTitle>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Votre réponse au client..."
              style={{ ...s.input, minHeight: 150, paddingTop: 10 }}
            />
            <div style={s.formActions}>
              <SelenButton
                type="button"
                disabled={busy || reply.trim().length === 0}
                onClick={() => void sendReply()}
              >
                Envoyer la réponse
              </SelenButton>
            </div>
          </SelenCard>
        </div>

        <aside style={s.rightColumn}>
          <SelenCard>
            <SelenCardTitle>Qualification</SelenCardTitle>
            <Field label="Catégorie">
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                style={s.input}
              >
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                style={s.input}
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priorité">
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                style={s.input}
              >
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Résolution">
              <select
                value={resolutionType}
                onChange={(event) => setResolutionType(event.target.value)}
                style={s.input}
              >
                {RESOLUTION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Agent traitant">
              <select
                value={assignedAgentEmail}
                onChange={(event) => setAssignedAgentEmail(event.target.value)}
                style={s.input}
              >
                <option value="">Non attribue</option>
                {agents.map((agent) => {
                  const name = [agent.first_name, agent.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  return (
                    <option key={agent.email} value={agent.email}>
                      {name ? `${name} - ${agent.email}` : agent.email}
                    </option>
                  );
                })}
              </select>
            </Field>
            <div style={s.formActions}>
              <SelenButton
                type="button"
                disabled={busy}
                onClick={() => void saveQualification()}
              >
                Enregistrer
              </SelenButton>
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Geste commercial</SelenCardTitle>
            <div style={s.inlineActions}>
              <Link href="/agent/codes-reduction" style={{ textDecoration: "none" }}>
                <SelenButton type="button" size="sm" variant="ghost">
                  Voir tous les codes de reduction
                </SelenButton>
              </Link>
            </div>
            <div style={s.compactGrid}>
              <Field label="Type">
                <select
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value)}
                  style={s.input}
                >
                  <option value="percent">Pourcentage</option>
                  <option value="amount">Montant fixe</option>
                </select>
              </Field>
              <Field label={discountType === "percent" ? "Valeur %" : "Montant EUR"}>
                <input
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  placeholder={discountType === "percent" ? "10" : "25"}
                  style={s.input}
                />
              </Field>
            </div>
            <Field label="Expiration">
              <input
                type="datetime-local"
                value={discountExpiresAt}
                onChange={(event) => setDiscountExpiresAt(event.target.value)}
                style={s.input}
              />
            </Field>
            <div style={s.formActions}>
              <SelenButton
                type="button"
                variant="secondary"
                disabled={busy || discountValue.trim().length === 0}
                onClick={() => void createDiscount()}
              >
                Creer un code
              </SelenButton>
            </div>
            <div style={s.notes}>
              {discounts.length === 0 ? (
                <p style={s.muted}>Aucun code cree pour ce ticket ou ce client.</p>
              ) : (
                discounts.map((discount) => (
                  <article key={discount.id} style={s.note}>
                    <p style={s.noteText}>
                      <strong>{discount.code}</strong> - {discountLabel(discount)}
                    </p>
                    <p style={s.noteMeta}>
                      {discount.status} - expire le {formatDate(discount.expires_at)}
                    </p>
                    <div style={s.inlineActions}>
                      <SelenButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyText(discount.code, "Code")}
                      >
                        Copier
                      </SelenButton>
                      <SelenButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => insertIntoReply(`Code de reduction : ${discount.code}`)}
                      >
                        Inserer
                      </SelenButton>
                    </div>
                  </article>
                ))
              )}
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Remboursement</SelenCardTitle>
            <Field label="Montant EUR">
              <input
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                placeholder="49"
                style={s.input}
              />
            </Field>
            <Field label="Motif">
              <textarea
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder="Motif de la demande..."
                style={{ ...s.input, minHeight: 92, paddingTop: 10 }}
              />
            </Field>
            <Field label="Payment intent Stripe">
              <input
                value={refundPaymentIntent}
                onChange={(event) => setRefundPaymentIntent(event.target.value)}
                placeholder="pi_..."
                style={s.input}
              />
            </Field>
            <div style={s.formActions}>
              <SelenButton
                type="button"
                variant="secondary"
                disabled={busy || refundReason.trim().length === 0}
                onClick={() => void createRefund()}
              >
                Creer une demande
              </SelenButton>
            </div>
            <div style={s.notes}>
              {refunds.length === 0 ? (
                <p style={s.muted}>Aucune demande de remboursement.</p>
              ) : (
                refunds.map((refund) => (
                  <article key={refund.id} style={s.note}>
                    <p style={s.noteText}>
                      <strong>{formatAmount(refund.amount_cents, refund.currency ?? "eur")}</strong>{" "}
                      - {refund.status}
                    </p>
                    <p style={s.noteText}>{refund.reason}</p>
                    <p style={s.noteMeta}>
                      Cree le {formatDate(refund.created_at)}
                      {refund.stripe_payment_intent_id
                        ? ` - ${refund.stripe_payment_intent_id}`
                        : ""}
                    </p>
                    {refund.status === "to_process" ? (
                      <>
                        <Field label="Stripe refund id">
                          <input
                            value={refundIds[refund.id] ?? ""}
                            onChange={(event) =>
                              setRefundIds((current) => ({
                                ...current,
                                [refund.id]: event.target.value,
                              }))
                            }
                            placeholder="re_..."
                            style={s.input}
                          />
                        </Field>
                        <div style={s.inlineActions}>
                          <SelenButton
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void updateRefund(refund.id, "processed")}
                          >
                            Marquer effectue
                          </SelenButton>
                          <SelenButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void updateRefund(refund.id, "refused")}
                          >
                            Refuser
                          </SelenButton>
                          <SelenButton
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => void updateRefund(refund.id, "cancelled")}
                          >
                            Annuler
                          </SelenButton>
                        </div>
                      </>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Notes internes</SelenCardTitle>
            {notes.length === 0 ? (
              <p style={s.muted}>Aucune note interne.</p>
            ) : (
              <div style={s.notes}>
                {notes.map((item) => (
                  <article key={item.id} style={s.note}>
                    <p style={s.noteText}>{item.note}</p>
                    <p style={s.noteMeta}>
                      {item.agent_email || "Agent"} · {formatDate(item.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            )}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ajouter une note visible uniquement dans Studio..."
              style={{ ...s.input, minHeight: 110, paddingTop: 10, marginTop: 12 }}
            />
            <div style={s.formActions}>
              <SelenButton
                type="button"
                variant="secondary"
                disabled={busy || note.trim().length === 0}
                onClick={() => void addNote()}
              >
                Ajouter
              </SelenButton>
            </div>
          </SelenCard>
        </aside>
      </section>

      <div style={{ marginTop: 18 }}>
        <Link href="/agent/support" style={{ textDecoration: "none" }}>
          <SelenButton type="button" variant="ghost">
            Retour au support
          </SelenButton>
        </Link>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.info}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1220,
    margin: "0 auto",
    padding: "24px 28px 48px",
    color: "var(--selen-text)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  backRow: { marginBottom: 14 },
  eyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 30,
    lineHeight: 1.15,
    margin: "8px 0",
  },
  subtitle: { color: "var(--selen-text2)", fontSize: 13, margin: 0 },
  headerActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  actionLink: {
    minHeight: 38,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text2)",
    padding: "0 12px",
    fontSize: 13,
    textDecoration: "none",
  },
  linkBox: {
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text-oncard)",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  inlineActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 0.7fr)",
    gap: 14,
    marginBottom: 14,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.75fr)",
    gap: 14,
    alignItems: "start",
  },
  leftColumn: { display: "grid", gap: 14 },
  rightColumn: { display: "grid", gap: 14 },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  info: {
    padding: 10,
    borderRadius: "var(--radius-sm)",
    background: "rgba(247, 239, 224, 0.06)",
    border: "1px solid var(--selen-border)",
  },
  infoLabel: {
    display: "block",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "var(--selen-text3-oncard)",
    marginBottom: 5,
  },
  infoValue: {
    display: "block",
    fontSize: 13,
    color: "var(--selen-text-oncard)",
    overflowWrap: "anywhere",
  },
  thread: { display: "grid", gap: 12 },
  bubble: {
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--selen-border)",
    padding: 12,
  },
  clientBubble: { background: "rgba(247, 239, 224, 0.06)" },
  agentBubble: { background: "rgba(201, 148, 58, 0.12)" },
  bubbleMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    color: "var(--selen-text3-oncard)",
    fontSize: 11,
    marginBottom: 8,
  },
  bubbleText: {
    whiteSpace: "pre-wrap",
    margin: 0,
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  input: {
    width: "100%",
    minHeight: 40,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(120, 90, 50, 0.32)",
    background: "#f7ecd8",
    color: "#3b281b",
    padding: "0 12px",
    fontSize: 13,
    boxSizing: "border-box",
  },
  field: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    marginBottom: 10,
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  compactGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 10,
  },
  notes: { display: "grid", gap: 10 },
  note: {
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    padding: 10,
  },
  noteText: {
    whiteSpace: "pre-wrap",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  },
  noteMeta: {
    color: "var(--selen-text3-oncard)",
    fontSize: 11,
    margin: "8px 0 0",
  },
  muted: { color: "var(--selen-text2-oncard)", fontSize: 13, lineHeight: 1.6 },
  notice: {
    marginBottom: 14,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
  },
  error: {
    marginBottom: 14,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    background: "var(--selen-danger-bg)",
    color: "var(--selen-danger)",
    fontSize: 13,
  },
};
