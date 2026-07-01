export type IcpfIndicatorStatus = "non_evalue" | "conforme" | "non_conforme";

export type IcpfIndicatorConfig = {
  id: string;
  criterion: string;
  title: string;
  requirement: string;
  items: string[];
};

export const ICPF_INDICATORS: IcpfIndicatorConfig[] = [
  {
    id: "i1",
    criterion: "Critere 1",
    title: "Information du public sur les prestations",
    requirement:
      "Verifier que les informations relatives aux prestations sont accessibles, detaillees et verifiables.",
    items: [
      "les prerequis",
      "les objectifs",
      "la duree",
      "les tarifs",
      "les delais d'acces",
      "les methodes mobilisees",
      "les modalites d'evaluation",
      "les modalites d'accessibilite aux personnes en situation de handicap",
    ],
  },
  {
    id: "i2",
    criterion: "Critere 1",
    title: "Indicateurs de resultats adaptes",
    requirement:
      "Verifier que les indicateurs de resultats sont diffuses lorsqu'ils sont applicables a la prestation.",
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
    requirement:
      "Verifier que le besoin du beneficiaire est analyse avant ou au debut de la prestation.",
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
    requirement:
      "Verifier que les objectifs sont operationnels, evaluables et adaptes a la prestation.",
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
    requirement:
      "Verifier que les contenus et modalites sont adaptes aux objectifs et aux publics beneficiaires.",
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
    requirement:
      "Verifier que la prestation est adaptee aux beneficiaires et que les adaptations sont tracees lorsque necessaire.",
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
    requirement:
      "Verifier que les acquis sont evalues selon des modalites coherentes avec les objectifs.",
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
    requirement:
      "Verifier que l'organisme maitrise les prestations confiees et les competences mobilisees.",
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
    requirement:
      "Verifier que les reclamations, appreciations et difficultes sont recueillies, analysees et traitees.",
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
