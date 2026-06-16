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
  date_fin_formation?: string | null;
  stagiaire_prenom?: string | null;
  stagiaire_nom?: string | null;
  intitule_formation?: string | null;
  tarif_formation?: string | number | null;
  siret?: string | null;
  prerequis_formation?: string | null;
  organisme_adresse?: string | null;
};

export type NdaProgramDocumentVersion = {
  id?: string | null;
  version_type?: string | null;
  title?: string | null;
  target_audience?: string | null;
  overall_objective?: string | null;
  modules?: unknown;
  content?: unknown;
  structured_content?: unknown;
  programme_content?: unknown;
  pedagogical_content?: unknown;
  [key: string]: unknown;
};

export type BuildNdaProgramDocumentHtmlArgs = {
  kind: NdaProgramDocumentKind;
  version: NdaProgramDocumentVersion;
  organisation?: NdaProgramDocumentOrganisation | null;
  variables?: NdaProgramDocumentVariables | null;
  generatedAt?: Date;
};

type NormalizedChapter = {
  title: string;
  objective: string;
};

type NormalizedModule = {
  title: string;
  duration: string;
  objective: string;
  chapters: NormalizedChapter[];
};

const DEFAULT_PREREQUIS = "Savoir lire, écrire et comprendre le français.";

const DEFAULT_PEDAGOGICAL_MEANS =
  "Tables, chaises, rétroprojecteur, ordinateur et supports de formation.";

const DEFAULT_EVALUATION =
  "Questionnaire, exercices pratiques, mises en situation ou évaluation des acquis permettant de vérifier l’atteinte des objectifs de formation.";

const DEFAULT_FOLLOW_UP =
  "Le suivi de l’exécution de l’action est assuré au moyen de feuilles d’émargement ou de justificatifs de présence signés par le stagiaire et le formateur.";

const DEFAULT_CERTIFICATION =
  "À l’issue de la formation, une attestation de fin de formation est remise au bénéficiaire.";

function parseDurationToHours(value: unknown): number | null {
  const text = cleanText(value).toLowerCase().replace(",", ".");

  if (!text) {
    return null;
  }

  const hourMinuteMatch = text.match(/(\d+(?:\.\d+)?)\s*h\s*(\d+)?/i);

  if (hourMinuteMatch) {
    const hours = Number(hourMinuteMatch[1] ?? 0);
    const minutes = Number(hourMinuteMatch[2] ?? 0);

    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours + minutes / 60;
    }
  }

  const hourTextMatch = text.match(/(\d+(?:\.\d+)?)\s*(heure|heures|h)\b/i);

  if (hourTextMatch) {
    const hours = Number(hourTextMatch[1]);

    if (Number.isFinite(hours)) {
      return hours;
    }
  }

  const numericOnly = Number(text);

  return Number.isFinite(numericOnly) ? numericOnly : null;
}

function formatHours(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Non renseigné";
  }

  return Number.isInteger(value)
    ? `${value} heures`
    : `${value.toFixed(2).replace(".", ",")} heures`;
}

export function getNdaProgramModulesTotalHours(
  version: NdaProgramDocumentVersion | null | undefined,
) {
  const content = extractNdaProgramContent(version);

  if (!content.modules.length) {
    return null;
  }

  const durations = content.modules
    .map((module) => parseDurationToHours(module.duration))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) {
    return null;
  }

  return durations.reduce((total, duration) => total + duration, 0);
}

export function validateNdaProgramDurationConsistency(
  version: NdaProgramDocumentVersion | null | undefined,
  variables?: NdaProgramDocumentVariables | null,
) {
  const declaredHours = parseDurationToHours(variables?.duree_formation);
  const modulesTotalHours = getNdaProgramModulesTotalHours(version);

  if (declaredHours === null || modulesTotalHours === null) {
    return {
      ok: true,
      declaredHours,
      modulesTotalHours,
      message: "",
    };
  }

  const isConsistent = Math.abs(declaredHours - modulesTotalHours) < 0.01;

  return {
    ok: isConsistent,
    declaredHours,
    modulesTotalHours,
    message: isConsistent
      ? ""
      : `La durée totale déclarée est de ${formatHours(
          declaredHours,
        )}, mais les modules totalisent ${formatHours(
          modulesTotalHours,
        )}. Corrigez la durée ou les modules avant de générer le programme.`,
  };
}

