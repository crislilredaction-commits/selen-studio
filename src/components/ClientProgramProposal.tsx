"use client";

import { useState } from "react";

type ProgramChapter = {
  title: string;
  objective: string;
};

type ProgramModule = {
  title: string;
  duration: string;
  objective: string;
  chapters: ProgramChapter[];
};

type ProgramVersion = {
  id: string;
  title: string | null;
  target_audience: string | null;
  overall_objective: string | null;
  recommended_positioning: string | null;
  justification: string | null;
  agent_comment: string | null;
  vigilance_points: string[] | null;
  modules: ProgramModule[] | null;
};

export default function ClientProgramProposal({
  dossierId,
  program,
}: {
  dossierId: string;
  program: ProgramVersion;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decision, setDecision] = useState<"validated" | "refused" | null>(
    null,
  );
  const [clientComment, setClientComment] = useState("");
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleDecision(nextDecision: "validated" | "refused") {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      if (
        nextDecision === "refused" &&
        !clientComment.trim() &&
        !replacementFile
      ) {
        throw new Error(
          "Merci d’indiquer un commentaire ou de joindre une version modifiée avant de refuser le programme.",
        );
      }

      const formData = new FormData();
      formData.append("dossierId", dossierId);
      formData.append("programVersionId", program.id);
      formData.append("decision", nextDecision);

      if (clientComment.trim()) {
        formData.append("comment", clientComment.trim());
      }

      if (replacementFile) {
        formData.append("file", replacementFile);
      }

      const res = await fetch("/agent/api/client/program/decision", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error ?? "Erreur lors de l’enregistrement de votre décision.",
        );
      }

      setDecision(nextDecision);
      setSuccessMessage(
        nextDecision === "validated"
          ? "Votre validation a bien été transmise à votre agent."
          : "Votre demande de modification a bien été transmise à votre agent.",
      );

      window.location.reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inconnue.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const downloadUrl = `/agent/api/client/program/download?programVersionId=${encodeURIComponent(program.id)}&dossierId=${encodeURIComponent(dossierId)}`;

  return (
    <div
      style={{
        borderRadius: 4,
        border: "1px solid #deceb7",
        background: "rgba(255,252,247,0.88)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
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
            fontFamily: "sans-serif",
            borderRadius: 2,
          }}
        >
          Programme proposé
        </div>

        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "transparent",
            color: "#4b2e1e",
            border: "1px solid #c9b79c",
            borderRadius: 3,
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "sans-serif",
            letterSpacing: "0.08em",
            textDecoration: "none",
          }}
        >
          Télécharger en Word
        </a>
      </div>

      <h2
        style={{
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.2,
          color: "#3a261a",
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {program.title || "Programme reformulé"}
      </h2>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: "#5f4d3d",
          margin: "12px 0 0",
          fontFamily: "sans-serif",
        }}
      >
        Nous vous proposons cette reformulation afin de renforcer la cohérence
        pédagogique et administrative du programme transmis.
      </p>

      {program.target_audience ? (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7f6b58",
              fontFamily: "sans-serif",
              marginBottom: 6,
            }}
          >
            Public visé
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#3a261a",
              fontFamily: "sans-serif",
            }}
          >
            {program.target_audience}
          </div>
        </div>
      ) : null}

      {program.overall_objective ? (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7f6b58",
              fontFamily: "sans-serif",
              marginBottom: 6,
            }}
          >
            Objectif global
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#3a261a",
              fontFamily: "sans-serif",
              lineHeight: 1.65,
            }}
          >
            {program.overall_objective}
          </div>
        </div>
      ) : null}

      {program.recommended_positioning ? (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7f6b58",
              fontFamily: "sans-serif",
              marginBottom: 6,
            }}
          >
            Positionnement recommandé
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#3a261a",
              fontFamily: "sans-serif",
              lineHeight: 1.65,
            }}
          >
            {program.recommended_positioning}
          </div>
        </div>
      ) : null}

      {program.justification ? (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7f6b58",
              fontFamily: "sans-serif",
              marginBottom: 6,
            }}
          >
            Pourquoi cette proposition
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#3a261a",
              fontFamily: "sans-serif",
              lineHeight: 1.65,
            }}
          >
            {program.justification}
          </div>
        </div>
      ) : null}

      {program.vigilance_points?.length ? (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7f6b58",
              fontFamily: "sans-serif",
              marginBottom: 8,
            }}
          >
            Points de vigilance
          </div>

          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.6,
              color: "#5f4d3d",
              fontFamily: "sans-serif",
            }}
          >
            {program.vigilance_points.map((point, index) => (
              <li key={`${index}-${point}`}>{point}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {program.modules?.length ? (
        <div
          style={{
            marginTop: 22,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {program.modules.map((module, index) => (
            <div
              key={`${index}-${module.title}`}
              style={{
                border: "1px solid #e2d7c5",
                background: "#fffdfa",
                borderRadius: 4,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#3a261a",
                  marginBottom: 6,
                }}
              >
                {module.title}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#7e6e5d",
                  fontFamily: "sans-serif",
                  marginBottom: 10,
                  lineHeight: 1.6,
                }}
              >
                {module.duration} · {module.objective}
              </div>

              {module.chapters?.length ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "#5f4d3d",
                    fontFamily: "sans-serif",
                  }}
                >
                  {module.chapters.map((chapter, chapterIndex) => (
                    <li key={`${chapterIndex}-${chapter.title}`}>
                      <strong>{chapter.title}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {program.agent_comment ? (
        <div
          style={{
            marginTop: 22,
            borderRadius: 3,
            border: "1px solid #ead9bf",
            background: "#fbf3e4",
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.65,
            color: "#6f5a45",
            fontFamily: "sans-serif",
          }}
        >
          <strong>Commentaire de votre conseiller :</strong>
          <br />
          {program.agent_comment}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 22,
          borderRadius: 3,
          border: "1px solid #ead9bf",
          background: "#fbf3e4",
          padding: "12px 14px",
          fontSize: 13,
          lineHeight: 1.7,
          color: "#6f5a45",
          fontFamily: "sans-serif",
        }}
      >
        Si cette proposition vous convient, vous pouvez la valider.
        <br />
        Si vous souhaitez une correction, merci d’expliquer ce qui doit être
        ajusté et, si possible, de joindre votre version modifiée afin que votre
        conseiller puisse retravailler le plan.
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 20,
        }}
      >
        <a
          href={`/agent/api/program/download?programVersionId=${program.id}&dossierId=${dossierId}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#4b2e1e",
            color: "white",
            border: "1px solid #4b2e1e",
            borderRadius: 3,
            padding: "12px 20px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "sans-serif",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            textDecoration: "none",
            minWidth: 260,
          }}
        >
          Télécharger la proposition Word
        </a>
      </div>

      <div style={{ marginTop: 22 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#7f6b58",
            fontFamily: "sans-serif",
            marginBottom: 8,
          }}
        >
          Votre retour
        </div>

        <textarea
          value={clientComment}
          onChange={(e) => setClientComment(e.target.value)}
          placeholder="Vous pouvez expliquer ici ce qui vous convient ou ce que vous souhaitez modifier..."
          style={{
            width: "100%",
            minHeight: 120,
            border: "1px solid #d9ccb9",
            background: "#fffdfa",
            padding: "12px 14px",
            fontSize: 14,
            color: "#3a261a",
            outline: "none",
            fontFamily: "sans-serif",
            borderRadius: 3,
            boxSizing: "border-box",
            resize: "vertical",
            lineHeight: 1.6,
          }}
        />
      </div>

      <div
        style={{
          marginTop: 18,
          borderRadius: 3,
          border: "1px solid #ead9bf",
          background: "#fbf3e4",
          padding: "12px 14px",
          fontSize: 13,
          lineHeight: 1.65,
          color: "#6f5a45",
          fontFamily: "sans-serif",
        }}
      >
        Si cette proposition ne vous convient pas, vous pouvez télécharger le
        document, le corriger, puis nous renvoyer votre version modifiée avec un
        commentaire expliquant les ajustements souhaités. Votre conseiller
        pourra alors reprendre le plan et vous faire une nouvelle proposition.
      </div>

      <div style={{ marginTop: 18 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#7f6b58",
            fontFamily: "sans-serif",
            marginBottom: 8,
          }}
        >
          Ajouter une version corrigée
        </div>

        <label
          style={{
            display: "block",
            border: "1px dashed #c9b79c",
            background: "#fffdfa",
            borderRadius: 4,
            padding: "14px 16px",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#3a261a",
              fontFamily: "sans-serif",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Cliquer pour joindre votre fichier modifié
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#7e6e5d",
              fontFamily: "sans-serif",
              lineHeight: 1.6,
            }}
          >
            Formats acceptés : DOC, DOCX ou PDF.
          </div>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fffdfa",
              color: "#4b2e1e",
              border: "1px solid #c9b79c",
              borderRadius: 3,
              padding: "12px 18px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "sans-serif",
              letterSpacing: "0.08em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            Ajouter mon fichier corrigé
            <input
              type="file"
              accept=".doc,.docx,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setReplacementFile(file);
              }}
              style={{ display: "none" }}
            />
          </label>
        </label>

        {replacementFile ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#5f4d3d",
              fontFamily: "sans-serif",
            }}
          >
            Fichier sélectionné : <strong>{replacementFile.name}</strong>
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <div
          style={{
            marginTop: 18,
            borderRadius: 3,
            border: "1px solid #e7b8b8",
            background: "#fff1f1",
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#8a2f2f",
            fontFamily: "sans-serif",
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            marginTop: 18,
            borderRadius: 3,
            border: "1px solid #cfe3c3",
            background: "#f4fbef",
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#446236",
            fontFamily: "sans-serif",
          }}
        >
          {successMessage}
        </div>
      ) : null}

      {decision === "validated" ? (
        <div
          style={{
            marginTop: 18,
            borderRadius: 3,
            border: "1px solid #cfe3c3",
            background: "#f4fbef",
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#446236",
            fontFamily: "sans-serif",
          }}
        >
          Programme validé avec succès.
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
          marginTop: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => handleDecision("refused")}
          disabled={isSubmitting}
          style={{
            background: "transparent",
            color: "#4b2e1e",
            border: "1px solid #c9b79c",
            borderRadius: 3,
            padding: "12px 20px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "sans-serif",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            minWidth: 220,
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          {isSubmitting ? "Envoi..." : "Je refuse et je commente"}
        </button>

        <button
          type="button"
          onClick={() => handleDecision("validated")}
          disabled={isSubmitting}
          style={{
            background: isSubmitting ? "rgba(75,46,30,0.45)" : "#4b2e1e",
            color: "white",
            border: "1px solid #4b2e1e",
            borderRadius: 3,
            padding: "12px 20px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "sans-serif",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            minWidth: 220,
          }}
        >
          {isSubmitting ? "Envoi..." : "Je valide ce programme"}
        </button>
      </div>
    </div>
  );
}
