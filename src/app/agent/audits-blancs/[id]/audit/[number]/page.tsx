"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuditGrimoire from "@/components/agent/AuditGrimoire";

// ─── Types ───────────────────────────────────────────────────────────────────

type Answer = "yes" | "partial" | "no" | "unknown";
type Diagnostic = "a_verifier" | "majeure" | "mineure" | "conforme";

type DisplayCondition = {
  profile_question_key?: string;
  operator?: string;
  value?: unknown;
  values?: unknown[];
};

type Question = {
  id: string;
  question_order: number;
  question: string;
  help_text: string | null;
  is_critical: boolean;
  affects_major: boolean;
  affects_minor: boolean;
  display_condition: DisplayCondition | DisplayCondition[] | string | null;
};

type AuditBlancCase = {
  id: string;
  client_email: string;
  status: string;
  offer: string;
  report_status: string;
  profile_data: Record<string, unknown> | null;
  applicable_indicators: number[] | null;
  excluded_indicators: number[] | null;
};

type AgentProfile = {
  email: string;
  role: "agent" | "admin";
};

type PreauditDocumentModel = {
  id: string;
  name: string;
  description: string | null;
  related_indicators: number[] | null;
  file_url: string | null;
};

type AuditBlancDocument = {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  public_url: string | null;
  is_visible_to_client: boolean;
  uploaded_by_email: string | null;
  created_at: string;
  source_model_id: string | null;
};

// ─── Logic (unchanged) ───────────────────────────────────────────────────────

function computeDiagnostic(
  indicatorNumber: number,
  questions: Question[],
  answers: Record<string, Answer>,
): Diagnostic {
  let hasMajor = false;
  let hasMinor = false;
  let answered = 0;

  questions.forEach((q) => {
    const answer = answers[q.id];
    if (!answer) return;
    answered++;
    if (answer === "no") {
      if (q.affects_major) hasMajor = true;
      else if (q.affects_minor) hasMinor = true;
    }
    if (answer === "partial") {
      if (
        [10, 11, 12, 14, 15, 16, 20, 21, 22, 26, 27, 28, 29, 31, 32].includes(
          indicatorNumber,
        ) &&
        q.affects_major
      ) {
        hasMajor = true;
      } else {
        hasMinor = true;
      }
    }
  });

  if (answered < Math.min(5, questions.length)) return "a_verifier";
  if (hasMajor) return "majeure";
  if (hasMinor) return "mineure";
  return "conforme";
}

function getIssues(questions: Question[], answers: Record<string, Answer>) {
  const issues: { text: string; level: "major" | "minor" }[] = [];
  questions.forEach((q) => {
    const answer = answers[q.id];
    if (!answer) return;
    if (answer === "no" && q.affects_major)
      issues.push({ text: q.question, level: "major" });
    if (answer === "partial" && q.affects_major)
      issues.push({ text: q.question, level: "major" });
    if (answer === "no" && q.affects_minor)
      issues.push({ text: q.question, level: "minor" });
  });
  return issues;
}

function normalizeBooleanLike(value: unknown) {
  if (value === true || value === "true" || value === "yes") return true;
  if (value === false || value === "false" || value === "no") return false;
  return value;
}

function parseDisplayCondition(
  condition: DisplayCondition | DisplayCondition[] | string | null,
): DisplayCondition | DisplayCondition[] | null {
  if (!condition) return null;
  if (typeof condition === "string") {
    try {
      return JSON.parse(condition) as DisplayCondition | DisplayCondition[];
    } catch {
      return null;
    }
  }
  return condition;
}

function matchSingleCondition(
  condition: DisplayCondition,
  profileData: Record<string, unknown> | null,
) {
  const key = condition.profile_question_key;
  if (!key) return true;
  const profileValue = profileData?.[key];
  const expectedValue = condition.value;
  const operator = condition.operator ?? "equals";
  if (operator === "equals")
    return (
      normalizeBooleanLike(profileValue) === normalizeBooleanLike(expectedValue)
    );
  if (operator === "not_equals")
    return (
      normalizeBooleanLike(profileValue) !== normalizeBooleanLike(expectedValue)
    );
  if (operator === "contains") {
    if (Array.isArray(profileValue))
      return profileValue.map(String).includes(String(expectedValue));
    if (typeof profileValue === "string")
      return profileValue.includes(String(expectedValue));
    return false;
  }
  if (operator === "not_contains") {
    if (Array.isArray(profileValue))
      return !profileValue.map(String).includes(String(expectedValue));
    if (typeof profileValue === "string")
      return !profileValue.includes(String(expectedValue));
    return true;
  }
  if (operator === "in") {
    const values = condition.values ?? [];
    return values.map(String).includes(String(profileValue));
  }
  return true;
}

function questionMatchesProfile(
  question: Question,
  profileData: Record<string, unknown> | null,
) {
  const parsedCondition = parseDisplayCondition(question.display_condition);
  if (!parsedCondition) return true;
  if (Array.isArray(parsedCondition))
    return parsedCondition.every((c) => matchSingleCondition(c, profileData));
  return matchSingleCondition(parsedCondition, profileData);
}

function extractStoragePathFromPublicUrl(value?: string | null) {
  if (!value) return "";

  const marker = "/storage/v1/object/public/selen-documents/";
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return decodeURIComponent(value.slice(markerIndex + marker.length));
  }

  return value;
}

// ─── Diagnostic helpers ───────────────────────────────────────────────────────

function diagnosticConfig(diagnostic: Diagnostic) {
  if (diagnostic === "majeure")
    return {
      label: "Non-conformité majeure probable",
      color: "#c97a7a",
      bg: "rgba(201,122,122,0.1)",
      border: "rgba(201,122,122,0.3)",
      icon: "✕",
    };
  if (diagnostic === "mineure")
    return {
      label: "Non-conformité mineure probable",
      color: "#d4a843",
      bg: "rgba(212,168,67,0.1)",
      border: "rgba(212,168,67,0.3)",
      icon: "△",
    };
  if (diagnostic === "conforme")
    return {
      label: "Conforme",
      color: "#7ec97e",
      bg: "rgba(126,201,126,0.1)",
      border: "rgba(126,201,126,0.3)",
      icon: "✓",
    };
  return {
    label: "En cours d'analyse…",
    color: "rgba(255,255,255,0.3)",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.1)",
    icon: "…",
  };
}

