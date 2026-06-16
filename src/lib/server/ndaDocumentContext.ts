import { createClient } from "@/lib/supabase/server";

export type NdaDocumentContextDossier = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  organisation_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type NdaDocumentContextOrganisation = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  nda_number: string | null;
  address: string | null;
};

export type NdaDocumentContextVariables = {
  representant_prenom: string | null;
  representant_nom: string | null;
  formateur_nom: string | null;
  formateur_prenom: string | null;
  formateur_email: string | null;
  intitule_formation: string | null;
  duree_formation: string | null;
  tarif_formation: string | number | null;
  modalite: string | null;
  nb_formateurs: number | string | null;
  ville: string | null;
  code_postal: string | null;
  region: string | null;
  siret: string | null;
  stagiaire_prenom: string | null;
  stagiaire_nom: string | null;
  stagiaire_adresse: string | null;
  stagiaire_email: string | null;
  stagiaire_telephone: string | null;
  stagiaire_fonction: string | null;
  client_nom: string | null;
  client_adresse: string | null;
  client_representant_prenom: string | null;
  client_representant_nom: string | null;
  client_siret: string | null;
  date_formation_prevue: string | null;
  lieu_formation: string | null;
  lieu_signature_convention: string | null;
  date_signature_convention: string | null;
};

export type NdaDocumentContextProgramVersion = {
  id: string;
  version_type: string | null;
  title: string | null;
  target_audience: string | null;
  overall_objective: string | null;
  recommended_positioning: string | null;
  justification: string | null;
  agent_comment: string | null;
  vigilance_points: unknown;
  modules: unknown;
  client_decision: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type NdaDocumentContextDocument = {
  id: string;
  name: string | null;
  document_type: string | null;
  document_role: string | null;
  review_status: string | null;
  source: string | null;
  storage_path: string | null;
  is_visible_to_client: boolean | null;
  requires_client_action: boolean | null;
  created_at: string | null;
};

export type NdaDocumentContextFlags = {
  hasValidatedProgram: boolean;
  hasStep2Info: boolean;
  hasRequiredGenerationContext: boolean;
  missingRequiredFields: string[];
};

export type NdaDocumentContext = {
  dossier: NdaDocumentContextDossier;
  organisation: NdaDocumentContextOrganisation | null;
  variables: NdaDocumentContextVariables | null;
  latestProgramVersion: NdaDocumentContextProgramVersion | null;
  documents: NdaDocumentContextDocument[];
  flags: NdaDocumentContextFlags;
};

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function hasAnyValue(...values: unknown[]) {
  return values.some(hasValue);
}

function getMissingRequiredFields(args: {
  organisation: NdaDocumentContextOrganisation | null;
  variables: NdaDocumentContextVariables | null;
  latestProgramVersion: NdaDocumentContextProgramVersion | null;
}) {
  const { organisation, variables, latestProgramVersion } = args;
  const missing: string[] = [];

  if (!hasAnyValue(organisation?.name, variables?.siret, organisation?.siret)) {
    missing.push("organisation.name ou siret");
  }

  if (!hasValue(variables?.client_nom)) {
    missing.push("client_nom");
  }

  if (!hasValue(variables?.client_adresse)) {
    missing.push("client_adresse");
  }

  if (!hasValue(variables?.client_representant_prenom)) {
    missing.push("client_representant_prenom");
  }

  if (!hasValue(variables?.client_representant_nom)) {
    missing.push("client_representant_nom");
  }

  if (!hasValue(variables?.representant_prenom)) {
    missing.push("representant_prenom");
  }

  if (!hasValue(variables?.representant_nom)) {
    missing.push("representant_nom");
  }

  if (!hasValue(variables?.intitule_formation)) {
    missing.push("intitule_formation");
  }

  if (!hasValue(variables?.duree_formation)) {
    missing.push("duree_formation");
  }

  if (!hasValue(variables?.modalite)) {
    missing.push("modalite");
  }

  if (!hasAnyValue(variables?.formateur_nom, variables?.formateur_prenom)) {
    missing.push("formateur_nom ou formateur_prenom");
  }

  if (!hasAnyValue(variables?.stagiaire_nom, variables?.stagiaire_prenom)) {
    missing.push("stagiaire_nom ou stagiaire_prenom");
  }

  if (!hasValue(variables?.stagiaire_fonction)) {
    missing.push("stagiaire_fonction");
  }

  if (!hasValue(variables?.client_siret)) {
    missing.push("client_siret");
  }

  if (!hasValue(variables?.date_formation_prevue)) {
    missing.push("date_formation_prevue");
  }

  if (!hasValue(variables?.lieu_formation)) {
    missing.push("lieu_formation");
  }

  if (!hasValue(variables?.lieu_signature_convention)) {
    missing.push("lieu_signature_convention");
  }

  if (!hasValue(variables?.date_signature_convention)) {
    missing.push("date_signature_convention");
  }

  if (!latestProgramVersion) {
    missing.push("latestProgramVersion");
  }

  return missing;
}

function hasStep2Info(variables: NdaDocumentContextVariables | null) {
  return hasAnyValue(
    variables?.stagiaire_prenom,
    variables?.stagiaire_nom,
    variables?.stagiaire_adresse,
    variables?.stagiaire_email,
    variables?.stagiaire_telephone,
    variables?.stagiaire_fonction,
    variables?.client_nom,
    variables?.client_adresse,
    variables?.client_representant_prenom,
    variables?.client_representant_nom,
    variables?.client_siret,
    variables?.date_formation_prevue,
    variables?.lieu_formation,
    variables?.lieu_signature_convention,
    variables?.date_signature_convention,
  );
}

async function getLatestProgramVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dossierId: string,
) {
  const { data: validatedProgram, error: validatedProgramError } =
    await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossierId)
      .eq("version_type", "client_sent")
      .eq("client_decision", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (validatedProgramError) {
    throw new Error(validatedProgramError.message);
  }

  if (validatedProgram) {
    return validatedProgram as NdaDocumentContextProgramVersion;
  }

  const { data: agentDraft, error: agentDraftError } = await supabase
    .from("dossier_program_versions")
    .select("*")
    .eq("dossier_id", dossierId)
    .eq("version_type", "agent_draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (agentDraftError) {
    throw new Error(agentDraftError.message);
  }

  return (agentDraft ?? null) as NdaDocumentContextProgramVersion | null;
}

