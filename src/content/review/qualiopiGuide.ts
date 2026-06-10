export type QualiopiGuideSection = {
  title: string;
  content?: string;
  items?: string[];
};

export type QualiopiGuideContent = {
  title: string;
  description: string;
  sections: QualiopiGuideSection[];
};

export const qualiopiGuide: QualiopiGuideContent = {
  title: "Guide express Qualiopi",
  description:
    "Repères simples pour expliquer Qualiopi au client, vérifier les preuves et garder une posture d’audit blanc utile.",
  sections: [
    {
      title: "À quoi sert Qualiopi ?",
      content:
        "Qualiopi est la certification qualité des organismes de formation. Elle permet notamment d’accéder aux financements publics ou mutualisés, mais elle sert aussi à structurer l’organisme : clarifier l’offre, tracer les preuves, suivre les résultats et améliorer les pratiques. Ce n’est pas juste une pile de documents. C’est une façon de montrer que l’activité est pilotée.",
      items: [
        "Donner un cadre commun aux organismes de formation.",
        "Vérifier que les informations, les parcours, les évaluations et les améliorations sont tracés.",
        "Rendre les pratiques plus lisibles pour les bénéficiaires, financeurs et partenaires.",
        "Transformer les preuves en outil de pilotage, pas en décoration de classeur.",
      ],
    },
    {
      title: "Ce que Qualiopi certifie réellement",
      content:
        "Qualiopi est avant tout un audit administratif et qualité. Il certifie la qualité du processus de gestion, d’organisation, de traçabilité et d’amélioration continue de l’organisme. Il ne certifie pas directement la qualité pédagogique intrinsèque d’une formation ni le talent du formateur.",
      items: [
        "Qualiopi ne dit pas : cette formation est géniale.",
        "Qualiopi vérifie plutôt : l’organisme sait-il informer, organiser, tracer, évaluer, écouter, corriger et améliorer ?",
        "L’agent doit donc chercher des preuves de fonctionnement, pas seulement de bonnes intentions.",
        "Le client peut être très compétent dans son métier tout en ayant besoin de structurer ses traces.",
      ],
    },
    {
      title: "Les catégories d’action",
      content:
        "Les catégories d’action définissent le périmètre certifié. Un organisme peut être certifié pour une ou plusieurs catégories, mais il ne doit pas communiquer comme si toutes ses activités étaient couvertes si elles ne le sont pas.",
      items: [
        "AF : actions de formation.",
        "BC : bilans de compétences.",
        "VAE : actions permettant de faire valider les acquis de l’expérience.",
        "CFA : actions de formation par apprentissage.",
        "Le périmètre affiché sur le certificat doit correspondre aux activités réellement communiquées et vendues.",
      ],
    },
    {
      title: "CFA, alternance et formation certifiante",
      content:
        "Une formation certifiante peut préparer à une certification RNCP ou RS sans être une formation en apprentissage. Un CFA concerne l’apprentissage ou l’alternance, avec des obligations spécifiques liées aux apprentis, aux entreprises, au suivi en entreprise et au conseil de perfectionnement.",
      items: [
        "Une formation certifiante classique sans alternance n’est pas un CFA.",
        "Le statut CFA déclenche des exigences spécifiques qui ne concernent pas toutes les formations RNCP ou RS.",
        "Pendant la Review, bien distinguer certification, alternance et apprentissage évite de rendre applicables les mauvais indicateurs.",
      ],
    },
    {
      title: "Financements et CPF",
      content:
        "Qualiopi ouvre l’accès aux financements publics ou mutualisés selon le périmètre et les financeurs concernés. En revanche, Qualiopi ne suffit pas à rendre une formation éligible au CPF.",
      items: [
        "Pour le CPF, la formation doit généralement être rattachée à une certification enregistrée au RS ou au RNCP.",
        "Le dossier de certification est porté auprès de France compétences.",
        "Qualiopi ouvre beaucoup de portes, mais le CPF a sa propre serrure. Jolie porte, autre clé.",
      ],
    },
    {
      title: "Le cycle de certification",
      content:
        "Un cycle de certification Qualiopi dure 3 ans. L’audit initial ouvre la porte, la surveillance vérifie que le système vit réellement, puis le renouvellement relance un nouveau cycle avec un regard sur l’historique.",
      items: [
        "Le cycle commence par un audit initial.",
        "Il comprend ensuite un audit de surveillance, généralement entre 14 et 22 mois après l’obtention de la certification.",
        "Un nouveau cycle démarre avec un audit de renouvellement.",
        "Audit complémentaire : contrôle ciblé lorsque certains écarts ou changements le nécessitent.",
        "Audit d’extension : audit permettant d’ajouter une catégorie d’action entre deux audits de cycle.",
      ],
    },
    {
      title: "Les différents types d’audit",
      content:
        "Le type d’audit change la manière de regarder les preuves. En initial, on vérifie ce qui est prévu et déjà mis en place. En surveillance ou renouvellement, on attend davantage de traces réelles et d’historique.",
      items: [
        "Audit initial : l’organisme entre dans la certification et doit montrer un système prêt à fonctionner.",
        "Audit de surveillance : l’auditeur vérifie que le système n’est pas resté au stade des bonnes intentions.",
        "Audit de renouvellement : on regarde la continuité, les résultats et l’amélioration depuis le cycle précédent.",
        "Audit complémentaire : il cible un point précis après certains écarts ou évolutions de périmètre.",
        "Audit d’extension : il sert à ajouter une catégorie d’action au périmètre certifié.",
      ],
    },
    {
      title: "Les non-conformités",
      content:
        "Une non-conformité est un écart entre ce qui est attendu et ce qui est prouvé. Elle peut être mineure ou majeure selon son impact. Le rôle de la Review est d’aider le client à voir l’écart avant le jour officiel.",
      items: [
        "Non-conformité mineure : un écart limité, corrigible, qui ne remet pas forcément tout le système en cause.",
        "Non-conformité majeure : un écart important, une absence de preuve structurante ou un risque fort sur la conformité.",
        "Cinq non-conformités mineures peuvent conduire à une majeure supplémentaire.",
        "Cinq non-conformités majeures peuvent entraîner un risque d’audit complémentaire.",
        "Une preuve absente doit être notée clairement. Qualiopi ne valide pas les souvenirs : il faut une trace.",
      ],
    },
    {
      title: "Peut-on “rater” Qualiopi ?",
      content:
        "Il faut rassurer sans endormir. Le client ne “rate” pas forcément immédiatement parce qu’un écart est identifié. Si des non-conformités subsistent, un délai de mise en conformité peut être accordé. Selon les cas, il peut aller de 1 à 6 mois. L’objectif de la Review est justement d’éviter la panique le jour de l’audit réel.",
      items: [
        "Identifier les écarts tôt permet d’agir avant l’audit officiel.",
        "Une non-conformité doit devenir une action concrète, pas une inquiétude vague.",
        "Le client doit repartir avec des priorités : quoi corriger, pourquoi, avec quelle preuve.",
      ],
    },
    {
      title: "Délais de mise en conformité",
      content:
        "Les délais dépendent de la nature des écarts et des règles applicables au cycle de certification. Pendant l’audit blanc, l’agent doit aider le client à distinguer l’urgent, l’important et le simple confort documentaire.",
      items: [
        "Prioriser les écarts majeurs ou les absences de preuve structurante.",
        "Transformer chaque écart en action datée et vérifiable.",
        "Demander des preuves réalistes : document corrigé, procédure utilisée, capture, exemple d’application.",
        "Rappeler qu’une correction doit être comprise et appliquée, pas seulement rédigée.",
      ],
    },
    {
      title: "Le rôle de l’agent auditeur",
      content:
        "L’agent n’est ni un juge froid, ni un consultant qui fait à la place du client. Il vérifie, questionne, explique et aide à rendre la conformité plus concrète.",
      items: [
        "Vérifier les preuves disponibles.",
        "Poser les bonnes questions pour comprendre la pratique réelle.",
        "Expliquer l’intérêt de chaque exigence dans le fonctionnement de l’organisme.",
        "Transformer une contrainte Qualiopi en amélioration utile pour le client.",
        "Rester précis : une veille non exploitée, c’est une collection de liens ; une veille exploitée, c’est une amélioration visible.",
      ],
    },
    {
      title: "Posture pendant l’audit blanc",
      content:
        "La bonne posture tient en équilibre : bienveillance sans complaisance, clarté sans jargon, exigence sans dramatisation.",
      items: [
        "Être clair sur ce qui est conforme, incomplet ou absent.",
        "Rester bienveillant, surtout quand le client découvre un écart.",
        "Ne pas minimiser les écarts : un point flou aujourd’hui peut devenir une non-conformité demain.",
        "Expliquer sans noyer le client dans le vocabulaire administratif.",
        "Proposer des actions concrètes, compréhensibles et vérifiables.",
        "Finir chaque séquence avec une réponse simple : preuve suffisante, preuve à compléter ou preuve absente.",
      ],
    },
  ],
};
