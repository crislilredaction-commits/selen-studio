export type IcpfIndicatorStatus = "" | "non_evalue" | "conforme" | "non_conforme";

export type IcpfIndicatorConfig = {
  id: string;
  criterion: string;
  title: string;
  officialLabel: string;
  requirement: string;
  expected: string;
  items: string[];
};

export const ICPF_INDICATORS: IcpfIndicatorConfig[] = [
  {
    id: "i1",
    criterion: "Critere 1",
    title: "Information du public sur les prestations",
    officialLabel:
      "Le prestataire diffuse une information accessible au public, detaillee et verifiable sur les prestations proposees.",
    requirement:
      "Verifier que les informations relatives aux prestations sont accessibles, detaillees et verifiables.",
    expected:
      "L'information doit etre accessible, actualisee et permettre d'identifier clairement la prestation, ses conditions d'acces, ses modalites, son evaluation et les contacts utiles.",
    items: [
      "les prerequis",
      "les objectifs",
      "la duree",
      "les modalites d'acces",
      "les delais d'acces",
      "les tarifs",
      "les contacts",
      "les methodes mobilisees",
      "les modalites d'evaluation",
      "l'accessibilite aux personnes en situation de handicap",
    ],
  },
  {
    id: "i2",
    criterion: "Critere 1",
    title: "Indicateurs de resultats adaptes",
    officialLabel:
      "Le prestataire diffuse des indicateurs de resultats adaptes a la nature des prestations mises en oeuvre.",
    requirement:
      "Verifier que les indicateurs de resultats sont diffuses lorsqu'ils sont applicables a la prestation.",
    expected:
      "Les resultats doivent etre pertinents, accessibles au public et relies a la nature des prestations concernees.",
    items: [
      "les resultats obtenus",
      "les taux d'obtention",
      "les taux de satisfaction",
      "les suites de parcours ou debouches lorsque disponibles",
      "la source ou la periode des resultats",
    ],
  },
  {
    id: "i4",
    criterion: "Critere 2",
    title: "Analyse du besoin du beneficiaire",
    officialLabel:
      "Le prestataire analyse le besoin du beneficiaire en lien avec l'entreprise ou le financeur concerne.",
    requirement:
      "Verifier que le besoin du beneficiaire est analyse avant ou au debut de la prestation.",
    expected:
      "L'analyse du besoin doit etre formalisee ou tracable et permettre d'adapter la prestation au beneficiaire.",
    items: [
      "le recueil du besoin",
      "les attentes du beneficiaire",
      "le positionnement ou diagnostic initial",
      "l'adaptation eventuelle du parcours",
      "la conservation d'une trace de l'analyse",
    ],
  },
  {
    id: "i5",
    criterion: "Critere 2",
    title: "Objectifs operationnels et evaluables",
    officialLabel:
      "Le prestataire definit les objectifs operationnels et evaluables de la prestation.",
    requirement:
      "Verifier que les objectifs sont operationnels, evaluables et adaptes a la prestation.",
    expected:
      "Les objectifs doivent etre explicites, operationnels, evaluables et coherents avec le besoin identifie.",
    items: [
      "les objectifs operationnels",
      "les competences visees",
      "les modalites d'evaluation des acquis",
      "la coherence avec le public vise",
      "la coherence avec la duree et les moyens mobilises",
    ],
  },
  {
    id: "i6",
    criterion: "Critere 2",
    title: "Contenus et modalites de mise en oeuvre",
    officialLabel:
      "Le prestataire etablit les contenus et les modalites de mise en oeuvre de la prestation, adaptes aux objectifs definis et aux publics beneficiaires.",
    requirement:
      "Verifier que les contenus et modalites sont adaptes aux objectifs et aux publics beneficiaires.",
    expected:
      "Les contenus, moyens, durees et modalites doivent etre coherents avec les objectifs et le public vise.",
    items: [
      "le programme ou deroule pedagogique",
      "les contenus de la prestation",
      "les moyens pedagogiques",
      "les modalites d'accompagnement",
      "l'adaptation aux publics beneficiaires",
    ],
  },
  {
    id: "i10",
    criterion: "Critere 3",
    title: "Adaptation de la prestation aux beneficiaires",
    officialLabel:
      "Le prestataire adapte la prestation, son accompagnement et son suivi aux publics beneficiaires.",
    requirement:
      "Verifier que la prestation est adaptee aux beneficiaires et que les adaptations sont tracees lorsque necessaire.",
    expected:
      "Les modalites d'accueil, d'accompagnement, de suivi et d'evaluation doivent etre adaptees ou adaptables aux situations des beneficiaires.",
    items: [
      "les modalites d'accueil",
      "l'adaptation du parcours",
      "les besoins specifiques identifies",
      "les amenagements proposes",
      "le suivi des adaptations",
    ],
  },
  {
    id: "i11",
    criterion: "Critere 3",
    title: "Evaluation des acquis",
    officialLabel:
      "Le prestataire evalue l'atteinte par les publics beneficiaires des objectifs de la prestation.",
    requirement:
      "Verifier que les acquis sont evalues selon des modalites coherentes avec les objectifs.",
    expected:
      "Les evaluations doivent etre prevues, realisees et tracees selon des modalites coherentes avec les objectifs de la prestation.",
    items: [
      "les evaluations realisees",
      "les criteres ou grilles d'evaluation",
      "les resultats des evaluations",
      "la tracabilite des acquis",
      "les actions prevues en cas d'ecart",
    ],
  },
  {
    id: "i26",
    criterion: "Critere 6",
    title: "Sous-traitance et maitrise des intervenants",
    officialLabel:
      "Le prestataire s'assure que les intervenants et sous-traitants respectent les exigences applicables.",
    requirement:
      "Verifier que l'organisme maitrise les prestations confiees et les competences mobilisees.",
    expected:
      "Les intervenants, partenaires ou sous-traitants doivent etre identifies, selectionnes et suivis selon des modalites tracables.",
    items: [
      "l'identification des intervenants",
      "les competences des intervenants",
      "les contrats ou conventions applicables",
      "les consignes transmises",
      "le suivi de la prestation realisee",
    ],
  },
  {
    id: "i30",
    criterion: "Critere 7",
    title: "Traitement des reclamations et amelioration continue",
    officialLabel:
      "Le prestataire recueille les appreciations, traite les reclamations et met en oeuvre des mesures d'amelioration.",
    requirement:
      "Verifier que les reclamations, appreciations et difficultes sont recueillies, analysees et traitees.",
    expected:
      "Les appreciations, reclamations et aleas doivent etre recueillis, analyses, traites et alimenter l'amelioration continue.",
    items: [
      "le recueil des appreciations",
      "le recueil des reclamations",
      "l'analyse des difficultes",
      "les actions correctives ou d'amelioration",
      "la tracabilite du traitement",
    ],
  },
];

export function getIndicatorById(id: string) {
  return ICPF_INDICATORS.find((indicator) => indicator.id === id) ?? ICPF_INDICATORS[0];
}
