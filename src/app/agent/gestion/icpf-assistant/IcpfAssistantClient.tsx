"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { indicatorAdvice } from "@/content/review/indicatorAdvice";
import {
  ICPF_INDICATORS,
  type IcpfApplicability,
  type IcpfIndicatorStatus,
} from "@/lib/icpfAssistantConfig";

type EvidenceFormat =
  | "PDF"
  | "Word"
  | "site internet"
  | "mail"
  | "capture"
  | "plateforme"
  | "entretien"
  | "autre";

type Evidence = {
  id: string;
  name: string;
  format: EvidenceFormat;
  documentDate: string;
  signatureDate: string;
  dated: boolean;
  completed: boolean;
  signed: boolean;
  observed: boolean;
  note: string;
  coveredItems: string[];
};

type IndicatorDraft = {
  status: IcpfIndicatorStatus;
  note: string;
  evidences: Evidence[];
};

type DraftState = Record<string, IndicatorDraft>;

type StoredDraftState = {
  draft: DraftState;
  isPristine: boolean;
};

type JsonRecord = Record<string, unknown>;

export type InitialPreauditData = {
  dossierId?: string;
  session:
    | {
        id: string;
        status: string | null;
        audit_type: string | null;
        is_new_entrant: boolean | null;
        applicable_indicators: number[] | null;
        excluded_indicators: number[] | null;
        updated_at: string | null;
      }
    | null;
  indicators: JsonRecord[];
  questions: JsonRecord[];
  answers: JsonRecord[];
  results: JsonRecord[];
  notes: JsonRecord[];
};

type AuditReadinessStatus =
  | "conforme"
  | "a_completer"
  | "non_applicable"
  | "exclu"
  | "a_verifier";

type IndicatorReview = {
  number: number;
  status: AuditReadinessStatus;
  label: string;
  justification: string;
  hasProof: boolean;
  answers: JsonRecord[];
  questions: JsonRecord[];
  result?: JsonRecord;
  note?: string;
  proofLabels: string[];
  alerts: string[];
  conclusion: string;
};

const FORMATS: EvidenceFormat[] = [
  "PDF",
  "Word",
  "site internet",
  "mail",
  "capture",
  "plateforme",
  "entretien",
  "autre",
];

const APPLICABILITY_LABELS: Record<IcpfApplicability, string> = {
  toutes_prestations: "Toutes prestations",
  action_formation: "Action de formation",
  bilan_competences: "Bilan de competences",
  vae: "VAE",
  apprentissage: "Apprentissage",
  cfa: "CFA",
  certification_professionnelle: "Certification professionnelle",
  alternance: "Alternance",
  afest: "AFEST",
  sous_traitance: "Sous-traitance / portage",
  nouvel_entrant: "Nouvel entrant",
};

const READINESS_LABELS: Record<AuditReadinessStatus, string> = {
  conforme: "Conforme",
  a_completer: "A completer",
  non_applicable: "Non applicable",
  exclu: "Exclu",
  a_verifier: "A verifier",
};

function emptyDraft(): DraftState {
  return Object.fromEntries(
    ICPF_INDICATORS.map((indicator) => [
      indicator.id,
      { status: "", note: "", evidences: [] },
    ]),
  );
}

function newEvidence(): Evidence {
  return {
    id: crypto.randomUUID(),
    name: "",
    format: "PDF",
    documentDate: "",
    signatureDate: "",
    dated: false,
    completed: false,
    signed: false,
    observed: false,
    note: "",
    coveredItems: [],
  };
}

