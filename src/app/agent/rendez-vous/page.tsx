"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type AppointmentRow = Record<string, JsonValue> & { id: string };

const TYPE_FILTERS = [
  { value: "all", label: "Tous les types" },
  { value: "call_30", label: "Appel 30 min" },
  { value: "audit_3h30", label: "Audit blanc 3h30" },
  { value: "audit_split", label: "Audit blanc 2 x 1h45" },
];

const STATUS_FILTERS = [
  { value: "all", label: "Tous les statuts" },
  { value: "booked", label: "Réservé" },
  { value: "completed", label: "Terminé" },
  { value: "cancelled", label: "Annulé" },
  { value: "pending", label: "En attente" },
];

const PERIOD_FILTERS = [
  { value: "all", label: "Toute période" },
  { value: "today", label: "Aujourd'hui" },
  { value: "tomorrow", label: "Demain" },
  { value: "week", label: "Cette semaine" },
  { value: "late", label: "Retard" },
  { value: "future", label: "À venir" },
  { value: "past", label: "Passés" },
  { value: "30", label: "30 jours" },
];

function text(value: JsonValue | undefined) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function first(row: AppointmentRow, keys: string[]) {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function jsonObject(value: JsonValue | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function metadata(row: AppointmentRow) {
  return (
    jsonObject(row.metadata) ??
    jsonObject(row.meta) ??
    jsonObject(row.extra_data) ??
    {}
  );
}

function metaText(row: AppointmentRow, keys: string[]) {
  const meta = metadata(row);
  for (const key of keys) {
    const value = text(meta[key]);
    if (value) return value;
  }
  return "";
}

function objectValue(row: AppointmentRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object") return value;
  }
  return null;
}

function isArchived(row: AppointmentRow) {
  return metadata(row).archived === true;
}

function isProcessed(row: AppointmentRow) {
  return metadata(row).processed === true;
}

function appointmentType(row: AppointmentRow) {
  const raw = [
    first(row, ["appointment_type", "type", "booking_type", "request_type", "format"]),
    metaText(row, ["appointment_type", "type", "booking_type", "format"]),
  ]
    .join(" ")
    .toLowerCase();

  if (raw.includes("30") || raw.includes("call") || raw.includes("appel")) {
    return { key: "call_30", label: "Appel découverte 30 min", icon: "📞" };
  }
  if (raw.includes("2") || raw.includes("split") || raw.includes("1h45")) {
    return { key: "audit_split", label: "Audit blanc 2 x 1h45", icon: "🎥" };
  }
  if (raw.includes("audit") || raw.includes("3h30") || raw.includes("review")) {
    return { key: "audit_3h30", label: "Audit blanc 3h30", icon: "🎥" };
  }
  return { key: raw || "unknown", label: raw || "Rendez-vous", icon: "🕒" };
}

function isAuditType(typeKey: string) {
  return typeKey === "audit_3h30" || typeKey === "audit_split";
}

function appointmentDate(row: AppointmentRow) {
  return first(row, [
    "appointment_at",
    "starts_at",
    "start_at",
    "scheduled_at",
    "date_time",
    "date",
    "slot_start",
    "event_start",
    "created_at",
  ]);
}

function dateFromRow(row: AppointmentRow) {
  const raw = appointmentDate(row);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDateTime(date: Date | null) {
  if (!date) return "Date à vérifier";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente",
    requested: "Demandé",
    booked: "Réservé",
    confirmed: "Confirmé",
    completed: "Terminé",
    cancelled: "Annulé",
  };
  return labels[status] ?? status ?? "Non renseigné";
}

function statusVariant(status: string) {
  if (status === "completed") return "success";
  if (status === "booked" || status === "confirmed") return "info";
  if (status === "cancelled") return "danger";
  return "warn";
}

function sourceLabel(row: AppointmentRow) {
  const value = first(row, ["source", "origin"]) || metaText(row, ["source", "origin"]);
  const clean = value.toLowerCase();
  if (clean.includes("client")) return "Espace client";
  if (clean.includes("public") || clean.includes("site")) return "Public";
  return value || "Source inconnue";
}

function fullName(row: AppointmentRow) {
  const firstName = first(row, ["first_name", "firstname", "prenom"]);
  const lastName = first(row, ["last_name", "lastname", "nom"]);
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Client à identifier";
}

function phone(row: AppointmentRow) {
  return first(row, ["phone", "telephone", "tel", "mobile"]);
}

function email(row: AppointmentRow) {
  return first(row, ["email", "client_email"]);
}

function meetLink(row: AppointmentRow) {
  return (
    metaText(row, ["google_meet_link", "google_meet_url", "meet_link", "meeting_url"]) ||
    first(row, ["google_meet_link", "google_meet_url", "meet_link", "meeting_url"])
  );
}

function googleCalendarLink(row: AppointmentRow) {
  return (
    metaText(row, ["google_event_link", "google_calendar_link", "htmlLink"]) ||
    first(row, ["google_event_link", "google_calendar_link", "htmlLink"])
  );
}

function reviewCaseId(row: AppointmentRow) {
  return first(row, ["audit_blanc_case_id"]) || metaText(row, ["audit_blanc_case_id"]);
}

function dossierId(row: AppointmentRow) {
  return first(row, ["dossier_id"]) || metaText(row, ["dossier_id"]);
}

function JsonDetails({ title, value }: { title: string; value: JsonValue }) {
  if (!value) return null;
  return (
    <details style={s.details}>
      <summary style={s.summary}>{title}</summary>
      <pre style={s.pre}>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export default function AgentRendezVousPage() {
  const supabase = useMemo(() => createClient(), []);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [showArchives, setShowArchives] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  async function loadAppointments() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("appointment_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setAppointments(((data ?? []) as AppointmentRow[]).filter((row) => row.id));
    setLoading(false);
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  async function markCompleted(id: string) {
    setUpdatingId(id);
    setNotice("");
    setError("");
    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update({ status: "completed" })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setUpdatingId("");
      return;
    }

    setAppointments((rows) =>
      rows.map((row) => (row.id === id ? { ...row, status: "completed" } : row)),
    );
    setNotice("Rendez-vous marqué comme terminé.");
    setUpdatingId("");
  }

  async function markProcessed(row: AppointmentRow) {
    setUpdatingId(row.id);
    setNotice("");
    setError("");
    const nextMetadata = {
      ...metadata(row),
      processed: true,
      processed_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      setUpdatingId("");
      return;
    }

    setAppointments((rows) =>
      rows.map((item) =>
        item.id === row.id ? { ...item, metadata: nextMetadata } : item,
      ),
    );
    setNotice("Rendez-vous marqué comme traité côté Studio.");
    setUpdatingId("");
  }

  async function archiveAppointment(row: AppointmentRow) {
    setUpdatingId(row.id);
    setNotice("");
    setError("");
    const nextMetadata = { ...metadata(row), archived: true };
    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      setUpdatingId("");
      return;
    }

    setAppointments((rows) =>
      rows.map((item) =>
        item.id === row.id ? { ...item, metadata: nextMetadata } : item,
      ),
    );
    setNotice("Rendez-vous archivé côté Studio.");
    setUpdatingId("");
  }

  async function prepare48hReminder() {
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/reminders/generate", { method: "POST" });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? "Impossible de préparer le rappel 48h.");
      return;
    }

    setNotice(
      "Génération lancée. Si le rendez-vous est dans la fenêtre 48h, le rappel est visible dans Relances clients.",
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const nowMs = now.getTime();
    const thirtyDaysAgo = nowMs - 30 * 24 * 60 * 60 * 1000;
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);

    return appointments.filter((row) => {
      const type = appointmentType(row).key;
      const status = first(row, ["status", "internal_status"]).toLowerCase();
      const date = dateFromRow(row);
      const timestamp = date?.getTime() ?? 0;
      const archived = isArchived(row);
      const haystack = [
        fullName(row),
        email(row),
        phone(row),
        row.id,
        dossierId(row),
        reviewCaseId(row),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const matchesType = typeFilter === "all" || type === typeFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesArchives = showArchives ? archived : !archived;
      const matchesPeriod =
        periodFilter === "all" ||
        (periodFilter === "today" && date && isSameDay(date, now)) ||
        (periodFilter === "tomorrow" &&
          date &&
          isSameDay(date, new Date(nowMs + 24 * 60 * 60 * 1000))) ||
        (periodFilter === "week" && date && date >= weekStart && date <= weekEnd) ||
        (periodFilter === "late" &&
          date &&
          timestamp < nowMs &&
          !["completed", "cancelled"].includes(status)) ||
        (periodFilter === "future" && timestamp >= nowMs) ||
        (periodFilter === "past" && timestamp < nowMs) ||
        (periodFilter === "30" && timestamp >= thirtyDaysAgo);

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus &&
        matchesArchives &&
        Boolean(matchesPeriod)
      );
    });
  }, [appointments, periodFilter, search, showArchives, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);

    const visible = appointments.filter((row) => !isArchived(row));
    return {
      today: visible.filter((row) => {
        const date = dateFromRow(row);
        return date && isSameDay(date, now);
      }).length,
      tomorrow: visible.filter((row) => {
        const date = dateFromRow(row);
        return date && isSameDay(date, tomorrow);
      }).length,
      auditsThisWeek: visible.filter((row) => {
        const date = dateFromRow(row);
        return (
          date &&
          date >= weekStart &&
          date <= weekEnd &&
          isAuditType(appointmentType(row).key)
        );
      }).length,
      pending: visible.filter((row) =>
        ["", "pending", "requested", "booked", "confirmed"].includes(
          first(row, ["status", "internal_status"]).toLowerCase(),
        ),
      ).length,
    };
  }, [appointments]);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Rendez-vous</h1>
          <p style={s.subtitle}>
            Suivi agent des rendez-vous créés par la Vitrine. Studio ne propose
            pas de nouveaux créneaux et ne modifie pas Google Agenda.
          </p>
        </div>
        <div style={s.stats}>
          <Stat label="RDV aujourd'hui" value={stats.today} />
          <Stat label="RDV demain" value={stats.tomorrow} />
          <Stat label="Audits semaine" value={stats.auditsThisWeek} />
          <Stat label="En attente" value={stats.pending} />
        </div>
      </header>

      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur Supabase : {error}</div> : null}

      <SelenCard>
        <SelenCardTitle>Filtres</SelenCardTitle>
        <div style={s.toolbar}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher nom, email, téléphone, dossier..."
            style={s.input}
            type="search"
          />
          <Select value={typeFilter} onChange={setTypeFilter} items={TYPE_FILTERS} />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            items={STATUS_FILTERS}
          />
          <Select
            value={periodFilter}
            onChange={setPeriodFilter}
            items={PERIOD_FILTERS}
          />
          <label style={s.archiveToggle}>
            <input
              type="checkbox"
              checked={showArchives}
              onChange={(event) => setShowArchives(event.target.checked)}
            />
            Afficher archives
          </label>
        </div>
      </SelenCard>

      <section style={s.list}>
        {loading ? (
          <SelenCard>Chargement des rendez-vous...</SelenCard>
        ) : filtered.length === 0 ? (
          <SelenCard>Aucun rendez-vous ne correspond aux filtres.</SelenCard>
        ) : (
          filtered.map((row) => {
            const type = appointmentType(row);
            const status = first(row, ["status", "internal_status"]).toLowerCase();
            const profileAnswers = objectValue(row, [
              "profile_answers",
              "profile_responses",
              "questionnaire_answers",
              "audit_profile_answers",
              "answers",
              "profile_data",
            ]);
            const message = first(row, ["message", "notes", "comment"]);
            const isUpdating = updatingId === row.id;
            const date = dateFromRow(row);
            const rowEmail = email(row);
            const rowPhone = phone(row);
            const meet = meetLink(row);
            const googleLink = googleCalendarLink(row);
            const auditCaseId = reviewCaseId(row);
            const rowDossierId = dossierId(row);

            return (
              <SelenCard key={row.id} style={isArchived(row) ? s.archivedCard : undefined}>
                <div style={s.cardTop}>
                  <div style={{ minWidth: 0 }}>
                    <div style={s.kindLine}>
                      <span aria-hidden>{type.icon}</span>
                      <span>{type.label}</span>
                    </div>
                    <h2 style={s.clientName}>{fullName(row)}</h2>
                    <div style={s.contactLines}>
                      <span>📧 {rowEmail || "Email non renseigné"}</span>
                      <span>📱 {rowPhone || "Téléphone non renseigné"}</span>
                    </div>
                  </div>
                  <div style={s.badges}>
                    <SelenBadge variant="type" dot>
                      🌐 {sourceLabel(row)}
                    </SelenBadge>
                    <SelenBadge variant={statusVariant(status)} dot>
                      📌 {statusLabel(status)}
                    </SelenBadge>
                    {isArchived(row) ? (
                      <SelenBadge variant="neutral" dot>
                        📂 Archivé
                      </SelenBadge>
                    ) : null}
                    {isProcessed(row) ? (
                      <SelenBadge variant="success" dot>
                        ✅ Traité
                      </SelenBadge>
                    ) : null}
                  </div>
                </div>

                <div style={s.dateLine}>🕒 {formatDateTime(date)}</div>

                {message ? (
                  <div style={s.message}>
                    <strong>Message</strong>
                    <p>{message}</p>
                  </div>
                ) : null}

                <div style={s.actions}>
                  {rowPhone ? (
                    <a href={`tel:${rowPhone}`} style={s.actionLink}>
                      📞 Appeler
                    </a>
                  ) : null}
                  {rowEmail ? (
                    <a href={`mailto:${rowEmail}`} style={s.actionLink}>
                      ✉️ Email
                    </a>
                  ) : null}
                  {googleLink ? (
                    <a
                      href={googleLink}
                      target="_blank"
                      rel="noreferrer"
                      style={s.actionLink}
                    >
                      🗓 Agenda Google
                    </a>
                  ) : null}
                  {isAuditType(type.key) && meet ? (
                    <a
                      href={meet}
                      target="_blank"
                      rel="noreferrer"
                      style={s.actionLink}
                    >
                      🎥 Rejoindre Meet
                    </a>
                  ) : null}
                  {isAuditType(type.key) && auditCaseId ? (
                    <Link
                      href={`/agent/audits-blancs/${auditCaseId}`}
                      style={s.actionLink}
                    >
                      📄 Ouvrir dossier Review
                    </Link>
                  ) : isAuditType(type.key) && rowDossierId ? (
                    <Link href={`/agent/dossiers/${rowDossierId}`} style={s.actionLink}>
                      📄 Ouvrir dossier
                    </Link>
                  ) : null}
                  {isAuditType(type.key) ? (
                    <button
                      type="button"
                      onClick={() => void prepare48hReminder()}
                      style={s.actionButton}
                    >
                      ⏰ Envoyer rappel 48h
                    </button>
                  ) : null}
                  <SelenButton
                    size="sm"
                    variant="secondary"
                    disabled={isUpdating || isProcessed(row)}
                    onClick={() => void markProcessed(row)}
                  >
                    ✅ Traité
                  </SelenButton>
                  <SelenButton
                    size="sm"
                    variant="primary"
                    disabled={isUpdating || status === "completed"}
                    onClick={() => void markCompleted(row.id)}
                  >
                    ✅ Terminer
                  </SelenButton>
                  <SelenButton
                    size="sm"
                    variant="ghost"
                    disabled={isUpdating || isArchived(row)}
                    onClick={() => void archiveAppointment(row)}
                  >
                    📂 Archiver
                  </SelenButton>
                </div>

                <details style={s.details}>
                  <summary style={s.summary}>Détails internes</summary>
                  <div style={s.grid}>
                    <Info label="booking_group_id" value={first(row, ["booking_group_id"])} mono />
                    <Info label="google_event_id" value={first(row, ["google_event_id"])} mono />
                    <Info label="client_id" value={first(row, ["client_id"])} mono />
                    <Info label="dossier_id" value={rowDossierId} mono />
                    <Info label="audit_blanc_case_id" value={auditCaseId} mono />
                  </div>
                </details>

                <JsonDetails title="Réponses au questionnaire profil" value={profileAnswers} />
              </SelenCard>
            );
          })
        )}
      </section>
    </main>
  );
}