export type NdaProgramContent = {
  modules: NormalizedModule[];
  rawText: string;
  source: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function isInternalDiagnostic(value: unknown) {
  const normalized = cleanText(value).toLowerCase();

  if (!normalized) {
    return false;
  }

  return [
    "aucun programme",
    "aucun cv",
    "aucun element exploitable",
    "aucun élément exploitable",
    "non pertinent",
    "diagnostic",
    "recommandation agent",
    "conseiller",
  ].some((pattern) => normalized.includes(pattern));
}

function display(value: unknown, fallback = "Non renseigné") {
  const normalized = cleanText(value);

  if (!normalized || isInternalDiagnostic(normalized)) {
    return escapeHtml(fallback);
  }

  return escapeHtml(normalized);
}

function displayMultiline(value: unknown, fallback = "Non renseigné") {
  return display(value, fallback).replaceAll("\n", "<br />");
}

function displayDate(value: unknown) {
  const normalized = cleanText(value);

  if (!normalized) {
    return "Non renseigné";
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(normalized);
  }

  return escapeHtml(date.toLocaleDateString("fr-FR"));
}

function displayDateRange(start: unknown, end: unknown) {
  return `du ${displayDate(start)} au ${displayDate(end)}`;
}

function displayPerson(firstName?: unknown, lastName?: unknown) {
  return display([firstName, lastName].filter(Boolean).join(" "));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function asArray(value: unknown) {
  const parsed = parseJsonMaybe(value);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  const record = asRecord(parsed);
  if (record && Array.isArray(record.modules)) {
    return record.modules;
  }

  return [];
}

function parseModulesFromEditableText(value: unknown): NormalizedModule[] {
  const text = cleanText(value);

  if (!text || isInternalDiagnostic(text)) {
    return [];
  }

  const blocks = text
    .split(/\n\s*\n(?=\s*MODULE\s+\d+\s*:)/i)
    .map((block) => block.trim())
    .filter(Boolean);

  const moduleBlocks =
    blocks.length > 0 &&
    blocks.some((block) => /^MODULE\s+\d+\s*:/im.test(block))
      ? blocks
      : /^MODULE\s+\d+\s*:/im.test(text)
        ? [text]
        : [];

  return moduleBlocks
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim());
      const title =
        lines
          .find((line) => /^MODULE\s+\d+\s*:/i.test(line))
          ?.replace(/^MODULE\s+\d+\s*:\s*/i, "") ?? "";
      const duration =
        lines
          .find((line) => /^Dur(é|e)e?\s*:/i.test(line))
          ?.replace(/^Dur(é|e)e?\s*:\s*/i, "") ?? "";
      const objective =
        lines
          .find((line) => /^Objectif\s*:/i.test(line))
          ?.replace(/^Objectif\s*:\s*/i, "") ?? "";
      const chapters: NormalizedChapter[] = [];

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";

        if (!/^\d+[\).\s-]+/.test(line)) {
          continue;
        }

        const nextLine = lines[index + 1] ?? "";
        chapters.push({
          title: line.replace(/^\d+[\).\s-]+/, "").trim(),
          objective: /^Objectif\s*:/i.test(nextLine)
            ? nextLine.replace(/^Objectif\s*:\s*/i, "").trim()
            : "",
        });
      }

      return { title, duration, objective, chapters };
    })
    .filter(
      (module) =>
        module.title ||
        module.duration ||
        module.objective ||
        module.chapters.length,
    );
}

function normalizeChapters(value: unknown): NormalizedChapter[] {
  const parsed = parseJsonMaybe(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map((chapter) => {
        const record = asRecord(chapter);
        const title = cleanText(record?.title ?? chapter);
        const objective = cleanText(record?.objective);

        return { title, objective };
      })
      .filter((chapter) => chapter.title || chapter.objective);
  }

  if (typeof parsed === "string") {
    return parsed
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\d+[\).\s-]*/, "").trim())
      .filter(Boolean)
      .map((title) => ({ title, objective: "" }));
  }

  return [];
}

function normalizeModules(value: unknown): NormalizedModule[] {
  const parsed = parseJsonMaybe(value);
  const editableTextModules = parseModulesFromEditableText(parsed);

  if (editableTextModules.length > 0) {
    return editableTextModules;
  }

  return asArray(parsed)
    .map((module) => {
      const record = asRecord(module);
      const title = cleanText(record?.title ?? module);
      const duration = cleanText(record?.duration ?? record?.duree);
      const objective = cleanText(record?.objective ?? record?.objectif);
      const chapters = normalizeChapters(record?.chapters ?? record?.chapitres);

      return { title, duration, objective, chapters };
    })
    .filter(
      (module) =>
        !isInternalDiagnostic(module.title) &&
        (module.title ||
          module.duration ||
          module.objective ||
          module.chapters.length),
    );
}

function getNestedValue(source: unknown, key: string) {
  const record = asRecord(source);
  return record ? record[key] : undefined;
}

export function extractNdaProgramContent(
  version: NdaProgramDocumentVersion | null | undefined,
): NdaProgramContent {
  if (!version) {
    return { modules: [], rawText: "", source: "none" };
  }

  const structuredContent = parseJsonMaybe(version.structured_content);
  const content = parseJsonMaybe(version.content);
  const candidates: Array<{ source: string; value: unknown }> = [
    { source: "modules", value: version.modules },
    {
      source: "structured_content.modules",
      value: getNestedValue(structuredContent, "modules"),
    },
    { source: "content.modules", value: getNestedValue(content, "modules") },
    { source: "structured_content", value: structuredContent },
    { source: "content", value: content },
    { source: "programme_content", value: version.programme_content },
    { source: "pedagogical_content", value: version.pedagogical_content },
  ];

  for (const candidate of candidates) {
    const modules = normalizeModules(candidate.value);

    if (modules.length > 0) {
      return {
        modules,
        rawText: typeof candidate.value === "string" ? candidate.value : "",
        source: candidate.source,
      };
    }
  }

  return { modules: [], rawText: "", source: "none" };
}

