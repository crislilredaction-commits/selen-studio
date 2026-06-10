export type ReviewProcedureSection = {
  title: string;
  content?: string;
  items?: string[];
};

export type ReviewProcedureContent = {
  title: string;
  description: string;
  sections: ReviewProcedureSection[];
};

export const reviewProcedure: ReviewProcedureContent = {
  title: "Procédure d’utilisation de l’outil Review",
  description:
    "Mode d’emploi terrain pour préparer, conduire et clôturer une Review sans se perdre dans le brouillard administratif.",
  sections: [
    {
      title: "Avant le rendez-vous",
      content:
        "Le bon audit blanc commence avant l’appel. L’objectif est d’arriver avec le périmètre clair, les documents sous la main et quelques points de vigilance déjà en tête.",
      items: [
        "Ouvrir la fiche Review du client.",
        "Vérifier le nom du client, le type d’audit, le statut du dossier et le périmètre renseigné dans le profil Review.",
        "Contrôler que le lien Google Meet est bien renseigné dans la fiche audit.",
        "Vérifier les documents déjà déposés ou rendus visibles dans la zone documents.",
        "Repérer les documents souvent utiles : site internet, programme, convention, livret d’accueil, règlement intérieur, questionnaires et évaluations.",
        "Préparer les modèles ou documents correctifs qui pourraient aider le client après l’audit.",
      ],
    },
    {
      title: "Rejoindre le Google Meet",
      content:
        "Quelques minutes d’avance évitent beaucoup de théâtre technique. Le client doit sentir que l’audit est cadré dès le départ.",
      items: [
        "Depuis la fiche Review, repérer le lien Google Meet dans la zone rendez-vous ou visio.",
        "Cliquer sur le lien quelques minutes avant l’heure prévue.",
        "Vérifier le micro, la caméra et le partage d’écran.",
        "Accueillir le client, confirmer le temps disponible et rappeler le déroulé.",
        "Garder la fiche Review ouverte pendant l’entretien pour naviguer rapidement.",
      ],
    },
    {
      title: "Si la Review se fait en deux rendez-vous",
      content:
        "Si le client préfère découper la Review en deux sessions de 1h45, pensez à fixer immédiatement le second rendez-vous et à le renseigner sur la fiche Review. Le rendez-vous ne doit pas rester dans un coin de mémoire ou dans un message perdu au fond d’une messagerie.",
      items: [
        "Proposer ou fixer le second rendez-vous dès que le format en deux temps est confirmé.",
        "Renseigner le second créneau sur la fiche Review / fiche audit.",
        "Envoyer un email de confirmation avec le nouveau lien Google Meet.",
        "Si vous n’avez pas la main sur la création du Meet ou l’envoi, demander à un admin de le faire.",
        "Vérifier que le client sait quelle partie sera traitée au second rendez-vous.",
        "Qualiopi aime les preuves et les agents aiment retrouver leurs rendez-vous : une trace claire évite les flottements.",
      ],
    },
    {
      title: "Présenter le déroulé au client",
      content:
        "La Review n’est pas un piège. C’est une répétition générale : on repère ce qui tient, ce qui manque et ce qui doit être corrigé avant l’audit réel.",
      items: [
        "Expliquer que l’audit blanc sert à identifier les points solides et les zones à renforcer.",
        "Rappeler que l’objectif n’est pas de piéger le client, mais de rendre ses preuves plus robustes.",
        "Indiquer que l’agent va avancer indicateur par indicateur.",
        "Prévenir que chaque réponse doit être appuyée par une trace. Qualiopi n’a pas encore appris à lire dans les souvenirs : il faut une preuve.",
        "Lorsqu’une preuve est absente, noter l’écart, expliquer le risque et proposer une piste concrète.",
      ],
    },
    {
      title: "Conduire l’audit dans l’outil Review",
      content:
        "L’outil est la colonne vertébrale de l’entretien. Il aide à avancer sans oublier d’indicateur et à garder des notes prêtes pour le rapport.",
      items: [
        "Utiliser le bouton “Reprendre la Review” depuis la fiche audit.",
        "Suivre uniquement les indicateurs applicables calculés à partir du profil Review.",
        "Répondre aux questions à partir des preuves observées, pas seulement des déclarations.",
        "Utiliser les notes automatiques pour conserver les constats pendant l’échange.",
        "Marquer les points conformes, à vérifier ou non conformes selon les réponses et les preuves.",
        "Ne pas passer trop de temps à chercher une preuve introuvable : noter l’absence, expliquer l’impact, puis continuer.",
      ],
    },
    {
      title: "Consulter les documents du client pendant l’audit",
      content:
        "Le site du client est souvent la caverne aux preuves. Gardez-le ouvert, avec les documents principaux à portée de clic.",
      items: [
        "Ouvrir les documents depuis la fiche Review ou depuis la zone documents de l’indicateur.",
        "Garder accessibles les documents souvent réutilisés : site internet, programme, convention, livret d’accueil, règlement intérieur, questionnaires, évaluations.",
        "Expliquer au client ce que vous cherchez dans chaque document avant de le parcourir.",
        "Vérifier que la preuve concerne bien le bon périmètre, la bonne prestation et si possible le bon échantillon.",
        "Si le document ne suffit pas, noter ce qui manque plutôt que de forcer une conformité fragile.",
      ],
    },
    {
      title: "Visualiser les documents en partage d’écran",
      content:
        "Le partage d’écran peut devenir un mini atelier pédagogique. Montrez où la preuve existe, où elle manque, et pourquoi cela compte.",
      items: [
        "Ouvrir le document dans un onglet ou une fenêtre propre.",
        "Partager uniquement l’onglet ou la fenêtre utile.",
        "Éviter de partager tout l’écran si des informations internes ou d’autres clients sont visibles.",
        "Zoomer si nécessaire pour rendre la preuve lisible.",
        "Montrer au client l’endroit précis où se trouve la preuve ou l’endroit où elle devrait apparaître.",
        "Transformer la recherche de preuve en explication utile, pas en chasse au trésor punitive.",
      ],
    },
    {
      title: "Prendre les notes d’audit",
      content:
        "Les notes sont la matière première du rapport. Une note claire aujourd’hui évite un rapport flou demain.",
      items: [
        "Noter les preuves vues : nom du document, page, date, capture ou emplacement.",
        "Noter les éléments manquants ou insuffisants.",
        "Noter les conseils donnés au client pendant l’entretien.",
        "Noter les documents ou modèles à rendre visibles au client si nécessaire.",
        "Garder une formulation factuelle : preuve observée, écart constaté, action attendue.",
        "Éviter les jugements vagues. Préférer “le programme ne mentionne pas les modalités d’évaluation” à “programme incomplet”.",
      ],
    },
    {
      title: "Préparer le rapport Review",
      content:
        "Le rapport doit servir de feuille de route. Il doit aider le client à comprendre quoi corriger, pourquoi, et avec quelle priorité.",
      items: [
        "Vérifier que les indicateurs applicables ont bien été traités.",
        "Relire les notes avant génération du rapport.",
        "Vérifier les non-conformités et les points à confirmer.",
        "S’assurer que les corrections proposées sont concrètes et compréhensibles.",
        "Générer le rapport depuis la fiche Review principale.",
        "Rappeler au client que le rapport n’est pas une sanction, mais une carte de progression avant l’audit réel.",
      ],
    },
    {
      title: "Avant de clôturer la visio",
      content:
        "Dernier tour de table avant de raccrocher. C’est le moment de transformer l’audit blanc en plan d’action clair.",
      items: [
        "Confirmer les points forts observés.",
        "Résumer les écarts principaux sans noyer le client.",
        "Indiquer les corrections prioritaires.",
        "Préciser les documents qui seront partagés ou demandés après l’entretien.",
        "Expliquer la suite : finalisation des notes, génération du rapport, feuille de route.",
        "Vérifier que le client sait quoi faire en premier.",
      ],
    },
  ],
};
