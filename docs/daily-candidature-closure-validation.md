# Clôture des candidatures et sauvegarde de l’analyse

L’OF conserve la décision d’acceptation ou de refus. Une analyse ouverte auparavant ne doit pas écraser ses notes plus récentes ni provoquer un email « décision attendue » lorsque sa sauvegarde n’a finalement modifié aucune candidature.

Le formulaire transmet `candidature_updated_at`, issu du dossier réellement ouvert. L’action revérifie le périmètre, la décision courante, l’horodatage, la formation et les prérequis humains. La sauvegarde conditionne l’écriture à la formation, au statut et à cet horodatage. Elle exige le retour d’une ligne modifiée avant notification ou revalidation. Un conflit demande une nouvelle lecture du dossier.

Huit tests exécutent le vrai rendu et la vraie action avec transport email isolé. Cinq échouaient avant correction : horodatage absent du formulaire, formulaire périmé, version ouverte absente, décision OF concurrente et synthèse concurrente. Les tests confirment aussi l’enregistrement normal, la disparition des dossiers acceptés/refusés de la liste active, leur consultation en lecture seule, et les contrôles d’affectation et de prérequis.

Aucune décision OF, trace historique, règle Auth/RLS, migration ou donnée de production n’est modifiée pendant la recette. Aucun email réel. La recette navigateur authentifiée du parcours Avant reste distincte des validations automatisées du commit exact sur le Lenovo et Vercel.