function readStoredDraft(storageKey: string): StoredDraftState {
  if (typeof window === "undefined") {
    return { draft: emptyDraft(), isPristine: true };
  }
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) {
    return { draft: emptyDraft(), isPristine: true };
  }
  try {
    return {
      draft: { ...emptyDraft(), ...(JSON.parse(saved) as DraftState) },
      isPristine: false,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return { draft: emptyDraft(), isPristine: true };
  }
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function dateFr(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function evidenceSentence(evidence: Evidence) {
  const covered = evidence.coveredItems.join(", ");
  const mentioning = covered ? `mentionnant : ${covered}` : "sans item rattache";
  const date = evidence.documentDate ? dateFr(evidence.documentDate) : "";
  const signed = evidence.signatureDate
    ? `signe le ${dateFr(evidence.signatureDate)}`
    : evidence.signed
      ? "signe"
      : "";
  const completed = evidence.completed ? "complete/rempli" : "";

  if (evidence.format === "site internet") {
    return [
      `Vu le site internet ${evidence.name || "[nom ou URL]"}`,
      evidence.observed ? "consulte pendant l'audit" : "",
      mentioning,
    ]
      .filter(Boolean)
      .join(", ") + ".";
  }
  if (evidence.format === "mail") {
    return [
      `Vu le mail ${evidence.name || "[objet]"}`,
      date ? `envoye le ${date}` : "",
      mentioning,
    ]
      .filter(Boolean)
      .join(", ") + ".";
  }
  if (evidence.format === "entretien") {
    return [
      `Vu/recueilli par entretien avec ${evidence.note || evidence.name || "[interlocuteur]"}`,
      covered ? `concernant : ${covered}` : "sans item rattache",
    ].join(", ") + ".";
  }
  return [
    `Vu le document "${evidence.name || "[nom]"}"`,
    `au format ${evidence.format}`,
    date ? `date du ${date}` : "",
    completed,
    signed,
    mentioning,
  ]
    .filter(Boolean)
    .join(", ") + ".";
}

function buildFinding({
  coveredItems,
  missingItems,
  note,
  status,
}: {
  coveredItems: string[];
  missingItems: string[];
  note: string;
  status: IcpfIndicatorStatus;
}) {
  if (status === "conforme") {
    return [
      "Les elements observes permettent de verifier l'exigence de l'indicateur.",
      coveredItems.length ? `Items verifies : ${coveredItems.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (status === "non_conforme") {
    return [
      "Les elements observes ne permettent pas de verifier l'ensemble des attendus de l'indicateur.",
      missingItems.length
        ? `Items manquants ou insuffisamment justifies : ${missingItems.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (status === "non_concerne") {
    return [
      "Indicateur non concerne pour le perimetre audite.",
      note.trim() ? `Precision : ${note.trim()}.` : "La justification doit etre explicite dans la grille.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    "L'indicateur reste a verifier avant audit ICPF.",
    note.trim() ? `Point d'attention : ${note.trim()}.` : "La conclusion doit etre completee avec une preuve exploitable.",
  ]
    .filter(Boolean)
    .join(" ");
}

function isMeaningfulAnswer(answer: JsonRecord) {
  const value = textValue(answer.answer);
  return Boolean(value && value !== "unknown" && value !== "non_applicable");
}

function extractNote(note?: JsonRecord) {
  if (!note) return "";
  return (
    textValue(note.user_notes) ||
    textValue(note.note) ||
    textValue(note.agent_note) ||
    textValue(note.comment) ||
    textValue(note.comments)
  );
}

function extractProofLabels(answers: JsonRecord[], result?: JsonRecord) {
  const labels = new Set<string>();
  answers.forEach((answer) => {
    [
      answer.evidence,
      answer.evidence_text,
      answer.proof,
      answer.proof_text,
      answer.comment,
      answer.comments,
      answer.note,
    ].forEach((value) => {
      const text = textValue(value);
      if (text.length >= 8) labels.add(text);
    });
  });
  arrayValue(result?.recommended_models).forEach((value) => {
    const text = textValue(value);
    if (text) labels.add(`Modele recommande : ${text}`);
  });
  return Array.from(labels);
}

function resultStatus(result?: JsonRecord) {
  return textValue(result?.status).toLowerCase();
}

function resultDiagnosis(result?: JsonRecord) {
  return textValue(result?.diagnosis);
}

function buildReviewMap(data: InitialPreauditData | null, draft: DraftState) {
  const session = data?.session ?? null;
  const applicableIndicators = session?.applicable_indicators ?? [];
  const excludedIndicators = session?.excluded_indicators ?? [];
  const hasApplicabilityMatrix = applicableIndicators.length > 0 || excludedIndicators.length > 0;

  const questionsByIndicator = new Map<number, JsonRecord[]>();
  const questionIndicatorById = new Map<string, number>();
  (data?.questions ?? []).forEach((question) => {
    const indicatorNumber = numberValue(question.indicator_number);
    if (!Number.isFinite(indicatorNumber)) return;
    questionsByIndicator.set(indicatorNumber, [
      ...(questionsByIndicator.get(indicatorNumber) ?? []),
      question,
    ]);
    const id = textValue(question.id);
    if (id) questionIndicatorById.set(id, indicatorNumber);
  });

  const answersByIndicator = new Map<number, JsonRecord[]>();
  (data?.answers ?? []).forEach((answer) => {
    const questionId = textValue(answer.question_id);
    const indicatorNumber =
      questionIndicatorById.get(questionId) ?? numberValue(answer.indicator_number);
    if (!Number.isFinite(indicatorNumber)) return;
    answersByIndicator.set(indicatorNumber, [
      ...(answersByIndicator.get(indicatorNumber) ?? []),
      answer,
    ]);
  });

  const resultsByIndicator = new Map<number, JsonRecord>();
  (data?.results ?? []).forEach((result) => {
    const indicatorNumber = numberValue(result.indicator_number);
    if (Number.isFinite(indicatorNumber)) resultsByIndicator.set(indicatorNumber, result);
  });

  const notesByIndicator = new Map<number, JsonRecord>();
  (data?.notes ?? []).forEach((note) => {
    const indicatorNumber = numberValue(note.indicator_number);
    if (Number.isFinite(indicatorNumber)) notesByIndicator.set(indicatorNumber, note);
  });

  const map = new Map<number, IndicatorReview>();

  ICPF_INDICATORS.forEach((indicator) => {
    const number = indicator.indicatorNumber;
    const result = resultsByIndicator.get(number);
    const questions = questionsByIndicator.get(number) ?? [];
    const answers = answersByIndicator.get(number) ?? [];
    const note = extractNote(notesByIndicator.get(number));
    const proofLabels = extractProofLabels(answers, result);
    const localEvidence = draft[indicator.id]?.evidences ?? [];
    const hasProof = proofLabels.length > 0 || localEvidence.some((evidence) => evidence.name.trim());
    const answeredCount = answers.filter(isMeaningfulAnswer).length;
    const status = resultStatus(result);
    const diagnosis = resultDiagnosis(result);
    const score = numberValue(result?.score);
    const isExcluded = excludedIndicators.includes(number);
    const isApplicable =
      !hasApplicabilityMatrix || applicableIndicators.includes(number);
    const draftStatus = draft[indicator.id]?.status;

    let reviewStatus: AuditReadinessStatus = "a_verifier";
    let justification = "Indicateur a relire avant audit ICPF.";

    if (isExcluded) {
      reviewStatus = "exclu";
      justification = note || "Indicateur exclu dans le perimetre preaudit.";
    } else if (!isApplicable) {
      reviewStatus = "non_applicable";
      justification = note || "Indicateur marque non applicable dans le preaudit.";
    } else if (draftStatus === "non_conforme" || status === "majeure" || status === "mineure") {
      reviewStatus = "a_completer";
      justification = diagnosis || "Le resultat preaudit signale un ecart ou un risque.";
    } else if (draftStatus === "conforme" || status === "conforme") {
      reviewStatus = hasProof ? "conforme" : "a_verifier";
      justification = hasProof
        ? diagnosis || "Conformite appuyee par des traces disponibles."
        : "Conformite indiquee, mais aucune preuve exploitable n'est rattachee.";
    } else if (answeredCount === 0) {
      reviewStatus = "a_verifier";
      justification = "Aucune reponse preaudit exploitable n'est disponible.";
    } else if (!hasProof) {
      reviewStatus = "a_completer";
      justification = "Des reponses existent, mais la preuve reste insuffisante.";
    } else if (Number.isFinite(score) && score >= 80) {
      reviewStatus = "conforme";
      justification = diagnosis || "Reponses et preuves suffisantes pour une validation de principe.";
    } else {
      reviewStatus = "a_verifier";
      justification = diagnosis || "Reponses presentes, a consolider avant audit.";
    }

    const conclusion =
      diagnosis ||
      (reviewStatus === "conforme"
        ? "Les elements disponibles permettent de justifier l'indicateur sous reserve de conserver les preuves citees."
        : reviewStatus === "non_applicable" || reviewStatus === "exclu"
          ? `${READINESS_LABELS[reviewStatus]} : la justification du perimetre doit rester explicite.`
          : "Conclusion a completer avec des preuves nommees, datees et rattachees aux attendus.");

    const alerts = [
      !hasProof && isApplicable && !isExcluded ? "Absence de trace exploitable." : "",
      (status === "conforme" || draftStatus === "conforme") && !hasProof
        ? "Indicateur marque conforme sans preuve solide."
        : "",
      answeredCount === 0 && isApplicable && !isExcluded ? "Indicateur non traite dans le preaudit." : "",
      (reviewStatus === "non_applicable" || reviewStatus === "exclu") && !note
        ? "Non-applicabilite ou exclusion a justifier clairement."
        : "",
      diagnosis.length > 0 && diagnosis.length < 30 ? "Conclusion preaudit trop courte ou trop vague." : "",
      status === "conforme" && answeredCount > 0 && answers.some((answer) => textValue(answer.answer) === "no")
        ? "Contradiction possible entre reponse negative et statut conforme."
        : "",
    ].filter(Boolean);

    map.set(number, {
      number,
      status: reviewStatus,
      label: READINESS_LABELS[reviewStatus],
      justification,
      hasProof,
      answers,
      questions,
      result,
      note,
      proofLabels,
      alerts,
      conclusion,
    });
  });

  return map;
}

export default function IcpfAssistantClient({
  auditId,
  dossierId,
  preauditData,
}: {
  auditId?: string;
  dossierId?: string;
  preauditData: InitialPreauditData | null;
}) {
  const linkedId = preauditData?.session?.id || dossierId || auditId || "standalone";
  const storageKey = `selen:icpf-assistant:${linkedId}`;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [{ draft, isPristine }, setDraftState] = useState<StoredDraftState>(() =>
    readStoredDraft(storageKey),
  );
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isPristine) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, isPristine, storageKey]);

  const reviews = useMemo(() => buildReviewMap(preauditData, draft), [draft, preauditData]);
  const indicator = ICPF_INDICATORS[currentIndex];
  const advice = indicatorAdvice[indicator.indicatorNumber];
  const review = reviews.get(indicator.indicatorNumber);
  const indicatorDraft = draft[indicator.id] ?? { status: "", note: "", evidences: [] };

  const coverage = useMemo(() => {
    const itemToDocs = new Map<string, string[]>();
    indicator.items.forEach((item) => itemToDocs.set(item, []));
    indicatorDraft.evidences.forEach((evidence) => {
      evidence.coveredItems.forEach((item) => {
        itemToDocs.get(item)?.push(evidence.name || "Preuve sans nom");
      });
    });
    const covered = indicator.items.filter((item) => (itemToDocs.get(item)?.length ?? 0) > 0);
    const missing = indicator.items.filter((item) => !covered.includes(item));
    const shouldCheckMissing =
      indicatorDraft.status !== "non_evalue" && indicatorDraft.status !== "non_concerne";
    const alerts = [
      ...(shouldCheckMissing
        ? missing.map((item) => `Item non rattache a une preuve : ${item}`)
        : []),
      ...indicatorDraft.evidences
        .filter(
          (evidence) =>
            (evidence.dated || evidence.signed) &&
            !evidence.documentDate &&
            !evidence.signatureDate,
        )
        .map((evidence) => `Date manquante pour : ${evidence.name || "preuve sans nom"}`),
      ...indicatorDraft.evidences
        .filter((evidence) => evidence.coveredItems.length === 0)
        .map((evidence) => `Preuve sans item rattache : ${evidence.name || "preuve sans nom"}`),
      indicatorDraft.status === "conforme" && missing.length > 0
        ? "Indicateur marque conforme alors que des items restent non couverts."
        : "",
    ].filter(Boolean);
    return { itemToDocs, covered, missing, alerts };
  }, [indicator.items, indicatorDraft.evidences, indicatorDraft.status]);

  const globalCounters = useMemo(() => {
    const list = Array.from(reviews.values());
    return {
      ok: list.filter((item) => item.status === "conforme").length,
      verify: list.filter((item) => item.status === "a_verifier").length,
      incomplete: list.filter((item) => item.status === "a_completer").length,
      notApplicable: list.filter((item) => item.status === "non_applicable" || item.status === "exclu").length,
      withoutProof: list.filter((item) => !item.hasProof && item.status !== "non_applicable" && item.status !== "exclu").length,
    };
  }, [reviews]);

  const evidenceText = [
    ...(review?.proofLabels ?? []).map((proof) => `Preaudit : ${proof}`),
    ...indicatorDraft.evidences.map(evidenceSentence),
  ].join("\n");
  const findingText =
    indicatorDraft.status || indicatorDraft.note || indicatorDraft.evidences.length
      ? buildFinding({
          coveredItems: coverage.covered,
          missingItems: coverage.missing,
          note: indicatorDraft.note,
          status: indicatorDraft.status,
        })
      : review?.conclusion || "Conclusion a completer avec une preuve exploitable.";

  function updateIndicator(patch: Partial<IndicatorDraft>) {
    setDraftState((current) => ({
      isPristine: false,
      draft: {
        ...current.draft,
        [indicator.id]: {
          ...(current.draft[indicator.id] ?? { status: "", note: "", evidences: [] }),
          ...patch,
        },
      },
    }));
  }

  function updateEvidence(id: string, patch: Partial<Evidence>) {
    updateIndicator({
      evidences: indicatorDraft.evidences.map((evidence) =>
        evidence.id === id ? { ...evidence, ...patch } : evidence,
      ),
    });
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  function resetAssistant() {
    if (!window.confirm("Reinitialiser l'assistant et supprimer le brouillon local ?")) return;
    window.localStorage.removeItem(storageKey);
    setDraftState({ draft: emptyDraft(), isPristine: true });
    setCopied("");
  }

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Gestion Lil</p>
          <h1 style={s.title}>Assistant grille ICPF</h1>
          <p style={s.subtitle}>
            {preauditData?.session
              ? `Lecture preaudit ${preauditData.session.id.slice(0, 8)}. Les 32 indicateurs restent affiches.`
              : "Aucune session preaudit reliee : les 32 indicateurs restent a verifier."}
          </p>
        </div>
        <div style={s.actions}>
          <SelenButton type="button" variant="danger" onClick={resetAssistant}>
            Reinitialiser
          </SelenButton>
          <Link href="/agent/gestion/audits" style={{ textDecoration: "none" }}>
            <SelenButton type="button" variant="ghost">Audits</SelenButton>
          </Link>
        </div>
      </header>

      <SelenCard>
        <div style={s.counterGrid}>
          <Counter label="OK" value={globalCounters.ok} tone="success" />
          <Counter label="A verifier" value={globalCounters.verify} tone="info" />
          <Counter label="Incomplets" value={globalCounters.incomplete} tone="danger" />
          <Counter label="Non applicables" value={globalCounters.notApplicable} tone="muted" />
          <Counter label="Sans preuve" value={globalCounters.withoutProof} tone="warn" />
        </div>
        <div style={s.indicatorRail}>
          {ICPF_INDICATORS.map((item, index) => {
            const itemReview = reviews.get(item.indicatorNumber);
            return (
              <button
                key={item.id}
                type="button"
                style={{
                  ...s.indicatorChip,
                  ...(index === currentIndex ? s.indicatorChipActive : {}),
                  ...statusBorder(itemReview?.status),
                }}
                onClick={() => setCurrentIndex(index)}
                title={`${item.indicatorNumber} - ${item.title}`}
              >
                {item.indicatorNumber}
              </button>
            );
          })}
        </div>
      </SelenCard>

      <SelenCard>
        <div style={s.indicatorHead}>
          <div>
            <SelenCardTitle>
              {indicator.criterion} - Indicateur {indicator.indicatorNumber}
            </SelenCardTitle>
            <p style={s.statusLine}>
              <span style={{ ...s.statusBadge, ...statusColor(review?.status) }}>
                {review?.label ?? "A verifier"}
              </span>
              <span>{review?.justification ?? "Indicateur a relire avant audit ICPF."}</span>
            </p>
            <p style={s.official}>{indicator.officialLabel}</p>
            <p style={s.muted}>{indicator.requirement}</p>
            <div style={s.badges}>
              {indicator.applicability.map((scope) => (
                <span key={scope} style={s.badge}>
                  {APPLICABILITY_LABELS[scope]}
                </span>
              ))}
            </div>
            <div style={s.expected}>
              <strong>Attendu exact</strong>
              <span>{indicator.expected}</span>
            </div>
            {indicator.todo ? <p style={s.todo}>{indicator.todo}</p> : null}
          </div>
          <select
            value={indicator.id}
            onChange={(event) => {
              const nextIndex = ICPF_INDICATORS.findIndex((item) => item.id === event.target.value);
              setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
            }}
            style={s.input}
          >
            {ICPF_INDICATORS.map((item) => (
              <option key={item.id} value={item.id}>
                Indicateur {item.indicatorNumber} - {item.title}
              </option>
            ))}
          </select>
        </div>
        <div style={s.toolbar}>
          <SelenButton
            type="button"
            variant="ghost"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          >
            Precedent
          </SelenButton>
          <SelenButton
            type="button"
            variant="ghost"
            disabled={currentIndex === ICPF_INDICATORS.length - 1}
            onClick={() => setCurrentIndex((index) => Math.min(ICPF_INDICATORS.length - 1, index + 1))}
          >
            Suivant
          </SelenButton>
          <span style={s.progress}>
            {coverage.covered.length}/{indicator.items.length} items couverts localement
          </span>
          <select
            value={indicatorDraft.status}
            onChange={(event) => updateIndicator({ status: event.target.value as IcpfIndicatorStatus })}
            style={s.input}
          >
            <option value="">Statut local optionnel</option>
            <option value="non_evalue">Non evalue</option>
            <option value="non_concerne">Non concerne</option>
            <option value="conforme">Conforme</option>
            <option value="non_conforme">Non conforme</option>
          </select>
        </div>
      </SelenCard>

      <section style={s.grid}>
        <div style={s.mainColumn}>
          <SelenCard>
            <SelenCardTitle>Donnees preaudit exploitees</SelenCardTitle>
            <div style={s.auditGrid}>
              <Info label="Reponses" value={`${review?.answers.filter(isMeaningfulAnswer).length ?? 0}/${review?.questions.length ?? 0}`} />
              <Info label="Resultat" value={resultStatus(review?.result) || "-"} />
              <Info label="Score" value={textValue(review?.result?.score) || "-"} />
              <Info label="Risque" value={textValue(review?.result?.risk_level) || "-"} />
            </div>
            <TextList
              title="Preuves reellement disponibles"
              items={review?.proofLabels ?? []}
              empty="Aucune preuve exploitable remontee du preaudit."
            />
            {review?.note ? (
              <div style={s.expected}>
                <strong>Note agent preaudit</strong>
                <span>{review.note}</span>
              </div>
            ) : null}
          </SelenCard>

          <SelenCard>
            <div style={s.cardHead}>
              <SelenCardTitle>Preuves observees dans l'assistant</SelenCardTitle>
              <SelenButton
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  updateIndicator({ evidences: [...indicatorDraft.evidences, newEvidence()] })
                }
              >
                Ajouter une preuve
              </SelenButton>
            </div>
            <div style={s.stack}>
              {indicatorDraft.evidences.map((evidence) => (
                <div key={evidence.id} style={s.evidence}>
                  <input
                    value={evidence.name}
                    onChange={(event) => updateEvidence(evidence.id, { name: event.target.value })}
                    placeholder="Nom du document, URL, objet du mail..."
                    style={s.input}
                  />
                  <div style={s.formGrid}>
                    <select
                      value={evidence.format}
                      onChange={(event) => updateEvidence(evidence.id, { format: event.target.value as EvidenceFormat })}
                      style={s.input}
                    >
                      {FORMATS.map((format) => <option key={format}>{format}</option>)}
                    </select>
                    <input
                      type="date"
                      value={evidence.documentDate}
                      onChange={(event) => updateEvidence(evidence.id, { documentDate: event.target.value })}
                      style={s.input}
                    />
                    <input
                      type="date"
                      value={evidence.signatureDate}
                      onChange={(event) => updateEvidence(evidence.id, { signatureDate: event.target.value })}
                      style={s.input}
                    />
                  </div>
                  <div style={s.checks}>
                    {(["dated", "completed", "signed", "observed"] as const).map((key) => (
                      <label key={key} style={s.check}>
                        <input
                          type="checkbox"
                          checked={Boolean(evidence[key])}
                          onChange={(event) => updateEvidence(evidence.id, { [key]: event.target.checked })}
                        />
                        {key === "dated" ? "date" : key === "completed" ? "complete/rempli" : key === "signed" ? "signe" : "observe audit"}
                      </label>
                    ))}
                  </div>
                  <div style={s.items}>
                    <button
                      type="button"
                      style={s.smallAction}
                      onClick={() => updateEvidence(evidence.id, { coveredItems: indicator.items })}
                    >
                      tout selectionner
                    </button>
                    {indicator.items.map((item) => {
                      const selected = evidence.coveredItems.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          style={selected ? s.pillOn : s.pill}
                          onClick={() =>
                            updateEvidence(evidence.id, {
                              coveredItems: selected
                                ? evidence.coveredItems.filter((value) => value !== item)
                                : [...evidence.coveredItems, item],
                            })
                          }
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={evidence.note}
                    onChange={(event) => updateEvidence(evidence.id, { note: event.target.value })}
                    placeholder="Note libre, interlocuteur pour entretien, precision utile..."
                    style={{ ...s.input, minHeight: 64, paddingTop: 10 }}
                  />
                  <div style={s.actionsRight}>
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateIndicator({
                          evidences: [
                            ...indicatorDraft.evidences,
                            { ...evidence, id: crypto.randomUUID(), name: `${evidence.name} (copie)` },
                          ],
                        })
                      }
                    >
                      Dupliquer
                    </SelenButton>
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        updateIndicator({
                          evidences: indicatorDraft.evidences.filter((item) => item.id !== evidence.id),
                        })
                      }
                    >
                      Supprimer
                    </SelenButton>
                  </div>
                </div>
              ))}
              {indicatorDraft.evidences.length === 0 ? (
                <p style={s.muted}>Ajoutez une preuve seulement si le preaudit ne suffit pas.</p>
              ) : null}
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Textes a copier</SelenCardTitle>
            <TextBlock title="Elements de preuve" text={evidenceText || "Aucune preuve renseignee."} />
            <TextBlock title="Constat d'audit" text={findingText} />
            <textarea
              value={indicatorDraft.note}
              onChange={(event) => updateIndicator({ note: event.target.value })}
              placeholder="Note locale, raison si non evalue ou precision si non concerne"
              style={{ ...s.input, minHeight: 70, paddingTop: 10 }}
            />
            <div style={s.actions}>
              <SelenButton type="button" size="sm" onClick={() => void copy(evidenceText, "preuves")}>
                Copier elements de preuve
              </SelenButton>
              <SelenButton type="button" size="sm" onClick={() => void copy(findingText, "constat")}>
                Copier constat
              </SelenButton>
              <SelenButton type="button" size="sm" variant="secondary" onClick={() => void copy(`${evidenceText}\n\n${findingText}`, "tout")}>
                Copier les deux
              </SelenButton>
            </div>
            {copied ? <p style={s.ok}>Copie reussie : {copied}</p> : null}
          </SelenCard>
        </div>

        <div style={s.side}>
          <SelenCard>
            <SelenCardTitle>Controle chef auditeur</SelenCardTitle>
            <TextList
              title="Preuves attendues"
              items={[...indicator.possibleEvidence, ...(advice?.evidenceToRequest ?? [])]}
              empty="Aucune preuve attendue configuree."
            />
            <TextList
              title="Points de vigilance"
              items={[...(advice?.vigilancePoints ?? []), ...(review?.alerts ?? []), ...coverage.alerts]}
              empty="Aucune alerte."
            />
            <div style={s.expected}>
              <strong>Formulation conseillee</strong>
              <span>{findingText}</span>
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Synthese anti-oubli</SelenCardTitle>
            <p style={s.muted}>Items couverts localement : {coverage.covered.length ? coverage.covered.join(", ") : "-"}</p>
            <p style={s.muted}>Items non couverts localement : {coverage.missing.length ? coverage.missing.join(", ") : "-"}</p>
            <div style={s.itemDocs}>
              {indicator.items.map((item) => {
                const docs = coverage.itemToDocs.get(item) ?? [];
                return (
                  <p key={item} style={s.itemDocLine}>
                    <strong>{item}</strong>
                    <span>{docs.length ? docs.join(", ") : "Aucune preuve locale rattachee"}</span>
                  </p>
                );
              })}
            </div>
          </SelenCard>
        </div>
      </section>
    </main>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "danger" | "muted" | "warn" }) {
  return (
    <div style={{ ...s.counter, ...counterTone(tone) }}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p style={s.info}>
      <strong>{label}</strong>
      <span>{value || "-"}</span>
    </p>
  );
}

function TextList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const uniqueItems = Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
  return (
    <div style={s.textList}>
      <strong>{title}</strong>
      {uniqueItems.length ? (
        <ul style={s.ul}>
          {uniqueItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <span style={s.muted}>{empty}</span>
      )}
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div style={s.textBlock}>
      <strong>{title}</strong>
      <pre style={s.pre}>{text}</pre>
    </div>
  );
}

function statusColor(status?: AuditReadinessStatus): CSSProperties {
  if (status === "conforme") return { color: "#135c33", background: "rgba(65, 150, 92, 0.16)", borderColor: "rgba(65, 150, 92, 0.5)" };
  if (status === "a_completer") return { color: "#8a251f", background: "rgba(210, 74, 64, 0.14)", borderColor: "rgba(210, 74, 64, 0.48)" };
  if (status === "non_applicable" || status === "exclu") return { color: "#595047", background: "rgba(120, 105, 90, 0.14)", borderColor: "rgba(120, 105, 90, 0.42)" };
  return { color: "#7a520b", background: "rgba(201, 148, 58, 0.15)", borderColor: "rgba(201, 148, 58, 0.48)" };
}

function statusBorder(status?: AuditReadinessStatus): CSSProperties {
  if (status === "conforme") return { borderColor: "rgba(65, 150, 92, 0.62)" };
  if (status === "a_completer") return { borderColor: "rgba(210, 74, 64, 0.62)" };
  if (status === "non_applicable" || status === "exclu") return { borderColor: "rgba(120, 105, 90, 0.45)" };
  return { borderColor: "rgba(201, 148, 58, 0.62)" };
}

function counterTone(tone: "success" | "info" | "danger" | "muted" | "warn"): CSSProperties {
  if (tone === "success") return { borderColor: "rgba(65, 150, 92, 0.42)" };
  if (tone === "danger") return { borderColor: "rgba(210, 74, 64, 0.42)" };
  if (tone === "warn") return { borderColor: "rgba(201, 148, 58, 0.42)" };
  if (tone === "muted") return { borderColor: "rgba(120, 105, 90, 0.32)" };
  return { borderColor: "rgba(88, 122, 165, 0.42)" };
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1320, margin: "0 auto", padding: "24px 28px 48px" },
  header: { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 },
  eyebrow: { fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 32, margin: "8px 0", color: "var(--selen-text)" },
  subtitle: { color: "var(--selen-text2)", fontSize: 13, margin: 0 },
  official: { color: "var(--selen-text)", fontSize: 14, lineHeight: 1.5, margin: "8px 0 6px" },
  statusLine: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.4, margin: "8px 0" },
  statusBadge: { border: "1px solid", borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800 },
  expected: { display: "grid", gap: 4, border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", padding: 10, color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.45, marginTop: 10 },
  badges: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  badge: { border: "1px solid rgba(201, 148, 58, 0.38)", background: "rgba(201, 148, 58, 0.12)", color: "var(--selen-gold2)", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 },
  todo: { color: "var(--selen-danger)", fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  actionsRight: { display: "flex", justifyContent: "flex-end", gap: 8 },
  counterGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 },
  counter: { display: "grid", gap: 2, border: "1px solid", borderRadius: "var(--radius-sm)", padding: "10px 12px", color: "var(--selen-text2)" },
  indicatorRail: { display: "grid", gridTemplateColumns: "repeat(16, minmax(34px, 1fr))", gap: 6, marginTop: 12 },
  indicatorChip: { minHeight: 34, border: "1px solid", background: "rgba(247, 239, 224, 0.08)", color: "var(--selen-text)", borderRadius: 8, fontWeight: 800 },
  indicatorChipActive: { background: "rgba(201, 148, 58, 0.18)", color: "var(--selen-gold2)" },
  indicatorHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 },
  progress: { color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 0.8fr)", gap: 14, marginTop: 14 },
  mainColumn: { display: "grid", gap: 14, alignContent: "start" },
  side: { display: "grid", gap: 14, alignContent: "start" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" },
  stack: { display: "grid", gap: 12 },
  auditGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 8 },
  info: { display: "grid", gap: 3, border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", padding: 10, margin: 0, color: "var(--selen-text2)", fontSize: 12 },
  evidence: { display: "grid", gap: 10, padding: 12, border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 150px 150px", gap: 8 },
  checks: { display: "flex", gap: 10, flexWrap: "wrap" },
  check: { color: "var(--selen-text2)", fontSize: 12, display: "flex", gap: 5, alignItems: "center" },
  items: { display: "flex", gap: 6, flexWrap: "wrap" },
  pill: { border: "1px solid var(--selen-border)", background: "transparent", color: "var(--selen-text2)", borderRadius: 999, padding: "5px 9px", fontSize: 12 },
  pillOn: { border: "1px solid rgba(201, 148, 58, 0.52)", background: "rgba(201, 148, 58, 0.16)", color: "var(--selen-gold2)", borderRadius: 999, padding: "5px 9px", fontSize: 12 },
  smallAction: { border: "1px solid var(--selen-border)", background: "rgba(247, 239, 224, 0.06)", color: "var(--selen-text2)", borderRadius: 999, padding: "5px 9px", fontSize: 12 },
  input: { minHeight: 38, borderRadius: "var(--radius-sm)", border: "1px solid rgba(120, 90, 50, 0.32)", background: "#f7ecd8", color: "#3b281b", padding: "0 10px", fontSize: 13, boxSizing: "border-box", width: "100%" },
  muted: { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5 },
  itemDocs: { display: "grid", gap: 6, margin: "10px 0" },
  itemDocLine: { display: "grid", gap: 2, margin: 0, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.35 },
  ok: { color: "var(--selen-success)", fontSize: 12 },
  textList: { display: "grid", gap: 6, marginTop: 10, color: "var(--selen-text)" },
  ul: { margin: 0, paddingLeft: 18, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.45 },
  textBlock: { display: "grid", gap: 6, marginBottom: 10, color: "var(--selen-text)" },
  pre: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", padding: 10, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.5, margin: 0 },
};
