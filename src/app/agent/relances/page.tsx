"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type ReminderStatus = "draft" | "ready" | "sent" | "ignored" | "postponed";

type ReminderRow = {
  id: string;
  client_email: string;
  client_id: string | null;
  dossier_id: string | null;
  reminder_type: string;
  status: ReminderStatus;
  subject: string;
  body_html: string;
  body_text: string;
  due_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

type ReminderEvent = {
  id: string;
  reminder_id: string;
  event_type: string;
  agent_email: string | null;
  subject: string | null;
  body_text: string | null;
  created_at: string;
};

const STATUS_FILTERS = [
  { value: "active", label: "À traiter" },
  { value: "ready", label: "Prêtes" },
  { value: "draft", label: "Brouillons" },
  { value: "postponed", label: "Reportées" },
  { value: "sent", label: "Envoyées" },
  { value: "ignored", label: "Ignorées" },
  { value: "all", label: "Toutes" },
];

function formatType(type: string) {
  const labels: Record<string, string> = {
    preaudit_incomplete_15_days: "Préaudit incomplet",
    audit_blanc_booking_reminder_7_days: "Prise de RDV Review",
    audit_blanc_48h_reminder: "Rappel 48h Review",
    nda_inactive_9_days: "NDA inactif",
  };
  return labels[type] ?? type;
}

function statusVariant(status: ReminderStatus) {
  if (status === "sent") return "success";
  if (status === "ignored") return "neutral";
  if (status === "postponed") return "warn";
  if (status === "draft") return "status";
  return "info";
}

function formatStatus(status: ReminderStatus) {
  const labels: Record<ReminderStatus, string> = {
    draft: "Brouillon",
    ready: "Prête",
    sent: "Envoyée",
    ignored: "Ignorée",
    postponed: "Reportée",
  };
  return labels[status];
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function daysWithoutAction(row: ReminderRow) {
  const value = row.metadata?.inactive_days;
  return typeof value === "number" ? value : null;
}

function metadataText(row: ReminderRow, key: string) {
  const value = row.metadata?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function stageLabel(row: ReminderRow) {
  return metadataText(row, "current_step") || "—";
}

function expectedAction(row: ReminderRow) {
  return metadataText(row, "expected_action") || "—";
}

function reason(row: ReminderRow) {
  return metadataText(row, "reason") || "—";
}

function prestation(row: ReminderRow) {
  return (
    metadataText(row, "prestation_type") ||
    metadataText(row, "dossier_type") ||
    "—"
  );
}

export default function AgentRelancesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editing, setEditing] = useState<Record<string, ReminderRow>>({});
  const [busyId, setBusyId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [historyByReminder, setHistoryByReminder] = useState<
    Record<string, ReminderEvent[]>
  >({});
  const [openHistoryId, setOpenHistoryId] = useState("");

  const loadReminders = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("client_reminders")
      .select("*")
      .order("due_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ReminderRow[];
    setReminders(rows);
    setEditing(
      Object.fromEntries(rows.map((row) => [row.id, { ...row }])) as Record<
        string,
        ReminderRow
      >,
    );
    setLoading(false);
  }, [supabase]);

  async function loadHistory(reminderId: string) {
    if (openHistoryId === reminderId) {
      setOpenHistoryId("");
      return;
    }

    setOpenHistoryId(reminderId);

    if (historyByReminder[reminderId]) {
      return;
    }

    const { data, error: historyError } = await supabase
      .from("client_reminder_events")
      .select(
        "id, reminder_id, event_type, agent_email, subject, body_text, created_at",
      )
      .eq("reminder_id", reminderId)
      .order("created_at", { ascending: false });

    if (historyError) {
      setError(historyError.message);
      return;
    }

    setHistoryByReminder((current) => ({
      ...current,
      [reminderId]: (data ?? []) as ReminderEvent[],
    }));
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadReminders();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadReminders]);

  async function generateNow() {
    setGenerating(true);
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/reminders/generate", {
      method: "POST",
    });
    const result = await response.json();
    setGenerating(false);

    if (!response.ok) {
      setError(result.error ?? "Impossible de générer les relances.");
      return;
    }

    setNotice(`${result.result.created} relance(s) préparée(s).`);
    await loadReminders();
  }

  async function updateReminder(
    id: string,
    action: "save" | "ignore" | "postpone",
  ) {
    setBusyId(id);
    setNotice("");
    setError("");
    const row = editing[id];
    const response = await fetch("/agent/api/reminders/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reminderId: id,
        action,
        subject: row?.subject,
        bodyHtml: row?.body_html,
        bodyText: row?.body_text,
        status: row?.status,
      }),
    });
    const result = await response.json();
    setBusyId("");

    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return;
    }

    setNotice(
      action === "postpone"
        ? "Relance reportée de 7 jours."
        : action === "ignore"
          ? "Relance ignorée."
          : "Relance enregistrée.",
    );
    await loadReminders();
  }

  async function sendReminder(id: string) {
    setBusyId(id);
    setNotice("");
    setError("");
    const row = editing[id];
    const response = await fetch("/agent/api/reminders/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reminderId: id,
        subject: row?.subject,
        bodyHtml: row?.body_html,
        bodyText: row?.body_text,
      }),
    });
    const result = await response.json();
    setBusyId("");

    if (!response.ok) {
      setError(result.error ?? "Envoi impossible.");
      return;
    }

    setNotice(
      result.sent
        ? "Relance envoyée."
        : (result.error ?? "Relance validée, mais email non envoyé."),
    );
    await loadReminders();
  }

  function updateDraft(id: string, field: keyof ReminderRow, value: string) {
    setEditing((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reminders.filter((row) => {
      const activeMatch =
        statusFilter === "active"
          ? ["draft", "ready", "postponed"].includes(row.status)
          : statusFilter === "all" || row.status === statusFilter;
      const textMatch =
        !q ||
        [
          row.client_email,
          row.reminder_type,
          row.subject,
          row.dossier_id ?? "",
          metadataText(row, "reason"),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      return activeMatch && textMatch;
    });
  }, [reminders, search, statusFilter]);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Relances clients</h1>
          <p style={s.subtitle}>
            Brouillons préparés automatiquement, envoyés uniquement après
            validation agent.
          </p>
        </div>
        <SelenButton onClick={() => void generateNow()} disabled={generating}>
          {generating ? "Génération..." : "Générer maintenant"}
        </SelenButton>
      </header>

      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}

      <SelenCard>
        <SelenCardTitle>Filtres</SelenCardTitle>
        <div style={s.toolbar}>
          <input
            value={search}
            type="search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher client, dossier, raison..."
            style={s.input}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={s.input}
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </SelenCard>

      <section style={s.list}>
        {loading ? (
          <SelenCard>Chargement des relances...</SelenCard>
        ) : filtered.length === 0 ? (
          <SelenCard>Aucune relance ne correspond aux filtres.</SelenCard>
        ) : (
          filtered.map((row) => {
            const draft = editing[row.id] ?? row;
            const isBusy = busyId === row.id;
            const inactiveDays = daysWithoutAction(row);

            return (
              <SelenCard key={row.id}>
                <div style={s.rowHeader}>
                  <div>
                    <div style={s.badges}>
                      <SelenBadge variant="type" dot>
                        {formatType(row.reminder_type)}
                      </SelenBadge>
                      <SelenBadge variant={statusVariant(row.status)} dot>
                        {formatStatus(row.status)}
                      </SelenBadge>
                    </div>
                    <h2 style={s.itemTitle}>{row.client_email}</h2>
                  </div>
                  <div style={s.actions}>
                    {row.dossier_id ? (
                      <Link
                        href={`/agent/dossiers/${row.dossier_id}`}
                        style={{ textDecoration: "none" }}
                      >
                        <SelenButton type="button" size="sm" variant="ghost">
                          Voir
                        </SelenButton>
                        <SelenButton
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void loadHistory(row.id)}
                        >
                          Historique
                        </SelenButton>
                      </Link>
                    ) : null}
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isBusy || row.status === "sent"}
                      onClick={() => void updateReminder(row.id, "save")}
                    >
                      Modifier
                    </SelenButton>
                    <SelenButton
                      type="button"
                      size="sm"
                      disabled={isBusy || row.status === "sent"}
                      onClick={() => void sendReminder(row.id)}
                    >
                      Envoyer
                    </SelenButton>
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isBusy || row.status === "sent"}
                      onClick={() => void updateReminder(row.id, "ignore")}
                    >
                      Ignorer
                    </SelenButton>
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isBusy || row.status === "sent"}
                      onClick={() => void updateReminder(row.id, "postpone")}
                    >
                      Reporter 7 j
                    </SelenButton>
                  </div>
                </div>

                <div style={s.grid}>
                  <Info
                    label="Prestation"
                    value={formatType(row.reminder_type)}
                  />
                  <Info label="Dossier" value={row.dossier_id ?? "—"} mono />
                  <Info
                    label="Raison"
                    value={metadataText(row, "reason") || "—"}
                  />
                  <Info
                    label="Dernière activité"
                    value={formatDate(metadataText(row, "last_activity_at"))}
                  />
                  <Info
                    label="Jours sans action"
                    value={inactiveDays === null ? "—" : String(inactiveDays)}
                  />
                  <Info label="Échéance" value={formatDate(row.due_at)} />
                </div>

                <div style={s.editor}>
                  <label style={s.field}>
                    Sujet
                    <input
                      value={draft.subject}
                      onChange={(event) =>
                        updateDraft(row.id, "subject", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>
                  <label style={s.field}>
                    Brouillon texte
                    <textarea
                      value={draft.body_text}
                      onChange={(event) =>
                        updateDraft(row.id, "body_text", event.target.value)
                      }
                      style={{ ...s.input, minHeight: 160, paddingTop: 10 }}
                    />
                  </label>
                  <details>
                    <summary style={s.summary}>HTML envoyé</summary>
                    <textarea
                      value={draft.body_html}
                      onChange={(event) =>
                        updateDraft(row.id, "body_html", event.target.value)
                      }
                      style={{ ...s.input, minHeight: 220, paddingTop: 10 }}
                    />
                  </details>
                </div>
                <div style={s.metaBox}>
                  <p>
                    <b>Prestation :</b> {prestation(row)}
                  </p>

                  <p>
                    <b>Étape :</b> {stageLabel(row)}
                  </p>

                  <p>
                    <b>Action attendue :</b> {expectedAction(row)}
                  </p>

                  <p>
                    <b>Pourquoi cette relance ?</b>
                    <br />
                    {reason(row)}
                  </p>
                </div>
                {openHistoryId === row.id ? (
                  <div style={s.historyBox}>
                    <strong>Historique de la relance</strong>

                    {(historyByReminder[row.id] ?? []).length === 0 ? (
                      <p style={{ color: "var(--selen-muted)" }}>
                        Aucun historique enregistré pour le moment.
                      </p>
                    ) : (
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {(historyByReminder[row.id] ?? []).map((event) => (
                          <div key={event.id} style={s.historyItem}>
                            <div style={{ fontWeight: 700 }}>
                              {formatReminderEvent(event.event_type)}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                color: "var(--selen-muted)",
                              }}
                            >
                              {formatDate(event.created_at)}
                              {event.agent_email
                                ? ` · ${event.agent_email}`
                                : ""}
                            </div>
                            {event.subject ? (
                              <div style={{ marginTop: 4 }}>
                                Objet : {event.subject}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </SelenCard>
            );
          })
        )}
      </section>
    </main>
  );
}

function formatReminderEvent(type: string) {
  const labels: Record<string, string> = {
    created: "Créée",
    edited: "Modifiée",
    sent: "Envoyée",
    ignored: "Ignorée",
    postponed: "Reportée",
    failed: "Échec d’envoi",
  };

  return labels[type] ?? type;
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={s.info}>
      <span style={s.infoLabel}>{label}</span>
      <span
        style={{ ...s.infoValue, fontFamily: mono ? "monospace" : undefined }}
      >
        {value || "—"}
      </span>
    </div>
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
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 20,
  },
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
  toolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1fr) minmax(160px, 240px)",
    gap: 10,
  },
  input: {
    width: "100%",
    minHeight: 40,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--ink)",
    background: "var(--paper)",
    padding: "0 12px",
    fontSize: 13,
    boxSizing: "border-box",
  },
  list: { display: "grid", gap: 12, marginTop: 14 },
  rowHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  itemTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    margin: 0,
    color: "var(--selen-text-oncard)",
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  info: {
    padding: 10,
    borderRadius: "var(--radius-sm)",
    background: "rgba(247, 239, 224, 0.06)",
    border: "1px solid var(--selen-border)",
    minWidth: 0,
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
  editor: { display: "grid", gap: 12, marginTop: 16 },
  field: {
    display: "grid",
    gap: 6,
    color: "var(--ink)",
    fontSize: 12,
  },
  summary: { cursor: "pointer", color: "var(--selen-gold2)", fontSize: 13 },
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
  historyBox: {
    marginTop: 14,
    padding: 14,
    border: "1px solid var(--selen-border)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
  },
  historyItem: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.08)",
  },
};
