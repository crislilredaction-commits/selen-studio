import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  tone?: "dark" | "light";
};

type TitleProps = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

export function SelenCardTitle({ children, style, className }: TitleProps) {
  return (
    <p
      className={className}
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 16,
        fontWeight: 600,
        color: "var(--selen-text)",
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export default function SelenCard({
  children,
  style,
  className,
  tone = "dark",
}: CardProps) {
  const darkCardTokens = {
    "--selen-text": "var(--selen-text-oncard)",
    "--selen-text2": "var(--selen-text2-oncard)",
    "--selen-text3": "var(--selen-text3-oncard)",
    "--selen-bg3": "rgba(247, 239, 224, 0.08)",
    "--selen-border": "rgba(245, 208, 138, 0.18)",
    "--selen-border2": "rgba(245, 208, 138, 0.34)",
  } as CSSProperties;

  return (
    <div
      className={className}
      style={{
        ...(tone === "dark" ? darkCardTokens : null),
        background:
          tone === "dark"
            ? "var(--selen-card-texture), var(--selen-card)"
            : "var(--selen-bg2)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        color: "var(--selen-text)",
        padding: 18,
        boxShadow:
          tone === "dark"
            ? "0 18px 42px rgba(58, 44, 32, 0.16)"
            : "0 12px 28px rgba(120, 90, 50, 0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
