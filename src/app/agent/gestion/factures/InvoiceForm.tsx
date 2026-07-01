"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { LilInvoiceRow } from "@/lib/server/lilInvoices";
import {
  CERTIFOPAC_AUDIT_AMOUNT_CENTS,
  INVOICE_TYPES,
  centsToEuros,
  eurosToCents,
  type LilInvoiceLine,
  type LilInvoiceType,
} from "@/lib/lilInvoiceShared";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

function metadataText(audit: ExternalAuditRow, key: string) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataCents(audit: ExternalAuditRow, key: string) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") return eurosToCents(value) ?? 0;
  return 0;
}

function auditLabel(audit: ExternalAuditRow) {
  return `${audit.of_name} - ${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(`${audit.audit_date}T12:00:00`))}`;
}

function isCertifopacAudit(audit: ExternalAuditRow) {
  const haystack = [
    audit.certifier,
    metadataText(audit, "order_giver"),
    metadataText(audit, "donneur_ordre"),
    metadataText(audit, "principal"),
    metadataText(audit, "client_name"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("certifopac");
}

function isIcpfAudit(audit: ExternalAuditRow) {
  return String(audit.certifier ?? "").toLowerCase().includes("icpf");
}

function auditReference(audit: ExternalAuditRow) {
  return metadataText(audit, "audit_reference") || audit.id.slice(0, 8);
}

function lineFromAudit(audit: ExternalAuditRow): LilInvoiceLine[] {
  if (isIcpfAudit(audit)) {
    const amount = metadataCents(audit, "audit_amount_cents");
    const travel = metadataCents(audit, "travel_expense_cents");
    const reference = auditReference(audit);
    const lines: LilInvoiceLine[] = [
      {
        label: `Audit ICPF - ${audit.audit_date} - Ref. ${reference}`,
        details: audit.of_name,
        quantity: 1,
        unitAmountCents: amount,
        totalAmountCents: amount,
      },
    ];
    if (travel > 0) {
      lines.push({
        label: `Frais de deplacement - ${audit.audit_date} - Ref. ${reference}`,
        details: audit.of_name,
        quantity: 1,
        unitAmountCents: travel,
        totalAmountCents: travel,
      });
    }
    return lines;
  }

  const amount = isCertifopacAudit(audit)
    ? CERTIFOPAC_AUDIT_AMOUNT_CENTS
    : metadataCents(audit, "audit_amount_cents") ||
      eurosToCents(metadataText(audit, "invoice_amount") || metadataText(audit, "fee_amount")) ||
      0;
  return [{
    label: `Audit Qualiopi - ${audit.of_name}`,
    details: `${audit.audit_type} - ${audit.audit_date}`,
    quantity: 1,
    unitAmountCents: amount,
    totalAmountCents: amount,
  }];
}

function emptyLine(): LilInvoiceLine {
  return { label: "", details: "", quantity: 1, unitAmountCents: 0, totalAmountCents: 0 };
}

function invoiceLines(invoice?: LilInvoiceRow | null) {
  return invoice?.lines?.length ? invoice.lines : [emptyLine()];
}

function euroValue(cents: number) {
  return cents ? String((cents / 100).toFixed(2)).replace(".", ",") : "";
}

export default function InvoiceForm({
  invoice,
  audits,
}: {
  invoice?: LilInvoiceRow | null;
  audits: ExternalAuditRow[];
}) {
  const router = useRouter();
  const locked = Boolean(invoice && invoice.status !== "draft");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [invoiceType, setInvoiceType] = useState<LilInvoiceType>(
    invoice?.invoice_type || "certifopac_single_audit",
  );
  const [selectedAuditIds, setSelectedAuditIds] = useState<string[]>(
    invoice?.linked_audit_ids || [],
  );
  const [lines, setLines] = useState<LilInvoiceLine[]>(invoiceLines(invoice));

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const unit = Number(line.unitAmountCents) || 0;
      const qty = Number(line.quantity) || 1;
      return sum + Math.round(unit * qty);
    }, 0);
    return { subtotal, total: subtotal };
  }, [lines]);

  function applyAuditSelection(nextIds: string[]) {
    setSelectedAuditIds(nextIds);
    if (invoiceType === "manual") return;
    const selectedAudits = audits.filter((audit) => nextIds.includes(audit.id));
    const nextLines = selectedAudits.flatMap(lineFromAudit);
    setLines(nextLines.length ? nextLines : [emptyLine()]);
    if (!invoice?.recipient_name && selectedAudits[0]) {
      const first = selectedAudits[0];
      const recipient = first.certifier || "";
      const field = document.querySelector<HTMLInputElement>("[name='recipientName']");
      if (field && recipient) field.value = recipient;
    }
  }

  function updateLine(index: number, patch: Partial<LilInvoiceLine>) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        next.totalAmountCents = Math.round((Number(next.quantity) || 1) * (Number(next.unitAmountCents) || 0));
        return next;
      }),
    );
  }

  async function submit(formData: FormData, action: "save_draft" | "issue") {
    setBusy(action);
    setNotice("");
    setError("");
    const payload = {
      action,
      id: invoice?.id,
      invoiceType,
      invoiceDate: formData.get("invoiceDate"),
      recipientName: formData.get("recipientName"),
      recipientAddress: formData.get("recipientAddress"),
      recipientEmail: formData.get("recipientEmail"),
      notes: formData.get("notes"),
      linkedAuditIds: selectedAuditIds,
      lines,
    };
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return;
    }
    setNotice(
      action === "issue"
        ? result.email?.sent
          ? `Facture generee et envoyee a ${result.email.to}.`
          : result.email?.error ?? "Facture generee, email non envoye."
        : "Brouillon enregistre.",
    );
    if (!invoice?.id && result.invoice?.id) {
      router.push(`/agent/gestion/factures/${result.invoice.id}`);
      return;
    }
    router.refresh();
  }

  async function cancelInvoice() {
    if (!invoice?.id) return;
    const confirmed = window.confirm("Annuler cette facture emise ?");
    if (!confirmed) return;
    setBusy("cancel");
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        id: invoice.id,
        invoiceType,
        lines,
        recipientName: invoice.recipient_name,
        invoiceDate: invoice.invoice_date,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Annulation impossible.");
      return;
    }
    setNotice("Facture annulee.");
    router.refresh();
  }

  async function invoiceAction(action: "send_email" | "mark_paid") {
    if (!invoice?.id) return;
    setBusy(action);
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        id: invoice.id,
        invoiceType,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return;
    }
    if (action === "send_email") {
      setNotice(
        result.email?.sent
          ? `Facture envoyee a ${result.email.to}.`
          : result.email?.error ?? "Email non envoye.",
      );
    } else {
      setNotice("Facture marquee payee.");
    }
    router.refresh();
  }

  return (
    <SelenCard>
      <div style={s.header}>
        <SelenCardTitle>{invoice ? "Facture Lil" : "Nouvelle facture"}</SelenCardTitle>
        <div style={s.actions}>
          {invoice?.pdf_url ? (
            <a href={invoice.pdf_url} target="_blank" rel="noreferrer" style={s.actionLink}>
              Ouvrir PDF
            </a>
          ) : null}
          <Link href="/agent/gestion/factures" style={s.actionLink}>
            Liste
          </Link>
        </div>
      </div>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}
      {locked ? (
        <p style={s.warning}>
          Cette facture est verrouillee. Elle ne peut plus etre modifiee dans ce
          generateur temporaire.
        </p>
      ) : null}

      <form style={s.form}>
        <label style={s.field}>
          <span>Type</span>
          <select
            value={invoiceType}
            onChange={(event) => setInvoiceType(event.target.value as LilInvoiceType)}
            style={s.input}
            disabled={locked}
          >
            {INVOICE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Date"
          name="invoiceDate"
          type="date"
          defaultValue={invoice?.invoice_date || new Date().toISOString().slice(0, 10)}
          disabled={locked}
        />
        <Field
          label="Destinataire"
          name="recipientName"
          defaultValue={invoice?.recipient_name}
          disabled={locked}
        />
        <Field
          label="Email destinataire"
          name="recipientEmail"
          defaultValue={invoice?.recipient_email}
          disabled={locked}
        />
        <label style={s.fieldFull}>
          <span>Adresse destinataire</span>
          <textarea
            name="recipientAddress"
            defaultValue={invoice?.recipient_address ?? ""}
            style={{ ...s.input, minHeight: 78, paddingTop: 10 }}
            disabled={locked}
          />
        </label>

        <div style={s.fieldFull}>
          <span style={s.label}>Audits lies</span>
          <div style={s.auditList}>
            {audits.map((audit) => {
              const checked = selectedAuditIds.includes(audit.id);
              return (
                <label key={audit.id} style={s.auditItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selectedAuditIds, audit.id]
                        : selectedAuditIds.filter((id) => id !== audit.id);
                      applyAuditSelection(next);
                    }}
                  />
                  <span>{auditLabel(audit)}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={s.fieldFull}>
          <span style={s.label}>Lignes</span>
          <div style={s.lines}>
            {lines.map((line, index) => (
              <div key={index} style={s.line}>
                <input
                  value={line.label}
                  onChange={(event) => updateLine(index, { label: event.target.value })}
                  placeholder="Designation"
                  style={s.input}
                  disabled={locked}
                />
                <input
                  value={line.details || ""}
                  onChange={(event) => updateLine(index, { details: event.target.value })}
                  placeholder="Details"
                  style={s.input}
                  disabled={locked}
                />
                <input
                  value={line.quantity}
                  type="number"
                  min="1"
                  onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                  style={s.input}
                  disabled={locked}
                />
                <input
                  value={euroValue(line.unitAmountCents)}
                  onChange={(event) => {
                    const cents = eurosToCents(event.target.value) ?? 0;
                    updateLine(index, { unitAmountCents: cents });
                  }}
                  placeholder="Montant HT"
                  style={s.input}
                  disabled={locked}
                />
              </div>
            ))}
          </div>
          {!locked ? (
            <SelenButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              Ajouter ligne
            </SelenButton>
          ) : null}
        </div>

        <label style={s.fieldFull}>
          <span>Notes internes</span>
          <textarea
            name="notes"
            defaultValue={
              typeof invoice?.metadata?.notes === "string" ? invoice.metadata.notes : ""
            }
            style={{ ...s.input, minHeight: 76, paddingTop: 10 }}
            disabled={locked}
          />
        </label>
        <div style={s.totalBox}>
          <span>Total HT</span>
          <strong>{centsToEuros(totals.total)}</strong>
        </div>
        {!locked ? (
          <div style={s.actionsFull}>
            <SelenButton
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => {
                const form = document.querySelector("form");
                if (form) void submit(new FormData(form), "save_draft");
              }}
            >
              {busy === "save_draft" ? "Enregistrement..." : "Enregistrer brouillon"}
            </SelenButton>
            <SelenButton
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                const form = document.querySelector("form");
                if (form) void submit(new FormData(form), "issue");
              }}
            >
              {busy === "issue" ? "Generation..." : "Generer PDF et envoyer"}
            </SelenButton>
          </div>
        ) : invoice?.status === "issued" || invoice?.status === "sent" ? (
          <div style={s.actionsFull}>
            <SelenButton
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => void invoiceAction("send_email")}
            >
              {busy === "send_email" ? "Envoi..." : "Envoyer / renvoyer email"}
            </SelenButton>
            <SelenButton
              type="button"
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() => void invoiceAction("mark_paid")}
            >
              {busy === "mark_paid" ? "Mise a jour..." : "Marquer payee"}
            </SelenButton>
            <SelenButton
              type="button"
              variant="danger"
              disabled={Boolean(busy)}
              onClick={() => void cancelInvoice()}
            >
              {busy === "cancel" ? "Annulation..." : "Annuler la facture"}
            </SelenButton>
          </div>
        ) : null}
      </form>
    </SelenCard>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        style={s.input}
        disabled={disabled}
      />
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  field: { display: "grid", gap: 6, color: "var(--selen-text2)", fontSize: 12 },
  fieldFull: { gridColumn: "1 / -1", display: "grid", gap: 6, color: "var(--selen-text2)", fontSize: 12 },
  label: { color: "var(--selen-text2)", fontSize: 12 },
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
  auditList: { display: "grid", gap: 6, maxHeight: 210, overflow: "auto" },
  auditItem: { display: "flex", gap: 8, alignItems: "center" },
  lines: { display: "grid", gap: 8 },
  line: { display: "grid", gridTemplateColumns: "1.2fr 1fr 80px 120px", gap: 8 },
  totalBox: {
    gridColumn: "1 / -1",
    display: "flex",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-text)",
  },
  actionsFull: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 34,
    padding: "0 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-gold2)",
    textDecoration: "none",
    fontSize: 12,
  },
  notice: { padding: 10, borderRadius: "var(--radius-sm)", background: "var(--selen-success-bg)", color: "var(--selen-success)", marginBottom: 12 },
  error: { padding: 10, borderRadius: "var(--radius-sm)", background: "var(--selen-danger-bg)", color: "var(--selen-danger)", marginBottom: 12 },
  warning: { color: "var(--selen-gold2)", fontSize: 13 },
};
