import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
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

export default function SelenCard({ children, style, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--selen-card)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