const ANSWER_CONFIG = [
  { value: "yes", label: "Oui", color: "#7ec97e", activeText: "#0e2010" },
  {
    value: "partial",
    label: "Partiellement",
    color: "#d4a843",
    activeText: "#1a1000",
  },
  { value: "no", label: "Non", color: "#c97a7a", activeText: "#200a0a" },
  {
    value: "unknown",
    label: "Ne sais pas",
    color: "rgba(255,255,255,0.3)",
    activeText: "#1a1510",
  },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

function getIndicatorInfoBlocks(indicatorNumber: number) {
  const blocks: Record<number, { title: string; text: string }[]> = {
    1: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "Vos informations doivent être accessibles au public avant toute contractualisation, complètes, cohérentes et à jour sur l’ensemble de vos supports.",
      },
      {
        title: "Preuves attendues",
        text: "Site internet, fiche formation, plaquette commerciale, catalogue ou email envoyé avant signature.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur est souvent vérifié en premier. Un site incomplet peut influencer négativement l’ensemble de l’audit.",
      },
    ],
    2: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que des indicateurs de résultats existent, qu’ils sont adaptés à la prestation et qu’ils sont diffusés au public.",
      },
      {
        title: "Preuves attendues",
        text: "Taux de satisfaction, taux de réussite ou d’atteinte des objectifs, taux d’abandon, indicateurs spécifiques selon la prestation.",
      },
      {
        title: "Bon à savoir",
        text: "Un taux seul ne suffit pas toujours : il est préférable d’indiquer aussi le volume concerné et la période de référence.",
      },
    ],
    3: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "Pour les certifications, VAE ou apprentissages, l’auditeur vérifie que les informations obligatoires liées à la certification sont accessibles et actualisées.",
      },
      {
        title: "Preuves attendues",
        text: "Taux d’obtention, taux de présentation, blocs de compétences, passerelles, équivalences, débouchés, taux d’insertion si applicable.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur ne concerne pas les formations non certifiantes classiques.",
      },
    ],
    4: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le besoin du bénéficiaire est analysé avant l’entrée en formation et que cette analyse est tracée.",
      },
      {
        title: "Preuves attendues",
        text: "Dossier d’inscription, fiche de renseignement, questionnaire d’analyse du besoin, validation des prérequis, positionnement amont.",
      },
      {
        title: "Bon à savoir",
        text: "L’analyse du besoin doit servir à adapter la prestation si nécessaire, pas seulement à collecter des informations administratives.",
      },
    ],
    5: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les objectifs sont clairs, opérationnels, adaptés au public et cohérents avec les évaluations.",
      },
      {
        title: "Preuves attendues",
        text: "Programme de formation, objectifs rédigés avec des verbes d’action, évaluations permettant de vérifier l’atteinte des objectifs.",
      },
      {
        title: "Bon à savoir",
        text: "Un bon objectif décrit ce que l’apprenant sera capable de faire, pas seulement ce qu’il va comprendre.",
      },
    ],
    6: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les contenus, modalités et moyens pédagogiques sont cohérents avec les objectifs, le public bénéficiaire et les besoins identifiés.",
      },
      {
        title: "Preuves attendues",
        text: "Programme détaillé, analyse du besoin, positionnement amont, adaptations pédagogiques, supports, modalités de mise en œuvre, politique handicap.",
      },
      {
        title: "Bon à savoir",
        text: "L’adaptation doit être justifiable : elle doit découler de l’analyse du besoin, du public visé, des objectifs et, si besoin, d’une situation de handicap.",
      },
    ],
    7: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les contenus de formation sont en adéquation avec les compétences, blocs et épreuves d’évaluation de la certification visée.",
      },
      {
        title: "Preuves attendues",
        text: "Référentiel RNCP/RS, programme de formation, tableau de correspondance contenus-compétences-évaluations, modalités de certification.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur concerne les formations certifiantes. Le programme doit démontrer clairement le lien avec le référentiel de certification.",
      },
    ],
    8: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie qu’un positionnement ou une évaluation des acquis est réalisé avant l’entrée en formation, et que cette démarche est adaptée au public et aux modalités prévues.",
      },
      {
        title: "Preuves attendues",
        text: "Questionnaire de positionnement, test de connaissances, entretien amont, validation des prérequis, fiche d’analyse du besoin, trace des adaptations décidées.",
      },
      {
        title: "Bon à savoir",
        text: "Le positionnement doit servir concrètement : il permet de vérifier le niveau d’entrée, de valider les prérequis et d’adapter le parcours si nécessaire.",
      },
    ],

    9: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le bénéficiaire reçoit, avant le démarrage, les informations nécessaires au bon déroulement de la prestation.",
      },
      {
        title: "Preuves attendues",
        text: "Convocation, livret d’accueil, email d’information, contrat ou convention, règlement intérieur si applicable, preuve de transmission.",
      },
      {
        title: "Bon à savoir",
        text: "Pour le bilan de compétences, l’information doit aussi couvrir les engagements déontologiques : consentement, confidentialité et respect du bénéficiaire.",
      },
    ],
    10: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que la prestation, l’accompagnement et le suivi sont réellement mis en œuvre et adaptés aux profils des bénéficiaires lorsque le besoin l’exige.",
      },
      {
        title: "Preuves attendues",
        text: "Planning, emploi du temps, feuilles d’émargement, tableau de suivi, livret pédagogique, supports de formation (numériques et/ou papier) traces d’accompagnement, adaptations mises en place, échanges ou comptes rendus.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur vérifie le passage du prévu au réel : ce qui a été identifié en amont doit se retrouver dans la mise en œuvre et le suivi.",
      },
    ],
    11: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que l’atteinte des objectifs est évaluée avec un processus formalisé, réellement mis en œuvre et cohérent avec les objectifs annoncés.",
      },
      {
        title: "Preuves attendues",
        text: "Grilles d’évaluation, résultats, bilans intermédiaires ou finaux, auto-évaluations, comptes rendus, livret de compétences, preuves d’évaluation en entreprise ou certification.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur ne vérifie pas seulement l’existence d’un quiz : il faut pouvoir montrer que chaque objectif est évalué et que le résultat est analysé.",
      },
    ],

    12: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que des mesures existent pour maintenir l’engagement des bénéficiaires et prévenir les abandons ou ruptures de parcours.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de suivi, relances, comptes rendus d’entretien, preuves de présence ou d’activité, points d’étape, suivi à distance, échanges avec l’entreprise ou le tuteur si applicable.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur concerne les prestations de plus de deux jours. Il faut pouvoir montrer des mesures prévues, mais aussi des traces de leur mise en œuvre.",
      },
    ],

    13: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les apprentissages en centre et en entreprise sont coordonnés, progressifs et anticipés avec l’entreprise et l’apprenant.",
      },
      {
        title: "Preuves attendues",
        text: "Carnet ou livret de liaison, planning d’alternance, progression pédagogique, échanges avec le tuteur ou maître d’apprentissage, comptes rendus de suivi ou visites en entreprise.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur concerne l’alternance. Il faut montrer que l’entreprise n’est pas seulement un lieu d’accueil, mais un lieu d’apprentissage coordonné avec le centre.",
      },
    ],

    14: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le CFA met en œuvre un accompagnement socio-professionnel, éducatif et citoyen des apprentis, au-delà du simple suivi pédagogique.",
      },
      {
        title: "Preuves attendues",
        text: "Livret de suivi de l’apprenti, règlement intérieur, droits et devoirs, actions citoyennes, ateliers CV ou insertion, prévention du harcèlement et des discriminations, feuilles d’émargement ou traces de participation.",
      },
      {
        title: "Bon à savoir",
        text: "Le livret apprenti peut devenir une preuve centrale s’il contient les informations transmises, les actions proposées et les traces de suivi ou de participation.",
      },
    ],

    15: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les apprentis sont informés de leurs droits et devoirs en tant qu’apprentis et salariés, ainsi que des règles de santé et de sécurité applicables.",
      },
      {
        title: "Preuves attendues",
        text: "Livret de suivi de l’apprenti, règlement intérieur, livret d’accueil, support d’information, preuve de remise ou d’émargement, email d’envoi, compte rendu de réunion d’information.",
      },
      {
        title: "Bon à savoir",
        text: "Pour cet indicateur, une information absente, incomplète ou non prouvée entraîne une non-conformité majeure. La preuve de transmission est donc aussi importante que le contenu.",
      },
    ],
    16: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les bénéficiaires sont présentés à la certification dans le respect des exigences formelles de l’autorité certificatrice.",
      },
      {
        title: "Preuves attendues",
        text: "Règlement ou guide du certificateur, checklist d’inscription, dossiers candidats, preuves de transmission, convocations, calendrier de certification, échanges avec l’autorité certificatrice.",
      },
      {
        title: "Bon à savoir",
        text: "Il ne suffit pas de préparer les bénéficiaires : il faut aussi prouver que les conditions administratives et formelles de présentation à la certification sont respectées.",
      },
    ],

    17: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les moyens humains, techniques, matériels et l’environnement sont adaptés aux objectifs, au public et aux modalités de la prestation.",
      },
      {
        title: "Preuves attendues",
        text: "CV ou profils des intervenants, planning d’intervention, inventaire matériel, contrat de location, convention de mise à disposition, registre d’accessibilité, DUERP, captures de plateforme, supports ou photos des équipements.",
      },
      {
        title: "Bon à savoir",
        text: "Il ne faut pas seulement disposer de moyens : il faut montrer qu’ils sont adaptés à la prestation réellement auditée, y compris lorsque les locaux ou équipements sont fournis par un tiers.",
      },
    ],

    18: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les fonctions nécessaires à la prestation sont identifiées et que les intervenants internes ou externes sont mobilisés et coordonnés.",
      },
      {
        title: "Preuves attendues",
        text: "Planning d’intervention, organigramme fonctionnel, fiches de mission, emails de cadrage, comptes rendus, tableau de suivi, échanges avec les intervenants, contrats ou conventions si besoin.",
      },
      {
        title: "Bon à savoir",
        text: "Même un prestataire indépendant peut être concerné : il doit pouvoir expliquer comment il organise les différentes fonctions qu’il assure seul.",
      },
    ],

    19: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que des ressources pédagogiques cohérentes avec les objectifs sont mises à disposition des bénéficiaires et que ceux-ci peuvent se les approprier.",
      },
      {
        title: "Preuves attendues",
        text: "Supports de cours, fiches pratiques, vidéos, ressources documentaires, plateforme, espace partagé, consignes d’accès, tutoriels, preuves de transmission, emails d’envoi, attestations de remise ou captures d’espace en ligne.",
      },
      {
        title: "Bon à savoir",
        text: "Avoir des supports ne suffit pas : il faut pouvoir prouver qu’ils ont bien été remis ou rendus accessibles aux bénéficiaires. Les preuves de remise sont donc indispensables : attestation de remise en main propre, email d’envoi, preuve de transmission via un espace en ligne, capture de dépôt, accusé de réception ou trace équivalente.",
      },
    ],

    20: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le CFA dispose d’un personnel dédié à la mobilité nationale et internationale, d’un référent handicap identifié et d’un conseil de perfectionnement.",
      },
      {
        title: "Preuves attendues",
        text: "Liste des membres du conseil de perfectionnement, dernier compte rendu ou procès-verbal, noms et qualités des personnes dédiées à la mobilité, nom et contact du référent handicap, preuves des actions menées.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur ne se limite pas à nommer des personnes : il faut prouver que les rôles existent, qu’ils sont identifiés et que des actions sont mises en œuvre ou au minimum organisées.",
      },
    ],

    21: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les intervenants disposent de compétences adaptées aux prestations réalisées et que ces compétences sont justifiées par des preuves concrètes.",
      },
      {
        title: "Preuves attendues",
        text: "Diplômes, titres, certifications, attestations de formation, CV à jour, habilitations éventuelles, justificatifs d’expérience, dossier intervenant, preuves de formation continue ou de spécialisation.",
      },
      {
        title: "Bon à savoir",
        text: "Pour cet indicateur, les preuves les plus importantes sont les diplômes, certifications et attestations de formation. Un CV seul peut aider, mais il est préférable de conserver des justificatifs concrets permettant de prouver la compétence professionnelle et pédagogique de chaque intervenant.",
      },
    ],

    22: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les compétences du personnel, ou du prestataire lui-même lorsqu’il travaille seul, sont entretenues et développées en cohérence avec les prestations délivrées.",
      },
      {
        title: "Preuves attendues",
        text: "Plan de développement des compétences, attestations de formation, certificats, preuves de participation à des webinaires, veille métier, échanges de pratiques, entretiens professionnels, actions de professionnalisation ou justificatifs de formation continue.",
      },
      {
        title: "Bon à savoir",
        text: "Pour les indépendants, certains certificateurs demandent aussi un plan de développement des compétences personnel. Il est donc préférable de formaliser les formations suivies, les actions prévues, la veille réalisée et les compétences à maintenir ou développer.",
      },
    ],

    23: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire réalise une veille légale et réglementaire sur le champ de la formation professionnelle, qu’il en garde une trace et qu’il en exploite les enseignements.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de veille, sources suivies, newsletters, liens institutionnels, notes d’analyse, exemples de mise à jour de documents ou procédures, preuve de diffusion aux personnes concernées.",
      },
      {
        title: "Bon à savoir",
        text: "La veille doit être vivante : il faut montrer une information repérée, son analyse, la décision prise et, si nécessaire, la mise à jour réalisée. Un simple dossier de liens non exploités risque d’être insuffisant.",
      },
    ],

    24: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire réalise une veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d’intervention, puis qu’il exploite les informations utiles.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de veille, sources métiers, observatoires, OPCO, branches professionnelles, salons, conférences, réseaux professionnels, revues spécialisées, notes d’analyse et exemples d’adaptation des prestations.",
      },
      {
        title: "Bon à savoir",
        text: "La veille métier doit servir à faire évoluer les prestations si nécessaire : contenu, exemples, compétences visées, supports, exercices, cas pratiques ou positionnement. Il faut pouvoir montrer au moins un exemple concret d’information repérée, analysée puis exploitée.",
      },
    ],

    25: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire réalise une veille sur les innovations pédagogiques et technologiques, puis qu’il analyse et exploite les informations utiles pour faire évoluer ses prestations.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de veille, newsletters, webinaires, salons, conférences, groupes d’échange, tests d’outils, notes d’analyse, captures, exemples d’évolution des supports, modalités ou outils pédagogiques.",
      },
      {
        title: "Bon à savoir",
        text: "Il n’est pas nécessaire d’adopter toutes les innovations repérées. L’important est de montrer que vous les analysez : intérêt, faisabilité, coût, pertinence pour le public, accessibilité, puis décision d’intégration ou non.",
      },
    ],

    26: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire a identifié un réseau handicap mobilisable pour accueillir, accompagner, former ou orienter les publics en situation de handicap.",
      },
      {
        title: "Preuves attendues",
        text: "Politique accessibilité handicap, coordonnées de partenaires handicap, référent handicap identifié, procédure de mobilisation du réseau, traces d’échanges, adaptations mises en place ou orientations proposées.",
      },
      {
        title: "Bon à savoir",
        text: "Il faut pouvoir présenter un réseau concret et mobilisable : Agefiph, Cap emploi, MDPH, FIPHFP, partenaires spécialisés et associations locales si pertinent. Une simple phrase d’intention ne suffit pas.",
      },
    ],
    27: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire maîtrise sa sous-traitance ou le recours au portage salarial et s’assure que les intervenants respectent les exigences Qualiopi applicables.",
      },
      {
        title: "Preuves attendues",
        text: "Contrat ou convention de sous-traitance, charte d’engagement Qualiopi signée, CV, diplômes, attestations, consignes transmises, preuves d’intervention, émargements, évaluations, bilans et contrôles qualité.",
      },
      {
        title: "Bon à savoir",
        text: "Un simple contrat commercial ne suffit pas. Il faut montrer que le sous-traitant connaît les exigences qualité, transmet les preuves nécessaires et accepte que ses interventions soient contrôlées par l’organisme donneur d’ordre.",
      },
    ],

    28: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire mobilise un réseau de partenaires socio-économiques pour co-construire l’ingénierie de formation et favoriser l’accueil en entreprise lorsque la prestation comprend des périodes en situation de travail.",
      },
      {
        title: "Preuves attendues",
        text: "Liste des entreprises partenaires, conventions de partenariat, conventions de formation, contacts du réseau socio-économique, comptes rendus de réunions, comités de pilotage, livret alternance, échanges avec les entreprises ou tuteurs.",
      },
      {
        title: "Bon à savoir",
        text: "Une simple liste de contacts ne suffit pas toujours : il faut montrer que le réseau est réellement mobilisé, avec des échanges, conventions, comptes rendus, retours entreprises ou actions concrètes liées à l’accueil en entreprise.",
      },
    ],

    29: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le CFA développe des actions concrètes favorisant l’insertion professionnelle ou la poursuite d’études des apprentis.",
      },
      {
        title: "Preuves attendues",
        text: "Livret de suivi de l’apprenti, planning d’ateliers, feuilles d’émargement, supports CV ou entretien, informations sur les poursuites d’études, partenariats, enquêtes de sortie ou suivi des suites de parcours.",
      },
      {
        title: "Bon à savoir",
        text: "Il ne suffit pas de dire que les apprentis peuvent poursuivre leurs études ou chercher un emploi : il faut montrer les actions proposées, les preuves de participation ou de transmission, et si possible un suivi des suites de parcours.",
      },
    ],

    30: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire recueille les appréciations des parties prenantes concernées : bénéficiaires, financeurs, équipes pédagogiques et entreprises lorsque cela s’applique.",
      },
      {
        title: "Preuves attendues",
        text: "Questionnaires de satisfaction, évaluations à chaud ou à froid, comptes rendus d’entretien, retours formateurs, retours entreprises, sollicitations financeurs, relances, exports de formulaires ou tableaux de synthèse.",
      },
      {
        title: "Bon à savoir",
        text: "Le recueil doit être organisé, tracé et permettre une expression libre. Il ne suffit pas d’avoir un questionnaire : il faut pouvoir prouver qu’il est envoyé, relancé si besoin, complété ou au moins sollicité auprès des parties prenantes concernées.",
      },
    ],

    31: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire a défini et met en œuvre des modalités de traitement des difficultés, aléas et réclamations exprimés par les parties prenantes.",
      },
      {
        title: "Preuves attendues",
        text: "Procédure de traitement, tableau d’amélioration continue, registre des réclamations, emails, accusés de réception, réponses apportées, actions correctives, preuves de clôture et suivi des aléas.",
      },
      {
        title: "Bon à savoir",
        text: "Pour cet indicateur, il faut prouver le traitement réel : réception, analyse, réponse, action décidée, suivi et clôture. Une réclamation non tracée ou une difficulté traitée oralement sans preuve peut fragiliser l’audit.",
      },
    ],

    32: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire met en œuvre des mesures d’amélioration à partir de l’analyse des appréciations, difficultés, aléas et réclamations.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau d’amélioration continue, analyse des retours, causes identifiées, plan d’action, mesures mises en œuvre, preuves de réalisation, suivi d’efficacité, documents ou procédures mis à jour.",
      },
      {
        title: "Bon à savoir",
        text: "Le 32 ne valide pas seulement l’existence d’un tableau : il faut montrer le chemin complet entre le retour reçu, l’analyse, l’action décidée, la mise en œuvre réelle et la preuve de suivi. Un questionnaire sans exploitation ne suffit pas.",
      },
    ],
  };

  return (
    blocks[indicatorNumber] ?? [
      {
        title: "Ce que l’auditeur vérifie",
        text: "Les exigences spécifiques de cet indicateur doivent être vérifiées à partir du référentiel Qualiopi.",
      },
      {
        title: "Preuves attendues",
        text: "Les preuves attendues dépendent de l’indicateur et de la catégorie d’action concernée.",
      },
      {
        title: "Bon à savoir",
        text: "Complétez progressivement cette aide au fur et à mesure de la construction des indicateurs.",
      },
    ]
  );
}

