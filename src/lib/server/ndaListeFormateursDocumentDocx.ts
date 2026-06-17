import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  NdaDocumentContext,
  NdaDocumentContextVariables,
} from "@/lib/server/ndaDocumentContext";

export const NDA_LISTE_FORMATEURS_TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "templates",
  "nda",
  "liste-formateurs-dreets.docx",
);

export const NDA_LISTE_FORMATEURS_GENERATED_MODEL =
  "liste_formateurs_dreets_v1";

type ListeFormateursInterne = {
  nom_prenom?: string | null;
  date_embauche?: string | null;
  statut?: string | null;
  titres_experience?: string | null;
};

type ListeFormateursSoustraitant = {
  nom_prenom?: string | null;
  organisme_nom?: string | null;
  adresse?: string | null;
  titres_experience?: string | null;
};

type OptionalDocxDependencies = {
  PizZip: new (content: Buffer) => {
    files: Record<string, { asText?: () => string }>;
    generate: (options: { type: "nodebuffer" }) => Buffer;
  };
  Docxtemplater: new (
    zip: unknown,
    options: {
      paragraphLoop: boolean;
      linebreaks: boolean;
      delimiters?: {
        start: string;
        end: string;
      };
      nullGetter: () => string;
    },
  ) => {
    render: (data: Record<string, string>) => void;
    getZip: () => {
      files: Record<string, { asText?: () => string }>;
      generate: (options: { type: "nodebuffer" }) => Buffer;
    };
  };
};

function loadOptionalDocxDependencies(): OptionalDocxDependencies | null {
  try {
    const requireFn = eval("require") as NodeRequire;
    return {
      PizZip: requireFn("pizzip"),
      Docxtemplater: requireFn("docxtemplater"),
    };
  } catch {
    return null;
  }
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function fullName(first?: string | null, last?: string | null) {
  return [first, last].map(text).filter(Boolean).join(" ");
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function rowHasContent(row: Record<string, unknown>) {
  return Object.values(row).some((value) => text(value).length > 0);
}

export function hasNdaListeFormateursContent(
  variables: NdaDocumentContextVariables | null,
) {
  const internes = normalizeArray<ListeFormateursInterne>(
    variables?.liste_formateurs_internes,
  );
  const soustraitants = normalizeArray<ListeFormateursSoustraitant>(
    variables?.liste_formateurs_soustraitants,
  );

  return (
    internes.some((row) => rowHasContent(row)) ||
    soustraitants.some((row) => rowHasContent(row)) ||
    text(variables?.liste_formateurs_dirigeant_resume).length > 0
  );
}

export function getNdaListeFormateursGenerationReadiness(
  context: NdaDocumentContext,
) {
  if (!existsSync(NDA_LISTE_FORMATEURS_TEMPLATE_PATH)) {
    return {
      ok: false as const,
      error: "template_missing",
      templatePath: "src/lib/templates/nda/liste-formateurs-dreets.docx",
    };
  }

  if (!loadOptionalDocxDependencies()) {
    return {
      ok: false as const,
      error: "docx_dependency_missing",
      dependencies: ["docxtemplater", "pizzip"],
    };
  }

  if (!hasNdaListeFormateursContent(context.variables)) {
    return {
      ok: false as const,
      error: "missing_liste_formateurs_content",
    };
  }

  return { ok: true as const };
}

function buildTemplateData(context: NdaDocumentContext) {
  const variables = context.variables;
  const organisation = context.organisation;
  const internes = normalizeArray<ListeFormateursInterne>(
    variables?.liste_formateurs_internes,
  ).slice(0, 5);
  const soustraitants = normalizeArray<ListeFormateursSoustraitant>(
    variables?.liste_formateurs_soustraitants,
  ).slice(0, 5);

  const data: Record<string, string> = {
    organisme_nom: text(organisation?.name),
    organisme_adresse: text(
      variables?.organisme_adresse || organisation?.address,
    ),
    dirigeant_titres_experience: text(
      variables?.liste_formateurs_dirigeant_resume,
    ),
    fait_a: text(
      variables?.liste_formateurs_fait_a ||
        variables?.lieu_signature_convention,
    ),
    date_signature_liste_formateurs: text(
      variables?.liste_formateurs_date_signature ||
        variables?.date_signature_convention,
    ),
    nom_signataire: text(
      variables?.liste_formateurs_nom_signataire ||
        fullName(variables?.representant_prenom, variables?.representant_nom),
    ),
    qualite_signataire: text(
      variables?.liste_formateurs_qualite_signataire || "Dirigeant",
    ),
  };

  for (let index = 0; index < 5; index += 1) {
    const position = index + 1;
    const interne = internes[index] ?? {};
    data[`interne_${position}_nom_prenom`] = text(interne.nom_prenom);
    data[`interne_${position}_date_embauche`] = text(interne.date_embauche);
    data[`interne_${position}_statut`] = text(interne.statut);
    data[`interne_${position}_titres_experience`] = text(
      interne.titres_experience,
    );

    const soustraitant = soustraitants[index] ?? {};
    data[`soustraitant_${position}_nom_prenom`] = text(soustraitant.nom_prenom);
    data[`soustraitant_${position}_organisme_nom`] = text(
      soustraitant.organisme_nom,
    );
    data[`soustraitant_${position}_adresse`] = text(soustraitant.adresse);
    data[`soustraitant_${position}_titres_experience`] = text(
      soustraitant.titres_experience,
    );
  }

  return data;
}

function assertNoVisiblePlaceholders(zip: {
  files: Record<string, { asText?: () => string }>;
}) {
  const xmlWithPlaceholders = Object.entries(zip.files).find(
    ([filename, file]) => {
      if (!filename.endsWith(".xml") || typeof file.asText !== "function") {
        return false;
      }

      const content = file.asText();
      return content.includes("{{") || content.includes("}}");
    },
  );

  if (xmlWithPlaceholders) {
    throw new Error(
      `Le document généré contient encore des placeholders visibles dans ${xmlWithPlaceholders[0]}.`,
    );
  }
}

export function buildNdaListeFormateursDocumentDocx(
  context: NdaDocumentContext,
) {
  const dependencies = loadOptionalDocxDependencies();

  if (!existsSync(NDA_LISTE_FORMATEURS_TEMPLATE_PATH)) {
    throw new Error(
      "Modèle Word manquant : src/lib/templates/nda/liste-formateurs-dreets.docx",
    );
  }

  if (!dependencies) {
    throw new Error(
      "Dépendances DOCX manquantes : installer docxtemplater et pizzip.",
    );
  }

  const template = readFileSync(NDA_LISTE_FORMATEURS_TEMPLATE_PATH);
  const zip = new dependencies.PizZip(template);
  const doc = new dependencies.Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: {
      start: "{{",
      end: "}}",
    },
    nullGetter: () => "",
  });

  doc.render(buildTemplateData(context));

  const renderedZip = doc.getZip();
  assertNoVisiblePlaceholders(renderedZip);

  return renderedZip.generate({ type: "nodebuffer" });
}
