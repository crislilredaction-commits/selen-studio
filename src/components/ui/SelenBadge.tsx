type Variant =
  | "type"
  | "status"
  | "info"
  | "warn"
  | "success"
  | "danger"
  | "neutral";

export default function SelenBadge({
  children,
  variant = "neutral",
  dot = false,
}: {
  children: React.ReactNode;
  variant?: Variant;
  dot?: boolean;
}) {
  const colors: Record<Variant, string> = {
    type: "var(--selen-gold2)",
    status: "var(--selen-copper)",
    info: "#4da3ff",
    warn: "#ffb347",
    success: "#52d273",
    danger: "#ff6b6b",
    neutral: "var(--selen-text3)",
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 11,
        background: "var(--selen-bg3)",
        border: "1px solid var(--selen-border)",
        color: colors[variant],
        fontWeight: 500,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: colors[variant],
          }}
        />
      )}
      {children}
    </span>
  );
}