export default function AgentAuditToolPage() {
  const router = useRouter();
  const params = useParams<{ id: string; number: string }>();
  const supabase = useMemo(() => createClient(), []);

  const caseId = params.id;
  const indicatorNumber = Number(params.number);

  const [loading, setLoading] = useState(true);
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [auditCase, setAuditCase] = useState<AuditBlancCase | null>(null);
  const [title, setTitle] = useState(`Indicateur ${indicatorNumber}`);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [documentModels, setDocumentModels] = useState<PreauditDocumentModel[]>(
    [],
  );
  const [publishedDocuments, setPublishedDocuments] = useState<
    AuditBlancDocument[]
  >([]);
  const [publishingModelId, setPublishingModelId] = useState<string | null>(
    null,
  );

  const diagnostic = computeDiagnostic(indicatorNumber, questions, answers);
  const issues = getIssues(questions, answers);
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const totalQuestions = questions.length;
  const progress =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const prevNum = indicatorNumber > 1 ? indicatorNumber - 1 : null;
  const nextNum = indicatorNumber < 32 ? indicatorNumber + 1 : null;
  const dc = diagnosticConfig(diagnostic);
  const indicatorOptions =
    auditCase?.applicable_indicators &&
    auditCase.applicable_indicators.length > 0
      ? auditCase.applicable_indicators
      : Array.from({ length: 32 }, (_, index) => index + 1);
  const indicatorDocumentModels = useMemo(() => {
    return documentModels.filter((model) => {
      if (!Array.isArray(model.related_indicators)) return false;

      return model.related_indicators
        .map((value) => Number(value))
        .includes(indicatorNumber);
    });
  }, [documentModels, indicatorNumber]);

  async function loadPage() {
    setLoading(true);
    setError("");
    setSuccess("");

    if (!indicatorNumber || Number.isNaN(indicatorNumber)) {
      setError("Numéro d'indicateur invalide.");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    if (!authData.user) {
      router.replace("/login");
      return;
    }

    const userEmail = authData.user.email ?? "";
    const { data: agentData, error: agentError } = await supabase
      .from("agent_profiles")
      .select("email, role")
      .eq("email", userEmail.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (agentError) {
      setError(`Impossible de vérifier l'accès agent. ${agentError.message}`);
      setLoading(false);
      return;
    }
    if (!agentData) {
      setError("Accès agent non autorisé pour ce compte.");
      setLoading(false);
      return;
    }
    setAgent(agentData as AgentProfile);

    const { data: caseData, error: caseError } = await supabase
      .from("audit_blanc_cases")
      .select(
        "id, client_email, status, offer, report_status, profile_data, applicable_indicators, excluded_indicators",
      )
      .eq("id", caseId)
      .maybeSingle();

    if (caseError) {
      setError(`Impossible de charger le dossier. ${caseError.message}`);
      setLoading(false);
      return;
    }
    if (!caseData) {
      setError("Dossier audit blanc introuvable.");
      setLoading(false);
      return;
    }
    setAuditCase(caseData as AuditBlancCase);

    const { data: indicatorData } = await supabase
      .from("preaudit_indicators")
      .select("title, simplified_title")
      .eq("number", indicatorNumber)
      .maybeSingle();

    setTitle(
      indicatorData?.simplified_title ||
        indicatorData?.title ||
        `Indicateur ${indicatorNumber}`,
    );

    const { data: questionData, error: questionError } = await supabase
      .from("preaudit_questions")
      .select(
        "id, question_order, question, help_text, is_critical, affects_major, affects_minor, display_condition",
      )
      .eq("indicator_number", indicatorNumber)
      .order("question_order", { ascending: true });

    if (questionError) {
      setError(questionError.message);
      setLoading(false);
      return;
    }

    const loadedQuestions = ((questionData ?? []) as Question[]).filter((q) =>
      questionMatchesProfile(
        q,
        (caseData.profile_data as Record<string, unknown> | null) ?? null,
      ),
    );
    setQuestions(loadedQuestions);

    const { data: answerData, error: answerError } = await supabase
      .from("audit_blanc_indicator_answers")
      .select("question_id, answer")
      .eq("case_id", caseId);

    if (answerError) {
      setError(answerError.message);
      setLoading(false);
      return;
    }

    const initialAnswers: Record<string, Answer> = {};
    (answerData ?? []).forEach(
      (row: { question_id: string; answer: string }) => {
        if (["yes", "partial", "no", "unknown"].includes(row.answer)) {
          initialAnswers[row.question_id] = row.answer as Answer;
        }
      },
    );
    setAnswers(initialAnswers);

    const { data: noteData, error: noteError } = await supabase
      .from("audit_blanc_indicator_notes")
      .select("user_notes")
      .eq("case_id", caseId)
      .eq("indicator_number", indicatorNumber)
      .maybeSingle();

    if (noteError) {
      setError(noteError.message);
      setLoading(false);
      return;
    }
    setNote(noteData?.user_notes ?? "");

    const { data: modelData, error: modelError } = await supabase
      .from("preaudit_document_models")
      .select("id, name, description, related_indicators, file_url")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (modelError) {
      setError(
        `Impossible de charger les modèles de documents. ${modelError.message}`,
      );
      setLoading(false);
      return;
    }

    setDocumentModels((modelData ?? []) as PreauditDocumentModel[]);

    const { data: documentData, error: documentError } = await supabase
      .from("audit_blanc_documents")
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      )
      .eq("case_id", caseId);

    if (documentError) {
      setError(`Impossible de charger les documents. ${documentError.message}`);
      setLoading(false);
      return;
    }

    setPublishedDocuments((documentData ?? []) as AuditBlancDocument[]);

    setLoading(false);
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, indicatorNumber]);

  async function saveAnswer(questionId: string, answer: Answer) {
    if (!agent) return;
    setSavingAnswerId(questionId);
    setError("");
    setSuccess("");
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));

    const { error: saveError } = await supabase
      .from("audit_blanc_indicator_answers")
      .upsert(
        {
          case_id: caseId,
          question_id: questionId,
          answer,
          answered_by_email: agent.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "case_id,question_id" },
      );

    if (saveError) {
      setError(saveError.message);
    }
    setSavingAnswerId(null);
  }

  async function saveIndicatorNote() {
    setSavingNote(true);
    setError("");
    setSuccess("");

    const { error: saveError } = await supabase
      .from("audit_blanc_indicator_notes")
      .upsert(
        {
          case_id: caseId,
          indicator_number: indicatorNumber,
          user_notes: note,
          agent_diagnostic: diagnostic,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "case_id,indicator_number" },
      );

    if (saveError) {
      setError(saveError.message);
      setSavingNote(false);
      return;
    }
    setSuccess("Note sauvegardée.");
    setSavingNote(false);
  }

  async function publishDocumentModelToClient(model: PreauditDocumentModel) {
    if (!auditCase || !agent) {
      setError("Dossier ou agent introuvable.");
      return;
    }

    if (!model.file_url) {
      setError("Ce modèle n’a pas de fichier associé.");
      return;
    }

    const alreadyPublished = publishedDocuments.some(
      (document) => document.source_model_id === model.id,
    );

    if (alreadyPublished) {
      setError("Ce document est déjà visible dans l’espace client.");
      return;
    }

    const storagePath = extractStoragePathFromPublicUrl(model.file_url);

    if (!storagePath) {
      setError("Impossible de retrouver le chemin du fichier modèle.");
      return;
    }

    setPublishingModelId(model.id);
    setError("");
    setSuccess("");

    const { data: publicUrlData } = supabase.storage
      .from("selen-documents")
      .getPublicUrl(storagePath);

    const { data: documentData, error: insertError } = await supabase
      .from("audit_blanc_documents")
      .insert({
        case_id: auditCase.id,
        name: model.name,
        document_type: "document_correctif",
        storage_bucket: "selen-documents",
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        uploaded_by_email: agent.email,
        is_visible_to_client: true,
        source_model_id: model.id,
      })
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      )
      .single();

    if (insertError) {
      setError(`Impossible de publier le document : ${insertError.message}`);
      setPublishingModelId(null);
      return;
    }

    setPublishedDocuments((prev) => [
      documentData as AuditBlancDocument,
      ...prev,
    ]);

    setSuccess(`Document “${model.name}” rendu visible dans l’espace client.`);
    setPublishingModelId(null);
  }

  function goToIndicator(targetNumber: number) {
    void saveIndicatorNote();
    router.push(`/agent/audits-blancs/${caseId}/audit/${targetNumber}`);
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={s.page}>
        <style>{css}</style>
        <div style={s.loadingWrap}>
          <div className="sel-spinner" />
          <p style={s.loadingText}>Chargement de l'outil d'audit…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{css}</style>
      <AuditGrimoire />

      <div style={s.container}>
        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.breadcrumb}>
            <Link
              href="/agent/audits-blancs"
              style={s.breadcrumbLink}
              className="sel-breadcrumb"
            >
              Dossiers
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <Link
              href={`/agent/audits-blancs/${caseId}`}
              style={s.breadcrumbLink}
              className="sel-breadcrumb"
            >
              Fiche dossier
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <span style={s.breadcrumbCurrent}>
              Indicateur {indicatorNumber}
            </span>
          </div>

          <div style={s.headerBody}>
            <div style={s.headerLeft}>
              <p style={s.eyebrow}>Selen Studio · Outil audit</p>
              <h1 style={s.title}>{title}</h1>
              {auditCase && (
                <p style={s.clientLine}>
                  <span style={s.clientDot} />
                  {auditCase.client_email}
                </p>
              )}
            </div>

            {/* Progress ring */}
            <div style={s.progressWrap}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke="rgba(196,169,106,0.12)"
                  strokeWidth="5"
                />
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke={progress === 100 ? "#7ec97e" : "#c4a96a"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 30}`}
                  strokeDashoffset={`${2 * Math.PI * 30 * (1 - progress / 100)}`}
                  transform="rotate(-90 36 36)"
                  style={{ transition: "stroke-dashoffset 0.4s ease" }}
                />
                <text
                  x="36"
                  y="40"
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.85)"
                  fontSize="14"
                  fontWeight="700"
                  fontFamily="Georgia, serif"
                >
                  {progress}%
                </text>
              </svg>
              <p style={s.progressSub}>
                {answeredCount}/{totalQuestions}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={s.progressBar}>
            <div
              style={{
                ...s.progressFill,
                width: `${progress}%`,
                background: progress === 100 ? "#7ec97e" : "#c4a96a",
              }}
            />
          </div>
        </header>

        {/* ── Alerts ── */}
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {!agent || !auditCase ? (
          <div style={s.card}>
            <p style={s.cardLabel}>Accès impossible</p>
            <p style={s.cardBody}>
              Le dossier est introuvable ou votre accès agent n'est pas
              autorisé.
            </p>
          </div>
        ) : (
          <div style={s.layout} className="sel-layout">
            {/* ── Questions ── */}
            <section style={s.questionsList}>
              <div style={s.infoGrid}>
                {getIndicatorInfoBlocks(indicatorNumber).map((block) => (
                  <article key={block.title} style={s.infoCard}>
                    <div style={s.infoCardRail} />

                    <p style={s.infoBlockLabel}>{block.title}</p>

                    <p style={s.infoBlockText}>{block.text}</p>
                  </article>
                ))}
              </div>

              {questions.length === 0 ? (
                <div style={s.card}>
                  <p style={s.cardLabel}>Aucune question</p>
                  <p style={s.cardBody}>
                    Aucune question n'est enregistrée pour cet indicateur.
                  </p>
                </div>
              ) : (
                questions.map((q, i) => {
                  const isSaving = savingAnswerId === q.id;
                  const currentAnswer = answers[q.id];
                  return (
                    <article
                      key={q.id}
                      style={{
                        ...s.questionCard,
                        animationDelay: `${i * 35}ms`,
                      }}
                      className="sel-question-card"
                    >
                      {/* Card top row */}
                      <div style={s.questionMeta}>
                        <span style={s.questionNum}>Q{q.question_order}</span>
                        {q.is_critical && (
                          <span style={s.criticalBadge}>Critique</span>
                        )}
                        {q.affects_major && !q.is_critical && (
                          <span style={s.majorBadge}>Majeur</span>
                        )}
                        {isSaving && (
                          <span style={s.savingBadge}>Sauvegarde…</span>
                        )}
                        {currentAnswer && !isSaving && (
                          <span
                            style={{
                              ...s.answeredBadge,
                              color:
                                ANSWER_CONFIG.find(
                                  (a) => a.value === currentAnswer,
                                )?.color ?? C.gold,
                            }}
                          >
                            ✓{" "}
                            {
                              ANSWER_CONFIG.find(
                                (a) => a.value === currentAnswer,
                              )?.label
                            }
                          </span>
                        )}
                      </div>

                      <h2 style={s.questionText}>{q.question}</h2>

                      {q.help_text && <p style={s.helpText}>{q.help_text}</p>}

                      {/* Answer buttons */}
                      <div style={s.answerRow}>
                        {ANSWER_CONFIG.map(
                          ({ value, label, color, activeText }) => {
                            const selected = currentAnswer === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  saveAnswer(q.id, value as Answer)
                                }
                                disabled={isSaving}
                                style={{
                                  ...s.answerBtn,
                                  border: `1px solid ${selected ? color : "rgba(196,169,106,0.18)"}`,
                                  background: selected
                                    ? color
                                    : "rgba(255,255,255,0.03)",
                                  color: selected
                                    ? activeText
                                    : "rgba(255,255,255,0.5)",
                                  opacity: isSaving ? 0.5 : 1,
                                  cursor: isSaving ? "not-allowed" : "pointer",
                                  fontWeight: selected ? 700 : 400,
                                  boxShadow: selected
                                    ? `0 0 12px ${color}33`
                                    : "none",
                                }}
                                className={selected ? "" : "sel-answer-btn"}
                              >
                                {label}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            {/* ── Sidebar ── */}
            <aside style={s.sidebar}>
              {/* Diagnostic */}
              <div
                style={{
                  ...s.diagnosticCard,
                  background: dc.bg,
                  border: `1px solid ${dc.border}`,
                }}
              >
                <div style={diagnosticIconStyle(dc.color)}>{dc.icon}</div>
                <div>
                  <p style={s.cardLabel}>Diagnostic agent</p>
                  <p style={{ ...s.diagnosticLabel, color: dc.color }}>
                    {dc.label}
                  </p>
                </div>
              </div>

              {/* Issues */}
              <div style={s.card}>
                <p style={s.cardLabel}>Points à corriger</p>
                {issues.length > 0 ? (
                  <div style={s.issuesList}>
                    {issues.slice(0, 6).map((issue, i) => (
                      <div key={i} style={s.issueItem}>
                        <span
                          style={{
                            ...s.issueDot,
                            background:
                              issue.level === "major" ? "#c97a7a" : "#d4a843",
                          }}
                        />
                        <span style={s.issueText}>{issue.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={s.cardBody}>Aucun point bloquant détecté.</p>
                )}
              </div>

              {/* Documents correctifs */}
              <div style={s.card}>
                <p style={s.cardLabel}>Documents correctifs</p>

                {diagnostic === "conforme" ? (
                  <p style={s.cardBody}>
                    Aucun document correctif n’est proposé tant que l’indicateur
                    est conforme.
                  </p>
                ) : indicatorDocumentModels.length === 0 ? (
                  <p style={s.cardBody}>
                    Aucun modèle actif n’est associé à cet indicateur pour le
                    moment.
                  </p>
                ) : (
                  <div style={s.documentList}>
                    {indicatorDocumentModels.map((model) => {
                      const alreadyPublished = publishedDocuments.some(
                        (document) => document.source_model_id === model.id,
                      );

                      const isPublishing = publishingModelId === model.id;

                      return (
                        <div key={model.id} style={s.documentItem}>
                          <div>
                            <p style={s.documentTitle}>{model.name}</p>

                            {model.description && (
                              <p style={s.documentDescription}>
                                {model.description}
                              </p>
                            )}

                            {!model.file_url && (
                              <p style={s.documentWarning}>
                                Aucun fichier associé à ce modèle.
                              </p>
                            )}

                            {alreadyPublished && (
                              <p style={s.documentVisible}>
                                Déjà visible dans l’espace client
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => publishDocumentModelToClient(model)}
                            disabled={
                              alreadyPublished ||
                              !model.file_url ||
                              isPublishing
                            }
                            style={{
                              ...s.btnGhost,
                              opacity:
                                alreadyPublished ||
                                !model.file_url ||
                                isPublishing
                                  ? 0.55
                                  : 1,
                              cursor:
                                alreadyPublished ||
                                !model.file_url ||
                                isPublishing
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                            className="sel-btn-ghost"
                          >
                            {isPublishing
                              ? "Publication…"
                              : alreadyPublished
                                ? "Publié"
                                : "Publier client"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Note */}
              <div style={s.card}>
                <p style={s.cardLabel}>Note indicateur</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => saveIndicatorNote()}
                  placeholder="Preuves observées, écarts, corrections à demander…"
                  style={s.textarea}
                  className="sel-textarea"
                />
                <button
                  type="button"
                  onClick={saveIndicatorNote}
                  disabled={savingNote}
                  style={{
                    ...s.btnPrimary,
                    opacity: savingNote ? 0.55 : 1,
                    cursor: savingNote ? "not-allowed" : "pointer",
                  }}
                  className="sel-btn-primary"
                >
                  {savingNote ? "Sauvegarde…" : "Sauvegarder la note"}
                </button>
              </div>

              {/* Navigation */}
              <div style={s.navGroup}>
                <p style={s.navGroupLabel}>Navigation</p>
                <label style={s.fieldLabel}>
                  Aller à un indicateur
                  <select
                    value={String(indicatorNumber)}
                    onChange={(event) =>
                      goToIndicator(Number(event.target.value))
                    }
                    style={s.selectInput}
                    className="sel-select"
                  >
                    {indicatorOptions.map((number) => (
                      <option key={number} value={String(number)}>
                        Indicateur {number}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={s.navBtns}>
                  {prevNum && (
                    <button
                      type="button"
                      onClick={() => goToIndicator(prevNum)}
                      style={s.btnGhost}
                      className="sel-btn-ghost"
                    >
                      ← Indicateur {prevNum}
                    </button>
                  )}
                  {nextNum ? (
                    <button
                      type="button"
                      onClick={() => goToIndicator(nextNum)}
                      style={s.btnPrimary}
                      className="sel-btn-primary"
                    >
                      Indicateur {nextNum} →
                    </button>
                  ) : (
                    <Link
                      href={`/agent/audits-blancs/${caseId}`}
                      style={s.btnPrimary}
                      className="sel-btn-primary"
                    >
                      Terminer l'audit ✓
                    </Link>
                  )}
                </div>

                <div style={s.navLinks}>
                  <Link
                    href={`/agent/audits-blancs/${caseId}`}
                    style={s.navLink}
                    className="sel-nav-link"
                  >
                    ← Retour fiche dossier
                  </Link>
                  <Link
                    href="/agent/audits-blancs"
                    style={s.navLink}
                    className="sel-nav-link"
                  >
                    ← Retour liste dossiers
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Alert({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  const isError = type === "error";
  return (
    <div
      style={{
        ...s.alert,
        borderLeftColor: isError ? "#c97a7a" : "#7ec97e",
        color: isError ? "#c97a7a" : "#7ec97e",
        background: isError
          ? "rgba(201,122,122,0.07)"
          : "rgba(126,201,126,0.07)",
      }}
    >
      {message}
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: "#1a1510",
  surface: "#221c14",
  surfaceDeep: "#1d1810",
  border: "rgba(196,169,106,0.15)",
  borderStrong: "rgba(196,169,106,0.28)",
  gold: "#c4a96a",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.5)",
  textFaint: "rgba(255,255,255,0.22)",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
function diagnosticIconStyle(color: string): CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: `${color}18`,
    border: `1px solid ${color}44`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1rem",
    color,
    flexShrink: 0,
  };
}
const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "Georgia, 'Times New Roman', serif",
  } as CSSProperties,
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "0 2rem 5rem",
  } as CSSProperties,

  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70vh",
    gap: "1.2rem",
  } as CSSProperties,
  loadingText: {
    color: C.textFaint,
    fontSize: "0.88rem",
    letterSpacing: "0.06em",
  } as CSSProperties,

  // Header
  header: { paddingTop: "2rem", marginBottom: "2rem" } as CSSProperties,
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.75rem",
    marginBottom: "1.4rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  breadcrumbLink: {
    color: C.gold,
    textDecoration: "none",
    opacity: 0.7,
  } as CSSProperties,
  breadcrumbSep: { color: C.textFaint } as CSSProperties,
  breadcrumbCurrent: { color: C.textSoft } as CSSProperties,
  headerBody: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "1.5rem",
    marginBottom: "1.2rem",
  } as CSSProperties,
  headerLeft: { flex: 1 } as CSSProperties,
  eyebrow: {
    fontSize: "0.68rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
    color: C.gold,
    marginBottom: "0.5rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  title: {
    fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
    fontWeight: 700,
    color: C.text,
    lineHeight: 1.15,
    margin: "0 0 0.6rem",
    fontFamily: "Georgia, serif",
  } as CSSProperties,
  clientLine: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.82rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
  } as CSSProperties,
  clientDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7ec97e",
    flexShrink: 0,
    boxShadow: "0 0 0 2.5px rgba(126,201,126,0.2)",
  } as CSSProperties,
  progressWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.3rem",
    flexShrink: 0,
  } as CSSProperties,
  progressSub: {
    fontSize: "0.7rem",
    color: C.textFaint,
    fontFamily: "sans-serif",
    letterSpacing: "0.04em",
  } as CSSProperties,
  progressBar: {
    height: 3,
    background: "rgba(196,169,106,0.1)",
    borderRadius: 99,
  } as CSSProperties,
  progressFill: {
    height: "100%",
    borderRadius: 99,
    transition: "width 0.4s ease",
  } as CSSProperties,

  // Layout
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 300px",
    gap: "1.25rem",
    alignItems: "start",
  } as CSSProperties,
  questionsList: { display: "grid", gap: "0.8rem" } as CSSProperties,

  // Question card
  questionCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem 1.3rem",
    animation: "selFadeIn 0.25s ease both",
  } as CSSProperties,
  questionMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.7rem",
    flexWrap: "wrap" as const,
  } as CSSProperties,
  questionNum: {
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    fontFamily: "sans-serif",
    fontWeight: 600,
  } as CSSProperties,
  criticalBadge: {
    fontSize: "0.65rem",
    padding: "0.15rem 0.5rem",
    background: "rgba(201,122,122,0.15)",
    border: "1px solid rgba(201,122,122,0.3)",
    borderRadius: 4,
    color: "#c97a7a",
    fontFamily: "sans-serif",
    fontWeight: 700,
  } as CSSProperties,
  majorBadge: {
    fontSize: "0.65rem",
    padding: "0.15rem 0.5rem",
    background: "rgba(212,168,67,0.12)",
    border: "1px solid rgba(212,168,67,0.28)",
    borderRadius: 4,
    color: "#d4a843",
    fontFamily: "sans-serif",
    fontWeight: 700,
  } as CSSProperties,
  savingBadge: {
    marginLeft: "auto",
    fontSize: "0.72rem",
    color: C.textFaint,
    fontFamily: "sans-serif",
    fontStyle: "italic",
  } as CSSProperties,
  answeredBadge: {
    marginLeft: "auto",
    fontSize: "0.72rem",
    fontFamily: "sans-serif",
    fontWeight: 600,
  } as CSSProperties,
  questionText: {
    fontSize: "0.97rem",
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.55,
    fontWeight: 400,
    margin: "0 0 0.55rem",
  } as CSSProperties,
  helpText: {
    fontSize: "0.8rem",
    color: C.textFaint,
    fontStyle: "italic",
    lineHeight: 1.55,
    margin: "0 0 0.85rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  answerRow: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap" as const,
  } as CSSProperties,
  answerBtn: {
    padding: "0.42rem 0.9rem",
    borderRadius: 6,
    fontSize: "0.8rem",
    fontFamily: "sans-serif",
    transition: "all 0.15s ease",
    letterSpacing: "0.01em",
  } as CSSProperties,

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0.75rem",
    marginBottom: "0.9rem",
  } as CSSProperties,

  infoCard: {
    position: "relative",
    overflow: "hidden",
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1rem 1rem 1rem 1.15rem",
  } as CSSProperties,

  infoCardRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: "linear-gradient(to bottom, #8f6f3f, #c4a96a)",
  } as CSSProperties,

  infoBlockLabel: {
    fontSize: "0.64rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.45rem",
    fontFamily: "sans-serif",
    fontWeight: 800,
  } as CSSProperties,

  infoBlockText: {
    color: C.textSoft,
    fontSize: "0.82rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  } as CSSProperties,

  jumpBox: {
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.75rem",
    marginBottom: "0.8rem",
  } as CSSProperties,

  jumpLabel: {
    display: "grid",
    gap: "0.4rem",
    color: C.textFaint,
    fontSize: "0.72rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontFamily: "sans-serif",
  } as CSSProperties,

  jumpSelect: {
    width: "100%",
    padding: "0.55rem",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    borderRadius: 6,
    cursor: "pointer",
    outline: "none",
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
    textTransform: "none" as const,
    letterSpacing: 0,
  } as CSSProperties,

  // Sidebar
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "0.85rem",
  } as CSSProperties,
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  } as CSSProperties,
  cardLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.6rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  cardBody: {
    color: C.textFaint,
    fontSize: "0.85rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  } as CSSProperties,

  // Diagnostic
  diagnosticCard: {
    borderRadius: 10,
    padding: "1rem 1.1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.85rem",
  } as CSSProperties,

  diagnosticLabel: {
    fontSize: "0.88rem",
    fontWeight: 700,
    marginTop: "0.2rem",
    fontFamily: "sans-serif",
  } as CSSProperties,

  // Issues
  issuesList: {
    display: "grid",
    gap: "0.55rem",
    marginTop: "0.3rem",
  } as CSSProperties,
  issueItem: {
    display: "flex",
    gap: "0.55rem",
    alignItems: "flex-start",
  } as CSSProperties,
  issueDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    marginTop: "0.35rem",
  } as CSSProperties,
  issueText: {
    fontSize: "0.79rem",
    color: C.textSoft,
    lineHeight: 1.5,
    fontFamily: "sans-serif",
  } as CSSProperties,

  documentList: {
    display: "grid",
    gap: "0.65rem",
    marginTop: "0.4rem",
  } as CSSProperties,
  documentItem: {
    display: "grid",
    gap: "0.55rem",
    padding: "0.75rem",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: "rgba(255,255,255,0.025)",
  } as CSSProperties,
  documentTitle: {
    color: C.text,
    fontSize: "0.82rem",
    fontWeight: 700,
    lineHeight: 1.35,
    fontFamily: "sans-serif",
  } as CSSProperties,
  documentDescription: {
    color: C.textFaint,
    fontSize: "0.76rem",
    lineHeight: 1.45,
    marginTop: "0.25rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  documentWarning: {
    color: "#c97a7a",
    fontSize: "0.74rem",
    marginTop: "0.3rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  documentVisible: {
    color: "#7ec97e",
    fontSize: "0.74rem",
    marginTop: "0.3rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
  } as CSSProperties,

  // Textarea
  textarea: {
    width: "100%",
    minHeight: 120,
    marginTop: "0.2rem",
    marginBottom: "0.7rem",
    padding: "0.75rem",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.83rem",
    lineHeight: 1.55,
    resize: "vertical" as const,
    fontFamily: "sans-serif",
    outline: "none",
    boxSizing: "border-box" as const,
  } as CSSProperties,

  // Buttons
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "0.6rem 1rem",
    background: C.gold,
    color: "#1a1510",
    border: "none",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    textAlign: "center" as const,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s ease",
    boxSizing: "border-box" as const,
  } as CSSProperties,
  btnGhost: {
    display: "block",
    width: "100%",
    padding: "0.6rem 1rem",
    background: "transparent",
    color: C.gold,
    border: `1px solid rgba(196,169,106,0.3)`,
    borderRadius: 6,
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
    letterSpacing: "0.02em",
    textAlign: "center" as const,
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease",
    boxSizing: "border-box" as const,
  } as CSSProperties,

  fieldLabel: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontSize: "0.78rem",
    fontFamily: "sans-serif",
  } as CSSProperties,

  selectInput: {
    width: "100%",
    padding: "0.6rem 0.7rem",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.82rem",
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    fontFamily: "sans-serif",
  } as CSSProperties,

  // Nav
  navGroup: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  } as CSSProperties,
  navGroupLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.8rem",
    fontFamily: "sans-serif",
  } as CSSProperties,
  navBtns: {
    display: "grid",
    gap: "0.45rem",
    marginBottom: "0.8rem",
  } as CSSProperties,
  navLinks: {
    display: "grid",
    gap: "0.3rem",
    borderTop: `1px solid ${C.border}`,
    paddingTop: "0.7rem",
    marginTop: "0.1rem",
  } as CSSProperties,
  navLink: {
    fontSize: "0.78rem",
    color: C.textFaint,
    textDecoration: "none",
    fontFamily: "sans-serif",
    padding: "0.25rem 0",
  } as CSSProperties,

  // Alert
  alert: {
    borderLeft: "3px solid",
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    borderRadius: "0 6px 6px 0",
    fontFamily: "sans-serif",
  } as CSSProperties,
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
  @keyframes selFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes selSpin {
    to { transform: rotate(360deg); }
  }

  .sel-spinner {
    width: 34px; height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(196,169,106,0.15);
    border-top-color: #c4a96a;
    animation: selSpin 0.75s linear infinite;
  }

  .sel-question-card:hover {
    border-color: rgba(196,169,106,0.28) !important;
  }

  .sel-answer-btn:hover {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(196,169,106,0.07) !important;
    color: rgba(255,255,255,0.75) !important;
  }

  .sel-btn-primary:hover {
    background: #d4a843 !important;
  }

  .sel-btn-ghost:hover {
    background: rgba(196,169,106,0.09) !important;
    border-color: rgba(196,169,106,0.5) !important;
  }

  .sel-textarea:focus {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(255,255,255,0.05) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.07);
  }

  .sel-breadcrumb:hover {
    opacity: 1 !important;
  }

  .sel-nav-link:hover {
    color: rgba(196,169,106,0.7) !important;
  }

  @media (max-width: 860px) {
    .sel-layout {
      grid-template-columns: 1fr !important;
    }
  }
`;
