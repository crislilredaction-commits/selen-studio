const STEPS = [
  { label: "Création\ndossier" },
  { label: "Assignation\nagent" },
  { label: "Collecte\ndocuments" },
  { label: "Vérification\nconformité" },
  { label: "Génération\nNDA" },
  { label: "Signature\nclient" },
  { label: "Dépôt\nQualiopi" },
];

// Map your dossier status to a step index (0-based)
export function statusToStepIndex(status: string): number {
  const map: Record<string, number> = {
    draft: 0,
    waiting_client: 0,
    assignable: 1,
    assigned: 1,
    in_progress: 2,
    collecting_documents: 2,
    under_review: 3,
    to_complete: 3,
    generated: 4,
    compliant: 5,
    archived: 6,
  };
  return map[status] ?? 0;
}

type DossierTimelineProps = {
  currentStep: number; // 0-based index of the active step
};

export default function DossierTimeline({ currentStep }: DossierTimelineProps) {
  const fillPercent = Math.round((currentStep / (STEPS.length - 1)) * 100);

  return (
    <div
      style={{
        background: "var(--selen-card)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px 28px",
        marginBottom: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Trait doré supérieur */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 2,
          background:
            "linear-gradient(90deg, transparent, var(--selen-gold), transparent)",
          opacity: 0.4,
        }}
      />

      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--selen-gold)",
          opacity: 0.75,
          marginBottom: 20,
        }}
      >
        Progression du dossier
      </p>

      {/* Track + steps */}
      <div style={{ position: "relative" }}>
        {/* Background track */}
        <div
          style={{
            position: "absolute",
            top: 18,
            left: "calc(100% / 14)",
            right: "calc(100% / 14)",
            height: 2,
            background: "var(--selen-bg3)",
            borderRadius: 1,
          }}
        >
          {/* Fill */}
          <div
            style={{
              height: "100%",
              width: `${fillPercent}%`,
              background: `linear-gradient(90deg, var(--selen-gold), var(--selen-gold2))`,
              borderRadius: 1,
              boxShadow: "0 0 8px rgba(201,148,58,0.5)",
              transition: "width 0.6s ease",
            }}
          />
        </div>

        {/* Steps */}
        <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
          {STEPS.map((step, i) => {
            const isDone = i < currentStep;
            const isActive = i === currentStep;
            const isPending = i > currentStep;

            let nodeStyle: React.CSSProperties = {
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              border: "2px solid",
              transition: "all 0.2s",
              flexShrink: 0,
            };

            if (isDone) {
              nodeStyle = {
                ...nodeStyle,
                background: "rgba(201,148,58,0.2)",
                borderColor: "var(--selen-gold)",
                color: "var(--selen-gold2)",
              };
            } else if (isActive) {
              nodeStyle = {
                ...nodeStyle,
                background: "var(--selen-gold)",
                borderColor: "var(--selen-gold2)",
                color: "#0f0c08",
                boxShadow: "0 0 16px rgba(201,148,58,0.5)",
              };
            } else {
              nodeStyle = {
                ...nodeStyle,
                background: "var(--selen-bg3)",
                borderColor: "var(--selen-border)",
                color: "var(--selen-text3)",
              };
            }

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={nodeStyle}>{isDone ? "✓" : i + 1}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: isActive
                      ? "var(--selen-gold2)"
                      : isPending
                        ? "var(--selen-text3)"
                        : "var(--selen-text2)",
                    textAlign: "center",
                    lineHeight: 1.3,
                    maxWidth: 64,
                    fontWeight: isActive ? 500 : 400,
                    fontFamily: "var(--font-body)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
