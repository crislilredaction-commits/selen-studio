"use client";

export type HistoryEntry = {
  id: string;
  label: string;
  date: string;
};

export default function DossierHistorique({
  entries,
}: {
  entries: HistoryEntry[];
}) {
  return (
    <div
      style={{
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        background: "var(--selen-card)",
      }}
    >
      <p
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--selen-text3)",
          marginBottom: 12,
        }}
      >
        Historique
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((e) => (
          <div key={e.id} style={{ fontSize: 13 }}>
            <strong>{e.label}</strong>
            <div style={{ fontSize: 11, color: "var(--selen-text3)" }}>
              {e.date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
