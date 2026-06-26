"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

const STATUSES = [
  ["planned", "Planifie"],
  ["confirmed", "Confirme"],
  ["completed", "Termine"],
  ["cancelled", "Annule"],
];

export default function ExternalAuditForm({
  audit,
}: {
  audit?: ExternalAuditRow | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function save(formData: FormData) {
    const result = await post("/agent/api/gestion/audits", {
      id: audit?.id,
      ofName: formData.get("ofName"),
      contactName: formData.get("contactName"),
      contactEmail: formData.get("contactEmail"),
      contactPhone: formData.get("contactPhone"),
      address: formData.get("address"),
      auditType: formData.get("auditType"),
      certifier: formData.get("certifier"),
      auditDate: formData.get("auditDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      status: formData.get("status"),
      notes: formData.get("notes"),
    });
    if (!result) return;
    setNotice(result.conflictWarning || "Audit enregistre.");
    if (!audit?.id && result.audit?.id) {
      router.push(`/agent/gestion/audits/${result.audit.id}`);
      return;
    }
    router.refresh();
  }

  async function sendConfirmation() {
    if (!audit?.id) return;
    const result = await post("/agent/api/gestion/audits/email-confirmation", {
      auditId: audit.id,
    });
    if (!result) return;
    setNotice(
      result.email?.sent
        ? "Email de confirmation envoye."
        : result.email?.error ?? "Email non envoye.",
    );
    router.refresh();
  }

  async function createCalendar() {
    if (!audit?.id) return;
    const result = await post("/agent/api/gestion/audits/calendar", {
      auditId: audit.id,
    });
    if (!result) return;
    setNotice(
      result.conflictWarning ||
        (result.calendar?.created
          ? "Evenement Google Calendar cree."
          : result.calendar?.error ?? "Evenement non cree."),
    );
    router.refresh();
  }

  return (
    <SelenCard>
      <SelenCardTitle>
        {audit ? "Modifier l'audit externe" : "Nouvel audit externe"}
      </SelenCardTitle>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}
      <form action={(formData) => void save(formData)} style={s.form}>
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
        <Field label="Certificateur" name="certifier" defaultValue={audit?.certifier} />
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
        <div style={s.actions}>
          <SelenButton type="submit" disabled={busy}>
            Enregistrer
          </SelenButton>
          {audit?.id ? (
            <>
              <SelenButton
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void sendConfirmation()}
              >
                Envoyer confirmation
              </SelenButton>
              <SelenButton
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void createCalendar()}
              >
                Creer evenement Google
              </SelenButton>
            </>
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
  input: {
    width: "100%",
    minHeight: 40,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-bg2)",
    color: "var(--selen-text)",
    padding: "0 12px",
    fontSize: 13,
    boxSizing: "border-box",
  },
  actions: {
    gridColumn: "1 / -1",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
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
