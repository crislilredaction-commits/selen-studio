export type CandidatureAnswer = { key: string; label: string; lines: string[] };

const labels: Record<string, string> = {
  birth_date: "Date de naissance", phone: "Téléphone", postal_address: "Adresse",
  beneficiary_siret: "SIRET du bénéficiaire", professional_situation: "Situation professionnelle",
  highest_diploma: "Dernier diplôme obtenu", current_knowledge_level: "Niveau de départ déclaré",
  funding: "Financement", funding_other: "Autre financement", expectations: "Attentes",
  expressed_need: "Besoin exprimé", objective: "Objectif", motivations: "Motivations",
  motivation: "Motivation", constraints: "Contraintes", availability: "Disponibilités",
  preferred_modality: "Modalité souhaitée", details: "Précisions",
  adaptation_needed_answer: "Aménagement demandé", adaptation_details: "Besoins d’aménagement",
  company_adaptation_details: "Aménagements pour les participants",
  company_name: "Entreprise", company_siret: "SIRET de l’entreprise", company_address: "Adresse de l’entreprise",
  admin_contact_name: "Contact administratif", admin_contact_role: "Fonction du contact administratif",
  admin_contact_email: "Email administratif", admin_contact_phone: "Téléphone administratif",
  training_contact_name: "Contact formation", training_contact_role: "Fonction du contact formation",
  training_contact_email: "Email du contact formation", training_contact_phone: "Téléphone du contact formation",
  employee_objectives: "Objectifs pour les participants", request_context: "Contexte de la demande",
  specific_requests: "Points d’attention", first_name: "Prénom", last_name: "Nom",
  firstname: "Prénom", lastname: "Nom", firstName: "Prénom", lastName: "Nom",
  email: "Email", mail: "Email", address: "Adresse", siret: "SIRET",
};
const technicalKeys = new Set([
  "id", "mode", "type", "required", "order", "version", "schema_version", "questionnaire_version",
  "source_document_id", "source_sha256", "submission_fingerprint", "external_documents",
  "document_id", "storage_path", "bucket", "sha256", "participant_index",
]);
const mainKeys = [
  "motivations", "motivation", "expectations", "expressed_need", "objective", "employee_objectives",
  "request_context", "current_knowledge_level", "specific_requests", "adaptation_needed_answer",
  "adaptation_details", "company_adaptation_details",
];
const detailKeys = new Set([
  "birth_date", "phone", "postal_address", "beneficiary_siret", "professional_situation", "highest_diploma",
  "funding", "funding_other", "constraints", "availability", "preferred_modality", "details",
  "company_name", "company_siret", "company_address", "admin_contact_name", "admin_contact_role",
  "admin_contact_email", "admin_contact_phone", "training_contact_name", "training_contact_role",
  "training_contact_email", "training_contact_phone",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function labelFor(key: string) {
  if (Object.hasOwn(labels, key)) return labels[key];
  const readable = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Réponse";
}

// Display the stored answers, including old questionnaires, without a JSON dump
// or the private document descriptors used by the server.
function answerLines(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return ["Non renseigné"];
  if (typeof value === "boolean") return [value ? "Oui" : "Non"];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.length ? value.flatMap(answerLines) : ["Aucune réponse"];
  const lines = Object.entries(record(value)).filter(([key]) => !technicalKeys.has(key)).flatMap(([key, answer]) =>
    answerLines(answer).map(line => labelFor(key) + " : " + line)
  );
  return lines.length ? lines : ["Non renseigné"];
}
function projectRows(value: unknown): CandidatureAnswer[] {
  return Object.entries(record(value)).filter(([key]) => !technicalKeys.has(key)).map(([key, answer]) =>
    ({ key, label: labelFor(key), lines: answerLines(answer) })
  );
}

export function candidatureNeedAnswers(value: unknown) {
  const all = projectRows(value);
  return {
    main: all.filter(row => !detailKeys.has(row.key)).sort((a, b) =>
      (mainKeys.includes(a.key) ? mainKeys.indexOf(a.key) : mainKeys.length) -
      (mainKeys.includes(b.key) ? mainKeys.indexOf(b.key) : mainKeys.length)
    ),
    details: all.filter(row => detailKeys.has(row.key)),
  };
}

export function candidaturePositioningAnswers(value: unknown): CandidatureAnswer[] {
  const data = record(value);
  if (data.mode === "off_platform") return [];
  if (Array.isArray(data.questions)) {
    const legacyAnswers = record(data.answers);
    return data.questions.map((raw, index) => {
      const question = record(raw), id = typeof question.id === "string" ? question.id : String(index);
      const answer = Object.hasOwn(question, "answer") ? question.answer : legacyAnswers[id];
      return {
        key: id + "-" + index,
        label: typeof question.label === "string" && question.label.trim() ? question.label : "Question " + (index + 1),
        lines: answerLines(answer),
      };
    });
  }
  if (Array.isArray(value)) return value.map((answer, index) =>
    ({ key: String(index), label: "Réponse " + (index + 1), lines: answerLines(answer) })
  );
  return projectRows(data);
}

export function candidatureParticipants(value: unknown) {
  return (Array.isArray(value) ? value : []).map((raw, index) => {
    const person = record(raw);
    const first = person.first_name ?? person.firstname ?? person.firstName;
    const last = person.last_name ?? person.lastname ?? person.lastName;
    const name = [first, last].filter(v => typeof v === "string" && v.trim()).join(" ") || "Participant " + (index + 1);
    const email = person.email ?? person.mail;
    const identityKeys = new Set(["first_name", "firstname", "firstName", "last_name", "lastname", "lastName", "email", "mail"]);
    return {
      name, email: typeof email === "string" ? email : "",
      details: projectRows(person).filter(row => !identityKeys.has(row.key)),
    };
  });
}

export function candidatureDecisionLabel(status: unknown) {
  const statuses: Record<string, string> = {
    pending: "À analyser", ready_for_of: "Décision de l’OF attendue",
    accepted: "Candidature acceptée", refused: "Candidature refusée",
  };
  return typeof status === "string" && Object.hasOwn(statuses, status) ? statuses[status] : "À suivre";
}

export function candidatureEvidenceLabel(status: unknown) {
  const statuses: Record<string, string> = {
    verified: "Vérifié", submitted: "À vérifier", pending: "À vérifier",
    rejected: "Non validé", missing: "Justificatif manquant", requested: "Justificatif attendu",
  };
  return typeof status === "string" && Object.hasOwn(statuses, status) ? statuses[status] : "À vérifier";
}
