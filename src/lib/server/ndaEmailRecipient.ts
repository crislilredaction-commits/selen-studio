type NdaEmailVariables = {
  client_representant_prenom?: string | null;
  client_representant_nom?: string | null;
  stagiaire_prenom?: string | null;
  stagiaire_nom?: string | null;
};

type NdaEmailOrganisation = {
  name?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() ?? "";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/(^|\s|-)\p{L}/gu, (letter) => letter.toUpperCase());
}

export function buildNdaEmailGreetingName(args: {
  organisation?: NdaEmailOrganisation | null;
  variables?: NdaEmailVariables | null;
}) {
  const firstName =
    clean(args.variables?.client_representant_prenom) ||
    clean(args.variables?.stagiaire_prenom);
  const lastName =
    clean(args.variables?.client_representant_nom) ||
    clean(args.variables?.stagiaire_nom);

  if (firstName) {
    return titleCase(firstName);
  }

  if (lastName) {
    return `Monsieur ${titleCase(lastName)}`;
  }

  return clean(args.organisation?.name);
}
