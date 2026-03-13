type Variant = "primary" | "ghost";

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

  const styles =
    variant === "primary"
      ? {
          background: "var(--selen-gold)",
          color: "#0f0c08",
          border: "none",
        }
      : {
          background: "transparent",
          color: "var(--selen-text2)",
          border: "1px solid var(--selen-border)",
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
        ...styles,
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}
