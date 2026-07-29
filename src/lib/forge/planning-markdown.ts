import type { MissionPlanDraft } from "./types";

function list(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- Aucun élément.";
}

export function buildPlanningMarkdown(plan: Omit<MissionPlanDraft, "markdownContent">) {
  return `# Cadrage de mission Cody — ${plan.proposedTitle}

## Résumé

${plan.summary}

## Objectif fonctionnel

${plan.functionalObjective}

## Périmètre inclus

${list(plan.includedScope)}

## Périmètre exclu

${list(plan.excludedScope)}

## Contraintes

${list(plan.constraints)}

## Zones du dépôt probablement concernées

${list(plan.repositoryAreas)}

## Dépendances techniques potentielles

${list(plan.technicalDependencies)}

## Risques et points de vigilance

${plan.risks.length
    ? plan.risks.map((risk) => `- **${risk.level} — ${risk.label}** : ${risk.detail}`).join("\n")
    : "- Aucun risque identifié."}

## Questions réellement bloquantes

${list(plan.blockingQuestions)}

## Questions non bloquantes

${list(plan.nonBlockingQuestions)}

## Hypothèses raisonnables

${list(plan.assumptions)}

## Recommandations facultatives

${list(plan.recommendations)}

## Critères d’acceptation

${list(plan.acceptanceCriteria)}

## Plan d’exécution

${plan.executionSteps.length
    ? [...plan.executionSteps]
      .sort((a, b) => a.position - b.position)
      .map((step, index) => `${index + 1}. **${step.title}** — ${step.detail}`)
      .join("\n")
    : "1. Plan à compléter."}

## Vérifications prévues

${list(plan.verificationPlan)}

> Ce document est un cadrage. Cody n’a encore modifié aucun fichier et n’a exécuté aucune étape.
`;
}
