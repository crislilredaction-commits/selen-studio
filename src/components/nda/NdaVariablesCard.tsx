"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GenerateNdaProgramButton from "@/components/nda/GenerateNdaProgramButton";

type FieldType = "text" | "email" | "date" | "number" | "textarea";
type NdaVariablesValues = Record<string, string>;
type ListeInterneRow = {
  nom_prenom: string;
  date_embauche: string;
  statut: string;
  titres_experience: string;
};
type ListeSoustraitantRow = {
  nom_prenom: string;
  organisme_nom: string;
  adresse: string;
  titres_experience: string;
};
type ListeFormateursValues = {
  internes: ListeInterneRow[];
  soustraitants: ListeSoustraitantRow[];
  dirigeant_resume: string;
  fait_a: string;
  date_signature: string;
  nom_signataire: string;
  qualite_signataire: string;
};

type FieldConfig = {
  name: string;
  label: string;
  type?: FieldType;
};

type Props = {
  dossierId: string;
  initialValues: Record<string, unknown> | null;
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
const FORMATEUR_STATUSES = ["", "CDD", "CDI", "bénévole", "associé"];

function emptyInterneRow(): ListeInterneRow {
  return {
    nom_prenom: "",
    date_embauche: "",
    statut: "",
    titres_experience: "",
  };
}

function emptySoustraitantRow(): ListeSoustraitantRow {
  return {
    nom_prenom: "",
    organisme_nom: "",
    adresse: "",
    titres_experience: "",
  };
}

function normalizeRows<T extends Record<string, string>>(
  value: unknown,
  emptyRow: () => T,
) {
  const rows = Array.isArray(value) ? value.slice(0, 5) : [];
  const normalized = rows.map((row) => {
    const source = row && typeof row === "object" ? row : {};
    const empty = emptyRow();

    return Object.fromEntries(
      Object.keys(empty).map((key) => [
        key,
        typeof (source as Record<string, unknown>)[key] === "string"
          ? ((source as Record<string, string>)[key] ?? "")
          : "",
      ]),
    ) as T;
  });

  while (normalized.length < 5) {
    normalized.push(emptyRow());
  }

  return normalized;
}

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

function buildListeFormateursState(
  initialValues: Props["initialValues"],
): ListeFormateursValues {
  const representantNom = [
    initialValues?.representant_prenom,
    initialValues?.representant_nom,
  ]
    .map((value) => (value ? String(value).trim() : ""))
    .filter(Boolean)
    .join(" ");

  return {
    internes: normalizeRows<ListeInterneRow>(
      initialValues?.liste_formateurs_internes,
      emptyInterneRow,
    ),
    soustraitants: normalizeRows<ListeSoustraitantRow>(
      initialValues?.liste_formateurs_soustraitants,
      emptySoustraitantRow,
    ),
    dirigeant_resume:
      initialValues?.liste_formateurs_dirigeant_resume === null ||
      initialValues?.liste_formateurs_dirigeant_resume === undefined
        ? ""
        : String(initialValues.liste_formateurs_dirigeant_resume),
    fait_a:
      initialValues?.liste_formateurs_fait_a === null ||
      initialValues?.liste_formateurs_fait_a === undefined
        ? String(initialValues?.lieu_signature_convention ?? "")
        : String(initialValues.liste_formateurs_fait_a),
    date_signature:
      initialValues?.liste_formateurs_date_signature === null ||
      initialValues?.liste_formateurs_date_signature === undefined
        ? String(initialValues?.date_signature_convention ?? "")
        : String(initialValues.liste_formateurs_date_signature),
    nom_signataire:
      initialValues?.liste_formateurs_nom_signataire === null ||
      initialValues?.liste_formateurs_nom_signataire === undefined
        ? representantNom
        : String(initialValues.liste_formateurs_nom_signataire),
    qualite_signataire:
      initialValues?.liste_formateurs_qualite_signataire === null ||
      initialValues?.liste_formateurs_qualite_signataire === undefined
        ? "Dirigeant"
        : String(initialValues.liste_formateurs_qualite_signataire),
  };
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
  const router = useRouter();
  const initialState = useMemo(
    () => buildState(initialValues),
    [initialValues],
  );
  const initialListeFormateursState = useMemo(
    () => buildListeFormateursState(initialValues),
    [initialValues],
  );

  const [values, setValues] = useState<NdaVariablesValues>(initialState);
  const [listeFormateurs, setListeFormateurs] = useState<ListeFormateursValues>(
    initialListeFormateursState,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [listeStatus, setListeStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [listeGenerationMessage, setListeGenerationMessage] = useState<
    string | null
  >(null);
  const [listeGenerationLoading, setListeGenerationLoading] = useState(false);
  const [dirtyField, setDirtyField] = useState<string | null>(null);

  const pendingValuesRef = useRef<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeFormateursRef = useRef<ListeFormateursValues>(
    initialListeFormateursState,
  );

  useEffect(() => {
    setValues(initialState);
    setListeFormateurs(initialListeFormateursState);
    listeFormateursRef.current = initialListeFormateursState;
    pendingValuesRef.current = {};
    setStatus("idle");
    setListeStatus("idle");
    setDirtyField(null);
  }, [initialState, initialListeFormateursState]);

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

  async function saveListeFormateurs(nextValues = listeFormateursRef.current) {
    setListeStatus("saving");

    const response = await fetch("/agent/api/nda/liste-formateurs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dossierId,
        ...nextValues,
      }),
    });

    if (!response.ok) {
      setListeStatus("error");
      return;
    }

    setListeStatus("saved");
    setTimeout(() => setListeStatus("idle"), 1800);
  }

  function scheduleListeSave(nextValues: ListeFormateursValues) {
    if (listeDebounceRef.current) clearTimeout(listeDebounceRef.current);

    listeDebounceRef.current = setTimeout(() => {
      void saveListeFormateurs(nextValues);
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

  function updateListeFormateurs(nextValues: ListeFormateursValues) {
    listeFormateursRef.current = nextValues;
    setListeFormateurs(nextValues);
    scheduleListeSave(nextValues);
  }

  function updateInterneRow(
    index: number,
    key: keyof ListeInterneRow,
    value: string,
  ) {
    const nextValues = {
      ...listeFormateursRef.current,
      internes: listeFormateursRef.current.internes.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    };

    updateListeFormateurs(nextValues);
  }

  function updateSoustraitantRow(
    index: number,
    key: keyof ListeSoustraitantRow,
    value: string,
  ) {
    const nextValues = {
      ...listeFormateursRef.current,
      soustraitants: listeFormateursRef.current.soustraitants.map(
        (row, rowIndex) =>
          rowIndex === index ? { ...row, [key]: value } : row,
      ),
    };

    updateListeFormateurs(nextValues);
  }

  function updateListeField(
    key: keyof Omit<ListeFormateursValues, "internes" | "soustraitants">,
    value: string,
  ) {
    updateListeFormateurs({
      ...listeFormateursRef.current,
      [key]: value,
    });
  }

  function flushListeSave() {
    if (listeDebounceRef.current) clearTimeout(listeDebounceRef.current);
    void saveListeFormateurs();
  }

  async function generateListeFormateurs() {
    setListeGenerationLoading(true);
    setListeGenerationMessage(null);

    try {
      await saveListeFormateurs();

      const response = await fetch("/agent/api/nda/generate-liste-formateurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        templatePath?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        if (data?.error === "template_missing") {
          setListeGenerationMessage(
            `Modèle Word manquant : ${data.templatePath ?? "src/lib/templates/nda/liste-formateurs-dreets.docx"}.`,
          );
          return;
        }

        if (data?.error === "docx_dependency_missing") {
          setListeGenerationMessage(
            "Génération Word indisponible : les dépendances docxtemplater et pizzip ne sont pas installées.",
          );
          return;
        }

        if (data?.error === "missing_liste_formateurs_content") {
          setListeGenerationMessage(
            "Ajoutez au moins un intervenant, un sous-traitant ou un résumé dirigeant avant de préparer la liste.",
          );
          return;
        }

        setListeGenerationMessage(
          data?.error ?? "Impossible de préparer la liste des formateurs.",
        );
        return;
      }

      setListeGenerationMessage(
        "Liste des formateurs préparée. La liste des documents se met à jour.",
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      setListeGenerationMessage(
        "Impossible de préparer la liste des formateurs.",
      );
    } finally {
      setListeGenerationLoading(false);
    }
  }

  const statusLabel =
    status === "saving"
      ? "Enregistrement..."
      : status === "saved"
        ? "Enregistré"
        : status === "error"
          ? "Erreur"
          : "";
  const listeStatusLabel =
    listeStatus === "saving"
      ? "Enregistrement..."
      : listeStatus === "saved"
        ? "Enregistré"
        : listeStatus === "error"
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
            Vérifiez et corrigez les informations avant de préparer les documents
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
            Certaines informations nécessaires à la préparation sont manquantes.
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

      <details
        style={{
          borderTop: "1px solid var(--selen-border)",
          marginTop: 18,
          paddingTop: 16,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            color: "var(--selen-gold2)",
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Liste des formateurs DREETS
          {listeStatusLabel ? (
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                fontFamily: "var(--font-body)",
                color:
                  listeStatus === "error"
                    ? "var(--selen-danger)"
                    : "var(--selen-text3)",
              }}
            >
              {listeStatusLabel}
            </span>
          ) : null}
        </summary>

        <div style={{ display: "grid", gap: 18, marginTop: 16 }}>
          <section>
            <h4
              style={{
                fontSize: 12,
                color: "var(--selen-gold2)",
                fontFamily: "var(--font-display)",
                margin: "0 0 10px",
              }}
            >
              En-tête organisme
            </h4>
            <div
              style={{
                fontSize: 12,
                color: "var(--selen-text3)",
                lineHeight: 1.5,
              }}
            >
              Le modèle utilisera la dénomination de l’organisation et l’adresse
              organisme renseignée plus haut.
            </div>
          </section>

          <section>
            <h4
              style={{
                fontSize: 12,
                color: "var(--selen-gold2)",
                fontFamily: "var(--font-display)",
                margin: "0 0 10px",
              }}
            >
              Formateurs salariés / bénévoles / associés
            </h4>
            <div style={{ display: "grid", gap: 8 }}>
              {listeFormateurs.internes.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1.1fr minmax(120px, 0.6fr) minmax(120px, 0.6fr) 1.5fr",
                    gap: 8,
                  }}
                >
                  <input
                    value={row.nom_prenom}
                    onChange={(event) =>
                      updateInterneRow(index, "nom_prenom", event.target.value)
                    }
                    onBlur={flushListeSave}
                    placeholder="Nom et prénom"
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={row.date_embauche}
                    onChange={(event) =>
                      updateInterneRow(
                        index,
                        "date_embauche",
                        event.target.value,
                      )
                    }
                    onBlur={flushListeSave}
                    style={inputStyle}
                  />
                  <select
                    value={row.statut}
                    onChange={(event) =>
                      updateInterneRow(index, "statut", event.target.value)
                    }
                    onBlur={flushListeSave}
                    style={inputStyle}
                  >
                    {FORMATEUR_STATUSES.map((statusOption) => (
                      <option
                        key={statusOption || "empty"}
                        value={statusOption}
                      >
                        {statusOption || "Statut"}
                      </option>
                    ))}
                  </select>
                  <input
                    value={row.titres_experience}
                    onChange={(event) =>
                      updateInterneRow(
                        index,
                        "titres_experience",
                        event.target.value,
                      )
                    }
                    onBlur={flushListeSave}
                    placeholder="Titres, diplômes, expérience"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4
              style={{
                fontSize: 12,
                color: "var(--selen-gold2)",
                fontFamily: "var(--font-display)",
                margin: "0 0 10px",
              }}
            >
              Sous-traitants
            </h4>
            <div style={{ display: "grid", gap: 8 }}>
              {listeFormateurs.soustraitants.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1.4fr",
                    gap: 8,
                  }}
                >
                  <input
                    value={row.nom_prenom}
                    onChange={(event) =>
                      updateSoustraitantRow(
                        index,
                        "nom_prenom",
                        event.target.value,
                      )
                    }
                    onBlur={flushListeSave}
                    placeholder="Nom et prénom"
                    style={inputStyle}
                  />
                  <input
                    value={row.organisme_nom}
                    onChange={(event) =>
                      updateSoustraitantRow(
                        index,
                        "organisme_nom",
                        event.target.value,
                      )
                    }
                    onBlur={flushListeSave}
                    placeholder="Organisme"
                    style={inputStyle}
                  />
                  <input
                    value={row.adresse}
                    onChange={(event) =>
                      updateSoustraitantRow(
                        index,
                        "adresse",
                        event.target.value,
                      )
                    }
                    onBlur={flushListeSave}
                    placeholder="Adresse"
                    style={inputStyle}
                  />
                  <input
                    value={row.titres_experience}
                    onChange={(event) =>
                      updateSoustraitantRow(
                        index,
                        "titres_experience",
                        event.target.value,
                      )
                    }
                    onBlur={flushListeSave}
                    placeholder="Titres, diplômes, expérience"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4
              style={{
                fontSize: 12,
                color: "var(--selen-gold2)",
                fontFamily: "var(--font-display)",
                margin: "0 0 10px",
              }}
            >
              Travailleur indépendant ou dirigeant
            </h4>
            <textarea
              value={listeFormateurs.dirigeant_resume}
              onChange={(event) =>
                updateListeField("dirigeant_resume", event.target.value)
              }
              onBlur={flushListeSave}
              rows={5}
              placeholder="Titres, diplômes, qualités et expérience. À relire et valider par l’agent avant préparation."
              style={{ ...inputStyle, resize: "vertical", minHeight: 110 }}
            />
            <div
              style={{
                fontSize: 11,
                color: "var(--selen-text3)",
                marginTop: 6,
              }}
            >
              L’analyse du CV est déposée ici par défaut. Si le formateur est
              dirigeant, TNS ou travailleur indépendant, vous pouvez laisser le
              résumé dans cette zone. Si le formateur est salarié ou
              sous-traitant, copiez-collez simplement le résumé dans la ligne
              correspondante du tableau.
            </div>
          </section>

          <section>
            <h4
              style={{
                fontSize: 12,
                color: "var(--selen-gold2)",
                fontFamily: "var(--font-display)",
                margin: "0 0 10px",
              }}
            >
              Signature
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 10,
              }}
            >
              <input
                value={listeFormateurs.fait_a}
                onChange={(event) =>
                  updateListeField("fait_a", event.target.value)
                }
                onBlur={flushListeSave}
                placeholder="Fait à"
                style={inputStyle}
              />
              <input
                type="date"
                value={listeFormateurs.date_signature}
                onChange={(event) =>
                  updateListeField("date_signature", event.target.value)
                }
                onBlur={flushListeSave}
                style={inputStyle}
              />
              <input
                value={listeFormateurs.nom_signataire}
                onChange={(event) =>
                  updateListeField("nom_signataire", event.target.value)
                }
                onBlur={flushListeSave}
                placeholder="Nom du signataire"
                style={inputStyle}
              />
              <input
                value={listeFormateurs.qualite_signataire}
                onChange={(event) =>
                  updateListeField("qualite_signataire", event.target.value)
                }
                onBlur={flushListeSave}
                placeholder="Qualité du signataire"
                style={inputStyle}
              />
            </div>
          </section>

          <div>
            <button
              type="button"
              onClick={generateListeFormateurs}
              disabled={listeGenerationLoading}
              style={{
                marginTop: 10,
                border: "1px solid var(--selen-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--selen-card2)",
                color: "var(--selen-text)",
                padding: "8px 12px",
                fontSize: 12,
                cursor: listeGenerationLoading ? "not-allowed" : "pointer",
                opacity: listeGenerationLoading ? 0.72 : 1,
              }}
            >
              {listeGenerationLoading
                ? "Génération..."
                : "Générer la liste des formateurs"}
            </button>
            {listeGenerationMessage ? (
              <div
                style={{
                  fontSize: 12,
                  color: listeGenerationMessage.includes("préparée")
                  ? "var(--selen-success)"
                    : "var(--selen-danger)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                {listeGenerationMessage}
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
