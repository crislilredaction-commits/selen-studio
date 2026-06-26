export type DeterministicCheckStatus = "ok" | "warning" | "missing";

export type DeterministicCheck = {
  key: string;
  label: string;
  status: DeterministicCheckStatus;
  message: string;
};

export type NdaQuickDiagnostic =
  | "conforme"
  | "a_verifier"
  | "risque_eleve_refus"
  | "insufficient_information";

function has(pattern: RegExp, text: string) {
  return pattern.test(text);
}

function check(
  key: string,
  label: string,
  ok: boolean,
  okMessage: string,
  missingMessage: string,
  warning = false,
): DeterministicCheck {
  return {
    key,
    label,
    status: ok ? "ok" : warning ? "warning" : "missing",
    message: ok ? okMessage : missingMessage,
  };
}

export function buildDeterministicNdaChecks({
  cvText,
  programText,
  entrepriseText,
  extracted,
}: {
  cvText: string;
  programText: string;
  entrepriseText?: string;
  extracted?: {
    duration?: string | null;
    siret?: string | null;
    email?: string | null;
  };
}) {
  const program = programText.toLowerCase();
  const cv = cvText.toLowerCase();
  const company = (entrepriseText ?? "").toLowerCase();
  const all = `${program}\n${cv}\n${company}`;

  return [
    check(
      "duration",
      "Durée de formation",
      Boolean(extracted?.duration) ||
        has(/\b\d+\s*(h|heure|heures|jour|jours|mois)\b/i, programText),
      "Une durée de formation est identifiable.",
      "Aucune durée de formation claire n'a été détectée.",
    ),
    check(
      "evaluation_methods",
      "Modalités d'évaluation",
      has(
        /évaluation|evaluation|quiz|qcm|mise en situation|cas pratique|exercice|contr[oô]le|validation/i,
        program,
      ),
      "Des modalités d'évaluation semblent présentes.",
      "Les modalités d'évaluation ne sont pas clairement identifiées.",
    ),
    check(
      "pedagogical_objectives",
      "Objectifs pédagogiques",
      has(
        /objectif|objectifs|sera capable|compétence|competence|à l'issue|a l'issue/i,
        program,
      ),
      "Des objectifs pédagogiques sont présents.",
      "Les objectifs pédagogiques ne sont pas suffisamment visibles.",
    ),
    check(
      "target_audience",
      "Public visé",
      has(
        /public visé|public vise|stagiaire|apprenant|bénéficiaire|beneficiaire|participant|professionnel/i,
        program,
      ),
      "Un public visé est identifiable.",
      "Le public visé n'est pas clairement indiqué.",
    ),
    check(
      "prerequisites",
      "Prérequis",
      has(
        /prérequis|prerequis|pré-requis|pre-requis|aucun prérequis|aucun prerequis/i,
        program,
      ),
      "Les prérequis sont mentionnés.",
      "Les prérequis ne sont pas clairement mentionnés.",
      true,
    ),
    check(
      "price",
      "Tarif",
      has(/tarif|prix|co[uû]t|montant|€|eur|euros/i, program),
      "Un tarif semble présent.",
      "Aucun tarif n'a été détecté.",
      true,
    ),
    check(
      "date",
      "Date",
      has(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(20)\d{2}\b|date/i, all),
      "Une date ou un repère calendaire est présent.",
      "Aucune date exploitable n'a été détectée.",
      true,
    ),
    check(
      "location",
      "Lieu",
      has(
        /lieu|adresse|présentiel|presentiel|distanciel|classe virtuelle|intra|inter/i,
        program,
      ),
      "Un lieu ou une modalité de réalisation est identifiable.",
      "Le lieu ou la modalité de réalisation n'est pas clairement identifié.",
      true,
    ),
    check(
      "siret",
      "SIRET",
      Boolean(extracted?.siret) || has(/\b\d{14}\b|\bsiret\b/i, all),
      "Un SIRET est identifiable.",
      "Aucun SIRET n'a été détecté dans les éléments analysés.",
    ),
    check(
      "trainer_email",
      "Email formateur",
      Boolean(extracted?.email) ||
        has(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, all),
      "Un email formateur est identifiable.",
      "Aucun email formateur n'a été détecté.",
      true,
    ),
    check(
      "professional_experience",
      "Expérience professionnelle",
      has(
        /expérience|experience|poste|mission|client|référence|reference|projet|activité|activite|formateur|formatrice|consultant|dirigeant|entreprise/i,
        cv,
      ),
      "Des éléments d'expérience professionnelle sont visibles.",
      "L'expérience professionnelle liée au sujet doit être mieux démontrée.",
    ),
  ];
}

