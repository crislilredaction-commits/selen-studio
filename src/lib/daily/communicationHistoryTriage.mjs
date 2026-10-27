const FAILED_STATUSES = new Set(["failed", "bounced", "complained", "error"]);
const SENT_STATUSES = new Set(["sent", "delivered", "opened", "clicked"]);

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function fold(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizeCommunicationQuery(value) {
  const raw = first(value);
  return typeof raw === "string" ? raw.trim().slice(0, 80) : "";
}

export function normalizeCommunicationStatus(value) {
  const status = first(value);
  return ["issues", "queued", "sent"].includes(status) ? status : "all";
}

export function normalizeCommunicationType(value) {
  const type = first(value);
  return ["attendance", "signature", "other"].includes(type) ? type : "all";
}

export function isCommunicationFailure(row) {
  return FAILED_STATUSES.has(String(row.status ?? "").toLowerCase())
    || Boolean(row.failed_at || row.failure_reason);
}

function communicationCategory(row) {
  const type = String(row.communication_type ?? "");
  if (type.startsWith("attendance_")) return "attendance";
  if (type.startsWith("convention_signature")) return "signature";
  return "other";
}

/**
 * Filtre exclusivement un instantané déjà borné aux organismes autorisés.
 * Les preuves, les métadonnées et le corps des emails ne sont jamais indexés.
 * Les erreurs d'envoi remontent en tête sans masquer l'historique.
 */
export function filterCommunicationHistory(rows, filters = {}) {
  const query = fold(normalizeCommunicationQuery(filters.q));
  const status = normalizeCommunicationStatus(filters.etat);
  const category = normalizeCommunicationType(filters.categorie);
  return rows.filter((row) => {
    if (category !== "all" && communicationCategory(row) !== category) return false;
    if (status === "issues" && !isCommunicationFailure(row)) return false;
    if (status === "queued" && row.status !== "queued") return false;
    if (status === "sent" && !SENT_STATUSES.has(String(row.status ?? "").toLowerCase())) return false;
    if (!query) return true;
    return fold([
      row.recipient_name, row.recipient_email, row.subject,
      row.organisation_label, row.session_label, row.formation_label,
    ].filter(Boolean).join(" ")).includes(query);
  }).sort((a, b) => {
    const priority = Number(isCommunicationFailure(b)) - Number(isCommunicationFailure(a));
    if (priority) return priority;
    const aDate = Date.parse(a.created_at ?? "");
    const bDate = Date.parse(b.created_at ?? "");
    return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
  });
}

export function communicationHistoryMetrics(rows) {
  return {
    total: rows.length,
    issues: rows.filter(isCommunicationFailure).length,
    queued: rows.filter((row) => row.status === "queued").length,
  };
}
