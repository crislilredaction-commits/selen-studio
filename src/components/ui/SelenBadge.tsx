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
    status: "var(--selen-gold2)",
    info: "var(--selen-info)",
    warn: "var(--selen-warn)",
    success: "var(--selen-success)",
    danger: "var(--selen-danger)",
    neutral: "var(--selen-text3)",
  };
  const backgrounds: Record<Variant, string> = {
    type: "rgba(201, 148, 58, 0.14)",
    status: "rgba(168, 95, 56, 0.14)",
    info: "var(--selen-info-bg)",
    warn: "var(--selen-warn-bg)",
    success: "var(--selen-success-bg)",
    danger: "var(--selen-danger-bg)",
    neutral: "rgba(120, 90, 50, 0.1)",
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
        background: backgrounds[variant],
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
