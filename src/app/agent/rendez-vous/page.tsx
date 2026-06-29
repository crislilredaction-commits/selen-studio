"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

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
  { value: "pending", label: "En attente" },
  { value: "booked", label: "Reserve" },
  { value: "processed", label: "Traite" },
  { value: "completed", label: "Termine" },
  { value: "archived", label: "Archives" },
  { value: "cancelled", label: "Annule" },
];

const PERIOD_FILTERS = [
  { value: "all", label: "Toute periode" },
  { value: "future", label: "A venir" },
  { value: "past", label: "Passes" },
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

function metadata(row: AppointmentRow) {
  return row.metadata && typeof row.metadata === "object"
    ? (row.metadata as JsonObject)
    : {};
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
    const direct = row[key];
    if (direct && typeof direct === "object") return direct;
    const nested = metadata(row)[key];
    if (nested && typeof nested === "object") return nested;
  }
  return null;
}

function appointmentType(row: AppointmentRow) {
  const raw = first(row, [
    "appointment_type",
    "type",
    "booking_type",
    "request_type",
    "format",
  ]).toLowerCase();
  if (raw.includes("30") || raw.includes("call") || raw.includes("appel")) {
    return { key: "call_30", label: "Appel 30 min" };
  }
  if (raw.includes("2") || raw.includes("split") || raw.includes("1h45")) {
    return { key: "audit_split", label: "Audit blanc 2 x 1h45" };
  }
  if (raw.includes("audit") || raw.includes("3h30") || raw.includes("review")) {
    return { key: "audit_3h30", label: "Audit blanc 3h30" };
  }
  return { key: raw || "unknown", label: raw || "Non renseigne" };
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

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusValue(row: AppointmentRow) {
  const base = first(row, ["status", "internal_status"]).toLowerCase();
  const meta = metadata(row);
  if (meta.archived === true) return "archived";
  if (meta.processed === true && base !== "completed") return "processed";
  return base || "pending";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente",
    requested: "Demande",
    booked: "Reserve",
    confirmed: "Confirme",
    processed: "Traite",
    completed: "Termine",
    archived: "Archive",
    cancelled: "Annule",
  };
  return labels[status] ?? status;
}

function statusVariant(
  status: string,
): "info" | "warn" | "success" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "processed" || status === "booked" || status === "confirmed") return "info";
  if (status === "cancelled") return "danger";
  if (status === "archived") return "neutral";
  return "warn";
}

function linkValue(row: AppointmentRow, keys: string[]) {
  return first(row, keys) || metaText(row, keys);
}

function externalAuditMetadata(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
}

function externalAuditMode(audit: ExternalAuditRow) {
  const meta = externalAuditMetadata(audit);
  const value =
    audit.audit_delivery_mode ||
    (typeof meta.audit_delivery_mode === "string" ? meta.audit_delivery_mode : "");
  return value === "distanciel" ? "Distanciel" : "Presentiel";
}

function externalAuditMeetLink(audit: ExternalAuditRow) {
  const meta = externalAuditMetadata(audit);
  return (
    audit.google_meet_link ||
    (typeof meta.meet_link === "string" ? meta.meet_link : "") ||
    (typeof meta.google_meet_link === "string" ? meta.google_meet_link : "")
  );
}

