export type NdaProgramDocumentKind = "proposal" | "final";

export type NdaProgramDocumentOrganisation = {
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  nda_number?: string | null;
};

export type NdaProgramDocumentVariables = {
  formateur_nom?: string | null;
  formateur_prenom?: string | null;
  duree_formation?: string | number | null;
  modalite?: string | null;
  lieu_formation?: string | null;
  date_formation_prevue?: string | null;
  stagiaire_prenom?: string | null;
  stagiaire_nom?: string | null;
  intitule_formation?: string | null;
};

export type NdaProgramDocumentVersion = {
  title?: string | null;
  target_audience?: string | null;
  overall_objective?: string | null;
  recommended_positioning?: string | null;
  justification?: string | null;
  agent_comment?: string | null;
  modules?: unknown;
  vigilance_points?: unknown;
};

export type BuildNdaProgramDocumentHtmlArgs = {
  kind: NdaProgramDocumentKind;
  version: NdaProgramDocumentVersion;
  organisation?: NdaProgramDocumentOrganisation | null;
  variables?: NdaProgramDocumentVariables | null;
  generatedAt?: Date;
};

type ProgramModule = {
  title?: unknown;
  duration?: unknown;
  objective?: unknown;
  chapters?: unknown;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function display(value: unknown, fallback = "Non renseigné") {
  const normalized = String(value ?? "").trim();
  return escapeHtml(normalized || fallback);
}

function displayDate(value: unknown) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "Non renseigné";
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(normalized);
  }

  return escapeHtml(date.toLocaleDateString("fr-FR"));
}

