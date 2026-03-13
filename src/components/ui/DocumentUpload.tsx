"use client";

import { useRef, useState } from "react";
import SelenButton from "@/components/ui/SelenButton";

const NDA_DOCUMENT_TYPES = [
  { value: "cv_formateur", label: "CV du formateur" },
  { value: "programme_formation", label: "Programme de formation" },
  { value: "avis_insee", label: "Avis INSEE" },
  {
    value: "diplomes_formateur_principal",
    label: "Diplômes du formateur principal",
  },
  { value: "questionnaire_nda", label: "Questionnaire NDA" },
  { value: "convention_signee", label: "Convention signée" },
  {
    value: "liste_formateurs_signee",
    label: "Liste des formateurs signée",
  },
  { value: "kbis", label: "Extrait KBIS" },
  {
    value: "statut_activite_formation_adulte",
    label: "Statut activité formation adulte",
  },
  { value: "casier_judiciaire_n3", label: "Casier judiciaire n°3" },
];

export default function DocumentUpload({
  dossierId,
  organisationId,
}: {
  dossierId?: string;
  organisationId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [documentType, setDocumentType] = useState("programme_formation");

  function openFilePicker() {
    inputRef.current?.click();
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", documentType);

    if (dossierId) {
      formData.append("dossier_id", dossierId);
    }

    if (organisationId) {
      formData.append("organisation_id", organisationId);
    }

    const res = await fetch("/agent/api/upload-document", {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Erreur upload document");
      return;
    }

    location.reload();
  }

  return (
    <form
      onSubmit={handleUpload}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <select
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value)}
        style={{
          background: "var(--selen-bg3)",
          border: "1px solid var(--selen-border)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 12px",
          color: "var(--selen-text)",
          fontSize: 13,
          fontFamily: "var(--font-body)",
          outline: "none",
        }}
      >
        {NDA_DOCUMENT_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          onChange={() =>
            setFileName(inputRef.current?.files?.[0]?.name ?? null)
          }
        />

        <SelenButton type="button" variant="ghost" onClick={openFilePicker}>
          📜 Choisir un document
        </SelenButton>

        {fileName && (
          <span
            style={{
              fontSize: 12,
              color: "var(--selen-text2)",
            }}
          >
            {fileName}
          </span>
        )}

        <SelenButton
          variant="primary"
          size="sm"
          disabled={!fileName || loading}
        >
          {loading ? "Upload..." : "Importer"}
        </SelenButton>
      </div>
    </form>
  );
}
