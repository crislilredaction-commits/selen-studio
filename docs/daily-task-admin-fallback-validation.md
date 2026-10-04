# A6 — visibilité des tâches et secours admin

Les programmes à contrôler/importer et tâches de session restent dans le moteur canonique même si l’OF n’a pas encore d’agent. Le secours admin reçoit donc une tâche accessible dans Dashboard/Pilotage, avec son identité habituelle ; un agent tiers n’obtient pas le traitement d’une tâche sans affectation. Les points organisme `to_review`/`blocked` apparaissent par leur identifiant de checklist et leur lien direct dans le même moteur. Les états terminés restent dans l’historique.

Les tâches avec affectation conservent cette affectation et la règle existante de partage après 24 heures ouvrées. Aucune écriture d’affectation, Auth, RLS ou donnée réelle ; le moteur reste en lecture seule. Les tâches pré-audit/satisfaction et leurs gardes sont conservées.

Validation : cinq nouveaux cas comportementaux exécutent le moteur Dashboard et Pilotage réel avec frontières Supabase isolées, couvrant programme avant/après session, secours admin, absence de doublon, checklist organisme, phases/statuts et lien OF incohérent. Les dix cas comportementaux existants et les garde-fous restent conservés. La recette authentifiée et la suppression conditionnelle d’email par présence agent restent distinctes.
