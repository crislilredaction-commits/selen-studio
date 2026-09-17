"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

type AuditDay = { date: string; start_time: string; end_time: string };

function initialDays(audit?: ExternalAuditRow | null): AuditDay[] {
  const raw = audit?.metadata?.audit_days;
  if (Array.isArray(raw)) {
    const days = raw.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const date = typeof item.date === "string" ? item.date : "";
      const start = typeof item.start_time === "string" ? item.start_time.slice(0, 5) : "";
      const end = typeof item.end_time === "string" ? item.end_time.slice(0, 5) : "";
      return date && start ? [{ date, start_time: start, end_time: end }] : [];
    });
    if (days.length) return days;
  }
  return [{
    date: audit?.audit_date ?? "",
    start_time: audit?.start_time?.slice(0, 5) ?? "",
    end_time: audit?.end_time?.slice(0, 5) ?? "",
  }];
}

export default function AuditDaysFields({ audit }: { audit?: ExternalAuditRow | null }) {
  const [days, setDays] = useState<AuditDay[]>(() => initialDays(audit));

  function update(index: number, key: keyof AuditDay, value: string) {
    setDays((current) => current.map((day, i) => i === index ? { ...day, [key]: value } : day));
  }

  function addDay() {
    setDays((current) => [...current, { date: "", start_time: current.at(-1)?.start_time ?? "", end_time: current.at(-1)?.end_time ?? "" }]);
  }

  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Journées de l&apos;audit</h3>
          <p style={styles.help}>Ajoute une ligne par journée. Chaque jour peut avoir ses propres horaires.</p>
        </div>
        <button type="button" onClick={addDay} style={styles.add}>+ Ajouter un jour</button>
      </div>
      <input type="hidden" name="auditDays" value={JSON.stringify(days)} />
      {days.map((day, index) => (
        <div key={index} style={styles.day}>
          <strong style={styles.dayTitle}>Jour {index + 1}</strong>
          <label style={styles.field}><span>Date</span><input type="date" value={day.date} onChange={(e) => update(index, "date", e.target.value)} required style={styles.input} /></label>
          <label style={styles.field}><span>Début</span><input type="time" value={day.start_time} onChange={(e) => update(index, "start_time", e.target.value)} required style={styles.input} /></label>
          <label style={styles.field}><span>Fin</span><input type="time" value={day.end_time} onChange={(e) => update(index, "end_time", e.target.value)} style={styles.input} /></label>
          {days.length > 1 ? <button type="button" onClick={() => setDays((current) => current.filter((_, i) => i !== index))} style={styles.remove}>Supprimer</button> : null}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  section: { gridColumn: "1 / -1", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  title: { margin: 0, fontSize: 16 },
  help: { margin: "5px 0 0", fontSize: 13, opacity: 0.72 },
  add: { border: "1px solid #cbd5e1", borderRadius: 9, padding: "8px 12px", background: "white", cursor: "pointer", fontWeight: 700 },
  day: { display: "grid", gridTemplateColumns: "90px repeat(3, minmax(140px, 1fr)) auto", gap: 12, alignItems: "end", marginTop: 14 },
  dayTitle: { alignSelf: "center" },
  field: { display: "grid", gap: 5, fontSize: 13 },
  input: { minHeight: 40, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 10px", font: "inherit" },
  remove: { border: 0, background: "transparent", cursor: "pointer", padding: "10px 4px", textDecoration: "underline" },
};
