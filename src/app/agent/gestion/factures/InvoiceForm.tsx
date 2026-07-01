"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { LilBillingProfile, LilInvoiceRow } from "@/lib/server/lilInvoices";
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
  const reference = auditReference(audit);
  const auditAmount = metadataCents(audit, "audit_amount_cents");
  const travel =
    metadataCents(audit, "travel_expense_cents") ||
    metadataCents(audit, "travel_expenses_cents");

  if (isIcpfAudit(audit)) {
    const lines: LilInvoiceLine[] = [
      {
        label: `Audit ICPF - ${audit.audit_date} - Ref. ${reference}`,
        details: audit.of_name,
        quantity: 1,
        unitAmountCents: auditAmount,
        totalAmountCents: auditAmount,
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

  if (isCertifopacAudit(audit) && (auditAmount > 0 || travel > 0)) {
    const amount = auditAmount > 0 ? auditAmount : CERTIFOPAC_AUDIT_AMOUNT_CENTS;
    const lines: LilInvoiceLine[] = [
      {
        label: `Prestation d'audit Certifopac - Ref. ${reference}`,
        details: `${audit.audit_type} - ${audit.audit_date}`,
        quantity: 1,
        unitAmountCents: amount,
        totalAmountCents: amount,
      },
    ];
    if (travel > 0) {
      lines.push({
        label: `Frais de deplacement - Ref. ${reference}`,
        details: audit.audit_date,
        quantity: 1,
        unitAmountCents: travel,
        totalAmountCents: travel,
      });
    }
    return lines;
  }

  const amount = isCertifopacAudit(audit)
    ? CERTIFOPAC_AUDIT_AMOUNT_CENTS
    : auditAmount ||
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
  const locked = Boolean(invoice && !["draft", "generated"].includes(invoice.status));
  const canDelete = Boolean(invoice && ["draft", "generated"].includes(invoice.status));
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<LilBillingProfile[]>([]);
  const [invoiceType, setInvoiceType] = useState<LilInvoiceType>(
    invoice?.invoice_type || "certifopac_single_audit",
  );
  const [recipientName, setRecipientName] = useState(invoice?.recipient_name ?? "");
  const [recipientEmail, setRecipientEmail] = useState(invoice?.recipient_email ?? "");
  const [recipientAddress, setRecipientAddress] = useState(invoice?.recipient_address ?? "");
  const [clientLegalForm, setClientLegalForm] = useState(
    typeof invoice?.metadata?.client_legal_form === "string"
      ? invoice.metadata.client_legal_form
      : "",
  );
  const [clientSirenSiret, setClientSirenSiret] = useState(
    typeof invoice?.metadata?.client_siren_siret === "string"
      ? invoice.metadata.client_siren_siret
      : "",
  );
  const [clientVatNumber, setClientVatNumber] = useState(
    typeof invoice?.metadata?.client_vat_number === "string"
      ? invoice.metadata.client_vat_number
      : "",
  );
  const [clientPostalCode, setClientPostalCode] = useState(
    typeof invoice?.metadata?.client_postal_code === "string"
      ? invoice.metadata.client_postal_code
      : "",
  );
  const [clientCity, setClientCity] = useState(
    typeof invoice?.metadata?.client_city === "string" ? invoice.metadata.client_city : "",
  );
  const [clientPhone, setClientPhone] = useState(
    typeof invoice?.metadata?.client_phone === "string" ? invoice.metadata.client_phone : "",
  );
  const [paymentTerms, setPaymentTerms] = useState(
    typeof invoice?.metadata?.payment_terms === "string" ? invoice.metadata.payment_terms : "",
  );
  const [selectedAuditIds, setSelectedAuditIds] = useState<string[]>(
    invoice?.linked_audit_ids || [],
  );
  const [lines, setLines] = useState<LilInvoiceLine[]>(invoiceLines(invoice));

  useEffect(() => {
    fetch("/agent/api/gestion/invoices/profiles")
      .then((response) => response.json())
      .then((result) => setProfiles(result.profiles ?? []))
      .catch(() => undefined);
  }, []);

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
      if (recipient) setRecipientName(recipient);
    }
    scheduleAutosave();
  }

  function applyProfile(name: string) {
    setRecipientName(name);
    const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
    const profile = profiles.find(
      (item) => item.normalized_name === normalized || item.name.trim().toLowerCase() === normalized,
    );
    if (!profile) return;
    setClientLegalForm(profile.legal_form ?? "");
    setRecipientEmail(profile.email ?? "");
    setRecipientAddress(profile.address ?? "");
    setClientPostalCode(profile.postal_code ?? "");
    setClientCity(profile.city ?? "");
    setClientSirenSiret(profile.siren_siret ?? "");
    setClientVatNumber(profile.vat_number ?? "");
    setClientPhone(profile.phone ?? "");
    setPaymentTerms(profile.default_payment_terms ?? "");
    scheduleAutosave();
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
    scheduleAutosave();
  }

  function scheduleAutosave() {
    if (!invoice?.id || locked) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState("Sauvegarde...");
    autosaveTimer.current = setTimeout(() => {
      if (formRef.current) void submit(new FormData(formRef.current), "save_draft", true);
    }, 900);
  }

  async function submit(
    formData: FormData,
    action: "save_draft" | "generate_pdf",
    autosave = false,
  ) {
    setBusy(action);
    if (!autosave) setNotice("");
    setError("");
    const payload = {
      action,
      id: invoice?.id,
      invoiceType,
      invoiceDate: formData.get("invoiceDate"),
      recipientName: formData.get("recipientName"),
      recipientAddress: formData.get("recipientAddress"),
      recipientEmail: formData.get("recipientEmail"),
      clientLegalForm: formData.get("clientLegalForm"),
      clientSirenSiret: formData.get("clientSirenSiret"),
      clientVatNumber: formData.get("clientVatNumber"),
      clientPhone: formData.get("clientPhone"),
      clientPostalCode: formData.get("clientPostalCode"),
      clientCity: formData.get("clientCity"),
      paymentTerms: formData.get("paymentTerms"),
      auditReference: formData.get("auditReference"),
      dueDate: formData.get("dueDate"),
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
      if (autosave) setSaveState("Erreur de sauvegarde");
      return;
    }
    if (autosave) {
      setSaveState("Sauvegarde OK");
      router.refresh();
      return;
    }
    setNotice(
      action === "generate_pdf"
        ? "PDF genere. Aucun email n'a ete envoye."
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

  async function deleteInvoice() {
    if (!invoice?.id) return;
    const confirmed = window.confirm(
      "Supprimer definitivement cette facture test ? Les audits lies seront liberes si cette facture les avait archives.",
    );
    if (!confirmed) return;
    setBusy("delete");
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        id: invoice.id,
        invoiceType,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Suppression impossible.");
      return;
    }
    router.push("/agent/gestion/factures");
  }

  async function invoiceAction(action: "mark_deposited" | "mark_paid") {
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
    if (action === "mark_deposited") {
      setNotice("Facture marquee deposee sur la plateforme.");
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

      <form
        ref={formRef}
        style={s.form}
        onChange={() => scheduleAutosave()}
        onInput={() => scheduleAutosave()}
      >
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
        <label style={s.field}>
          <span>Destinataire</span>
          <input
            name="recipientName"
            list="billing-profiles"
            value={recipientName}
            onChange={(event) => applyProfile(event.target.value)}
            style={s.input}
            disabled={locked}
          />
          <datalist id="billing-profiles">
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.name} />
            ))}
          </datalist>
        </label>
        <label style={s.field}>
          <span>Email destinataire</span>
          <input
            name="recipientEmail"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            style={s.input}
            disabled={locked}
          />
        </label>
        <label style={s.field}>
          <span>Forme juridique client</span>
          <input
            name="clientLegalForm"
            value={clientLegalForm}
            onChange={(event) => setClientLegalForm(event.target.value)}
            style={s.input}
            disabled={locked}
          />
        </label>
        <label style={s.field}>
          <span>SIREN/SIRET client</span>
          <input
            name="clientSirenSiret"
            value={clientSirenSiret}
            onChange={(event) => setClientSirenSiret(event.target.value)}
            style={s.input}
            disabled={locked}
          />
        </label>
        <label style={s.field}>
          <span>TVA intracommunautaire</span>
          <input
            name="clientVatNumber"
            value={clientVatNumber}
            onChange={(event) => setClientVatNumber(event.target.value)}
            style={s.input}
            disabled={locked}
          />
        </label>
        <label style={s.field}>
          <span>Telephone client</span>
          <input
            name="clientPhone"
            value={clientPhone}
            onChange={(event) => setClientPhone(event.target.value)}
            style={s.input}
            disabled={locked}
          />
        </label>
        <label style={s.fieldFull}>
          <span>Adresse de facturation</span>
          <textarea
            name="recipientAddress"
            value={recipientAddress}
            onChange={(event) => setRecipientAddress(event.target.value)}
            style={{ ...s.input, minHeight: 78, paddingTop: 10 }}
            disabled={locked}
          />
        </label>
        <details style={s.fieldFull}>
          <summary style={s.summary}>Code postal et ville pour autocompletion</summary>
          <div style={s.compactGrid}>
            <label style={s.field}>
              <span>Code postal client</span>
              <input
                name="clientPostalCode"
                value={clientPostalCode}
                onChange={(event) => setClientPostalCode(event.target.value)}
                style={s.input}
                disabled={locked}
              />
            </label>
            <label style={s.field}>
              <span>Ville client</span>
              <input
                name="clientCity"
                value={clientCity}
                onChange={(event) => setClientCity(event.target.value)}
                style={s.input}
                disabled={locked}
              />
            </label>
          </div>
        </details>
        <Field
          label="Reference audit"
          name="auditReference"
          defaultValue={
            typeof invoice?.metadata?.audit_reference === "string" ? invoice.metadata.audit_reference : ""
          }
          disabled={locked}
        />
        <Field
          label="Date echeance"
          name="dueDate"
          type="date"
          defaultValue={typeof invoice?.metadata?.due_date === "string" ? invoice.metadata.due_date : ""}
          disabled={locked}
        />
        <label style={s.fieldFull}>
          <span>Conditions paiement facture</span>
          <input
            name="paymentTerms"
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
            style={s.input}
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
        {saveState ? <div style={s.saveState}>{saveState}</div> : null}
        {!locked ? (
          <div style={s.actionsFull}>
            {!invoice?.id ? (
              <SelenButton
                type="button"
                variant="ghost"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (formRef.current) void submit(new FormData(formRef.current), "save_draft");
                }}
              >
                {busy === "save_draft" ? "Enregistrement..." : "Enregistrer brouillon"}
              </SelenButton>
            ) : null}
            <SelenButton
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                if (formRef.current) void submit(new FormData(formRef.current), "generate_pdf");
              }}
            >
              {busy === "generate_pdf" ? "Generation..." : "Generer PDF"}
            </SelenButton>
            {canDelete ? (
              <SelenButton
                type="button"
                variant="danger"
                disabled={Boolean(busy)}
                onClick={() => void deleteInvoice()}
              >
                {busy === "delete" ? "Suppression..." : "Supprimer facture test"}
              </SelenButton>
            ) : null}
          </div>
        ) : invoice?.status === "generated" || invoice?.status === "deposited" ? (
          <div style={s.actionsFull}>
            {invoice?.pdf_url ? (
              <a href={invoice.pdf_url} download style={s.actionLink}>
                Telecharger PDF
              </a>
            ) : null}
            {invoice.status === "generated" ? (
              <SelenButton
                type="button"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => void invoiceAction("mark_deposited")}
              >
                {busy === "mark_deposited" ? "Mise a jour..." : "Marquer deposee plateforme"}
              </SelenButton>
            ) : null}
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
  summary: { cursor: "pointer", color: "var(--selen-text2)", fontSize: 12 },
  compactGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 8,
  },
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
  saveState: { gridColumn: "1 / -1", color: "var(--selen-text2)", fontSize: 12 },
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
