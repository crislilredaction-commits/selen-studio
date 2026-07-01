"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

const STATUSES = [
  ["planned", "Planifie"],
  ["confirmed", "Confirme"],
  ["completed", "Termine"],
  ["to_invoice", "A facturer"],
  ["cancelled", "Annule"],
];

function metadataText(audit: ExternalAuditRow | null | undefined, key: string) {
  const metadata =
    audit?.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataMoney(audit: ExternalAuditRow | null | undefined, key: string) {
  const metadata =
    audit?.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const value = metadata[key];
  if (typeof value === "number" && value > 0) {
    return String((value / 100).toFixed(2)).replace(".", ",");
  }
  if (typeof value === "string") return value;
  return "";
}

export default function ExternalAuditForm({
  audit,
}: {
  audit?: ExternalAuditRow | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [busy, setBusy] = useState(false);
  const [departureMode, setDepartureMode] = useState(
    metadataText(audit, "departure_mode") || "home",
  );
  const [auditDeliveryMode, setAuditDeliveryMode] = useState(
    audit?.audit_delivery_mode || metadataText(audit, "audit_delivery_mode") || "presentiel",
  );
  const currentMeetLink = audit?.google_meet_link || metadataText(audit, "meet_link");

  async function post(url: string, body: Record<string, unknown>) {
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

  function requiredReady(formData: FormData) {
    return Boolean(
      String(formData.get("ofName") ?? "").trim() &&
        String(formData.get("auditType") ?? "").trim() &&
        String(formData.get("auditDate") ?? "").trim() &&
        String(formData.get("startTime") ?? "").trim(),
    );
  }

  function scheduleAutosave() {
    if (!audit?.id || !formRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState("Sauvegarde...");
    autosaveTimer.current = setTimeout(() => {
      if (!formRef.current) return;
      const formData = new FormData(formRef.current);
      if (requiredReady(formData)) void save(formData, true);
    }, 900);
  }

  async function save(formData: FormData, autosave = false) {
    if (!requiredReady(formData)) {
      if (autosave) setSaveState("");
      return;
    }
    const result = await post("/agent/api/gestion/audits", {
      id: audit?.id,
      ofName: formData.get("ofName"),
      contactName: formData.get("contactName"),
      contactEmail: formData.get("contactEmail"),
      contactPhone: formData.get("contactPhone"),
      address: formData.get("address"),
      auditType: formData.get("auditType"),
      auditDeliveryMode: formData.get("auditDeliveryMode"),
      certifier: formData.get("certifier"),
      auditReference: formData.get("auditReference"),
      auditAmount: formData.get("auditAmount"),
      travelExpenseAmount: formData.get("travelExpenseAmount"),
      auditDate: formData.get("auditDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      status: formData.get("status"),
      notes: formData.get("notes"),
      departureMode: formData.get("departureMode"),
      departureAddress: formData.get("departureAddress"),
      travelDurationMinutes: formData.get("travelDurationMinutes"),
      planAuditSent: formData.get("planAuditSent") === "on",
    });
    if (!result) return;
    if (autosave) {
      setSaveState("Sauvegarde OK");
      router.refresh();
      return;
    }
    setNotice(result.conflictWarning || "Audit enregistre.");
    if (!audit?.id && result.audit?.id) {
      router.push(`/agent/gestion/audits/${result.audit.id}`);
      return;
    }
    router.refresh();
  }

  async function deleteCancelledAudit() {
    if (!audit?.id) return;
    const confirmed = window.confirm(
      "Supprimer definitivement cet audit annule ? Cette action est irreversible.",
    );
    if (!confirmed) return;

    setBusy(true);
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/gestion/audits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditId: audit.id }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Suppression impossible.");
      return;
    }

    router.push("/agent/gestion/audits");
  }

  return (
    <SelenCard>
      <SelenCardTitle>
        {audit ? "Modifier l'audit externe" : "Nouvel audit externe"}
      </SelenCardTitle>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}
      <form
        ref={formRef}
        action={(formData) => void save(formData)}
        style={s.form}
        onChange={() => scheduleAutosave()}
        onInput={() => scheduleAutosave()}
      >
        <Field label="Nom de l'OF" name="ofName" defaultValue={audit?.of_name} required />
        <Field label="Contact" name="contactName" defaultValue={audit?.contact_name} />
        <Field label="Email" name="contactEmail" defaultValue={audit?.contact_email} />
        <Field label="Telephone" name="contactPhone" defaultValue={audit?.contact_phone} />
        <label style={s.field}>
          <span>Adresse</span>
          <textarea
            name="address"
            defaultValue={audit?.address ?? ""}
            style={{ ...s.input, minHeight: 84, paddingTop: 10 }}
          />
        </label>
        <Field label="Type d'audit" name="auditType" defaultValue={audit?.audit_type} required />
        <label style={s.field}>
          <span>Modalite</span>
          <select
            name="auditDeliveryMode"
            value={auditDeliveryMode}
            onChange={(event) => setAuditDeliveryMode(event.target.value)}
            style={s.input}
          >
            <option value="presentiel">Presentiel</option>
            <option value="distanciel">Distanciel</option>
          </select>
        </label>
        <label style={s.field}>
          <span>Certificateur</span>
          <select name="certifier" defaultValue={audit?.certifier ?? ""} style={s.input}>
            <option value="">A confirmer</option>
            <option value="Certifopac">Certifopac</option>
            <option value="ICPF">ICPF</option>
          </select>
        </label>
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Facturation</h3>
          <Field
            label="Reference audit"
            name="auditReference"
            defaultValue={metadataText(audit, "audit_reference")}
          />
          <Field
            label="Montant audit HT"
            name="auditAmount"
            defaultValue={metadataMoney(audit, "audit_amount_cents")}
          />
          <Field
            label="Frais de deplacement HT"
            name="travelExpenseAmount"
            defaultValue={metadataMoney(audit, "travel_expense_cents")}
          />
        </div>
        <Field label="Date" name="auditDate" type="date" defaultValue={audit?.audit_date} required />
        <Field
          label="Heure debut"
          name="startTime"
          type="time"
          defaultValue={audit?.start_time?.slice(0, 5)}
          required
        />
        <Field
          label="Heure fin"
          name="endTime"
          type="time"
          defaultValue={audit?.end_time?.slice(0, 5)}
        />
        <label style={s.field}>
          <span>Statut</span>
          <select name="status" defaultValue={audit?.status ?? "planned"} style={s.input}>
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={s.fieldFull}>
          <span>Notes</span>
          <textarea
            name="notes"
            defaultValue={
              typeof audit?.metadata?.notes === "string"
                ? audit.metadata.notes
                : ""
            }
            style={{ ...s.input, minHeight: 96, paddingTop: 10 }}
          />
        </label>
        <label style={s.checkboxRow}>
          <input
            type="checkbox"
            name="planAuditSent"
            defaultChecked={audit?.metadata?.plan_audit_sent === true}
          />
          <span>Plan d'audit envoyé</span>
        </label>
        {auditDeliveryMode === "distanciel" ? (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Visio</h3>
            <p style={s.muted}>
              Aucun trajet ni horaire de depart ne sera calcule. Un evenement
              Google Calendar avec lien Meet sera demande automatiquement.
            </p>
            {currentMeetLink ? (
              <a
                href={currentMeetLink}
                target="_blank"
                rel="noreferrer"
                style={s.actionLink}
              >
                Rejoindre Meet
              </a>
            ) : null}
          </div>
        ) : (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Départ vers l'audit</h3>
          <label style={s.field}>
            <span>Lieu de départ</span>
            <select
              name="departureMode"
              value={departureMode}
              onChange={(event) => setDepartureMode(event.target.value)}
              style={s.input}
            >
              <option value="home">🏠 Domicile (Droupt-Saint-Basle)</option>
              <option value="mother">👩 Chez maman (Abbeville)</option>
              <option value="custom">🏨 Hébergement temporaire</option>
            </select>
          </label>
          {departureMode === "custom" ? (
            <label style={s.field}>
              <span>Adresse de départ</span>
              <textarea
                name="departureAddress"
                defaultValue={metadataText(audit, "departure_address")}
                placeholder={"Exemple :\n12 rue des Tanneurs\n67000 Strasbourg"}
                style={{ ...s.input, minHeight: 84, paddingTop: 10 }}
              />
            </label>
          ) : (
            <input
              type="hidden"
              name="departureAddress"
              value={departureMode === "mother" ? "Abbeville" : "Droupt-Saint-Basle"}
            />
          )}
          <Field
            label="Temps de trajet estime (minutes)"
            name="travelDurationMinutes"
            type="number"
            defaultValue={metadataText(audit, "travel_duration_minutes")}
          />
        </div>
        )}
        <div style={s.actions}>
          {saveState ? <span style={s.saveState}>{saveState}</span> : null}
          {audit?.status === "cancelled" ? (
            <SelenButton
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void deleteCancelledAudit()}
            >
              Supprimer definitivement
            </SelenButton>
          ) : null}
          {!audit?.id ? (
            <SelenButton type="submit" disabled={busy}>
              Creer audit
            </SelenButton>
          ) : null}
        </div>
      </form>
    </SelenCard>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={s.field}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        style={s.input}
      />
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  field: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  fieldFull: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    gridColumn: "1 / -1",
  },
  section: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
  },
  sectionTitle: {
    gridColumn: "1 / -1",
    margin: 0,
    color: "var(--selen-text-oncard)",
    fontFamily: "var(--font-display)",
    fontSize: 18,
  },
  muted: {
    gridColumn: "1 / -1",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.6,
    margin: 0,
  },
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-gold2)",
    background: "rgba(201, 148, 58, 0.1)",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 700,
  },
  checkboxRow: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
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
  actions: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  saveState: {
    marginRight: "auto",
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  notice: {
    margin: "12px 0",
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
  },
  error: {
    margin: "12px 0",
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    background: "var(--selen-danger-bg)",
    color: "var(--selen-danger)",
    fontSize: 13,
  },
};
