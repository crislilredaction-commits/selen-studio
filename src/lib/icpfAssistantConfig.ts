export type IcpfIndicatorStatus =
  | ""
  | "non_evalue"
  | "non_concerne"
  | "conforme"
  | "non_conforme";

export type IcpfApplicability =
  | "toutes_prestations"
  | "action_formation"
  | "bilan_competences"
  | "vae"
  | "apprentissage"
  | "cfa"
  | "certification_professionnelle"
  | "alternance"
  | "afest"
  | "sous_traitance"
  | "nouvel_entrant";

export type IcpfIndicatorConfig = {
  id: string;
  criterion: string;
  indicatorNumber: number;
  title: string;
  officialLabel: string;
  requirement: string;
  expected: string;
  possibleEvidence: string[];
  items: string[];
  applicability: IcpfApplicability[];
  todo?: string;
};

const ALL: IcpfApplicability[] = ["toutes_prestations"];

export const ICPF_INDICATORS: IcpfIndicatorConfig[] = [
  {
    id: "i1",
    criterion: "Critere 1",
    indicatorNumber: 1,
    title: "Informations diffusees au public",
    officialLabel:
      "Le prestataire diffuse une information accessible au public, detaillee et verifiable sur les prestations proposees.",
    requirement:
      "Verifier que les informations publiques permettent d'identifier clairement la prestation et ses conditions.",
    expected:
      "L'information est accessible, actualisee, detaillee, verifiable et couvre les elements utiles avant l'entree en prestation.",
    possibleEvidence: [
      "Page web ou plaquette programme",
      "Catalogue de formation",
      "Livret d'accueil",
      "Conditions generales ou devis",
    ],
    items: [
      "prerequis",
      "objectifs",
      "duree",
      "modalites d'acces",
      "delais d'acces",
      "tarifs",
      "contacts",
      "methodes mobilisees",
      "modalites d'evaluation",
      "accessibilite aux personnes en situation de handicap",
    ],
    applicability: ALL,
  },
  {
    id: "i2",
    criterion: "Critere 1",
    indicatorNumber: 2,
    title: "Indicateurs de resultats",
    officialLabel:
      "Le prestataire diffuse des indicateurs de resultats adaptes a la nature des prestations mises en oeuvre et des publics accueillis.",
    requirement:
      "Verifier que les resultats communiques sont adaptes, comprehensibles et contextualises.",
    expected:
      "Les indicateurs sont publics, coherents avec la prestation, periodises et exploitables par le public vise.",
    possibleEvidence: [
      "Page resultats du site",
      "Bilan qualite",
      "Questionnaires de satisfaction consolides",
      "Tableau de bord de resultats",
    ],
    items: [
      "nature des indicateurs",
      "periode de reference",
      "volume ou effectif concerne",
      "resultats de satisfaction",
      "resultats d'atteinte ou de reussite",
      "actualisation des donnees",
    ],
    applicability: ALL,
  },
  {
    id: "i3",
    criterion: "Critere 1",
    indicatorNumber: 3,
    title: "Information certification professionnelle",
    officialLabel:
      "Lorsque la prestation conduit a une certification professionnelle, le prestataire informe sur les taux d'obtention, les possibilites de validation de blocs de competences, les equivalences, passerelles, suites de parcours et debouches.",
    requirement:
      "Verifier l'information specifique aux prestations certifiantes.",
    expected:
      "Les informations de certification sont disponibles, exactes, actualisees et reliees a la certification visee.",
    possibleEvidence: [
      "Page certification RNCP ou RS",
      "Programme certifiant",
      "Fiche France competences",
      "Documents d'information candidat",
    ],
    items: [
      "taux d'obtention de la certification",
      "blocs de competences",
      "equivalences",
      "passerelles",
      "suites de parcours",
      "debouches",
      "lien avec la certification visee",
    ],
    applicability: ["certification_professionnelle"],
  },
  {
    id: "i4",
    criterion: "Critere 2",
    indicatorNumber: 4,
    title: "Analyse du besoin",
    officialLabel:
      "Le prestataire analyse le besoin du beneficiaire en lien avec l'entreprise ou le financeur concerne.",
    requirement:
      "Verifier que le besoin est identifie avant ou au debut de la prestation et qu'une trace existe.",
    expected:
      "L'analyse du besoin permet d'adapter la prestation et reste tracable dans le dossier.",
    possibleEvidence: [
      "Questionnaire de recueil du besoin",
      "Compte rendu d'entretien",
      "Diagnostic initial",
      "Devis ou convention personnalise",
    ],
    items: [
      "besoin du beneficiaire",
      "attentes ou objectifs personnels",
      "contexte entreprise ou financeur",
      "contraintes identifiees",
      "adaptation du parcours",
      "trace conservee",
    ],
    applicability: ALL,
  },
  {
    id: "i5",
    criterion: "Critere 2",
    indicatorNumber: 5,
    title: "Objectifs operationnels et evaluables",
    officialLabel:
      "Le prestataire definit les objectifs operationnels et evaluables de la prestation.",
    requirement:
      "Verifier que les objectifs annonces peuvent etre observes ou evalues.",
    expected:
      "Les objectifs sont explicites, operationnels, evaluables et coherents avec le besoin analyse.",
    possibleEvidence: [
      "Programme",
      "Convention",
      "Deroule pedagogique",
      "Grille d'evaluation",
    ],
    items: [
      "objectifs operationnels",
      "competences visees",
      "criteres d'evaluation",
      "coherence avec le besoin",
      "coherence avec la prestation",
    ],
    applicability: ALL,
  },
  {
    id: "i6",
    criterion: "Critere 2",
    indicatorNumber: 6,
    title: "Contenus et modalites",
    officialLabel:
      "Le prestataire etablit les contenus et les modalites de mise en oeuvre de la prestation, adaptes aux objectifs definis et aux publics beneficiaires.",
    requirement:
      "Verifier l'adequation entre objectifs, contenus, modalites et public.",
    expected:
      "Les contenus, moyens, rythmes, durees et modalites sont coherents avec les objectifs et publics vises.",
    possibleEvidence: [
      "Programme detaille",
      "Deroule pedagogique",
      "Supports ou plateforme",
      "Modalites d'accompagnement",
    ],
    items: [
      "contenus de la prestation",
      "modalites pedagogiques",
      "duree et rythme",
      "moyens mobilises",
      "adaptation au public",
      "coherence avec les objectifs",
    ],
    applicability: ALL,
  },
  {
    id: "i7",
    criterion: "Critere 2",
    indicatorNumber: 7,
    title: "Adequation aux exigences de certification",
    officialLabel:
      "Lorsque la prestation conduit a une certification professionnelle, le prestataire s'assure de l'adequation du contenu de la prestation aux exigences de la certification visee.",
    requirement:
      "Verifier que la formation prepare aux competences et modalites de la certification.",
    expected:
      "Le contenu couvre les exigences de la certification et les modalites d'evaluation attendues.",
    possibleEvidence: [
      "Referentiel de certification",
      "Matrice programme / referentiel",
      "Deroule pedagogique certifiant",
      "Modalites d'examen",
    ],
    items: [
      "referentiel pris en compte",
      "competences couvertes",
      "modalites d'evaluation de certification",
      "blocs de competences si applicables",
      "ecarts identifies et traites",
    ],
    applicability: ["certification_professionnelle"],
  },
  {
    id: "i8",
    criterion: "Critere 2",
    indicatorNumber: 8,
    title: "Positionnement et prerequis",
    officialLabel:
      "Le prestataire determine les procedures de positionnement et d'evaluation des acquis a l'entree de la prestation.",
    requirement:
      "Verifier comment l'entree en parcours est securisee.",
    expected:
      "Les prerequis et acquis sont verifies lorsque necessaire et le positionnement oriente l'adaptation du parcours.",
    possibleEvidence: [
      "Test de positionnement",
      "Questionnaire d'entree",
      "Entretien de positionnement",
      "Grille de prerequis",
    ],
    items: [
      "prerequis identifies",
      "verification des prerequis",
      "evaluation des acquis a l'entree",
      "trace du positionnement",
      "adaptation issue du positionnement",
    ],
    applicability: ALL,
  },
  {
    id: "i9",
    criterion: "Critere 3",
    indicatorNumber: 9,
    title: "Conditions de deroulement",
    officialLabel:
      "Le prestataire informe les publics beneficiaires sur les conditions de deroulement de la prestation.",
    requirement:
      "Verifier que les beneficiaires disposent des informations pratiques et pedagogiques necessaires.",
    expected:
      "Les conditions d'accueil, d'accompagnement, de suivi et d'evaluation sont communiquees avant ou au demarrage.",
    possibleEvidence: [
      "Convocation",
      "Livret d'accueil",
      "Reglement interieur",
      "Mail d'entree en formation",
    ],
    items: [
      "lieu ou modalite de realisation",
      "horaires et rythme",
      "contacts utiles",
      "regles de fonctionnement",
      "modalites de suivi",
      "modalites d'evaluation",
    ],
    applicability: ALL,
  },
  {
    id: "i10",
    criterion: "Critere 3",
    indicatorNumber: 10,
    title: "Adaptation de la prestation",
    officialLabel:
      "Le prestataire adapte la prestation, son accompagnement et son suivi aux publics beneficiaires.",
    requirement:
      "Verifier que les adaptations necessaires sont identifiees, mises en oeuvre et tracees.",
    expected:
      "La prestation est ajustee aux situations des beneficiaires et les adaptations restent justifiees.",
    possibleEvidence: [
      "Fiche de suivi",
      "Compte rendu d'entretien",
      "Avenant ou adaptation de parcours",
      "Echanges avec le beneficiaire",
    ],
    items: [
      "besoins specifiques identifies",
      "adaptation du parcours",
      "adaptation des supports ou modalites",
      "suivi de l'adaptation",
      "trace des decisions",
    ],
    applicability: ALL,
  },
  {
    id: "i11",
    criterion: "Critere 3",
    indicatorNumber: 11,
    title: "Evaluation des acquis",
    officialLabel:
      "Le prestataire evalue l'atteinte par les publics beneficiaires des objectifs de la prestation.",
    requirement:
      "Verifier que l'evaluation mesure les objectifs annonces.",
    expected:
      "Les acquis sont evalues selon des modalites coherentes, avec conservation des resultats.",
    possibleEvidence: [
      "Quiz ou test",
      "Mise en situation",
      "Grille d'evaluation",
      "Attestation des acquis",
    ],
    items: [
      "modalites d'evaluation",
      "criteres d'evaluation",
      "realisation effective",
      "resultats ou traces",
      "lien avec les objectifs",
    ],
    applicability: ALL,
  },
  {
    id: "i12",
    criterion: "Critere 3",
    indicatorNumber: 12,
    title: "Engagement et prevention des ruptures",
    officialLabel:
      "Le prestataire decrit et met en oeuvre les mesures pour favoriser l'engagement des beneficiaires et prevenir les ruptures de parcours.",
    requirement:
      "Verifier le suivi des presences, difficultes, abandons et actions de relance.",
    expected:
      "Des mesures de suivi et de prevention existent et sont mobilisees en cas de risque ou de rupture.",
    possibleEvidence: [
      "Feuilles d'emargement",
      "Tableau de suivi",
      "Mails de relance",
      "Procedure abandon ou absence",
    ],
    items: [
      "suivi de l'assiduite",
      "identification des difficultes",
      "relances ou actions de soutien",
      "traitement des abandons",
      "tracabilite des actions",
    ],
    applicability: ALL,
  },
  {
    id: "i13",
    criterion: "Critere 3",
    indicatorNumber: 13,
    title: "Alternance centre / entreprise",
    officialLabel:
      "Pour les formations en alternance, le prestataire assure la coordination et la progressivite des apprentissages entre le centre et l'entreprise.",
    requirement:
      "Verifier l'articulation entre les temps en organisme et en entreprise.",
    expected:
      "Les acteurs disposent d'outils de liaison et les apprentissages sont coordonnes dans le parcours.",
    possibleEvidence: [
      "Livret d'alternance",
      "Planning alterne",
      "Echanges tuteur / organisme",
      "Compte rendu de visite",
    ],
    items: [
      "coordination avec l'entreprise",
      "progressivite des apprentissages",
      "role du tuteur ou maitre d'apprentissage",
      "outils de liaison",
      "suivi des periodes en entreprise",
    ],
    applicability: ["alternance", "apprentissage"],
  },
  {
    id: "i14",
    criterion: "Critere 3",
    indicatorNumber: 14,
    title: "CFA : accompagnement de l'apprenti",
    officialLabel:
      "Pour les CFA, le prestataire met en oeuvre un accompagnement socio-professionnel, educatif et relatif a l'exercice de la citoyennete.",
    requirement:
      "Verifier les actions specifiques d'accompagnement des apprentis.",
    expected:
      "Le CFA informe, accompagne et oriente les apprentis sur les dimensions sociales, professionnelles, educatives et citoyennes.",
    possibleEvidence: [
      "Livret apprenti",
      "Procedure d'accompagnement",
      "Contacts ou permanences",
      "Actions collectives",
    ],
    items: [
      "accompagnement socio-professionnel",
      "accompagnement educatif",
      "citoyennete",
      "orientation vers interlocuteurs utiles",
      "traces d'accompagnement",
    ],
    applicability: ["cfa", "apprentissage"],
  },
  {
    id: "i15",
    criterion: "Critere 3",
    indicatorNumber: 15,
    title: "CFA : droits, devoirs, sante et securite",
    officialLabel:
      "Pour les CFA, le prestataire informe les apprentis de leurs droits et devoirs en tant qu'apprentis et salaries, ainsi que des regles applicables en matiere de sante et de securite en milieu professionnel.",
    requirement:
      "Verifier l'information donnee aux apprentis sur leur statut et les regles applicables.",
    expected:
      "Les apprentis disposent d'une information claire sur droits, devoirs, sante, securite et environnement professionnel.",
    possibleEvidence: [
      "Livret apprenti",
      "Reglement interieur",
      "Support sante securite",
      "Preuve de remise ou presentation",
    ],
    items: [
      "droits de l'apprenti",
      "devoirs de l'apprenti",
      "statut de salarie",
      "sante et securite",
      "preuve d'information",
    ],
    applicability: ["cfa", "apprentissage"],
  },
  {
    id: "i16",
    criterion: "Critere 3",
    indicatorNumber: 16,
    title: "Presentation a la certification",
    officialLabel:
      "Lorsque la prestation conduit a une certification professionnelle, le prestataire respecte les exigences formelles de l'autorite de certification pour presenter les beneficiaires.",
    requirement:
      "Verifier que les conditions de presentation a la certification sont connues et appliquees.",
    expected:
      "Les inscriptions, pieces, delais, convocations et amenagements sont suivis conformement aux exigences du certificateur.",
    possibleEvidence: [
      "Procedure d'inscription certification",
      "Convocation",
      "Dossier candidat",
      "Echanges avec le certificateur",
    ],
    items: [
      "conditions de presentation",
      "delais et pieces",
      "convocations",
      "amenagements eventuels",
      "respect des exigences du certificateur",
    ],
    applicability: ["certification_professionnelle"],
  },
  {
    id: "i17",
    criterion: "Critere 4",
    indicatorNumber: 17,
    title: "Moyens humains, techniques et environnementaux",
    officialLabel:
      "Le prestataire met a disposition ou s'assure de la mise a disposition des moyens humains, techniques et d'un environnement appropries a la prestation.",
    requirement:
      "Verifier que les moyens mobilises sont adaptes aux prestations realisees.",
    expected:
      "Les ressources humaines, techniques, materielles et environnementales permettent la realisation effective de la prestation.",
    possibleEvidence: [
      "Liste des moyens",
      "Contrat de location ou acces plateforme",
      "Photos ou visite des locaux",
      "Inventaire outils et materiels",
    ],
    items: [
      "moyens humains",
      "moyens techniques",
      "locaux ou environnement",
      "accessibilite ou conditions d'accueil",
      "adequation avec la prestation",
    ],
    applicability: ALL,
  },
  {
    id: "i18",
    criterion: "Critere 4",
    indicatorNumber: 18,
    title: "Coordination des intervenants",
    officialLabel:
      "Le prestataire mobilise et coordonne les differents intervenants internes ou externes.",
    requirement:
      "Verifier que les roles et interactions entre intervenants sont organises.",
    expected:
      "Les fonctions, responsabilites et modalites de coordination sont connues, communiquees et tracables.",
    possibleEvidence: [
      "Organigramme fonctionnel",
      "Fiches de mission",
      "Planning intervenants",
      "Comptes rendus de coordination",
    ],
    items: [
      "intervenants identifies",
      "roles definis",
      "coordination interne",
      "coordination externe",
      "traces de communication",
    ],
    applicability: ALL,
  },
  {
    id: "i19",
    criterion: "Critere 4",
    indicatorNumber: 19,
    title: "Ressources pedagogiques",
    officialLabel:
      "Le prestataire met a disposition du beneficiaire des ressources pedagogiques et permet a celui-ci de se les approprier.",
    requirement:
      "Verifier la disponibilite et l'appropriation des supports par les beneficiaires.",
    expected:
      "Les supports sont accessibles, adaptes et accompagnes pour permettre leur utilisation effective.",
    possibleEvidence: [
      "Plateforme LMS",
      "Supports remis",
      "Mail d'acces",
      "Guide d'utilisation",
    ],
    items: [
      "ressources disponibles",
      "modalites d'acces",
      "accompagnement a l'utilisation",
      "adaptation des supports",
      "preuve de mise a disposition",
    ],
    applicability: ALL,
  },
  {
    id: "i20",
    criterion: "Critere 4",
    indicatorNumber: 20,
    title: "CFA : referents et conseil de perfectionnement",
    officialLabel:
      "Pour les CFA, le prestataire dispose d'un personnel dedie a l'appui a la mobilite nationale et internationale, d'un referent handicap et d'un conseil de perfectionnement.",
    requirement:
      "Verifier les fonctions et instances specifiques attendues en CFA.",
    expected:
      "Les referents et le conseil de perfectionnement sont identifies, actifs et documentes.",
    possibleEvidence: [
      "Nomination des referents",
      "Compte rendu du conseil de perfectionnement",
      "Procedure mobilite",
      "Politique handicap CFA",
    ],
    items: [
      "referent mobilite",
      "referent handicap",
      "conseil de perfectionnement",
      "missions definies",
      "traces d'activite",
    ],
    applicability: ["cfa", "apprentissage"],
  },
  {
    id: "i21",
    criterion: "Critere 5",
    indicatorNumber: 21,
    title: "Competences des intervenants",
    officialLabel:
      "Le prestataire determine, mobilise et evalue les competences des differents intervenants internes ou externes, adaptees aux prestations.",
    requirement:
      "Verifier l'adequation entre competences des intervenants et prestations confiees.",
    expected:
      "Les competences attendues sont definies, verifiees, mobilisees et evaluees.",
    possibleEvidence: [
      "CV ou dossier formateur",
      "Grille de selection",
      "Entretien annuel",
      "Evaluation intervenant",
    ],
    items: [
      "competences attendues",
      "competences verifiees",
      "adequation prestation / intervenant",
      "evaluation des intervenants",
      "traces documentees",
    ],
    applicability: ALL,
  },
  {
    id: "i22",
    criterion: "Critere 5",
    indicatorNumber: 22,
    title: "Developpement des competences",
    officialLabel:
      "Le prestataire entretient et developpe les competences de ses salaries, adaptees aux prestations qu'il delivre.",
    requirement:
      "Verifier les actions de maintien et developpement des competences.",
    expected:
      "Les besoins de developpement sont identifies et donnent lieu a des actions ou ressources adaptees.",
    possibleEvidence: [
      "Plan de developpement des competences",
      "Attestations de formation",
      "Veille metier",
      "Entretiens professionnels",
    ],
    items: [
      "besoins de competences",
      "actions realisees",
      "veille ou autoformation",
      "traces de formation",
      "lien avec les prestations",
    ],
    applicability: ALL,
  },
  {
    id: "i23",
    criterion: "Critere 6",
    indicatorNumber: 23,
    title: "Veille legale et reglementaire",
    officialLabel:
      "Le prestataire realise une veille legale et reglementaire sur le champ de la formation professionnelle et en exploite les enseignements.",
    requirement:
      "Verifier que la veille existe, est pertinente et produit des effets.",
    expected:
      "La veille est organisee, actualisee et exploitee dans les pratiques ou documents de l'organisme.",
    possibleEvidence: [
      "Tableau de veille",
      "Abonnements ou sources",
      "Compte rendu d'analyse",
      "Document mis a jour apres veille",
    ],
    items: [
      "sources legales et reglementaires",
      "frequence de veille",
      "analyse des informations",
      "actions issues de la veille",
      "tracabilite",
    ],
    applicability: ALL,
  },
  {
    id: "i24",
    criterion: "Critere 6",
    indicatorNumber: 24,
    title: "Veille metier et competences",
    officialLabel:
      "Le prestataire realise une veille sur les evolutions des competences, des metiers et des emplois dans ses secteurs d'intervention et en exploite les enseignements.",
    requirement:
      "Verifier la veille metier et son exploitation.",
    expected:
      "Les evolutions metier ou sectorielles sont suivies et alimente l'adaptation des prestations.",
    possibleEvidence: [
      "Tableau de veille metier",
      "Sources professionnelles",
      "Participation reseaux ou evenements",
      "Programme mis a jour",
    ],
    items: [
      "sources metier",
      "evolutions des competences",
      "evolutions des emplois",
      "exploitation de la veille",
      "adaptation des prestations",
    ],
    applicability: ALL,
  },
  {
    id: "i25",
    criterion: "Critere 6",
    indicatorNumber: 25,
    title: "Veille pedagogique et technologique",
    officialLabel:
      "Le prestataire realise une veille sur les innovations pedagogiques et technologiques permettant une evolution de ses prestations et en exploite les enseignements.",
    requirement:
      "Verifier que la veille pedagogique ou technologique produit des adaptations utiles.",
    expected:
      "Les innovations pertinentes sont reperees, analysees et, lorsque utile, integrees aux prestations.",
    possibleEvidence: [
      "Tableau de veille pedagogique",
      "Essais d'outils",
      "Support actualise",
      "Compte rendu de formation ou webinaire",
    ],
    items: [
      "sources pedagogiques ou technologiques",
      "innovation identifiee",
      "analyse de pertinence",
      "integration dans les pratiques",
      "trace d'exploitation",
    ],
    applicability: ALL,
  },
  {
    id: "i26",
    criterion: "Critere 6",
    indicatorNumber: 26,
    title: "Handicap : expertises, outils et reseaux",
    officialLabel:
      "Le prestataire mobilise les expertises, outils et reseaux necessaires pour accueillir, accompagner, former ou orienter les publics en situation de handicap.",
    requirement:
      "Verifier que l'organisme sait identifier les besoins de compensation, adapter ou orienter vers les interlocuteurs competents.",
    expected:
      "Les ressources handicap sont identifiees, mobilisables et connues des personnes concernees par l'accueil ou l'accompagnement.",
    possibleEvidence: [
      "Politique handicap",
      "Liste de contacts Agefiph, Fiphfp, MDPH, Cap emploi ou RHF",
      "Procedure d'orientation",
      "Trace d'une adaptation ou sollicitation reseau",
    ],
    items: [
      "referent handicap ou contact identifie",
      "reseau Agefiph, Fiphfp, MDPH, Cap emploi, Ressource handicap formation",
      "procedure d'accueil ou d'orientation",
      "adaptations possibles",
      "contacts partenaires",
      "preuves de mobilisation ou de connaissance du reseau",
    ],
    applicability: ALL,
  },
  {
    id: "i27",
    criterion: "Critere 6",
    indicatorNumber: 27,
    title: "Sous-traitance et portage salarial",
    officialLabel:
      "Lorsque le prestataire fait appel a la sous-traitance ou au portage salarial, il s'assure du respect de la conformite au referentiel par les intervenants concernes.",
    requirement:
      "Verifier que les exigences Qualiopi sont cadrees, transmises et suivies pour les prestations confiees.",
    expected:
      "Les sous-traitants, salaries portes ou intervenants concernes sont selectionnes, informes des exigences et suivis par le prestataire.",
    possibleEvidence: [
      "Contrat de sous-traitance ou portage",
      "Charte qualite ou consignes Qualiopi",
      "Fiche de mission",
      "Evaluation ou suivi du sous-traitant",
    ],
    items: [
      "sous-traitants ou salaries portes identifies",
      "exigences qualite transmises",
      "roles et responsabilites definis",
      "preuves attendues communiquees",
      "suivi de la prestation externalisee",
      "traitement des ecarts",
    ],
    applicability: ["sous_traitance"],
  },
  {
    id: "i28",
    criterion: "Critere 6",
    indicatorNumber: 28,
    title: "Situations de travail et partenaires",
    officialLabel:
      "Lorsque les prestations comprennent des periodes en situation de travail, le prestataire mobilise son reseau de partenaires socio-economiques pour en assurer la mise en oeuvre et le suivi.",
    requirement:
      "Verifier la preparation, le suivi et l'exploitation des periodes en entreprise, stages, AFEST ou mises en pratique.",
    expected:
      "Les partenaires, tuteurs ou structures d'accueil sont identifies, informes des objectifs et associes au suivi.",
    possibleEvidence: [
      "Convention de stage ou AFEST",
      "Livret de suivi terrain",
      "Echanges avec tuteur ou entreprise",
      "Bilan de periode en situation de travail",
    ],
    items: [
      "partenaires ou structures d'accueil identifies",
      "objectifs transmis",
      "roles du tuteur ou referent",
      "suivi pendant la periode",
      "exploitation du retour terrain",
    ],
    applicability: ["action_formation", "alternance", "afest", "apprentissage"],
    todo:
      "Verifier le libelle officiel exact dans le guide de lecture avant usage comme citation.",
  },
  {
    id: "i29",
    criterion: "Critere 6",
    indicatorNumber: 29,
    title: "CFA : insertion et poursuite de parcours",
    officialLabel:
      "Pour les CFA, le prestataire developpe des actions concourant a l'insertion professionnelle ou a la poursuite d'etudes des apprentis.",
    requirement:
      "Verifier les actions d'appui a la suite de parcours des apprentis.",
    expected:
      "Le CFA informe, accompagne et suit les apprentis vers l'emploi, la poursuite d'etudes ou les partenaires utiles.",
    possibleEvidence: [
      "Supports sur les debouches",
      "Actions entreprises ou partenaires",
      "Suivi post-formation",
      "Informations passerelles ou poursuite d'etudes",
    ],
    items: [
      "information sur les debouches",
      "information sur les poursuites d'etudes",
      "actions avec entreprises ou partenaires",
      "accompagnement vers l'emploi",
      "suivi apres parcours",
    ],
    applicability: ["cfa", "apprentissage"],
    todo:
      "Verifier le libelle officiel exact dans le guide de lecture avant usage comme citation.",
  },
  {
    id: "i30",
    criterion: "Critere 7",
    indicatorNumber: 30,
    title: "Appreciations des parties prenantes",
    officialLabel:
      "Le prestataire recueille les appreciations des parties prenantes : beneficiaires, financeurs, equipes pedagogiques et entreprises concernees.",
    requirement:
      "Verifier que les retours des parties prenantes sont sollicites et exploitables.",
    expected:
      "Les appreciations sont recueillies aupres des parties concernees et analysees pour alimenter l'amelioration.",
    possibleEvidence: [
      "Questionnaires de satisfaction",
      "Relances de non-reponse",
      "Analyse des retours",
      "Compte rendu ou bilan qualite",
    ],
    items: [
      "beneficiaires sollicites",
      "financeurs ou donneurs d'ordre sollicites si concernes",
      "intervenants ou equipe pedagogique sollicites",
      "entreprises sollicitees si concernees",
      "analyse des retours",
    ],
    applicability: ALL,
  },
  {
    id: "i31",
    criterion: "Critere 7",
    indicatorNumber: 31,
    title: "Reclamations et aleas",
    officialLabel:
      "Le prestataire met en oeuvre des modalites de traitement des difficultes rencontrees par les parties prenantes, des reclamations exprimees, des aleas survenus en cours de prestation.",
    requirement:
      "Verifier que les difficultes, reclamations et aleas peuvent etre signales, suivis et traites.",
    expected:
      "Un dispositif de recueil et traitement existe, il est connu, trace et mobilise lorsque necessaire.",
    possibleEvidence: [
      "Procedure reclamation",
      "Registre ou tableau de suivi",
      "Mail de traitement",
      "Action corrective issue d'un alea",
    ],
    items: [
      "modalite de depot d'une reclamation",
      "traitement des difficultes",
      "traitement des aleas",
      "suivi des reclamations",
      "information des parties prenantes",
      "actions correctives",
    ],
    applicability: ALL,
  },
  {
    id: "i32",
    criterion: "Critere 7",
    indicatorNumber: 32,
    title: "Amelioration continue",
    officialLabel:
      "Le prestataire met en oeuvre des mesures d'amelioration a partir de l'analyse des appreciations et des reclamations.",
    requirement:
      "Verifier que l'organisme analyse les donnees qualite et decide des ameliorations suivies.",
    expected:
      "Les retours, incidents, reclamations, resultats et veilles alimentent des actions d'amelioration tracees.",
    possibleEvidence: [
      "Plan d'amelioration",
      "Tableau de suivi actions",
      "Bilan qualite",
      "Preuve de mise a jour documentaire",
    ],
    items: [
      "sources d'amelioration identifiees",
      "analyse des donnees",
      "actions decidees",
      "responsable et echeance",
      "suivi de realisation",
      "verification de l'efficacite",
    ],
    applicability: ALL,
  },
];

export function getIndicatorById(id: string) {
  return ICPF_INDICATORS.find((indicator) => indicator.id === id) ?? ICPF_INDICATORS[0];
}
