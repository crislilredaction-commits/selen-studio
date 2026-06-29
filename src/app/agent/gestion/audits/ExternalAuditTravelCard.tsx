import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import {
  getAuditMeetLink,
  isRemoteAudit,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";
import { buildTravelPreparation } from "@/lib/server/externalAuditEmails";

export default function ExternalAuditTravelCard({
  audit,
}: {
  audit: ExternalAuditRow;
}) {
  if (isRemoteAudit(audit)) {
    const meetLink = getAuditMeetLink(audit);
    return (
      <SelenCard>
        <SelenCardTitle>Audit distanciel</SelenCardTitle>
        <div style={s.grid}>
          <Info label="Google Meet" value={meetLink || "Lien Meet en attente"} />
          <Info label="Heure debut" value={audit.start_time.slice(0, 5)} />
          <Info label="Heure fin" value={audit.end_time?.slice(0, 5) || "-"} />
        </div>
        {meetLink ? (
          <a href={meetLink} target="_blank" rel="noreferrer" style={s.actionLink}>
            Rejoindre Meet
          </a>
        ) : null}
      </SelenCard>
    );
  }

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
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 36,
    padding: "0 12px",
    marginTop: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-gold2)",
    background: "rgba(201, 148, 58, 0.1)",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 700,
  },
};