function buildInfoRow(label: string, value: string) {
  return `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${value}</td>
    </tr>
  `;
}

export function hasNdaProgramDocumentContent(
  version: NdaProgramDocumentVersion | null | undefined,
) {
  if (!version) {
    return false;
  }

  const modules = normalizeModules(version.modules);
  const content = extractNdaProgramContent(version);

  return content.modules.length > 0 || modules.length > 0;
}

function buildModulesHtml(modules: NormalizedModule[]) {
  return modules
    .map((module, index) => {
      const chaptersHtml = module.chapters.length
        ? `
          <p class="subsection-label">Chapitres</p>
          <ul>
            ${module.chapters
              .map((chapter) => `<li>${display(chapter.title)}</li>`)
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
              <td>${displayMultiline(module.objective)}</td>
            </tr>
          </table>
          ${chaptersHtml}
        </div>
      `;
    })
    .join("");
}

export function buildNdaProgramDocumentHtml({
  version,
  organisation,
  variables,
  generatedAt = new Date(),
}: BuildNdaProgramDocumentHtmlArgs) {
  const programmeTitle =
    variables?.intitule_formation || version.title || "Programme de formation";
  const generatedDate = generatedAt.toLocaleDateString("fr-FR");
  const ndaNumber =
    cleanText(organisation?.nda_number) || "en cours d'enregistrement";
  const organisationSiret =
    cleanText(organisation?.siret) || cleanText(variables?.siret);
  const organisationAddress =
    cleanText(organisation?.address) || cleanText(variables?.organisme_adresse);
  const programContent = extractNdaProgramContent(version);
  const modules = programContent.modules;
  const modulesHtml = buildModulesHtml(modules);
  const prerequisFormation =
    cleanText(variables?.prerequis_formation) || DEFAULT_PREREQUIS;
  const footerParts = [
    display(organisation?.name),
    display(organisationAddress),
    `NDA ${escapeHtml(ndaNumber)}`,
    "cet enregistrement ne vaut pas agrément de l'État",
    display(organisation?.email),
    display(organisation?.phone),
    `Document actualisé le ${escapeHtml(generatedDate)}`,
  ];

  const summaryRows = [
    buildInfoRow("Organisme", display(organisation?.name)),
    buildInfoRow("SIRET", display(organisationSiret)),
    buildInfoRow(
      "Formateur",
      displayPerson(variables?.formateur_prenom, variables?.formateur_nom),
    ),
    buildInfoRow("Durée", display(variables?.duree_formation)),
    buildInfoRow("Modalité", display(variables?.modalite)),
    buildInfoRow("Lieu", display(variables?.lieu_formation)),
    buildInfoRow(
      "Dates prévues",
      escapeHtml(
        displayDateRange(
          variables?.date_formation_prevue,
          variables?.date_fin_formation,
        ),
      ),
    ),
    buildInfoRow("Tarif TTC", display(variables?.tarif_formation)),
    buildInfoRow(
      "Stagiaire",
      displayPerson(variables?.stagiaire_prenom, variables?.stagiaire_nom),
    ),
  ].join("");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>Programme de formation - ${display(programmeTitle)}</title>
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
        margin-bottom: 4pt;
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
      .chapter-objective {
        color: #5f5b55;
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
        <h1>Programme de formation</h1>
        <p class="programme-title">${display(programmeTitle)}</p>
        <p class="generated">Document actualisé le ${escapeHtml(generatedDate)}</p>
      </div>

      <h2>Récapitulatif</h2>
      <table class="summary">
        ${summaryRows}
      </table>

      <h2>Public visé</h2>
      <p>${displayMultiline(version.target_audience)}</p>

      <h2>Prérequis</h2>

      <p>${displayMultiline(prerequisFormation, DEFAULT_PREREQUIS)}</p>

      <h2>Objectif global</h2>
      <p>${displayMultiline(version.overall_objective)}</p>

      <h2>Modalités pédagogiques</h2>
      <p>Alternance de théorie et de pratique.</p>

      <h2>Moyens pédagogiques / techniques</h2>

      <p>${escapeHtml(DEFAULT_PEDAGOGICAL_MEANS)}</p>

      <h2>Modalités d'évaluation</h2>

      <p>${escapeHtml(DEFAULT_EVALUATION)}</p>

      <h2>Modalités de suivi</h2>

      <p>${escapeHtml(DEFAULT_FOLLOW_UP)}</p>

      <h2>Accessibilité handicap</h2>
      <p>Cette formation est accessible aux personnes en situation de handicap. En cas de besoin particulier, le bénéficiaire est invité à contacter l'organisme de formation afin d'analyser sa situation et de mettre en place, si nécessaire, les adaptations permettant le bon déroulement de la formation.</p>

      <h2>Déroulé pédagogique détaillé</h2>
      ${modulesHtml}

      <div class="footer">
        ${footerParts.join(" — ")}
      </div>
    </div>
  </body>
</html>`;
}
