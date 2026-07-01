"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { LilInvoiceSettings } from "@/lib/server/lilInvoices";

function euroValue(cents: number) {
  return String((cents / 100).toFixed(2)).replace(".", ",");
}

export default function SettingsForm({ settings }: { settings: LilInvoiceSettings }) {
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setNotice("Sauvegarde...");
    autosaveTimer.current = setTimeout(() => {
      if (formRef.current) void save(new FormData(formRef.current));
    }, 900);
  }

  async function save(formData: FormData) {
    setBusy(true);
    setNotice("Sauvegarde...");
    setError("");
    const response = await fetch("/agent/api/gestion/invoices/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "Sauvegarde impossible.");
      return;
    }
    setNotice("Sauvegarde OK.");
  }

  return (
    <SelenCard>
      <SelenCardTitle>Parametres de facturation Lil</SelenCardTitle>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}
      <form
        ref={formRef}
        action={(formData) => void save(formData)}
        style={s.form}
        onChange={() => scheduleAutosave()}
        onInput={() => scheduleAutosave()}
      >
        <Field label="Nom ou raison sociale" name="businessName" defaultValue={settings.business_name} />
        <Field label="Forme juridique" name="legalForm" defaultValue={settings.legal_form} />
        <Field label="Activite" name="activity" defaultValue={settings.activity} />
        <Field label="SIREN/SIRET" name="sirenSiret" defaultValue={settings.siren_siret} />
        <Field label="Dispense RCS/RM" name="rcsRmExemption" defaultValue={settings.rcs_rm_exemption} />
        <Field label="Code postal" name="postalCode" defaultValue={settings.postal_code} />
        <Field label="Ville" name="city" defaultValue={settings.city} />
        <Field label="Telephone" name="phone" defaultValue={settings.phone} />
        <Field label="Email" name="email" defaultValue={settings.email} />
        <Field label="Email PayPal" name="paypalEmail" defaultValue={settings.paypal_email} />
        <Field label="IBAN" name="iban" defaultValue={settings.iban} />
        <Field label="BIC" name="bic" defaultValue={settings.bic} />
        <Field label="Statut TVA" name="vatStatus" defaultValue={settings.vat_status} />
        <Field label="Penalites de retard" name="latePenaltyRate" defaultValue={settings.late_penalty_rate} />
        <Field label="Indemnite recouvrement" name="recoveryFee" defaultValue={euroValue(settings.recovery_fee_cents)} />
        <Field label="Conditions paiement" name="paymentTerms" defaultValue={settings.payment_terms} />
        <label style={s.fieldFull}>
          <span>Adresse</span>
          <textarea
            name="address"
            defaultValue={settings.address ?? ""}
            style={{ ...s.input, minHeight: 88, paddingTop: 10 }}
          />
        </label>
        <label style={s.fieldFull}>
          <span>Mentions legales</span>
          <textarea
            name="legalMentions"
            defaultValue={settings.legal_mentions ?? ""}
            style={{ ...s.input, minHeight: 96, paddingTop: 10 }}
          />
        </label>
        <div style={s.actions}>
          <span style={s.saveState}>{busy ? "Sauvegarde..." : notice || "Sauvegarde automatique"}</span>
        </div>
      </form>
    </SelenCard>
  );
}

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <input name={name} defaultValue={defaultValue ?? ""} style={s.input} />
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  field: { display: "grid", gap: 6, color: "var(--selen-text2)", fontSize: 12 },
  fieldFull: { gridColumn: "1 / -1", display: "grid", gap: 6, color: "var(--selen-text2)", fontSize: 12 },
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
  actions: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" },
  saveState: { color: "var(--selen-text2)", fontSize: 12 },
  notice: { padding: 10, borderRadius: "var(--radius-sm)", background: "var(--selen-success-bg)", color: "var(--selen-success)", marginBottom: 12 },
  error: { padding: 10, borderRadius: "var(--radius-sm)", background: "var(--selen-danger-bg)", color: "var(--selen-danger)", marginBottom: 12 },
};
