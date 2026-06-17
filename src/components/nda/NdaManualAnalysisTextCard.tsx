"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import SelenButton from "@/components/ui/SelenButton";

type Props = {
  dossierId: string;
  cvInitialText?: string | null;
  programInitialText?: string | null;
  cvAutoTextLength?: number;
  programAutoTextLength?: number;
};

function normalizeText(value?: string | null) {
  return value?.trim() ?? "";
}

function isReady(value: string) {
  return value.trim().length >= 20;
}

function StatusPill({
  ready,
  readyLabel,
}: {
  ready: boolean;
  readyLabel: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: ready
          ? "1px solid rgba(103, 168, 120, 0.38)"
          : "1px solid rgba(212, 159, 63, 0.36)",
        background: ready
          ? "rgba(103, 168, 120, 0.12)"
          : "rgba(212, 159, 63, 0.1)",
        color: ready ? "var(--selen-success)" : "var(--selen-warning)",
        padding: "4px 8px",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {ready ? readyLabel : "Texte à compléter"}
    </span>
  );
}

export default function NdaManualAnalysisTextCard({
  dossierId,
  cvInitialText,
  programInitialText,
  cvAutoTextLength = 0,
  programAutoTextLength = 0,
}: Props) {
  const initialState = useMemo(
    () => ({
      cv: normalizeText(cvInitialText),
      program: normalizeText(programInitialText),
    }),
    [cvInitialText, programInitialText],
  );

  const [cvText, setCvText] = useState(initialState.cv);
  const [programText, setProgramText] = useState(initialState.program);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [savingTarget, setSavingTarget] = useState<"cv" | "program" | "both" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function saveManualTexts(
    values: Record<string, string>,
    target: "cv" | "program" | "both",
  ) {
    try {
      setStatus("saving");
      setSavingTarget(target);
      setError(null);

      const response = await fetch("/agent/api/nda/variables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId, values }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Enregistrement impossible.");
      }

      setStatus("saved");
      setTimeout(() => {
        setStatus("idle");
        setSavingTarget(null);
      }, 1800);
    } catch (saveError) {
      setStatus("error");
      setSavingTarget(null);
      setError(saveError instanceof Error ? saveError.message : "Erreur");
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    minHeight: 180,
    resize: "vertical",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-md)",
    padding: "12px 14px",
    color: "var(--selen-text)",
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  };

  const blockStyle: CSSProperties = {
    display: "grid",
    gap: 8,
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    padding: "12px 14px",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={blockStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--selen-text)",
              }}
            >
              Texte exploitable du CV
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--selen-text3)",
                lineHeight: 1.5,
                margin: "5px 0 0",
              }}
            >
              Si l’extraction automatique échoue ou semble incomplète, collez
              ici le contenu du CV ou rédigez un résumé détaillé des diplômes,
              expériences et compétences utiles à l’analyse.
            </p>
          </div>
          <StatusPill ready={isReady(cvText)} readyLabel="Texte CV prêt" />
        </div>

        {cvAutoTextLength === 0 ? (
          <div style={{ fontSize: 12, color: "var(--selen-warning)" }}>
            Document reçu — texte non extrait automatiquement.
          </div>
        ) : null}

        <textarea
          value={cvText}
          onChange={(event) => setCvText(event.target.value)}
          placeholder="Collez ici le contenu exploitable du CV ou un résumé précis du parcours."
          style={inputStyle}
        />

        <div>
          <SelenButton
            type="button"
            size="sm"
            onClick={() => saveManualTexts({ cv_manual_text: cvText }, "cv")}
            disabled={status === "saving"}
          >
            {status === "saving" && savingTarget === "cv"
              ? "Enregistrement..."
              : "Enregistrer le texte du CV"}
          </SelenButton>
        </div>
      </div>

      <div style={blockStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--selen-text)",
              }}
            >
              Texte exploitable du programme
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--selen-text3)",
                lineHeight: 1.5,
                margin: "5px 0 0",
              }}
            >
              Collez ou corrigez ici le contenu du programme qui servira à
              l’analyse de cohérence.
            </p>
          </div>
          <StatusPill
            ready={isReady(programText)}
            readyLabel="Texte programme prêt"
          />
        </div>

        {programAutoTextLength === 0 ? (
          <div style={{ fontSize: 12, color: "var(--selen-warning)" }}>
            Document reçu — texte non extrait automatiquement.
          </div>
        ) : null}

        <textarea
          value={programText}
          onChange={(event) => setProgramText(event.target.value)}
          placeholder="Collez ici le contenu exploitable du programme."
          style={inputStyle}
        />

        <div>
          <SelenButton
            type="button"
            size="sm"
            onClick={() =>
              saveManualTexts({ program_manual_text: programText }, "program")
            }
            disabled={status === "saving"}
          >
            {status === "saving" && savingTarget === "program"
              ? "Enregistrement..."
              : "Enregistrer le texte du programme"}
          </SelenButton>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <SelenButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            saveManualTexts(
              {
                cv_manual_text: cvText,
                program_manual_text: programText,
              },
              "both",
            )
          }
          disabled={status === "saving"}
        >
          {status === "saving" && savingTarget === "both"
            ? "Enregistrement..."
            : "Enregistrer les deux textes"}
        </SelenButton>
        {status === "saved" ? (
          <span style={{ fontSize: 12, color: "var(--selen-success)" }}>
            Texte enregistré.
          </span>
        ) : null}
        {error ? (
          <span style={{ fontSize: 12, color: "var(--selen-danger)" }}>
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