export default function AgentRendezVousPage() {
  const supabase = useMemo(() => createClient(), []);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [externalAudits, setExternalAudits] = useState<ExternalAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
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
    const { data: auditsData } = await supabase
      .from("external_audits")
      .select("*")
      .in("status", ["planned", "confirmed"])
      .order("audit_date", { ascending: true })
      .order("start_time", { ascending: true });
    setExternalAudits((auditsData ?? []) as ExternalAuditRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  async function updateAppointment(
    row: AppointmentRow,
    changes: { status?: "completed"; metadata?: Record<string, unknown> },
  ) {
    setUpdatingId(row.id);
    setError("");

    const currentMetadata = metadata(row);
    const updatePayload: Record<string, unknown> = {};
    if (changes.status) updatePayload.status = changes.status;
    if (changes.metadata) {
      updatePayload.metadata = { ...currentMetadata, ...changes.metadata };
    }

    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update(updatePayload)
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      setUpdatingId("");
      return;
    }

    setAppointments((rows) =>
      rows.map((item) =>
        item.id === row.id ? ({ ...item, ...updatePayload } as AppointmentRow) : item,
      ),
    );
    setUpdatingId("");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    return appointments.filter((row) => {
      const type = appointmentType(row).key;
      const status = statusValue(row);
      const dateValue = appointmentDate(row);
      const timestamp = new Date(dateValue).getTime();
      const archived = metadata(row).archived === true;
      const haystack = [
        first(row, ["first_name", "firstname", "prenom"]),
        first(row, ["last_name", "lastname", "nom"]),
        first(row, ["email", "client_email"]),
        first(row, ["phone", "telephone", "tel"]),
        first(row, ["message", "notes", "comment"]),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const matchesType = typeFilter === "all" || type === typeFilter;
      const matchesStatus =
        statusFilter === "all" ? !archived : status === statusFilter;
      const matchesPeriod =
        periodFilter === "all" ||
        (periodFilter === "future" && timestamp >= now) ||
        (periodFilter === "past" && timestamp < now) ||
        (periodFilter === "30" && timestamp >= thirtyDaysAgo);

      return matchesSearch && matchesType && matchesStatus && matchesPeriod;
    });
  }, [appointments, periodFilter, search, statusFilter, typeFilter]);

  const visibleForStats = appointments.filter((row) => metadata(row).archived !== true);
  const stats = {
    total: visibleForStats.length,
    pending: visibleForStats.filter((row) =>
      ["pending", "requested", "booked", "confirmed", "processed"].includes(statusValue(row)),
    ).length,
    completed: visibleForStats.filter((row) => statusValue(row) === "completed").length,
  };

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Rendez-vous</h1>
          <p style={s.subtitle}>
            Consultation et suivi interne des demandes creees par la Vitrine.
          </p>
        </div>
        <div style={s.stats}>
          <Stat label="Total" value={stats.total} />
          <Stat label="A suivre" value={stats.pending} />
          <Stat label="Termines" value={stats.completed} />
        </div>
      </header>

      {error ? <div style={s.error}>Erreur Supabase : {error}</div> : null}

      <SelenCard>
        <SelenCardTitle>Filtres</SelenCardTitle>
        <div style={s.toolbar}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher nom, email, telephone..."
            style={s.input}
            type="search"
          />
          <Select value={typeFilter} onChange={setTypeFilter} items={TYPE_FILTERS} />
          <Select value={statusFilter} onChange={setStatusFilter} items={STATUS_FILTERS} />
          <Select value={periodFilter} onChange={setPeriodFilter} items={PERIOD_FILTERS} />
        </div>
      </SelenCard>

      <section style={s.list}>
        {externalAudits.map((audit) => {
          const mode = externalAuditMode(audit);
          const meet = externalAuditMeetLink(audit);
          return (
            <SelenCard key={`external-audit-${audit.id}`}>
              <div style={s.rowHeader}>
                <div>
                  <div style={s.badges}>
                    <SelenBadge variant="type" dot>
                      Audit externe
                    </SelenBadge>
                    <SelenBadge variant={mode === "Distanciel" ? "info" : "neutral"} dot>
                      {mode}
                    </SelenBadge>
                  </div>
                  <h2 style={s.itemTitle}>
                    {formatDateTime(`${audit.audit_date}T${audit.start_time}`)}
                  </h2>
                  <p style={s.person}>{audit.of_name}</p>
                </div>
                <div style={s.actions}>
                  <Link href={`/agent/gestion/audits/${audit.id}`} style={s.actionLink}>
                    Ouvrir audit
                  </Link>
                  {meet ? (
                    <a href={meet} target="_blank" rel="noreferrer" style={s.actionLink}>
                      Rejoindre Meet
                    </a>
                  ) : null}
                </div>
              </div>
              <div style={s.grid}>
                <Info label="Contact" value={audit.contact_name || ""} />
                <Info label="Telephone" value={audit.contact_phone || ""} />
                <Info
                  label={mode === "Distanciel" ? "Google Meet" : "Adresse"}
                  value={mode === "Distanciel" ? meet : audit.address || ""}
                />
              </div>
            </SelenCard>
          );
        })}
        {loading ? (
          <SelenCard>Chargement des rendez-vous...</SelenCard>
        ) : filtered.length === 0 ? (
          <SelenCard>Aucun rendez-vous ne correspond aux filtres.</SelenCard>
        ) : (
          filtered.map((row) => {
            const type = appointmentType(row);
            const status = statusValue(row);
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
            const meetLink = linkValue(row, [
              "google_meet_link",
              "google_meet_url",
              "meet_link",
              "meet_url",
            ]);
            const calendarLink = linkValue(row, [
              "google_calendar_link",
              "google_event_link",
              "calendar_link",
              "htmlLink",
            ]);
            const dossierId = first(row, ["dossier_id"]);
            const auditCaseId = first(row, ["audit_blanc_case_id"]);
            const reviewHref = auditCaseId
              ? `/agent/audits-blancs/${auditCaseId}`
              : dossierId
                ? `/agent/dossiers/${dossierId}`
                : "";

            return (
              <SelenCard key={row.id}>
                <div style={s.rowHeader}>
                  <div>
                    <div style={s.badges}>
                      <SelenBadge variant="type" dot>
                        {type.label}
                      </SelenBadge>
                      <SelenBadge variant={statusVariant(status)} dot>
                        {statusLabel(status)}
                      </SelenBadge>
                    </div>
                    <h2 style={s.itemTitle}>{formatDateTime(appointmentDate(row))}</h2>
                    <p style={s.person}>
                      {[first(row, ["first_name", "firstname", "prenom"]), first(row, ["last_name", "lastname", "nom"])]
                        .filter(Boolean)
                        .join(" ") || "Client"}
                    </p>
                  </div>
                  <div style={s.actions}>
                    {metadata(row).processed !== true ? (
                      <SelenButton
                        size="sm"
                        variant="secondary"
                        disabled={isUpdating}
                        onClick={() =>
                          void updateAppointment(row, {
                            metadata: { processed: true },
                          })
                        }
                      >
                        Traite
                      </SelenButton>
                    ) : null}
                    {status !== "completed" ? (
                      <SelenButton
                        size="sm"
                        variant="primary"
                        disabled={isUpdating}
                        onClick={() =>
                          void updateAppointment(row, {
                            status: "completed",
                          })
                        }
                      >
                        Termine
                      </SelenButton>
                    ) : null}
                    <SelenButton
                      size="sm"
                      variant="ghost"
                      disabled={isUpdating}
                      onClick={() =>
                        void updateAppointment(row, {
                          metadata: { archived: true },
                        })
                      }
                    >
                      Archiver
                    </SelenButton>
                  </div>
                </div>

                <div style={s.grid}>
                  <Info label="Email" value={first(row, ["email", "client_email"])} />
                  <Info label="Telephone" value={first(row, ["phone", "telephone", "tel"])} />
                  <Info label="Source" value={first(row, ["source", "origin"]) || metaText(row, ["source", "origin"])} />
                </div>

                <div style={s.linkActions}>
                  {calendarLink ? (
                    <a href={calendarLink} target="_blank" rel="noreferrer" style={s.actionLink}>
                      Agenda Google
                    </a>
                  ) : null}
                  {meetLink ? (
                    <a href={meetLink} target="_blank" rel="noreferrer" style={s.actionLink}>
                      Rejoindre Meet
                    </a>
                  ) : null}
                  {reviewHref ? (
                    <Link href={reviewHref} style={s.actionLink}>
                      Ouvrir dossier Review
                    </Link>
                  ) : null}
                </div>

                {message ? (
                  <div style={s.message}>
                    <strong>Message laisse</strong>
                    <p>{message}</p>
                  </div>
                ) : null}

                {profileAnswers ? (
                  <details style={s.details}>
                    <summary style={s.summary}>Reponses au questionnaire profil</summary>
                    <pre style={s.pre}>{JSON.stringify(profileAnswers, null, 2)}</pre>
                  </details>
                ) : null}
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
    <select value={value} onChange={(event) => onChange(event.target.value)} style={s.input}>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.info}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value || "-"}</span>
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
  stats: { display: "flex", gap: 10, flexWrap: "wrap" },
  stat: {
    minWidth: 100,
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
    gridTemplateColumns: "minmax(220px, 1.3fr) repeat(3, minmax(150px, 0.7fr))",
    gap: 10,
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
  list: { display: "grid", gap: 12, marginTop: 14 },
  rowHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  itemTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    margin: 0,
    color: "var(--selen-text-oncard)",
  },
  person: {
    margin: "8px 0 0",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
  },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
  linkActions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 34,
    padding: "0 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-gold2)",
    background: "rgba(201, 148, 58, 0.1)",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 700,
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
