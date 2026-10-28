/**
 * Triage purement visuel des documents préformation déjà bornés aux organismes
 * affectés par l'API Studio. Aucun identifiant ni jeton n'est recherché.
 */
const DOCUMENT_LABELS = {
  training_program: "Programme",
  training_agreement: "Convention",
  training_contract: "Contrat individuel",
  convocation: "Convocation",
  registration_positioning: "Inscription & positionnement",
  welcome_booklet: "Livret d’accueil",
  internal_regulations: "Règlement intérieur",
};

export function normalizePretrainingQuery(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trimStart().slice(0, 80) : "";
}

function comparable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

/**
 * Recherche limitée aux libellés déjà autorisés à l'écran.
 * @param {{document_type:string,logical_name?:string,organisations?:{name?:string|null}|null,metadata?:Record<string,unknown>|null,session_id?:string|null}} document
 * @param {unknown} rawQuery
 */
export function matchesPretrainingDocument(document, rawQuery) {
  const query = comparable(normalizePretrainingQuery(rawQuery).trim());
  if (!query) return true;
  const metadata = document.metadata ?? {};
  const values = [
    document.organisations?.name, DOCUMENT_LABELS[document.document_type] ?? document.document_type,
    document.logical_name, metadata.learner_name, metadata.learner_email,
    metadata.session_name, metadata.session_title, document.session_id,
  ];
  return comparable(values.join(" ")).includes(query);
}

export function matchesPretrainingReviewStep(status, step) {
  if (step === "review") return status === "to_check" || status === "to_validate";
  if (step === "publish") return status === "validated";
  if (step === "correction") return status === "correction_requested";
  return step === "all";
}

export function pretrainingPriority(status) {
  if (status === "to_check" || status === "to_validate") return 0;
  if (status === "validated") return 1;
  if (status === "correction_requested") return 2;
  if (status === "draft" || status === "active") return 3;
  return 4;
}

/** Liste des seuls organismes présents dans les données déjà autorisées par l'API agent. 
 * @param {Array<{organisation_id:string,organisations?:{name?:string|null}|null}>} documents
 * @param {Array<{organisation_id:string}>} sessions
 * @returns {Array<{id:string,name:string}>}
 */
export function pretrainingOrganisationOptions(documents, sessions) {
  const options = new Map();
  for (const session of sessions) {
    const id = typeof session.organisation_id === "string" ? session.organisation_id.trim() : "";
    if (id) options.set(id, { id, name: `Organisme ${id.slice(0, 8)}` });
  }
  for (const document of documents) {
    const id = typeof document.organisation_id === "string" ? document.organisation_id.trim() : "";
    if (!id) continue;
    const name = document.organisations?.name?.trim() || options.get(id)?.name || `Organisme ${id.slice(0, 8)}`;
    options.set(id, { id, name });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}

/** @template {{organisation_id:string}} T
 * @param {T[]} rows
 * @param {string} organisationId
 * @returns {T[]}
 */
export function filterPretrainingByOrganisation(rows, organisationId) {
  if (organisationId === "all") return rows;
  return rows.filter((row) => row.organisation_id === organisationId);
}
