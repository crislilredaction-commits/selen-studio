"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import {
  ICPF_INDICATORS,
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
  if (!status) {
    return "Selectionner une conformite pour generer le constat.";
  }
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
  return [
    "L'indicateur n'a pas pu etre evalue.",
    note.trim() ? `Raison : ${note.trim()}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function IcpfAssistantClient({ auditId }: { auditId?: string }) {
  const storageKey = `selen:icpf-assistant:${auditId || "standalone"}`;
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

  const indicator = ICPF_INDICATORS[currentIndex];
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
    const alerts = [
      ...missing.map((item) => `Item non rattache a une preuve : ${item}`),
      ...indicatorDraft.evidences
        .filter((evidence) => (evidence.dated || evidence.signed) && !evidence.documentDate && !evidence.signatureDate)
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

  const evidenceText = indicatorDraft.evidences.map(evidenceSentence).join("\n");
  const findingText = buildFinding({
    coveredItems: coverage.covered,
    missingItems: coverage.missing,
    note: indicatorDraft.note,
    status: indicatorDraft.status,
  });

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
            Brouillon local {auditId ? `lie a l'audit ${auditId.slice(0, 8)}` : "non lie a un audit"}.
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
        <div style={s.indicatorHead}>
          <div>
            <SelenCardTitle>{indicator.criterion} - {indicator.id.toUpperCase()}</SelenCardTitle>
            <p style={s.official}>{indicator.officialLabel}</p>
            <p style={s.muted}>{indicator.requirement}</p>
            <div style={s.expected}>
              <strong>Attendu</strong>
              <span>{indicator.expected}</span>
            </div>
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
                {item.id.toUpperCase()} - {item.title}
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
            {coverage.covered.length}/{indicator.items.length} items couverts
          </span>
          <select
            value={indicatorDraft.status}
            onChange={(event) => updateIndicator({ status: event.target.value as IcpfIndicatorStatus })}
            style={s.input}
          >
            <option value="">Selectionner une conformite</option>
            <option value="non_evalue">Non evalue</option>
            <option value="conforme">Conforme</option>
            <option value="non_conforme">Non conforme</option>
          </select>
        </div>
      </SelenCard>

      <section style={s.grid}>
        <SelenCard>
          <div style={s.cardHead}>
            <SelenCardTitle>Preuves observees</SelenCardTitle>
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
              <p style={s.muted}>Ajoutez une preuve pour commencer la synthese.</p>
            ) : null}
          </div>
        </SelenCard>

        <div style={s.side}>
          <SelenCard>
            <SelenCardTitle>Synthese anti-oubli</SelenCardTitle>
            <p style={s.muted}>Items couverts : {coverage.covered.length ? coverage.covered.join(", ") : "-"}</p>
            <p style={s.muted}>Items non couverts : {coverage.missing.length ? coverage.missing.join(", ") : "-"}</p>
            <div style={s.itemDocs}>
              {indicator.items.map((item) => {
                const docs = coverage.itemToDocs.get(item) ?? [];
                return (
                  <p key={item} style={s.itemDocLine}>
                    <strong>{item}</strong>
                    <span>{docs.length ? docs.join(", ") : "Aucune preuve rattachee"}</span>
                  </p>
                );
              })}
            </div>
            <div style={s.alerts}>
              {coverage.alerts.map((alert) => <span key={alert}>{alert}</span>)}
              {coverage.alerts.length === 0 ? <span style={s.ok}>Aucune alerte.</span> : null}
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Textes a copier</SelenCardTitle>
            <TextBlock title="Elements de preuve" text={evidenceText || "Aucune preuve renseignee."} />
            <TextBlock title="Constat d'audit" text={findingText} />
            <textarea
              value={indicatorDraft.note}
              onChange={(event) => updateIndicator({ note: event.target.value })}
              placeholder="Note libre ou raison si non evalue"
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
      </section>
    </main>
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

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1280, margin: "0 auto", padding: "24px 28px 48px" },
  header: { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 },
  eyebrow: { fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 32, margin: "8px 0", color: "var(--selen-text)" },
  subtitle: { color: "var(--selen-text2)", fontSize: 13, margin: 0 },
  official: { color: "var(--selen-text)", fontSize: 14, lineHeight: 1.5, margin: "8px 0 6px" },
  expected: { display: "grid", gap: 4, border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", padding: 10, color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.45, marginTop: 10 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  actionsRight: { display: "flex", justifyContent: "flex-end", gap: 8 },
  indicatorHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 },
  progress: { color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(340px, 0.65fr)", gap: 14, marginTop: 14 },
  side: { display: "grid", gap: 14, alignContent: "start" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" },
  stack: { display: "grid", gap: 12 },
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
  alerts: { display: "grid", gap: 6, color: "var(--selen-danger)", fontSize: 12 },
  itemDocs: { display: "grid", gap: 6, margin: "10px 0" },
  itemDocLine: { display: "grid", gap: 2, margin: 0, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.35 },
  ok: { color: "var(--selen-success)", fontSize: 12 },
  textBlock: { display: "grid", gap: 6, marginBottom: 10, color: "var(--selen-text)" },
  pre: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", padding: 10, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.5, margin: 0 },
};
