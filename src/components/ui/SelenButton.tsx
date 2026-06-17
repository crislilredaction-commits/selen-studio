type Variant = "primary" | "ghost" | "secondary" | "danger";

export default function SelenButton({
  children,
  variant = "primary",
  size = "md",
  ...props
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const padding = size === "sm" ? "6px 12px" : "10px 18px";

  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      background:
        "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
      color: "var(--selen-ink)",
      border: "1px solid rgba(120, 90, 50, 0.24)",
      boxShadow: "0 10px 24px rgba(201, 148, 58, 0.18)",
    },
    secondary: {
      background: "rgba(168, 95, 56, 0.14)",
      color: "var(--selen-gold2)",
      border: "1px solid rgba(201, 148, 58, 0.28)",
    },
    ghost: {
      background: "rgba(247, 239, 224, 0.06)",
      color: "var(--selen-text2)",
      border: "1px solid var(--selen-border)",
    },
    danger: {
      background: "var(--selen-danger-bg)",
      color: "var(--selen-danger)",
      border: "1px solid rgba(176, 74, 74, 0.32)",
    },
  };

  return (
    <button
      {...props}
      style={{
        padding,
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "0.2s",
        ...styles[variant],
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}
