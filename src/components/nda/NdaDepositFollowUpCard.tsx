"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const NOTICE_URL =
  "https://www.formulaires.service-public.gouv.fr/gf/getNotice.do?cerfaFormulaire=10782&cerfaNotice=51469";

type DepositStatus =
  | "ready"
  | "procedure_sent"
  | "submitted"
  | "dreets_pending"
  | "refusal_received"
  | "rework_required"
  | "nda_obtained"
  | "closed";

type Props = {
  dossierId: string;
  initialValues: Record<string, unknown> | null;
  hasDreetsRefusalLetter?: boolean;
  mode?: "code" | "followup";
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR");
}

function getStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    ready: "Dossier prêt pour dépôt",
    procedure_sent: "Client informé de la procédure",
    submitted: "Dossier déposé par le client",
    dreets_pending: "En attente du retour DREETS",
    refusal_received: "Courrier de refus reçu",
    rework_required: "Reprise agent nécessaire",
    nda_obtained: "NDA obtenu",
    closed: "Dossier clôturé",
  };

  return labels[status ?? ""] ?? "Suivi du dépôt à renseigner";
}

function inferStatus(args: {
  rawStatus?: string | null;
  submittedAt?: string | null;
  refusalAt?: string | null;
  obtainedAt?: string | null;
  hasDreetsRefusalLetter?: boolean;
}) {
  if (args.rawStatus) return args.rawStatus;
  if (args.obtainedAt) return "nda_obtained";
  if (args.refusalAt || args.hasDreetsRefusalLetter) return "refusal_received";
  if (args.submittedAt) return "dreets_pending";
  return "ready";
}

export default function NdaDepositFollowUpCard({
  dossierId,
  initialValues,
  hasDreetsRefusalLetter = false,
  mode = "followup",
}: Props) {
  const initialState = useMemo(
    () => ({
      specificCode: text(initialValues?.nda_deposit_specific_code),
      specificCodeLabel: text(initialValues?.nda_deposit_specific_code_label),
    }),
    [initialValues],
  );
  const [specificCode, setSpecificCode] = useState(initialState.specificCode);
  const [specificCodeLabel, setSpecificCodeLabel] = useState(
    initialState.specificCodeLabel,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSpecificCode(initialState.specificCode);
      setSpecificCodeLabel(initialState.specificCodeLabel);
      pendingRef.current = {};
      setStatus("idle");
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [initialState]);

  const depositStatus = inferStatus({
    rawStatus: text(initialValues?.nda_deposit_status),
    submittedAt: text(initialValues?.nda_deposit_submitted_at),
    refusalAt: text(initialValues?.nda_deposit_refusal_received_at),
    obtainedAt: text(initialValues?.nda_obtained_at),
    hasDreetsRefusalLetter,
  });
  const submittedAt = formatDate(initialValues?.nda_deposit_submitted_at);
  const refusalAt = formatDate(initialValues?.nda_deposit_refusal_received_at);
  const obtainedAt = formatDate(initialValues?.nda_obtained_at);

  async function savePending() {
    const values = pendingRef.current;
    if (Object.keys(values).length === 0) return;

    pendingRef.current = {};
    setStatus("saving");

    const response = await fetch("/agent/api/nda/variables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId, values }),
    });

    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      setTimeout(() => setStatus("idle"), 1600);
    }
  }

  function scheduleSave(values: Record<string, string>) {
    pendingRef.current = { ...pendingRef.current, ...values };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void savePending();
    }, 800);
  }

  function flushSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void savePending();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-sm)",
    padding: "9px 10px",
    color: "var(--selen-text)",
    fontSize: 13,
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {mode === "followup" ? (
        <div
          style={{
            border: "1px solid var(--selen-border)",
            borderRadius: "var(--radius-md)",
            background: "var(--selen-bg3)",
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--selen-gold2)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {getStatusLabel(depositStatus as DepositStatus)}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--selen-text3)",
              lineHeight: 1.5,
            }}
          >
            {submittedAt ? `Dépôt client signalé le ${submittedAt}. ` : null}
            {refusalAt ? `Courrier de refus signalé le ${refusalAt}. ` : null}
            {obtainedAt ? `NDA obtenu le ${obtainedAt}. ` : null}
            {!submittedAt && !refusalAt && !obtainedAt
              ? "Cette zone sert à suivre le dépôt officiel, l’attente DREETS, un éventuel refus ou l’obtention du NDA."
              : null}
          </div>
        </div>
      ) : null}

      {mode === "code" ? (
        <>
          <label style={{ display: "grid", gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--selen-text3)",
              }}
            >
              Code spécifique au domaine de formation
            </span>
            <input
              value={specificCode}
              onChange={(event) => {
                setSpecificCode(event.target.value);
                scheduleSave({
                  nda_deposit_specific_code: event.target.value,
                });
              }}
              onBlur={flushSave}
              placeholder="Ex : 333, 312, 326..."
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--selen-text3)",
              }}
            >
              Libellé du code spécifique
            </span>
            <input
              value={specificCodeLabel}
              onChange={(event) => {
                setSpecificCodeLabel(event.target.value);
                scheduleSave({
                  nda_deposit_specific_code_label: event.target.value,
                });
              }}
              onBlur={flushSave}
              placeholder="Libellé ou mémo agent"
              style={inputStyle}
            />
          </label>

          <div
            style={{
              border: "1px solid rgba(212, 159, 63, 0.28)",
              borderRadius: "var(--radius-sm)",
              background: "rgba(212, 159, 63, 0.08)",
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--selen-text2)",
              lineHeight: 1.55,
            }}
          >
            Renseignez ici le code spécifique au domaine de formation avant de
            valider les documents finaux. Ce code sera affiché côté client dans
            la procédure de dépôt. Le client ne doit pas chercher ce code
            lui-même. Le code général 333 - Enseignements pour adultes est
            affiché automatiquement côté client.
            <br />
            <a
              href={NOTICE_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 6,
                color: "var(--selen-gold2)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Ouvrir la notice officielle
            </a>
          </div>
        </>
      ) : null}

      {mode === "code" && status !== "idle" ? (
        <div
          style={{
            fontSize: 11,
            color:
              status === "error" ? "var(--selen-danger)" : "var(--selen-text3)",
          }}
        >
          {status === "saving"
            ? "Enregistrement..."
            : status === "saved"
              ? "Enregistré"
              : "Erreur d’enregistrement"}
        </div>
      ) : null}
    </div>
  );
}