function Select({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={s.input}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
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
      <span style={{ ...s.infoValue, fontFamily: mono ? "monospace" : undefined }}>
        {value || "—"}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const actionBase: CSSProperties = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--selen-border)",
  background: "rgba(247, 239, 224, 0.06)",
  color: "var(--selen-text2-oncard)",
  padding: "6px 12px",
  fontSize: 13,
  textDecoration: "none",
  cursor: "pointer",
};

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
  subtitle: {
    color: "var(--selen-text2)",
    fontSize: 13,
    margin: 0,
    maxWidth: 650,
    lineHeight: 1.55,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(130px, 1fr))",
    gap: 10,
  },
  stat: {
    minWidth: 130,
    padding: 12,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-card-texture), var(--selen-card)",
    display: "grid",
    gap: 4,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  toolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1.3fr) repeat(3, minmax(145px, 0.7fr)) auto",
    gap: 10,
    alignItems: "center",
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
  archiveToggle: {
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
  },
  list: { display: "grid", gap: 12, marginTop: 14 },
  archivedCard: { opacity: 0.74 },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  kindLine: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    color: "var(--selen-gold2)",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  clientName: {
    fontFamily: "var(--font-display)",
    fontSize: 23,
    lineHeight: 1.15,
    margin: 0,
    color: "var(--selen-text-oncard)",
  },
  contactLines: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 8,
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
  },
  badges: { display: "flex", gap: 8, flexWrap: "wrap" },
  dateLine: {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(201, 148, 58, 0.08)",
    color: "var(--selen-text-oncard)",
    fontSize: 14,
    fontWeight: 700,
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 },
  actionLink: actionBase,
  actionButton: {
    ...actionBase,
    fontFamily: "inherit",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginTop: 12,
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
  message: {
    marginTop: 14,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    background: "rgba(201, 148, 58, 0.08)",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  details: { marginTop: 12 },
  summary: { cursor: "pointer", color: "var(--selen-gold2)", fontSize: 13 },
  pre: {
    marginTop: 10,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    background: "rgba(10, 8, 6, 0.32)",
    color: "var(--selen-text2-oncard)",
    overflowX: "auto",
    fontSize: 12,
    lineHeight: 1.55,
  },
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
