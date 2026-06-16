"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GenerateNdaProgramButton from "@/components/nda/GenerateNdaProgramButton";

type FieldType = "text" | "email" | "date" | "number" | "textarea";
type NdaVariablesValues = Record<string, string>;

type FieldConfig = {
  name: string;
  label: string;
  type?: FieldType;
};

type Props = {
  dossierId: string;
  initialValues: Record<string, string | number | null | undefined> | null;
};

const SECTIONS: Array<{ title: string; fields: FieldConfig[] }> = [
  {
    title: "Formation",
    fields: [
      { name: "intitule_formation", label: "Intitulé formation" },
      { name: "duree_formation", label: "Durée formation" },
      { name: "modalite", label: "Modalité" },
      { name: "date_formation_prevue", label: "Date début", type: "date" },
      { name: "date_fin_formation", label: "Date fin", type: "date" },
      { name: "lieu_formation", label: "Lieu formation" },
      { name: "tarif_formation", label: "Tarif TTC" },
      { name: "prerequis_formation", label: "Prérequis", type: "textarea" },
    ],
  },
  {
    title: "Organisme & formateur",
    fields: [
      { name: "siret", label: "SIRET organisme" },
      { name: "representant_prenom", label: "Prénom représentant organisme" },
      { name: "representant_nom", label: "Nom représentant organisme" },
      { name: "formateur_prenom", label: "Prénom formateur" },
      { name: "formateur_nom", label: "Nom formateur" },
      { name: "formateur_email", label: "Email formateur", type: "email" },
      { name: "nb_formateurs", label: "Nombre de formateurs", type: "number" },
      { name: "organisme_adresse", label: "Adresse organisme" },
      { name: "region", label: "Région" },
    ],
  },
  {
    title: "Client professionnel",
    fields: [
      { name: "client_nom", label: "Nom entreprise cliente" },
      { name: "client_siret", label: "SIRET client" },
      { name: "client_adresse", label: "Adresse client" },
      { name: "client_representant_prenom", label: "Prénom représentant" },
      { name: "client_representant_nom", label: "Nom représentant" },
    ],
  },
  {
    title: "Stagiaire",
    fields: [
      { name: "stagiaire_prenom", label: "Prénom stagiaire" },
      { name: "stagiaire_nom", label: "Nom stagiaire" },
      { name: "stagiaire_fonction", label: "Fonction" },
      { name: "stagiaire_adresse", label: "Adresse" },
      { name: "stagiaire_email", label: "Email", type: "email" },
      { name: "stagiaire_telephone", label: "Téléphone" },
    ],
  },
  {
    title: "Convention & signature",
    fields: [
      { name: "lieu_signature_convention", label: "Lieu signature" },
      {
        name: "date_signature_convention",
        label: "Date signature",
        type: "date",
      },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields);
const FIELD_LABELS = new Map(
  ALL_FIELDS.map((field) => [field.name, field.label]),
);

function buildState(initialValues: Props["initialValues"]): NdaVariablesValues {
  return Object.fromEntries(
    ALL_FIELDS.map((field) => [
      field.name,
      initialValues?.[field.name] === null ||
      initialValues?.[field.name] === undefined
        ? ""
        : String(initialValues[field.name]),
    ]),
  );
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function getMissingRequiredFields(values: NdaVariablesValues) {
  const missing = [
    "client_nom",
    "client_adresse",
    "client_representant_prenom",
    "client_representant_nom",
    "stagiaire_fonction",
    "intitule_formation",
    "duree_formation",
    "modalite",
    "date_formation_prevue",
    "date_fin_formation",
    "lieu_formation",
    "tarif_formation",
    "organisme_adresse",
    "lieu_signature_convention",
    "date_signature_convention",
  ].filter((field) => !hasValue(values[field]));

  if (!hasValue(values.stagiaire_prenom) && !hasValue(values.stagiaire_nom)) {
    missing.push("stagiaire_prenom");
  }

  return missing;
}

export default function NdaVariablesCard({ dossierId, initialValues }: Props) {
  const initialState = useMemo(
    () => buildState(initialValues),
    [initialValues],
  );

  const [values, setValues] = useState<NdaVariablesValues>(initialState);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [dirtyField, setDirtyField] = useState<string | null>(null);

  const pendingValuesRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValues(initialState);
    pendingValuesRef.current = {};
    setStatus("idle");
    setDirtyField(null);
  }, [initialState]);

  async function savePending() {
    const entries = Object.entries(pendingValuesRef.current);
    if (entries.length === 0) return;

    pendingValuesRef.current = {};
    setStatus("saving");

    const response = await fetch("/agent/api/nda/variables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dossierId,
        values: Object.fromEntries(entries),
      }),
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1800);
  }

  function scheduleSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      void savePending();
    }, 800);
  }

  function updateField(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    pendingValuesRef.current = { ...pendingValuesRef.current, [name]: value };
    setDirtyField(name);
    scheduleSave();
  }

  function flushSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void savePending();
  }

  const statusLabel =
    status === "saving"
      ? "Enregistrement..."
      : status === "saved"
        ? "Enregistré"
        : status === "error"
          ? "Erreur"
          : "";

  const missingRequiredFields = getMissingRequiredFields(values);

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
    <div
      style={{
        background: "var(--selen-card)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 600,
              fontFamily: "var(--font-display)",
              color: "var(--selen-text)",
              margin: 0,
            }}
          >
            Préparation des documents NDA
          </h3>

          <p
            style={{
              fontSize: 13,
              color: "var(--selen-text3)",
              lineHeight: 1.5,
              margin: "8px 0 0",
            }}
          >
            Vérifiez et corrigez les informations avant de générer les documents
            à signer.
          </p>
        </div>

        <span
          style={{
            fontSize: 12,
            color:
              status === "error" ? "var(--selen-danger)" : "var(--selen-text3)",
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel}
        </span>
      </div>

      {missingRequiredFields.length > 0 ? (
        <div
          style={{
            border: "1px solid rgba(212, 159, 63, 0.3)",
            background: "rgba(212, 159, 63, 0.08)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            margin: "16px 0 18px",
            color: "var(--selen-text2)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>
            Certaines informations nécessaires à la génération sont manquantes.
          </strong>

          <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
            {missingRequiredFields.map((field) => (
              <li key={field}>{FIELD_LABELS.get(field) ?? field}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h4
              style={{
                fontSize: 12,
                color: "var(--selen-gold2)",
                fontFamily: "var(--font-display)",
                margin: "0 0 10px",
              }}
            >
              {section.title}
            </h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: 10,
              }}
            >
              {section.fields.map((field) => {
                const isTextarea = field.type === "textarea";

                return (
                  <label
                    key={field.name}
                    style={{
                      display: "grid",
                      gap: 5,
                      gridColumn: isTextarea ? "1 / -1" : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--selen-text3)",
                      }}
                    >
                      {field.label}
                    </span>

                    {isTextarea ? (
                      <textarea
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          updateField(field.name, event.target.value)
                        }
                        onBlur={flushSave}
                        rows={3}
                        placeholder="Savoir lire, écrire et comprendre le français."
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                          minHeight: 78,
                          borderColor:
                            dirtyField === field.name && status === "saving"
                              ? "var(--selen-gold)"
                              : "var(--selen-border)",
                        }}
                      />
                    ) : (
                      <input
                        type={field.type ?? "text"}
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          updateField(field.name, event.target.value)
                        }
                        onBlur={flushSave}
                        style={{
                          ...inputStyle,
                          borderColor:
                            dirtyField === field.name && status === "saving"
                              ? "var(--selen-gold)"
                              : "var(--selen-border)",
                        }}
                      />
                    )}

                    {dirtyField === field.name && status !== "idle" ? (
                      <span
                        style={{
                          fontSize: 10,
                          color:
                            status === "error"
                              ? "var(--selen-danger)"
                              : "var(--selen-text3)",
                        }}
                      >
                        {statusLabel}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <GenerateNdaProgramButton dossierId={dossierId} />
    </div>
  );
}