export function computeQuickDiagnostic(
  checks: DeterministicCheck[],
  cvText: string,
  programText: string,
): NdaQuickDiagnostic {
  if (cvText.trim().length < 80 || programText.trim().length < 120) {
    return "insufficient_information";
  }

  const missing = checks.filter((item) => item.status === "missing").length;
  const warnings = checks.filter((item) => item.status === "warning").length;

  if (missing >= 4) return "risque_eleve_refus";
  if (missing > 0 || warnings >= 3) return "a_verifier";
  return "conforme";
}

export function quickDiagnosticLabel(value?: string | null) {
  if (value === "conforme") return "🟢 Conforme";
  if (value === "a_verifier") return "🟠 À vérifier";
  if (value === "risque_eleve_refus") return "🔴 Risque élevé de refus";
  return "⚪ Informations insuffisantes";
}

export function buildSourceUsedLabels({
  cvDocumentName,
  cvSource,
  programDocumentName,
  programSource,
  hasPreviousAnalysis,
}: {
  cvDocumentName?: string | null;
  cvSource?: string | null;
  programDocumentName?: string | null;
  programSource?: string | null;
  hasPreviousAnalysis?: boolean;
}) {
  const labels = [
    cvDocumentName
      ? `Document analysé CV : ${cvDocumentName}`
      : "Document CV non identifié",
    programDocumentName
      ? `Document analysé programme : ${programDocumentName}`
      : "Document programme non identifié",
  ];

  if (cvSource === "manual_agent" || programSource === "manual_agent") {
    labels.push("Texte manuel agent");
  }

  if (
    cvSource === "previous_analysis" ||
    programSource === "previous_analysis" ||
    hasPreviousAnalysis
  ) {
    labels.push("Analyse précédente");
  }

  if (cvSource && cvSource !== "manual_agent" && cvSource !== "previous_analysis") {
    labels.push(`Extraction automatique CV : ${cvSource}`);
  }

  if (
    programSource &&
    programSource !== "manual_agent" &&
    programSource !== "previous_analysis"
  ) {
    labels.push(`Extraction automatique programme : ${programSource}`);
  }

  if (!cvSource || !programSource) {
    labels.push("Extraction incomplète");
  }

  return labels;
}

export function buildQuestionsToAskFromChecks(checks: DeterministicCheck[]) {
  const questionsByKey: Record<string, string> = {
    duration: "Quelle est la durée exacte de la formation ?",
    evaluation_methods: "Comment seront évalués les stagiaires ?",
    pedagogical_objectives:
      "Quels objectifs pédagogiques doivent être atteints à l'issue de la formation ?",
    target_audience: "Quel public professionnel est précisément visé ?",
    prerequisites: "Quels prérequis doivent être mentionnés, même s'il n'y en a aucun ?",
    price: "Quel tarif doit être indiqué pour cette formation ?",
    date: "Quelle date ou période de réalisation doit être indiquée ?",
    location: "La formation se déroule-t-elle en présentiel, à distance ou en mixte ?",
    siret: "Quel est le SIRET de l'organisme ou de l'entreprise concernée ?",
    trainer_email: "Quel email formateur faut-il utiliser dans le dossier ?",
    professional_experience:
      "Depuis combien d'années exercez-vous cette activité et disposez-vous de références clients ?",
  };

  return checks
    .filter((checkItem) => checkItem.status !== "ok")
    .map((checkItem) => questionsByKey[checkItem.key])
    .filter((question): question is string => Boolean(question));
}
