"use client";

import { NDA_CHECKLIST } from "@/lib/ndaChecklist";

type Props = {
  receivedKeys: string[];
};

const PHASE_1_KEYS = NDA_CHECKLIST.filter((d) => d.phase === 1).map(
  (d) => d.key,
);

export default function NdaChecklist({ receivedKeys }: Props) {
  const phase1 = NDA_CHECKLIST.filter((d) => d.phase === 1);
  const phase2 = NDA_CHECKLIST.filter((d) => d.phase === 2);

  const phase1Validated = PHASE_1_KEYS.every((key) =>
    receivedKeys.includes(key),
  );

  function renderItem(key: string, label: string) {
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
        <span
          style={{
            fontSize: 13,
            color: "var(--selen-text)",
          }}
        >
          {label}
        </span>

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

      {phase1.map((d) => renderItem(d.key, d.label))}

      {phase1Validated ? (
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

          {phase2.map((d) => renderItem(d.key, d.label))}
        </>
      ) : (
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--selen-text3)",
          }}
        >
          La phase 2 apparaîtra une fois tous les documents de phase 1 reçus.
        </div>
      )}
    </div>
  );
}
