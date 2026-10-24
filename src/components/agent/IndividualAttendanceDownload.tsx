"use client";

import { useState } from "react";

type LearnerOption = { id: string; name: string; ready: boolean };

export default function IndividualAttendanceDownload({
  sessionId,
  options,
  publicationUnavailable = false,
}: {
  sessionId: string;
  options: LearnerOption[];
  publicationUnavailable?: boolean;
}) {
  const [enrolmentId, setEnrolmentId] = useState("");
  const selected = options.find((option) => option.id === enrolmentId);
  const canDownload = Boolean(selected?.ready);

  function download(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDownload) return;
    window.location.assign(
      `/agent/daily/session-dossiers/${encodeURIComponent(sessionId)}/attendance/pdf?enrolment=${encodeURIComponent(enrolmentId)}`,
    );
  }

  return (
    <form onSubmit={download} style={styles.form}>
      <label htmlFor="individual-attendance-learner" style={styles.label}>
        Télécharger la feuille d’émargement d’un apprenant
      </label>
      <div style={styles.controls}>
        <select
          id="individual-attendance-learner"
          value={enrolmentId}
          onChange={(event) => setEnrolmentId(event.target.value)}
          style={styles.select}
          disabled={publicationUnavailable || options.length === 0}
        >
          <option value="">Choisir l’apprenant concerné</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.ready ? "" : " — pas encore disponible"}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!canDownload}
          style={{
            ...styles.button,
            cursor: canDownload ? "pointer" : "not-allowed",
            opacity: canDownload ? 1 : 0.55,
          }}
        >
          Télécharger son PDF
        </button>
      </div>
      {publicationUnavailable ? (
        <p style={styles.help}>
          L’état de publication est momentanément indisponible.
        </p>
      ) : selected && !selected.ready ? (
        <p style={styles.help}>
          La session doit être terminée et toutes les présences de cet apprenant
          traitées puis publiées.
        </p>
      ) : (
        <p style={styles.help}>
          Le PDF contient uniquement cet apprenant et les signatures du
          formateur correspondant aux mêmes créneaux.
        </p>
      )}
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: "grid",
    gap: 8,
    padding: 14,
    marginBottom: 16,
    border: "1px solid var(--selen-border2)",
    borderRadius: 12,
    background: "var(--selen-bg2)",
  },
  label: { fontSize: 13, fontWeight: 800 },
  controls: { display: "flex", gap: 8, flexWrap: "wrap" },
  select: {
    flex: "1 1 280px",
    minWidth: 0,
    minHeight: 40,
    padding: "0 10px",
    border: "1px solid var(--selen-border)",
    borderRadius: 9,
    background: "var(--selen-bg3)",
    color: "var(--selen-text)",
  },
  button: {
    minHeight: 40,
    padding: "0 14px",
    border: 0,
    borderRadius: 9,
    background: "var(--selen-gold2)",
    color: "var(--selen-bg)",
    fontWeight: 800,
  },
  help: {
    margin: 0,
    color: "var(--selen-text3)",
    fontSize: 11,
    lineHeight: 1.5,
  },
};