export async function getNdaDocumentContext(
  dossierId: string,
): Promise<NdaDocumentContext> {
  const supabase = await createClient();

  const { data: dossierData, error: dossierError } = await supabase
    .from("dossiers")
    .select(
      `
      id,
      title,
      type,
      status,
      organisation_id,
      created_at,
      updated_at,
      organisations:organisation_id (
        id,
        name,
        email,
        phone,
        siret,
        nda_number,
        address
      )
    `,
    )
    .eq("id", dossierId)
    .maybeSingle();

  if (dossierError) {
    throw new Error(dossierError.message);
  }

  if (!dossierData) {
    throw new Error("Dossier introuvable.");
  }

  if (dossierData.type !== "nda") {
    throw new Error("Ce helper est reserve aux dossiers NDA.");
  }

  const organisationRaw = Array.isArray(dossierData.organisations)
    ? dossierData.organisations[0]
    : dossierData.organisations;

  const dossier: NdaDocumentContextDossier = {
    id: dossierData.id,
    title: dossierData.title ?? null,
    type: dossierData.type ?? null,
    status: dossierData.status ?? null,
    organisation_id: dossierData.organisation_id ?? null,
    created_at: dossierData.created_at ?? null,
    updated_at: dossierData.updated_at ?? null,
  };

  const organisation = (organisationRaw ??
    null) as NdaDocumentContextOrganisation | null;

  const [
    { data: variablesData, error: variablesError },
    latestProgramVersion,
    { data: documentsData, error: documentsError },
  ] = await Promise.all([
    supabase
      .from("nda_variables")
      .select(
        "representant_prenom, representant_nom, formateur_nom, formateur_prenom, formateur_email, intitule_formation, duree_formation, tarif_formation, modalite, nb_formateurs, ville, code_postal, region, siret, stagiaire_prenom, stagiaire_nom, stagiaire_adresse, stagiaire_email, stagiaire_telephone, stagiaire_fonction, client_nom, client_adresse, client_representant_prenom, client_representant_nom, client_siret, date_formation_prevue, lieu_formation, lieu_signature_convention, date_signature_convention",
      )
      .eq("dossier_id", dossierId)
      .maybeSingle(),
    getLatestProgramVersion(supabase, dossierId),
    supabase
      .from("documents")
      .select(
        "id, name, document_type, document_role, review_status, source, storage_path, is_visible_to_client, requires_client_action, created_at",
      )
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false }),
  ]);

  if (variablesError) {
    throw new Error(variablesError.message);
  }

  if (documentsError) {
    throw new Error(documentsError.message);
  }

  const variables = (variablesData ??
    null) as NdaDocumentContextVariables | null;
  const documents = (documentsData ?? []) as NdaDocumentContextDocument[];
  const hasValidatedProgram =
    latestProgramVersion?.version_type === "client_sent" &&
    latestProgramVersion.client_decision === "validated";
  const missingRequiredFields = getMissingRequiredFields({
    organisation,
    variables,
    latestProgramVersion,
  });

  return {
    dossier,
    organisation,
    variables,
    latestProgramVersion,
    documents,
    flags: {
      hasValidatedProgram,
      hasStep2Info: hasStep2Info(variables),
      hasRequiredGenerationContext: missingRequiredFields.length === 0,
      missingRequiredFields,
    },
  };
}
