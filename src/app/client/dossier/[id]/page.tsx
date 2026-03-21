"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ClientMessagingPanel from "@/components/ClientMessagingPanel";
import ClientProgramProposal from "@/components/ClientProgramProposal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocKey = "cv" | "programme" | "insee" | "kbis";

type MessageRow = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

interface DocState {
  file: File | null;
  uploading: boolean;
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function ClientNdaPage() {
  const params = useParams();
  const router = useRouter();

  const dossierId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);
  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    cv: { file: null, uploading: false },
    programme: { file: null, uploading: false },
    insee: { file: null, uploading: false },
    kbis: { file: null, uploading: false },
  });

  const [form, setForm] = useState({
    organisation_name: "",
    organisation_email: "",
    organisation_phone: "",
    representant_prenom: "",
    representant_nom: "",
    formateur_prenom: "",
    formateur_nom: "",
    formateur_email: "",
    formation_intitule: "",
    formation_duree: "",
    formation_tarif: "",
    formation_modalite: "",
  });

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [programProposal, setProgramProposal] = useState<any | null>(null);
  const [step1Submitted, setStep1Submitted] = useState(false);
  const [showStep1Details, setShowStep1Details] = useState(false);

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFileDrop(key: DocKey, file: File) {
    setDocs((prev) => ({ ...prev, [key]: { file, uploading: false } }));
  }

  useEffect(() => {
    async function loadClientState() {
      try {
        if (!dossierId) return;

        const [programRes, messagesRes] = await Promise.all([
          fetch(
            `/agent/api/program/client-latest?dossierId=${encodeURIComponent(dossierId)}`,
            {
              cache: "no-store",
            },
          ),
          fetch(
            `/agent/api/messages/list?dossierId=${encodeURIComponent(dossierId)}`,
            {
              cache: "no-store",
            },
          ),
        ]);

        const programData = await programRes.json().catch(() => null);
        const messagesData = await messagesRes.json().catch(() => null);

        if (programRes.ok) {
          setProgramProposal(programData?.version ?? null);
        }

        if (messagesRes.ok) {
          const items = Array.isArray(messagesData?.items)
            ? messagesData.items
            : [];

          const hasAnyExchange = items.length > 0;
          if (hasAnyExchange) {
            setStep1Submitted(true);
          }
        }
      } catch {
        // silencieux
      }
    }

    loadClientState();
  }, [dossierId]);

  useEffect(() => {
    async function loadProgramProposal() {
      try {
        if (!dossierId) return;

        const res = await fetch(
          `/agent/api/program/client-latest?dossierId=${encodeURIComponent(dossierId)}`,
          {
            cache: "no-store",
          },
        );

        const data = await res.json().catch(() => null);

        if (res.ok) {
          setProgramProposal(data?.version ?? null);
        }
      } catch {
        // silencieux
      }
    }

    loadProgramProposal();
  }, [dossierId]);

  async function saveStep1() {
    if (!dossierId) {
      throw new Error("Aucun dossierId trouvé dans l’URL.");
    }

    const res = await fetch("/agent/api/client/dossier/step-1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dossierId,
        ...form,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error ?? "Erreur lors de l’enregistrement.");
    }

    return data;
  }

  async function uploadOneDocument(documentType: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("dossierId", dossierId);
    formData.append("documentType", documentType);

    const res = await fetch("/agent/api/client/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error ?? `Erreur upload ${documentType}`);
    }
  }

  async function handleSubmitEssentialInfos() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setStep1Submitted(true);

      await saveStep1();

      if (docs.cv.file) {
        await uploadOneDocument("cv_formateur", docs.cv.file);
      }
      if (docs.programme.file) {
        await uploadOneDocument("programme_formation", docs.programme.file);
      }
      if (docs.insee.file) {
        await uploadOneDocument("avis_insee", docs.insee.file);
      }
      if (docs.kbis.file) {
        await uploadOneDocument("kbis", docs.kbis.file);
      }

      setSuccessMessage("Vos informations essentielles ont bien été envoyées.");
      setStep1Submitted(true);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await saveStep1();

      setSuccessMessage("Vos informations ont bien été enregistrées.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { number: 1, label: "Informations essentielles", active: true },
    { number: 2, label: "Informations client", active: false },
    { number: 3, label: "Documents à utiliser", active: false },
    { number: 4, label: "Dépôt final", active: false },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f1e8 0%, #efe6d8 100%)",
        color: "#3a261a",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header
        style={{
          borderBottom: "1px solid #ddd0bd",
          background: "#f4efe6",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2.5rem",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1px solid #dcc9af",
                background: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <img
                src="/Logo Selen Editions.png"
                alt="Selen Editions"
                style={{ width: 30, height: 30, objectFit: "contain" }}
              />
            </div>
            <div>
              <p
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Selen Editions
              </p>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "#8b7a67",
                  margin: 0,
                  fontFamily: "sans-serif",
                }}
              >
                Espace client
              </p>
            </div>
          </div>

          {/* Nav droite */}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" size="sm">
              Réserver un appel
            </Btn>
            <Btn
              variant="primary"
              size="sm"
              onClick={() => {
                setIsMessagingOpen((prev) => !prev);

                setTimeout(() => {
                  const input = document.getElementById(
                    "client-message-input",
                  ) as HTMLTextAreaElement | null;
                  input?.focus();
                }, 150);
              }}
            >
              Poser une question à mon agent
            </Btn>
          </div>
        </div>
      </header>
      {isMessagingOpen && (
        <div
          style={{
            borderBottom: "1px solid #ddd0bd",
            background: "#f8f1e8",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "1rem 2.5rem 1.25rem",
            }}
          >
            <ClientMessagingPanel dossierId={dossierId} initialMessages={[]} />
          </div>
        </div>
      )}
      {/* ------------------------------------------------------------------ */}
      {/* BANDEAU PROGRESSION — ÉTAPE 1/4                                     */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          background: "#4b2e1e",
          borderBottom: "1px solid #3a2212",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2.5rem",
          }}
        >
          {/* Stepper */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              overflowX: "auto",
            }}
          >
            {steps.map((step, i) => (
              <React.Fragment key={step.number}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 0",
                    flex: step.active ? "none" : "1 1 auto",
                    minWidth: 0,
                    opacity: step.active ? 1 : 0.45,
                    position: "relative",
                  }}
                >
                  {/* Indicateur actif */}
                  {step.active && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 2,
                        background: "#c98b49",
                      }}
                    />
                  )}

                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: step.active
                        ? "2px solid #c98b49"
                        : "1.5px solid rgba(255,255,255,0.3)",
                      background: step.active ? "#c98b49" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: step.active ? "#fff" : "rgba(255,255,255,0.7)",
                      flexShrink: 0,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {step.number}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "sans-serif",
                      fontWeight: step.active ? 600 : 400,
                      color: step.active ? "#fff" : "rgba(255,255,255,0.65)",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Séparateur */}
                {i < steps.length - 1 && (
                  <div
                    style={{
                      width: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M4 2l4 4-4 4"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section
        style={{
          borderBottom: "1px solid #c9b79c",
          padding: "3.5rem 0 3rem",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2.5rem",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 40,
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "0.35em",
                textTransform: "uppercase",
                color: "#9c5a2e",
                marginBottom: 14,
                fontFamily: "sans-serif",
              }}
            >
              Accompagnement NDA · Étape 1 sur 4
            </p>
            <h1
              style={{
                fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                margin: "0 0 20px",
                color: "#3a261a",
              }}
            >
              Vos premières{" "}
              <span style={{ color: "#9c5a2e" }}>informations</span>,
              <br />
              pas à pas
            </h1>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.75,
                color: "#5f4d3d",
                maxWidth: 560,
                margin: 0,
              }}
            >
              Cette première étape nous permet de lancer votre accompagnement,
              de préparer vos futurs documents et de vous guider sans vous
              demander d'informations inutiles.
            </p>
          </div>

          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              border: "1px solid #d9c9b2",
              background:
                "radial-gradient(circle, #fffaf3 0%, #f2e8d9 70%, #eadcc8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src="/selion.png"
              alt="Mascotte Selen"
              style={{ width: 128, height: 128, objectFit: "contain" }}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <main
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "2.5rem 2.5rem 5rem",
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 28,
          alignItems: "start",
        }}
      >
        {/* ====================== COLONNE GAUCHE ========================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {!step1Submitted ? (
            <>
              <Card>
                <Badge>Étape 1</Badge>
                <h2 style={styles.cardTitle}>Avant de commencer</h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <p style={styles.body}>
                    Ici, nous recueillons les informations indispensables pour
                    lancer votre accompagnement et préparer vos documents.
                  </p>
                  <p style={styles.body}>
                    Nous ne vous demandons pas tout d&apos;un coup :
                    l&apos;objectif est de vous faire avancer étape par étape,
                    sans surcharge.
                  </p>
                  <p
                    style={{
                      ...styles.body,
                      fontStyle: "italic",
                      color: "#7f6b58",
                    }}
                  >
                    Étape suivante : lorsque vous aurez trouvé votre client ou
                    votre session, vous nous transmettrez les coordonnées
                    utiles, les dates et le lieu de formation.
                  </p>
                </div>
              </Card>

              <SimpleFormCard
                badge="Indispensable"
                title="Organisme de formation"
                intro="Ces informations nous servent à ouvrir correctement votre accompagnement et à préparer les futurs documents au nom de votre organisme."
              >
                <Field
                  label="Raison sociale"
                  placeholder="Ex. Nom organisme"
                  value={form.organisation_name}
                  onChange={(value) => updateForm("organisation_name", value)}
                />
                <Field
                  label="Email"
                  placeholder="contact@exemple.fr"
                  type="email"
                  value={form.organisation_email}
                  onChange={(value) => updateForm("organisation_email", value)}
                />
                <Field
                  label="Téléphone"
                  placeholder="06 00 00 00 00"
                  value={form.organisation_phone}
                  onChange={(value) => updateForm("organisation_phone", value)}
                />
              </SimpleFormCard>

              <SimpleFormCard
                badge="Indispensable"
                title="Représentant de l'organisme"
                intro="Nous utiliserons ces informations pour compléter les documents administratifs liés à votre organisme."
              >
                <Field
                  label="Prénom"
                  placeholder="Prénom"
                  value={form.representant_prenom}
                  onChange={(value) => updateForm("representant_prenom", value)}
                />
                <Field
                  label="Nom"
                  placeholder="Nom"
                  value={form.representant_nom}
                  onChange={(value) => updateForm("representant_nom", value)}
                />
              </SimpleFormCard>

              <SimpleFormCard
                badge="Indispensable"
                title="Formateur principal"
                intro="Ces informations nous permettent d'identifier correctement le formateur principal et de préparer les documents associés."
              >
                <Field
                  label="Prénom"
                  placeholder="Prénom"
                  value={form.formateur_prenom}
                  onChange={(value) => updateForm("formateur_prenom", value)}
                />
                <Field
                  label="Nom"
                  placeholder="Nom"
                  value={form.formateur_nom}
                  onChange={(value) => updateForm("formateur_nom", value)}
                />
                <Field
                  label="Email"
                  placeholder="formateur@exemple.fr"
                  type="email"
                  full
                  value={form.formateur_email}
                  onChange={(value) => updateForm("formateur_email", value)}
                />
              </SimpleFormCard>

              <Card>
                <Badge>Indispensable</Badge>
                <h2 style={styles.cardTitle}>Formation</h2>
                <p style={{ ...styles.body, marginTop: 12, marginBottom: 20 }}>
                  Nous avons besoin ici de l'intitulé exact, de la durée, du
                  tarif et de la modalité. Les dates, le lieu précis et les
                  informations stagiaire seront demandés à l'étape suivante.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <Field
                    label="Intitulé exact de la formation"
                    placeholder="Ex. Création et gestion d'entreprise"
                    full
                    value={form.formation_intitule}
                    onChange={(value) =>
                      updateForm("formation_intitule", value)
                    }
                  />
                  <Field
                    label="Durée"
                    placeholder="35 heures"
                    value={form.formation_duree}
                    onChange={(value) => updateForm("formation_duree", value)}
                  />
                  <Field
                    label="Tarif"
                    placeholder="Ex. 1 200 € TTC"
                    value={form.formation_tarif}
                    onChange={(value) => updateForm("formation_tarif", value)}
                  />
                  <SelectField
                    label="Modalité"
                    options={["Présentiel", "Distanciel", "Mixte"]}
                    value={form.formation_modalite}
                    onChange={(value) =>
                      updateForm("formation_modalite", value)
                    }
                  />
                </div>
                <Notice style={{ marginTop: 16 }}>
                  Le programme doit être cohérent avec les diplômes et la
                  qualification du formateur. En cas d'écart, un ajustement
                  pourra être nécessaire avant validation.
                </Notice>
              </Card>

              <Card>
                <Badge>Documents</Badge>
                <h2 style={styles.cardTitle}>Pièces à déposer</h2>
                <p style={{ ...styles.body, marginTop: 12, marginBottom: 20 }}>
                  Ces pièces nous permettent de vérifier la cohérence de votre
                  activité et de préparer le traitement administratif dans de
                  bonnes conditions.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <DocDropZone
                    docKey="cv"
                    name="CV formateur"
                    status="Obligatoire"
                    statusColor="required"
                    description="Le CV doit mentionner les formations dispensées, les diplômes obtenus et l'expérience professionnelle du formateur."
                    notice="Format accepté : PDF, DOCX. Assurez-vous que le CV est à jour et reflète les compétences liées à la formation."
                    state={docs.cv}
                    onDrop={(f) => handleFileDrop("cv", f)}
                  />
                  <DocDropZone
                    docKey="programme"
                    name="Programme de formation"
                    status="Obligatoire"
                    statusColor="required"
                    description="Le programme doit être en rapport avec les diplômes du formateur. Si votre programme n'est pas conforme ou risque d'être refusé, une reformulation vous sera proposée."
                    notice="Format accepté : PDF, DOCX. Nous vous proposons un modèle à télécharger si vous n'en avez pas encore."
                    state={docs.programme}
                    onDrop={(f) => handleFileDrop("programme", f)}
                    downloadLabel="Télécharger le modèle de programme de formation"
                    downloadHref="/templates/modele-programme-formation-selen.docx"
                  />
                  <DocDropZone
                    docKey="insee"
                    name="Avis INSEE"
                    status="Obligatoire"
                    statusColor="required"
                    description="L'avis de situation SIRENE (INSEE) permet de vérifier l'existence légale de votre organisme et votre code APE."
                    notice={
                      <>
                        Téléchargeable gratuitement sur{" "}
                        <a
                          href="https://avis-situation-sirene.insee.fr/"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#9c5a2e",
                            fontWeight: 600,
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          le site de l’INSEE
                        </a>
                        . Doit dater de moins de 3 mois.
                      </>
                    }
                    state={docs.insee}
                    onDrop={(f) => handleFileDrop("insee", f)}
                  />
                  <DocDropZone
                    docKey="kbis"
                    name="Extrait KBIS"
                    status="Si concerné"
                    statusColor="optional"
                    description="Le KBIS est requis pour les sociétés commerciales. Il n’est pas attendu pour les micro-entreprises."
                    notice={
                      <>
                        À récupérer sur{" "}
                        <a
                          href="https://www.infogreffe.fr/kbis-documents/extrait-kbis?gad_source=1&gad_campaignid=23156315645&gbraid=0AAAAA90djejbDaanrl7BHHLn2O3kybwqB&gclid=Cj0KCQjwmunNBhDbARIsAOndKpm7ss8JfBpadw7vJdKBPyRo3mOxmvFG3a1cMhvucrhq4MNQLetqRWwaAuX1EALw_wcB"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#9c5a2e",
                            fontWeight: 600,
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          Infogreffe
                        </a>
                        . Pas de KBIS pour les micro-entreprises.
                      </>
                    }
                    state={docs.kbis}
                    onDrop={(f) => handleFileDrop("kbis", f)}
                  />
                </div>

                <Notice style={{ marginTop: 20 }}>
                  Vous avez un document ou une image et vous souhaitez le
                  transformer en PDF ? Le site{" "}
                  <a
                    href="https://www.ilovepdf.com/fr/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#9c5a2e",
                      fontWeight: 600,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    iLovePDF
                  </a>{" "}
                  permet de convertir gratuitement vos documents en PDF.
                </Notice>
              </Card>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                  paddingTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <Btn variant="ghost" onClick={handleSaveDraft}>
                  {saving
                    ? "Enregistrement..."
                    : "Enregistrer mes informations"}
                </Btn>
                <Btn variant="primary" onClick={handleSubmitEssentialInfos}>
                  {saving
                    ? "Envoi en cours..."
                    : "Envoyer mes informations essentielles →"}
                </Btn>

                {errorMessage && (
                  <Notice
                    style={{
                      marginTop: 8,
                      border: "1px solid #e7b8b8",
                      background: "#fff1f1",
                      color: "#8a2f2f",
                      width: "100%",
                    }}
                  >
                    {errorMessage}
                  </Notice>
                )}

                {successMessage && (
                  <Notice
                    style={{
                      marginTop: 8,
                      border: "1px solid #cfe3c3",
                      background: "#f4fbef",
                      color: "#446236",
                      width: "100%",
                    }}
                  >
                    {successMessage}
                  </Notice>
                )}
              </div>
            </>
          ) : (
            <>
              <Card>
                <Badge>Étape 1 terminée</Badge>
                <h2 style={styles.cardTitle}>
                  Merci, votre dossier a bien été transmis
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <p style={styles.body}>
                    Un agent va maintenant prendre en charge votre dossier. Il
                    pourra vous contacter si certains éléments doivent être
                    précisés ou complétés.
                  </p>
                  <p style={styles.body}>
                    La prochaine étape consiste à vérifier et, si nécessaire, à
                    retravailler votre programme afin qu’il soit cohérent avec
                    les diplômes du formateur et les attentes de l’instruction
                    du dossier.
                  </p>
                  <Notice>
                    Notre objectif est de vous proposer un programme conforme,
                    cohérent et défendable, afin d’optimiser les chances
                    d’acceptation de votre demande.
                  </Notice>
                </div>
              </Card>

              <Card>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <Badge>Vos informations</Badge>
                    <h2 style={{ ...styles.cardTitle, marginTop: 6 }}>
                      Informations déjà transmises
                    </h2>
                  </div>

                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowStep1Details((prev) => !prev)}
                  >
                    {showStep1Details ? "Masquer" : "Afficher"}
                  </Btn>
                </div>

                {showStep1Details ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    <Notice>
                      Vous pouvez consulter les éléments transmis. Si une
                      correction est nécessaire, votre agent vous l’indiquera
                      directement dans la messagerie.
                    </Notice>

                    <div style={{ ...styles.body }}>
                      <strong>Organisme :</strong>{" "}
                      {form.organisation_name || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Email :</strong> {form.organisation_email || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Téléphone :</strong>{" "}
                      {form.organisation_phone || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Formateur :</strong>{" "}
                      {form.formateur_prenom || "—"} {form.formateur_nom || ""}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Formation :</strong>{" "}
                      {form.formation_intitule || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Durée :</strong> {form.formation_duree || "—"}
                    </div>
                    <div style={{ ...styles.body }}>
                      <strong>Modalité :</strong>{" "}
                      {form.formation_modalite || "—"}
                    </div>
                  </div>
                ) : null}
              </Card>

              <Card>
                <Badge>Travail du programme</Badge>
                <h2 style={styles.cardTitle}>
                  Prochaine étape : votre programme
                </h2>
                <p style={{ ...styles.body, marginTop: 12 }}>
                  Un agent va analyser les éléments transmis et vous proposer,
                  si nécessaire, une version conforme de votre programme, en
                  accord avec les diplômes du formateur et les exigences du
                  dossier.
                </p>
                <p style={{ ...styles.body, marginTop: 12 }}>
                  Cette proposition apparaîtra ici dès qu’elle sera prête.
                </p>
              </Card>

              {programProposal ? (
                <ClientProgramProposal
                  dossierId={dossierId}
                  program={programProposal}
                />
              ) : (
                <Card>
                  <Badge>En attente</Badge>
                  <h2 style={styles.cardTitle}>Programme en cours d’étude</h2>
                  <p style={{ ...styles.body, marginTop: 12 }}>
                    Votre dossier est actuellement en cours d’analyse. Dès qu’un
                    agent aura préparé une proposition de programme, elle
                    s’affichera dans cet espace.
                  </p>
                </Card>
              )}
            </>
          )}
        </div>

        {/* ====================== COLONNE DROITE ========================= */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            position: "sticky",
            top: 88,
          }}
        >
          {/* Parcours */}
          <Card>
            <p style={styles.label}>Votre parcours</p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {steps.map((step) => (
                <div key={step.number} style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: step.active
                        ? "1.5px solid #4b2e1e"
                        : "1.5px solid #d9c9b2",
                      background: step.active ? "#f6efe4" : "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: step.active ? "#4b2e1e" : "#8b7a67",
                      flexShrink: 0,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {step.number}
                  </div>
                  <div style={{ paddingTop: 6 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: step.active ? "#3a261a" : "#7a6b5d",
                        margin: 0,
                        fontFamily: "sans-serif",
                      }}
                    >
                      {step.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Ce que nous faisons maintenant */}
          <Card>
            <p style={styles.label}>Ce que nous faisons maintenant</p>
            <ul
              style={{
                marginTop: 14,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {[
                "Informations de votre organisme",
                "Représentant de l'organisme",
                "Formateur principal",
                "Informations de base sur la formation",
                "Pièces essentielles à déposer",
              ].map((item) => (
                <li
                  key={item}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#c98b49",
                      flexShrink: 0,
                      marginTop: 5,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: "#5f4d3d",
                      fontFamily: "sans-serif",
                      lineHeight: 1.5,
                    }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            <Notice style={{ marginTop: 14 }}>
              Nous vous demandons uniquement les éléments essentiels pour lancer
              le travail. Vous pourrez compléter le reste ensuite.
            </Notice>
          </Card>

          {/* Ce qui se passe ensuite */}
          <Card>
            <p style={styles.label}>Ce qui se passe ensuite</p>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {[
                "Notre équipe lance votre accompagnement et prépare la prochaine étape.",
                "Vous recevrez un accès pour compléter les informations client.",
                "Vous accéderez aux documents générés à compléter et renvoyer.",
                "Vous récupérerez les documents vérifiés et un tutoriel de dépôt final.",
              ].map((text, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#9c5a2e",
                      fontFamily: "sans-serif",
                      minWidth: 16,
                      paddingTop: 2,
                    }}
                  >
                    {i + 2}
                  </span>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#5f4d3d",
                      margin: 0,
                      lineHeight: 1.55,
                      fontFamily: "sans-serif",
                    }}
                  >
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocDropZone
// ---------------------------------------------------------------------------

function DocDropZone({
  name,
  status,
  statusColor,
  description,
  notice,
  state,
  onDrop,
  downloadLabel,
  downloadHref,
}: {
  docKey: DocKey;
  name: string;
  status: string;
  statusColor: "required" | "optional";
  description: string;
  notice: React.ReactNode;
  state: DocState;
  onDrop: (file: File) => void;
  downloadLabel?: string;
  downloadHref?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onDrop(file);
  }

  const statusStyles: Record<string, React.CSSProperties> = {
    required: {
      background: "#fdf0e8",
      color: "#9c5a2e",
      border: "1px solid #e8c9a8",
    },
    optional: {
      background: "#f4f0ea",
      color: "#7a6b5d",
      border: "1px solid #ddd0bd",
    },
  };

  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid #e2d7c5",
        background: "#fffdfa",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid #ede5d8",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#3a261a",
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {name}
          </p>
          <span
            style={{
              ...statusStyles[statusColor],
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              borderRadius: 100,
              padding: "3px 9px",
              whiteSpace: "nowrap",
              fontFamily: "sans-serif",
            }}
          >
            {status}
          </span>
        </div>

        <p
          style={{
            fontSize: 12,
            color: "#7e6e5d",
            margin: 0,
            lineHeight: 1.55,
            fontFamily: "sans-serif",
          }}
        >
          {description}
        </p>

        {downloadHref && downloadLabel && (
          <div style={{ marginTop: 10 }}>
            <a
              href={downloadHref}
              download
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#9c5a2e",
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: 2,
                fontFamily: "sans-serif",
                fontSize: 13,
              }}
            >
              {downloadLabel}
            </a>
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "14px 16px",
          background: dragging ? "#f5ede0" : "#f8f1e8",
          borderBottom: "1px solid #ede5d8",
          cursor: "pointer",
          transition: "background 0.15s",
          textAlign: "center",
          border: dragging ? "1.5px dashed #9c5a2e" : "1.5px dashed #cdb99f",
          margin: "0 12px 0",
          borderRadius: 3,
          marginTop: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          accept=".pdf,.doc,.docx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onDrop(f);
          }}
        />

        {state.file ? (
          <div>
            <p
              style={{
                fontSize: 12,
                color: "#4b2e1e",
                fontWeight: 600,
                margin: "0 0 2px",
                fontFamily: "sans-serif",
              }}
            >
              ✓ {state.file.name}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "#8b7a67",
                margin: 0,
                fontFamily: "sans-serif",
              }}
            >
              Cliquer pour remplacer
            </p>
          </div>
        ) : (
          <div>
            <p
              style={{
                fontSize: 12,
                color: "#6c5a49",
                margin: "0 0 2px",
                fontFamily: "sans-serif",
              }}
            >
              Déposer un fichier ici
            </p>
            <p
              style={{
                fontSize: 11,
                color: "#9c8878",
                margin: 0,
                fontFamily: "sans-serif",
              }}
            >
              ou cliquer pour sélectionner · PDF, DOCX
            </p>
          </div>
        )}
      </div>

      <div
        style={{
          padding: "10px 16px 12px",
          background: "#fbf7f2",
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: "#7a6453",
            margin: 0,
            lineHeight: 1.5,
            fontFamily: "sans-serif",
            fontStyle: "italic",
          }}
        >
          {notice}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composants UI partagés
// ---------------------------------------------------------------------------

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid #deceb7",
        background: "rgba(255,252,247,0.88)",
        padding: "1.5rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #d8c3a8",
        background: "#f7eee2",
        padding: "3px 10px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "#9c5a2e",
        marginBottom: 10,
        fontFamily: "sans-serif",
        borderRadius: 2,
      }}
    >
      {children}
    </div>
  );
}

