type Props = {
  children: React.ReactNode;
};

export function SelenCardTitle({ children }: Props) {
  return (
    <p
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 16,
        fontWeight: 600,
        color: "var(--selen-text)",
        marginBottom: 14,
      }}
    >
      {children}
    </p>
  );
}

export default function SelenCard({ children }: Props) {
  return (
    <div
      style={{
        background: "var(--selen-card)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
      }}
    >
      {children}
    </div>
  );
}
