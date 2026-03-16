"use client";

import { useEffect, useState } from "react";

type Props = {
  dossierId: string;
  initialValues: {
    formateur_nom?: string | null;
    formateur_prenom?: string | null;
    formateur_email?: string | null;
    intitule_formation?: string | null;
    duree_formation?: string | null;
    modalite?: string | null;
    nb_formateurs?: number | null;
    ville?: string | null;
    code_postal?: string | null;
    region?: string | null;
    siret?: string | null;
  } | null;
};

function buildState(initialValues: Props["initialValues"]) {
  return {
    formateur_nom: initialValues?.formateur_nom ?? "",
    formateur_prenom: initialValues?.formateur_prenom ?? "",
    formateur_email: initialValues?.formateur_email ?? "",
    intitule_formation: initialValues?.intitule_formation ?? "",
    duree_formation: initialValues?.duree_formation ?? "",
    modalite: initialValues?.modalite ?? "",
    nb_formateurs: initialValues?.nb_formateurs?.toString() ?? "",
    ville: initialValues?.ville ?? "",
    code_postal: initialValues?.code_postal ?? "",
    region: initialValues?.region ?? "",
    siret: initialValues?.siret ?? "",
  };
}

export default function NdaVariablesCard({ dossierId, initialValues }: Props) {
  const [values, setValues] = useState(buildState(initialValues));

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValues(buildState(initialValues));
  }, [initialValues]);

  function updateField(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    setLoading(true);

    const res = await fetch("/agent/api/save-nda-variables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dossierId,
        ...values,
        nb_formateurs: values.nb_formateurs
          ? Number(values.nb_formateurs)
          : null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Erreur sauvegarde variables NDA");
      return;
    }

    window.location.reload();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-sm)",
    padding: "10px 12px",
    color: "var(--selen-text)",
    fontSize: 13,
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        background: "var(--selen-card)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        padding: 20,
      }}
    >
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 16,
          fontFamily: "var(--font-display)",
          color: "var(--selen-text)",
        }}
      >
        Variables NDA
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <input
          placeholder="Nom formateur"
          value={values.formateur_nom}
          onChange={(e) => updateField("formateur_nom", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Prénom formateur"
          value={values.formateur_prenom}
          onChange={(e) => updateField("formateur_prenom", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Email formateur"
          value={values.formateur_email}
          onChange={(e) => updateField("formateur_email", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Intitulé formation"
          value={values.intitule_formation}
          onChange={(e) => updateField("intitule_formation", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Durée formation"
          value={values.duree_formation}
          onChange={(e) => updateField("duree_formation", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Modalité"
          value={values.modalite}
          onChange={(e) => updateField("modalite", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Nombre de formateurs"
          value={values.nb_formateurs}
          onChange={(e) => updateField("nb_formateurs", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Ville"
          value={values.ville}
          onChange={(e) => updateField("ville", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Code postal"
          value={values.code_postal}
          onChange={(e) => updateField("code_postal", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Région"
          value={values.region}
          onChange={(e) => updateField("region", e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="SIRET"
          value={values.siret}
          onChange={(e) => updateField("siret", e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          style={{
            background: "var(--selen-gold)",
            color: "#0f0c08",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          {loading ? "Enregistrement..." : "Enregistrer les variables"}
        </button>
      </div>
    </div>
  );
}
