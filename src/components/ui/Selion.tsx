import Image from "next/image";

type SelionProps = {
  message?: string;
};

export default function Selion({ message }: SelionProps) {
  return (
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
          width: 56,
          height: 56,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <Image
          src="/selion.png"
          alt="Sélion"
          fill
          style={{ objectFit: "contain" }}
        />
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--selen-gold)",
            marginBottom: 4,
          }}
        >
          Sélion
        </div>

        <div
          style={{
            fontSize: 13,
            color: "var(--selen-text2)",
          }}
        >
          {message ?? "Je veille sur ce dossier ✨"}
        </div>
      </div>
    </div>
  );
}
