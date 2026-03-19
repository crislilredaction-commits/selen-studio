import Image from "next/image";

type SelionProps = {
  message?: string;
  size?: number;
  compact?: boolean;
  animate?: boolean;
};

export default function Selion({
  message,
  size = 56,
  compact = false,
  animate = false,
}: SelionProps) {
  const animationStyle = animate
    ? {
        animation: "selionPulse 1.8s ease-in-out infinite",
      }
    : undefined;

  if (compact) {
    return (
      <>
        <style>
          {`
            @keyframes selionPulse {
              0% { transform: translateY(0px) scale(1); }
              25% { transform: translateY(-1px) scale(1.03); }
              50% { transform: translateY(0px) scale(1.06); }
              75% { transform: translateY(-1px) scale(1.03); }
              100% { transform: translateY(0px) scale(1); }
            }
          `}
        </style>

        <div
          style={{
            width: size,
            height: size,
            position: "relative",
            flexShrink: 0,
            opacity: 0.98,
            ...animationStyle,
          }}
        >
          <Image
            src="/selion.png"
            alt="Sélion"
            fill
            style={{ objectFit: "contain" }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes selionPulse {
            0% { transform: translateY(0px) scale(1); }
            25% { transform: translateY(-1px) scale(1.03); }
            50% { transform: translateY(0px) scale(1.06); }
            75% { transform: translateY(-1px) scale(1.03); }
            100% { transform: translateY(0px) scale(1); }
          }
        `}
      </style>

      <div
        style={{
          border: "1px solid var(--selen-border)",
          background: "var(--selen-card)",
          borderRadius: "16px",
          padding: "14px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          color: "var(--selen-text)",
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            position: "relative",
            flexShrink: 0,
            ...animationStyle,
          }}
        >
          <Image
            src="/selion.png"
            alt="Sélion"
            fill
            style={{ objectFit: "contain" }}
          />
        </div>

        {message && (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--selen-text2)",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </>
  );
}
