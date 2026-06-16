"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SelenButton from "@/components/ui/SelenButton";

type GenerateProgramResponse = {
  ok?: boolean;
  documentId?: string;
  storagePath?: string;
  error?: string;
  message?: string;
  missingRequiredFields?: string[];
  declaredHours?: number | null;
  modulesTotalHours?: number | null;
};

type Props = {
  dossierId: string;
};

function formatMissingField(field: string) {
  const labels: Record<string, string> = {
    latestProgramVersion: "programme validé",
    organisation_id: "organisation",
    client_nom: "nom du client professionnel",
    client_adresse: "adresse du client professionnel",
    client_representant_prenom: "prénom du représentant client",
    client_representant_nom: "nom du représentant client",
    client_siret: "SIRET du client",
    stagiaire_prenom: "prénom du stagiaire",
    stagiaire_nom: "nom du stagiaire",
    stagiaire_fonction: "fonction du stagiaire",
    intitule_formation: "intitulé de formation",
    duree_formation: "durée de formation",
    modalite: "modalité",
    date_formation_prevue: "date de début de formation",
    date_fin_formation: "date de fin de formation",
    lieu_formation: "lieu ou lien de formation",
    tarif_formation: "tarif TTC",
    lieu_signature_convention: "lieu de signature",
    date_signature_convention: "date de signature",
  };

  return labels[field] ?? field.replaceAll("_", " ");
}

export default function GenerateNdaProgramButton({ dossierId }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  async function handleGenerate() {
    try {
      setLoading(true);
      setSuccess(null);
      setError(null);
      setMissingFields([]);

      const response = await fetch("/agent/api/nda/generate-program", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dossierId }),
      });

      const data = (await response
        .json()
        .catch(() => null)) as GenerateProgramResponse | null;

      if (!response.ok) {
        if (data?.error === "missing_generation_context") {
          setMissingFields(data.missingRequiredFields ?? []);
          setError(
            "Certaines informations nécessaires à la génération sont manquantes.",
          );
          return;
        }

        if (data?.error === "missing_program_content") {
          console.info("Génération programme NDA refusée :", data);
          setError(
            "Le programme validé ne contient pas encore de déroulé pédagogique exploitable. Vérifiez que les modules sont bien enregistrés avant de générer le document.",
          );
          return;
        }

        if (data?.error === "duration_mismatch") {
          console.info(
            "Génération programme NDA refusée : incohérence de durée",
            data,
          );
          setError(
            data.message ??
              "La durée totale déclarée ne correspond pas à la durée totale des modules. Corrigez la durée ou les modules avant de générer le programme.",
          );
          return;
        }

        setError(
          data?.message ??
            data?.error ??
            "Impossible de générer le programme pour le moment.",
        );
        return;
      }

      if (!data?.ok) {
        setError("Impossible de générer le programme pour le moment.");
        return;
      }

      setSuccess(
        "Programme final généré. La liste des documents se met à jour.",
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Impossible de générer le programme pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--selen-border)",
        marginTop: 16,
        paddingTop: 14,
      }}
    >
      <SelenButton
        type="button"
        size="sm"
        onClick={handleGenerate}
        disabled={loading}
        style={{
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.78 : 1,
        }}
      >
        {loading
          ? "Génération du programme..."
          : "Générer le programme final à signer"}
      </SelenButton>

      {success ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--selen-success)",
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          {success}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--selen-danger)",
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          {error}

          {missingFields.length > 0 ? (
            <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
              {missingFields.map((field) => (
                <li key={field}>{formatMissingField(field)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