function displayPerson(firstName?: unknown, lastName?: unknown) {
  return display([firstName, lastName].filter(Boolean).join(" "));
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function buildInfoRow(label: string, value: string) {
  return `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${value}</td>
    </tr>
  `;
}

export function buildNdaProgramDocumentHtml({
  kind,
  version,
  organisation,
  variables,
  generatedAt = new Date(),
}: BuildNdaProgramDocumentHtmlArgs) {
  const documentLabel =
    kind === "final"
      ? "Programme de formation validé"
      : "Proposition de programme de formation";
  const programmeTitle =
    variables?.intitule_formation || version.title || "Programme de formation";
  const generatedDate = generatedAt.toLocaleDateString("fr-FR");
  const ndaNumber =
    String(organisation?.nda_number ?? "").trim() || "en cours d'enregistrement";
  const modules = asArray(version.modules) as ProgramModule[];
  const vigilancePoints = asArray(version.vigilance_points);
  const footerParts = [
    display(organisation?.name),
    display(organisation?.address),
    `NDA ${escapeHtml(ndaNumber)}`,
    "cet enregistrement ne vaut pas agrément de l'État",
    display(organisation?.email),
    display(organisation?.phone),
    `Document actualisé le ${escapeHtml(generatedDate)}`,
  ];

  const summaryRows = [
    buildInfoRow("Organisme", display(organisation?.name)),
    buildInfoRow("SIRET", display(organisation?.siret)),
    buildInfoRow(
      "Formateur",
      displayPerson(variables?.formateur_prenom, variables?.formateur_nom),
    ),
    buildInfoRow("Durée", display(variables?.duree_formation)),
    buildInfoRow("Modalité", display(variables?.modalite)),
    buildInfoRow("Lieu", display(variables?.lieu_formation)),
    buildInfoRow("Date prévue", displayDate(variables?.date_formation_prevue)),
    buildInfoRow(
      "Stagiaire",
      displayPerson(variables?.stagiaire_prenom, variables?.stagiaire_nom),
    ),
  ].join("");

  const modulesHtml = modules.length
    ? modules
        .map((module, index) => {
          const chapters = asArray(module.chapters);
          const chaptersHtml = chapters.length
            ? `
              <p class="subsection-label">Chapitres</p>
              <ul>
                ${chapters
                  .map((chapter) => {
                    const title =
                      typeof chapter === "object" &&
                      chapter !== null &&
                      "title" in chapter
                        ? (chapter as { title?: unknown }).title
                        : chapter;

                    return `<li>${display(title)}</li>`;
                  })
                  .join("")}
              </ul>
            `
            : "";

          return `
            <div class="module">
              <h3>Module ${index + 1} - ${display(module.title)}</h3>
              <table class="module-table">
                <tr>
                  <th>Durée</th>
                  <td>${display(module.duration)}</td>
                </tr>
                <tr>
                  <th>Objectif</th>
                  <td>${display(module.objective)}</td>
                </tr>
              </table>
              ${chaptersHtml}
            </div>
          `;
        })
        .join("")
    : `<p class="muted">Aucun module détaillé n'est renseigné.</p>`;

  const vigilanceHtml = vigilancePoints.length
    ? `
      <h2>Points de vigilance</h2>
      <ul>
        ${vigilancePoints.map((point) => `<li>${display(point)}</li>`).join("")}
      </ul>
    `
    : "";

  const agentCommentHtml = version.agent_comment
    ? `
      <h2>Commentaire du conseiller</h2>
      <p>${display(version.agent_comment)}</p>
    `
    : "";

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(documentLabel)} - ${display(programmeTitle)}</title>
    <style>
      @page WordSection1 {
        size: 21cm 29.7cm;
        margin: 2.1cm 1.9cm 2cm 1.9cm;
      }
      body {
        font-family: "Georgia", "Times New Roman", serif;
        color: #2a2a28;
        background: #ffffff;
        line-height: 1.45;
        font-size: 11pt;
        margin: 0;
      }
      div.WordSection1 {
        page: WordSection1;
      }
      h1, h2, h3 {
        font-family: "Arial", "Helvetica", sans-serif;
        color: #27333a;
        margin: 0;
      }
      h1 {
        font-size: 24pt;
        font-weight: bold;
        margin-bottom: 10pt;
      }
      h2 {
        font-size: 15pt;
        border-bottom: 1pt solid #b8afa3;
        padding-bottom: 5pt;
        margin-top: 24pt;
        margin-bottom: 10pt;
      }
      h3 {
        font-size: 12.5pt;
        margin-top: 15pt;
        margin-bottom: 7pt;
      }
      p {
        margin: 6pt 0;
      }
      ul {
        margin-top: 6pt;
        margin-bottom: 8pt;
      }
      li {
        margin-bottom: 3pt;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th, td {
        border: 1pt solid #d5d0c8;
        padding: 7pt 8pt;
        vertical-align: top;
      }
      th {
        width: 28%;
        background: #f3f0ea;
        color: #3b454a;
        font-family: "Arial", "Helvetica", sans-serif;
        font-size: 9.5pt;
        text-align: left;
      }
      td {
        background: #ffffff;
      }
      .cover {
        border: 1.5pt solid #b8afa3;
        background: #fbfaf7;
        padding: 26pt 28pt;
        margin-bottom: 24pt;
      }
      .document-label {
        font-family: "Arial", "Helvetica", sans-serif;
        font-size: 10pt;
        text-transform: uppercase;
        letter-spacing: 1pt;
        color: #6a6258;
        margin-bottom: 16pt;
      }
      .programme-title {
        font-size: 18pt;
        color: #574837;
        margin-top: 8pt;
      }
      .generated {
        color: #6a6258;
        margin-top: 18pt;
      }
      .summary {
        margin-top: 12pt;
        margin-bottom: 20pt;
      }
      .module {
        margin-bottom: 16pt;
      }
      .module-table {
        margin-bottom: 8pt;
      }
      .subsection-label {
        font-family: "Arial", "Helvetica", sans-serif;
        font-size: 9.5pt;
        font-weight: bold;
        color: #574837;
        margin-top: 8pt;
      }
      .muted {
        color: #6f6b65;
      }
      .footer {
        border-top: 1pt solid #c8c1b8;
        color: #5d5a55;
        font-size: 8.5pt;
        margin-top: 28pt;
        padding-top: 10pt;
        line-height: 1.35;
      }
    </style>
  </head>
  <body>
    <div class="WordSection1">
      <div class="cover">
        <p class="document-label">${escapeHtml(documentLabel)}</p>
        <h1>Programme de formation</h1>
        <p class="programme-title">${display(programmeTitle)}</p>
        <p class="generated">Document actualisé le ${escapeHtml(generatedDate)}</p>
      </div>

      <h2>Récapitulatif</h2>
      <table class="summary">
        ${summaryRows}
      </table>

      <h2>Public visé</h2>
      <p>${display(version.target_audience)}</p>

      <h2>Objectif global</h2>
      <p>${display(version.overall_objective)}</p>

      <h2>Positionnement recommandé</h2>
      <p>${display(version.recommended_positioning)}</p>

      <h2>Justification pédagogique</h2>
      <p>${display(version.justification)}</p>

      <h2>Déroulé pédagogique</h2>
      ${modulesHtml}

      ${vigilanceHtml}
      ${agentCommentHtml}

      <div class="footer">
        ${footerParts.join(" — ")}
      </div>
    </div>
  </body>
</html>`;
}
