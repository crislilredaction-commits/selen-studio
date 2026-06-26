import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import { buildTravelPreparation } from "@/lib/server/externalAuditEmails";

export default function ExternalAuditTravelCard({
  audit,
}: {
  audit: ExternalAuditRow;
}) {
  const travel = buildTravelPreparation(audit);

  return (
    <SelenCard>
      <SelenCardTitle>Préparation déplacement</SelenCardTitle>
      <div style={s.grid}>
        <Info label="Point de départ" value={travel.label} />
        <Info label="Adresse de départ" value={travel.address} />
        <Info label="Temps de trajet estimé" value={travel.travelLabel} />
        <Info label="Départ conseillé" value={travel.departureLabel} />
        <Info label="Réveil conseillé" value={travel.wakeLabel} />
      </div>
      {!travel.travelMinutes ? (
        <p style={s.muted}>Temps de trajet non renseigné.</p>
      ) : null}
    </SelenCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.info}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  info: {
    display: "grid",
    gap: 4,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "#f7ecd8",
    color: "#3b281b",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  muted: {
    color: "#5a4331",
    fontSize: 13,
    lineHeight: 1.6,
    margin: "12px 0 0",
  },
};
