"use client";

import { getNdaDocumentChecklistItems } from "@/lib/ndaChecklist";

type Props = {
  receivedKeys: string[];
  phase1InfoStatus?: "completed" | "unknown";
  scope?: "initial" | "full";
};

const NDA_DOCUMENT_CHECKLIST = getNdaDocumentChecklistItems();

const REQUIRED_PHASE_1_KEYS = NDA_DOCUMENT_CHECKLIST.filter(
  (d) => d.phase === 1 && d.required !== false,
).map((d) => d.key);

export default function NdaChecklist({
  receivedKeys,
  phase1InfoStatus = "unknown",
  scope = "full",
}: Props) {
  const phase1Required = NDA_DOCUMENT_CHECKLIST.filter(
    (d) => d.phase === 1 && d.required !== false,
  );
  const phase1Recommended = NDA_DOCUMENT_CHECKLIST.filter(
    (d) => d.phase === 1 && d.required === false,
  );
  const phase2 = NDA_DOCUMENT_CHECKLIST.filter((d) => d.phase === 2);

  const phase1Validated = REQUIRED_PHASE_1_KEYS.every((key) =>
    receivedKeys.includes(key),
  );
  const showFinalPhase = scope === "full" && phase1Validated;

  function renderItem(key: string, label: string, helper?: string) {
    const received = receivedKeys.includes(key);

    return (
      <div
        key={key}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "8px 0",
          borderBottom: "1px solid var(--selen-border)",
          fontFamily: "var(--font-body)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: "var(--selen-text)",
            }}
          >
            {label}
          </div>
          {helper ? (
            <div
              style={{
                fontSize: 11,
                color: "var(--selen-text3)",
                marginTop: 2,
              }}
            >
              {helper}
            </div>
          ) : null}
        </div>

        <span
          style={{
            fontSize: 12,
            color: received ? "var(--selen-gold2)" : "var(--selen-text3)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {received ? "✓ reçu" : "attendu"}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--selen-bg3)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        marginBottom: 12,
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--selen-text)",
          marginBottom: 10,
        }}
      >
        Phase 1
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "8px 0",
          borderBottom: "1px solid var(--selen-border)",
          fontFamily: "var(--font-body)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: "var(--selen-text)",
            }}
          >
            Informations phase 1 remplies
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--selen-text3)",
              marginTop: 2,
            }}
          >
            Formulaire NDA renseigné côté Vitrine, traité comme information
            métier et non comme document.
          </div>
        </div>

        <span
          style={{
            fontSize: 12,
            color:
              phase1InfoStatus === "completed"
                ? "var(--selen-gold2)"
                : "var(--selen-text3)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {phase1InfoStatus === "completed" ? "✓ renseigné" : "à vérifier"}
        </span>
      </div>

      {phase1Required.map((d) => renderItem(d.key, d.label, d.helper))}

      {scope === "full" && phase1Recommended.length ? (
        <>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--selen-text)",
              marginTop: 18,
              marginBottom: 8,
            }}
          >
            Compléments recommandés
          </div>

          {phase1Recommended.map((d) => renderItem(d.key, d.label, d.helper))}
        </>
      ) : null}

      {showFinalPhase ? (
        <>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--selen-text)",
              marginTop: 18,
              marginBottom: 10,
            }}
          >
            Phase 2
          </div>

          {phase2.map((d) => renderItem(d.key, d.label, d.helper))}
        </>
      ) : scope === "full" ? (
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--selen-text3)",
          }}
        >
          La phase 2 apparaîtra une fois les pièces nécessaires à l&apos;analyse
          programme / CV reçues. Les compléments recommandés ne bloquent pas
          cette étape.
        </div>
      ) : null}
    </div>
  );
}
