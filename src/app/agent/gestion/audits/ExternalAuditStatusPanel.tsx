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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [liveGoogleStatus, setLiveGoogleStatus] = useState(googleStatus);
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

  async function testGoogleConfig() {
    setBusy("google-status");
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/gestion/google-calendar/status");
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Test Google impossible.");
      return;
    }
    setLiveGoogleStatus(result as GoogleStatus);
    setNotice(
      result.configured
        ? "Configuration Google Calendar presente."
        : "Configuration Google Calendar incomplete.",
    );
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
        {previewOpen ? (
          <div style={s.previewBox}>
            <span style={s.label}>Apercu du mail qui sera envoye</span>
            <strong>{subject}</strong>
            <pre style={s.pre}>{bodyText}</pre>
          </div>
        ) : null}
        <div style={s.actions}>
          <SelenButton
            type="button"
            variant="ghost"
            onClick={() => setPreviewOpen((current) => !current)}
          >
            {previewOpen ? "Masquer le mail" : "Previsualiser le mail"}
          </SelenButton>
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
        <SelenCardTitle>Rappel Lil veille a 20h</SelenCardTitle>
        <div style={s.grid}>
          <Info label="Statut" value={audit.reminder_email_sent_at ? "Envoye" : "Non envoye"} />
          <Info label="Date d'envoi" value={formatDate(audit.reminder_email_sent_at)} />
        </div>
        <p style={s.muted}>
          Le rappel automatique necessite un cron Vercel configure a 20h. Les
          crons Vercel utilisent l'UTC : 20h France correspond a 18h UTC en ete
          et 19h UTC en hiver.
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

      <SelenCard>
        <SelenCardTitle>Google Calendar Studio</SelenCardTitle>
        {!liveGoogleStatus.configured ? (
          <p style={s.warning}>
            Configuration Google Calendar absente dans Selen Studio. Ajoutez
            GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
            GOOGLE_CALENDAR_ID et GOOGLE_CALENDAR_TIMEZONE dans .env.local et
            dans Vercel.
          </p>
        ) : null}
        <div style={s.grid}>
          <Info
            label="Configuration"
            value={liveGoogleStatus.configured ? "Presente" : "Incomplete"}
          />
          <Info label="Variables manquantes" value={liveGoogleStatus.missing.join(", ") || "-"} />
          <Info label="Calendar ID" value={liveGoogleStatus.calendarId || "-"} />
          <Info label="Timezone" value={liveGoogleStatus.timezone || "-"} />
          <Info label="Google event" value={audit.google_calendar_event_id || "-"} />
        </div>
        <div style={s.actions}>
          <SelenButton
            type="button"
            variant="ghost"
            disabled={busy === "google-status"}
            onClick={() => void testGoogleConfig()}
          >
            Tester configuration Google
          </SelenButton>
          <SelenButton
            type="button"
            variant="secondary"
            disabled={busy === "calendar"}
            onClick={() => void createCalendar()}
          >
            Creer evenement Google
          </SelenButton>
        </div>
      </SelenCard>
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
  label: {
    display: "block",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--selen-text3-oncard)",
    marginBottom: 4,
  },
  previewBox: {
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-text-oncard)",
    marginBottom: 12,
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
  pre: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(10, 8, 6, 0.32)",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.55,
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
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
