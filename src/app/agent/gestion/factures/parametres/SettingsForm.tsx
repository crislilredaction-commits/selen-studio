"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import type {
  LilInvoiceSequenceState,
  LilInvoiceSettings,
} from "@/lib/server/lilInvoices";

function euroValue(cents: number) {
  return String((cents / 100).toFixed(2)).replace(".", ",");
}

export default function SettingsForm({
  settings,
  sequenceState,
}: {
  settings: LilInvoiceSettings;
  sequenceState: LilInvoiceSequenceState;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sequenceBusy, setSequenceBusy] = useState(false);
  const [sequenceNotice, setSequenceNotice] = useState("");
  const [sequenceError, setSequenceError] = useState("");
  const [nextNumber, setNextNumber] = useState(String(sequenceState.nextNumber));
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

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

  async function adjustSequence() {
    setSequenceBusy(true);
    setSequenceNotice("Verification et enregistrement...");
    setSequenceError("");
    const response = await fetch("/agent/api/gestion/invoices/sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nextNumber: Number(nextNumber),
        expectedCurrentNextNumber: sequenceState.nextNumber,
        reason,
        confirmed,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSequenceBusy(false);
    if (!response.ok) {
      setSequenceNotice("");
      setSequenceError(result.error ?? "Ajustement impossible.");
      return;
    }
    setSequenceNotice(
      result.sequence?.adjusted
        ? "Compteur ajuste et trace dans l'historique."
        : "Compteur deja coherent, aucune modification effectuee.",
    );
    router.refresh();
  }

  return (
    <>
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
      <SelenCard>
        <SelenCardTitle>Numerotation des factures</SelenCardTitle>
        <p style={s.sequenceHelp}>
          Dernier numero reserve : F{String(sequenceState.lastNumber).padStart(6, "0")}.
          Le prochain numero est F{String(sequenceState.nextNumber).padStart(6, "0")}.
          Le dernier numero encore attribue a une facture est F
          {String(sequenceState.maxAssignedSequence).padStart(6, "0")}.
        </p>
        <p style={s.sequenceHelp}>
          Ce reglage peut uniquement fermer un ecart final non attribue. Il refuse un numero
          deja utilise, toute avance creant un trou et toute modification concurrente.
        </p>
        {sequenceState.canCloseTrailingGap ? (
          <div style={s.sequenceForm}>
            <label style={s.field}>
              <span>Prochain numero</span>
              <input
                type="number"
                min={sequenceState.minimumSafeNextNumber}
                max={sequenceState.nextNumber}
                value={nextNumber}
                onChange={(event) => setNextNumber(event.target.value)}
                style={s.input}
              />
            </label>
            <label style={s.fieldFull}>
              <span>Motif de l&apos;ajustement</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex : suppression d'un brouillon jamais emis"
                style={s.input}
              />
            </label>
            <label style={s.confirmation}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Je confirme qu&apos;aucune facture emise ne porte le numero demande.
              </span>
            </label>
            <div style={s.actions}>
              <SelenButton
                type="button"
                variant="secondary"
                disabled={sequenceBusy || !confirmed || reason.trim().length < 8}
                onClick={() => void adjustSequence()}
              >
                {sequenceBusy ? "Verification..." : "Ajuster le prochain numero"}
              </SelenButton>
            </div>
          </div>
        ) : (
          <p style={s.sequenceOk}>
            Compteur coherent : aucun ecart final a corriger. La valeur reste consultable mais
            ne doit pas etre modifiee.
          </p>
        )}
        {sequenceNotice ? <div style={s.notice}>{sequenceNotice}</div> : null}
        {sequenceError ? <div style={s.error}>Erreur : {sequenceError}</div> : null}
      </SelenCard>
    </>
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
  sequenceHelp: { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.6 },
  sequenceForm: { display: "grid", gap: 12, marginTop: 12 },
  confirmation: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    color: "var(--selen-text2)",
    fontSize: 12,
  },
  sequenceOk: {
    padding: 10,
    borderRadius: "var(--radius-sm)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
  },
  notice: { padding: 10, borderRadius: "var(--radius-sm)", background: "var(--selen-success-bg)", color: "var(--selen-success)", marginBottom: 12 },
  error: { padding: 10, borderRadius: "var(--radius-sm)", background: "var(--selen-danger-bg)", color: "var(--selen-danger)", marginBottom: 12 },
};
