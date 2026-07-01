"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

type ConfirmationEmailPreview = {
  to: string;
  subject: string;
  bodyText: string;
  modelSubject: string;
  modelBodyText: string;
  hasDraft: boolean;
};

type GoogleStatus = {
  configured: boolean;
  missing: string[];
  calendarId: string | null;
  timezone: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metadataText(audit: ExternalAuditRow, key: string) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function meetLink(audit: ExternalAuditRow) {
  return audit.google_meet_link || metadataText(audit, "meet_link");
}

export default function ExternalAuditStatusPanel({
  audit,
  confirmationEmail,
  googleStatus,
}: {
  audit: ExternalAuditRow;
  confirmationEmail: ConfirmationEmailPreview;
  googleStatus: GoogleStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(confirmationEmail.subject);
  const [bodyText, setBodyText] = useState(confirmationEmail.bodyText);
  const [hasDraft, setHasDraft] = useState(confirmationEmail.hasDraft);

  async function post(url: string, body: Record<string, unknown>, action: string) {
    setBusy(action);
    setNotice("");
    setError("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return null;
    }
    return result;
  }

  async function sendConfirmation() {
    const result = await post(
      "/agent/api/gestion/audits/email-confirmation",
      { auditId: audit.id, action: "send", subject, bodyText },
      "confirmation",
    );
    if (!result) return;
    setNotice(
      result.email?.sent
        ? "Email de confirmation envoye."
        : result.email?.error ?? "Email non envoye.",
    );
    router.refresh();
  }

  async function saveDraft() {
    const result = await post(
      "/agent/api/gestion/audits/email-confirmation",
      { auditId: audit.id, action: "save_draft", subject, bodyText },
      "draft",
    );
    if (!result) return;
    setHasDraft(true);
    setNotice("Brouillon de confirmation enregistre.");
    router.refresh();
  }

  async function resetDraft() {
    const result = await post(
      "/agent/api/gestion/audits/email-confirmation",
      { auditId: audit.id, action: "reset_draft" },
      "reset",
    );
    if (!result) return;
    setSubject(confirmationEmail.modelSubject);
    setBodyText(confirmationEmail.modelBodyText);
    setHasDraft(false);
    setNotice("Modele de confirmation restaure.");
    router.refresh();
  }

  async function sendReminder() {
    const result = await post(
      "/agent/api/gestion/audits/reminder",
      { auditId: audit.id },
      "reminder",
    );
    if (!result) return;
    setNotice(
      result.email?.sent
        ? "Rappel Lil envoye."
        : result.email?.error ?? "Rappel non envoye.",
    );
    router.refresh();
  }

  async function createCalendar() {
    const result = await post(
      "/agent/api/gestion/audits/calendar",
      { auditId: audit.id },
      "calendar",
    );
    if (!result) return;
    setNotice(
      result.conflictWarning ||
        (result.calendar?.alreadyExists
          ? "Evenement deja cree."
          : result.calendar?.created
            ? "Evenement Google Calendar cree."
            : result.calendar?.error ?? "Evenement non cree."),
    );
    router.refresh();
  }

  return (
    <div style={s.stack}>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}

      <SelenCard>
        <SelenCardTitle>Mail de confirmation audit</SelenCardTitle>
        <div style={s.grid}>
          <Info label="Destinataire" value={confirmationEmail.to || "-"} />
          <Info label="Statut" value={audit.confirmation_email_sent_at ? "Envoye" : "Non envoye"} />
          <Info label="Date d'envoi" value={formatDate(audit.confirmation_email_sent_at)} />
          <Info label="Brouillon" value={hasDraft ? "Personnalise" : "Modele dynamique"} />
        </div>
        <label style={s.field}>
          <span>Objet</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            style={s.input}
          />
        </label>
        <label style={s.field}>
          <span>Corps du mail</span>
          <textarea
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            style={{ ...s.input, ...s.textarea }}
          />
        </label>
        <div style={s.actions}>
          <SelenButton
            type="button"
            variant="ghost"
            disabled={busy === "draft"}
            onClick={() => void saveDraft()}
          >
            Enregistrer brouillon
          </SelenButton>
          <SelenButton
            type="button"
            variant="ghost"
            disabled={busy === "reset"}
            onClick={() => void resetDraft()}
          >
            Reinitialiser modele
          </SelenButton>
          <SelenButton
            type="button"
            variant="secondary"
            disabled={busy === "confirmation"}
            onClick={() => void sendConfirmation()}
          >
            {audit.confirmation_email_sent_at
              ? "Renvoyer confirmation"
              : "Envoyer confirmation"}
          </SelenButton>
        </div>
      </SelenCard>

      <SelenCard>
        <SelenCardTitle>Rappels automatiques</SelenCardTitle>
        <div style={s.grid}>
          <Info
            label="Client J-1 09h"
            value={
              audit.client_reminder_sent_at || metadataText(audit, "client_reminder_sent_at")
                ? "Envoye"
                : "Non envoye"
            }
          />
          <Info
            label="Date rappel client"
            value={formatDate(
              audit.client_reminder_sent_at || metadataText(audit, "client_reminder_sent_at"),
            )}
          />
          <Info
            label="Lil J-1 20h"
            value={
              audit.lil_reminder_sent_at ||
              audit.reminder_email_sent_at ||
              metadataText(audit, "lil_reminder_sent_at")
                ? "Envoye"
                : "Non envoye"
            }
          />
          <Info
            label="Date rappel Lil"
            value={formatDate(
              audit.lil_reminder_sent_at ||
                audit.reminder_email_sent_at ||
                metadataText(audit, "lil_reminder_sent_at"),
            )}
          />
        </div>
        <p style={s.muted}>
          Le rappel client part a J-1 09h Europe/Paris. Le rappel Lil part a
          J-1 20h Europe/Paris. Le bouton manuel ci-dessous envoie uniquement
          le rappel Lil.
        </p>
        <div style={s.actions}>
          <SelenButton
            type="button"
            variant="secondary"
            disabled={busy === "reminder"}
            onClick={() => void sendReminder()}
          >
            Envoyer rappel Lil maintenant
          </SelenButton>
        </div>
      </SelenCard>

      {!audit.google_calendar_event_id ? (
        <div style={s.discreetActions}>
          {!googleStatus.configured ? (
            <span style={s.warning}>Configuration Google Calendar incomplete.</span>
          ) : null}
          <SelenButton
            type="button"
            variant="ghost"
            disabled={busy === "calendar"}
            onClick={() => void createCalendar()}
          >
            Creer l'evenement Google Calendar
          </SelenButton>
        </div>
      ) : meetLink(audit) ? (
        <div style={s.discreetActions}>
          <a href={meetLink(audit)} target="_blank" rel="noreferrer" style={s.actionLink}>
            Rejoindre Meet
          </a>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.info}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  stack: { display: "grid", gap: 14 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  info: {
    display: "grid",
    gap: 4,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  field: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    marginBottom: 12,
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
  textarea: {
    minHeight: 340,
    padding: 12,
    resize: "vertical",
    lineHeight: 1.55,
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  discreetActions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
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
  muted: { color: "var(--selen-text2-oncard)", fontSize: 13, lineHeight: 1.6 },
  warning: {
    color: "var(--selen-danger)",
    background: "var(--selen-danger-bg)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    borderRadius: "var(--radius-sm)",
    padding: 12,
    fontSize: 13,
    lineHeight: 1.5,
  },
  notice: {
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
  },
  error: {
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    background: "var(--selen-danger-bg)",
    color: "var(--selen-danger)",
    fontSize: 13,
  },
};