function Notice({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 3,
        border: "1px solid #ead9bf",
        background: "#fbf3e4",
        padding: "12px 14px",
        fontSize: 13,
        lineHeight: 1.65,
        color: "#6f5a45",
        fontFamily: "sans-serif",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SimpleFormCard({
  title,
  badge,
  intro,
  children,
}: {
  title: string;
  badge: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Badge>{badge}</Badge>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={{ ...styles.body, margin: "12px 0 20px" }}>{intro}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {children}
      </div>
    </Card>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  full = false,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: string;
  full?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label
      style={{ display: "block", gridColumn: full ? "1 / -1" : undefined }}
    >
      <span
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#7f6b58",
          fontFamily: "sans-serif",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: "100%",
          border: "1px solid #d9ccb9",
          background: "#fffdfa",
          padding: "10px 14px",
          fontSize: 14,
          color: "#3a261a",
          outline: "none",
          fontFamily: "sans-serif",
          borderRadius: 3,
          boxSizing: "border-box",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "#9c5a2e";
          e.target.style.boxShadow = "0 0 0 2px rgba(156,90,46,0.12)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#d9ccb9";
          e.target.style.boxShadow = "none";
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#7f6b58",
          fontFamily: "sans-serif",
        }}
      >
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: "100%",
          border: "1px solid #d9ccb9",
          background: "#fffdfa",
          padding: "10px 14px",
          fontSize: 14,
          color: "#3a261a",
          outline: "none",
          fontFamily: "sans-serif",
          borderRadius: 3,
          appearance: "none",
          cursor: "pointer",
        }}
      >
        <option value="">Sélectionner</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Btn({
  children,
  variant,
  size,
  full,
  onClick,
}: {
  children: React.ReactNode;
  variant: "primary" | "ghost";
  size?: "sm";
  full?: boolean;
  onClick?: () => void;
}) {
  const base: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    fontFamily: "sans-serif",
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    transition: "opacity 0.15s, background 0.15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
    width: full ? "100%" : undefined,
  };

  const sizeStyles: React.CSSProperties =
    size === "sm"
      ? { fontSize: 11, padding: "8px 14px" }
      : { fontSize: 12, padding: "12px 20px" };

  const variantStyles: React.CSSProperties =
    variant === "primary"
      ? { background: "#4b2e1e", color: "white", border: "1px solid #4b2e1e" }
      : {
          background: "transparent",
          color: "#4b2e1e",
          border: "1px solid #c9b79c",
        };

  return (
    <button
      onClick={onClick}
      style={{ ...base, ...sizeStyles, ...variantStyles }}
      onMouseEnter={(e) => {
        (e.target as HTMLButtonElement).style.opacity = "0.82";
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLButtonElement).style.opacity = "1";
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Styles partagés
// ---------------------------------------------------------------------------

const styles = {
  cardTitle: {
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.2,
    color: "#3a261a",
    margin: 0,
    letterSpacing: "-0.01em",
  } as React.CSSProperties,

  body: {
    fontSize: 14,
    lineHeight: 1.7,
    color: "#5f4d3d",
    margin: 0,
    fontFamily: "sans-serif",
  } as React.CSSProperties,

  label: {
    fontSize: 10,
    letterSpacing: "0.28em",
    textTransform: "uppercase" as const,
    color: "#9c5a2e",
    margin: 0,
    fontFamily: "sans-serif",
  } as React.CSSProperties,
};
