# Réconciliation locale de l'historique des migrations Supabase

Date : 4 août 2026  
Branche : `chore/daily-lot1-foundation-audit`  
HEAD audité : `43dc45f562cb2fbe8c5f4ccf40422379cba4ff2d`

## Périmètre

Le dry-run Daily Lot 1A échoue avec `LegacyDbPushMissingLocalError` car 27 migrations présentes dans l'historique distant Supabase sont absentes du dossier local `supabase/migrations`.

Cette mission a été limitée à une recherche locale en lecture seule dans l'historique Git :

- branches locales ;
- branches `origin/*` déjà présentes localement ;
- worktrees ;
- `git log --all` ;
- `git rev-list --all` ;
- `git ls-tree` ;
- `git show` / blobs Git ;
- `git branch --all --contains`.

Aucune migration n'a été copiée dans `supabase/migrations`.

## Garde-fous respectés

- Aucun `supabase migration repair`.
- Aucun `supabase db pull`.
- Aucun `supabase migration fetch`.
- Aucun `supabase db push` réel.
- Aucune écriture distante.
- Aucun push Git.
- Aucun fichier SQL historique existant modifié.
- Aucun contenu SQL inventé, régénéré ou reconstruit depuis le schéma distant.

## Résultat synthétique

- Migrations recherchées : 27.
- Migrations retrouvées exactement : 27.
- Migrations avec plusieurs variantes de contenu : 0.
- Migrations introuvables : 0.

Chaque timestamp a été retrouvé avec une seule variante de blob Git. Les SHA-256 ci-dessous sont calculés sur le contenu exact du blob Git.

## Tableau de réconciliation

| Timestamp | Nom du fichier | Commit source | Branche/ref source | Chemin source | SHA-256 | Statut | Risque ou remarque |
|---|---|---|---|---|---|---|---|
| `20260729220806` | `20260729220806_create_forge_cody_planning.sql` | `f0aa5277d1aed86df39118f8f1f89f90ccf9613f` | `feature/forge-cody-planning` | `supabase/migrations/20260729220806_create_forge_cody_planning.sql` | `7F1F19B407BB5ADD14F1A13D9F1B1DE4F95B2CD3BCFBE38CB07908EE3C68B279` | retrouvé exactement | Une seule variante détectée. |
| `20260729225608` | `20260729225608_require_current_validated_forge_plan.sql` | `f0aa5277d1aed86df39118f8f1f89f90ccf9613f` | `feature/forge-cody-planning` | `supabase/migrations/20260729225608_require_current_validated_forge_plan.sql` | `7FA35C8839EF21E89CF1C9704BE4D37EDBB2CCCF0B38552FF6389127323F772D` | retrouvé exactement | Une seule variante détectée. |
| `20260729232319` | `20260729232319_add_forge_mission_priority_controls.sql` | `89093bc4e1e66c5f54d53a74b7a9db328be9bf0a` | `feature/forge-cody-planning` | `supabase/migrations/20260729232319_add_forge_mission_priority_controls.sql` | `D0DC96FFDE23379FA729B559E44684B95E66EA7785A95A7A684458D30AF66D7F` | retrouvé exactement | Une seule variante détectée. |
| `20260729232320` | `20260729232320_add_forge_mission_pause_and_queue_guards.sql` | `89093bc4e1e66c5f54d53a74b7a9db328be9bf0a` | `feature/forge-cody-planning` | `supabase/migrations/20260729232320_add_forge_mission_pause_and_queue_guards.sql` | `6A6E7D30F9F25B6BD167635FAAF55FFFDB99A5D2986B662071FF38829B6383A5` | retrouvé exactement | Une seule variante détectée. |
| `20260730000301` | `20260730000301_create_forge_mission_checkpoints.sql` | `ff7edf659261e6f7ef7b3f97967f688282b3d6a7` | `feature/forge-cody-checkpoints` | `supabase/migrations/20260730000301_create_forge_mission_checkpoints.sql` | `26D4541B2B28FE4151D9CF0A064CC03DD8059A146B4452D44C11104F0FF599D4` | retrouvé exactement | Une seule variante détectée. |
| `20260730000302` | `20260730000302_integrate_forge_mission_checkpoints.sql` | `ff7edf659261e6f7ef7b3f97967f688282b3d6a7` | `feature/forge-cody-checkpoints` | `supabase/migrations/20260730000302_integrate_forge_mission_checkpoints.sql` | `7BA3BEF478BD8C50F4EC2A71C24616454561D28671E317FEA6A67AB99C8965BA` | retrouvé exactement | Une seule variante détectée. |
| `20260730010101` | `20260730010101_create_forge_mission_incidents.sql` | `3b14cfd8052bb4227e2861e816d5e2b693fee06a` | `feature/forge-cody-error-handling` | `supabase/migrations/20260730010101_create_forge_mission_incidents.sql` | `87C05A4EC0C89325A380206D5CFB61C6DD50D1C605189057F462BC12EED362DA` | retrouvé exactement | Une seule variante détectée. |
| `20260730010102` | `20260730010102_integrate_forge_mission_incidents.sql` | `3b14cfd8052bb4227e2861e816d5e2b693fee06a` | `feature/forge-cody-error-handling` | `supabase/migrations/20260730010102_integrate_forge_mission_incidents.sql` | `219B936B4419B07AE19CE87A61380517EEDB030FD03C889C5E6EF65BC6A2B13E` | retrouvé exactement | Une seule variante détectée. |
| `20260730010103` | `20260730010103_add_forge_incident_manual_resume.sql` | `3b14cfd8052bb4227e2861e816d5e2b693fee06a` | `feature/forge-cody-error-handling` | `supabase/migrations/20260730010103_add_forge_incident_manual_resume.sql` | `2E811275B8EFC3DBFA061BB0558224AA388DDD3164C12F9A60ED76B998546BE8` | retrouvé exactement | Une seule variante détectée. |
| `20260730014001` | `20260730014001_enforce_current_validated_forge_plan.sql` | `b2a323e6fef55dc9d61a8bc87e59749f72e78591` | `feature/forge-cody-plan-enforcement` | `supabase/migrations/20260730014001_enforce_current_validated_forge_plan.sql` | `65529AF6C18004E9ECBD13BBAFA5B04E028D0735AE5895C8340A47A76FD74D02` | retrouvé exactement | Une seule variante détectée. |
| `20260730014002` | `20260730014002_integrate_plan_revalidation_checkpoints.sql` | `b2a323e6fef55dc9d61a8bc87e59749f72e78591` | `feature/forge-cody-plan-enforcement` | `supabase/migrations/20260730014002_integrate_plan_revalidation_checkpoints.sql` | `148AD26FFC5D08547927FB05012DEC11126780AA93D3A994AAD1C6355596375A` | retrouvé exactement | Une seule variante détectée. |
| `20260730022120` | `20260730022120_add_forge_human_control.sql` | `f01e4d7215bd6eed1008a075e2d4f044c7c192dd` | `feature/forge-cody-human-control` | `supabase/migrations/20260730022120_add_forge_human_control.sql` | `05FA7C5F14D2872AB0F52BF7F147DD3935F01C3DDAF66E0ABFF78A437C00DECC` | retrouvé exactement | Une seule variante détectée. |
| `20260730102000` | `20260730102000_allow_paused_forge_mission_abandonment.sql` | `f01e4d7215bd6eed1008a075e2d4f044c7c192dd` | `feature/forge-cody-human-control` | `supabase/migrations/20260730102000_allow_paused_forge_mission_abandonment.sql` | `3AFF133F07E081817D126070B42369F5929BDEC85FE4592163BE2EB565C409CA` | retrouvé exactement | Une seule variante détectée. |
| `20260730102500` | `20260730102500_allow_authenticated_forge_admin_guard.sql` | `f01e4d7215bd6eed1008a075e2d4f044c7c192dd` | `feature/forge-cody-human-control` | `supabase/migrations/20260730102500_allow_authenticated_forge_admin_guard.sql` | `684D6AD5C3A8CF9435319019E68C630CED9CEDBA273F7A2AD7BD7C238C38C8F2` | retrouvé exactement | Une seule variante détectée. |
| `20260730103000` | `20260730103000_allow_admin_forge_control_rpc_writes.sql` | `f01e4d7215bd6eed1008a075e2d4f044c7c192dd` | `feature/forge-cody-human-control` | `supabase/migrations/20260730103000_allow_admin_forge_control_rpc_writes.sql` | `E729DB6BFA2E182A86469B8534FCF4A9045EC6CFB508BD8D1D72F6CB021CC607` | retrouvé exactement | Une seule variante détectée. |
| `20260730103500` | `20260730103500_use_current_forge_checkpoint_for_instruction.sql` | `f01e4d7215bd6eed1008a075e2d4f044c7c192dd` | `feature/forge-cody-human-control` | `supabase/migrations/20260730103500_use_current_forge_checkpoint_for_instruction.sql` | `0CF4CA1531EE241DCFAE45C0BBA970BBE00D1D58F9AB343B21F80ECC349588C6` | retrouvé exactement | Une seule variante détectée. |
| `20260730111500` | `20260730111500_create_forge_alert_center.sql` | `40aeee5388e8a6d22226f836438535cadf1301f0` | `feature/forge-cody-alert-center` | `supabase/migrations/20260730111500_create_forge_alert_center.sql` | `0897ACBD4BBDFC5A8FDDF5A5081D3702E3613AC9C5747537DF468741EDCCF9E5` | retrouvé exactement | Une seule variante détectée. |
| `20260730115000` | `20260730115000_allow_admin_alert_trigger_writes.sql` | `40aeee5388e8a6d22226f836438535cadf1301f0` | `feature/forge-cody-alert-center` | `supabase/migrations/20260730115000_allow_admin_alert_trigger_writes.sql` | `03D55CC77FA26C9381D26DBCCF8F763054731D725A2244D1BC81B817277F4F8E` | retrouvé exactement | Une seule variante détectée. |
| `20260730120500` | `20260730120500_add_forge_alert_audit_events.sql` | `40aeee5388e8a6d22226f836438535cadf1301f0` | `feature/forge-cody-alert-center` | `supabase/migrations/20260730120500_add_forge_alert_audit_events.sql` | `FE734CC574F5BBF60597F44E68ED1CB599AEE0FC179CD747F18B497149E3DABB` | retrouvé exactement | Une seule variante détectée. |
| `20260730143000` | `20260730143000_create_forge_telegram_alert_delivery.sql` | `c9ea62fde9d3e6e657c728a321e6aa54deaf3692` | `feature/forge-companion-telegram-alerts` | `supabase/migrations/20260730143000_create_forge_telegram_alert_delivery.sql` | `D6E709CD62384A6B563308F5BACA1F6795D00F4F14F1E4FB6BC6453E024D23FF` | retrouvé exactement | Une seule variante détectée. |
| `20260730150000` | `20260730150000_schedule_forge_telegram_worker.sql` | `9749eafd2a76b6303da9d311a796ada115add79f` | `feature/forge-telegram-supabase-cron` | `supabase/migrations/20260730150000_schedule_forge_telegram_worker.sql` | `ACDAE921C9E20B3E64AA4C3DB5514366B8F12D8BA33856162D8DDB7FE5EF25A1` | retrouvé exactement | Une seule variante détectée. |
| `20260730160000` | `20260730160000_enforce_forge_admin_only.sql` | `f78537314fed2de610f090c85f873024a28021cd` | `feature/forge-admin-only-access` | `supabase/migrations/20260730160000_enforce_forge_admin_only.sql` | `285B40E0EA186F2DDFC9948114946278FF6E49782C5D7573D3CE00C2DE3D2D29` | retrouvé exactement | Une seule variante détectée. |
| `20260730170000` | `20260730170000_add_forge_mission_archiving.sql` | `df4a4ee6dcc5fda93d11cf983db179a7f9552db1` | `feature/forge-mission-archiving` | `supabase/migrations/20260730170000_add_forge_mission_archiving.sql` | `59DFA48C54362E9FD6661E2E73649B45F0C94E481A62FD12E03A89C65B557473` | retrouvé exactement | Une seule variante détectée. |
| `20260730174200` | `20260730174200_connect_cody_human_actions_to_alerts.sql` | `8c0c08c47d35823c73291325ae48878d664c48f8` | `feature/forge-mission-archiving` | `supabase/migrations/20260730174200_connect_cody_human_actions_to_alerts.sql` | `432303D5BBC17B26639B453BC4B2443E983D699917B000FF0697D08F5C1F09EE` | retrouvé exactement | Une seule variante détectée. |
| `20260730184300` | `20260730184300_create_forge_execution_engine.sql` | `fe2dc24d408cdf6bad2013e9d8287a1feed391da` | `feature/forge-cody-execution-engine` | `supabase/migrations/20260730184300_create_forge_execution_engine.sql` | `8585356F6A09C3F0C43E3B94B08BC80647B4E3F59FEBC8C3D04C6F4281452E92` | retrouvé exactement | Une seule variante détectée. |
| `20260730204145` | `20260730204145_extend_forge_controlled_edit_execution.sql` | `63dcccf42ce92bdd599cbd478d016c15fede62e4` | `feature/forge-cody-execution-engine` | `supabase/migrations/20260730204145_extend_forge_controlled_edit_execution.sql` | `DAC3A5359608B1E5DC6EFEC1558CFC3D0E709595DE9FBAE2BAF23AA3E2137F8C` | retrouvé exactement | Une seule variante détectée. |
| `20260730210452` | `20260730210452_fix_forge_execution_step_grants.sql` | `63dcccf42ce92bdd599cbd478d016c15fede62e4` | `feature/forge-cody-execution-engine` | `supabase/migrations/20260730210452_fix_forge_execution_step_grants.sql` | `C11B80EF6A9434616A480FE84D2FA39A48BAEE2A13493AB8D79C88DBF2EF3253` | retrouvé exactement | Une seule variante détectée. |

## Branches et commits sources principaux

- `feature/forge-cody-planning` : `f0aa5277d1aed86df39118f8f1f89f90ccf9613f`, `89093bc4e1e66c5f54d53a74b7a9db328be9bf0a`
- `feature/forge-cody-checkpoints` : `ff7edf659261e6f7ef7b3f97967f688282b3d6a7`
- `feature/forge-cody-error-handling` : `3b14cfd8052bb4227e2861e816d5e2b693fee06a`
- `feature/forge-cody-plan-enforcement` : `b2a323e6fef55dc9d61a8bc87e59749f72e78591`
- `feature/forge-cody-human-control` : `f01e4d7215bd6eed1008a075e2d4f044c7c192dd`
- `feature/forge-cody-alert-center` : `40aeee5388e8a6d22226f836438535cadf1301f0`
- `feature/forge-companion-telegram-alerts` : `c9ea62fde9d3e6e657c728a321e6aa54deaf3692`
- `feature/forge-telegram-supabase-cron` : `9749eafd2a76b6303da9d311a796ada115add79f`
- `feature/forge-admin-only-access` : `f78537314fed2de610f090c85f873024a28021cd`
- `feature/forge-mission-archiving` : `df4a4ee6dcc5fda93d11cf983db179a7f9552db1`, `8c0c08c47d35823c73291325ae48878d664c48f8`
- `feature/forge-cody-execution-engine` : `fe2dc24d408cdf6bad2013e9d8287a1feed391da`, `63dcccf42ce92bdd599cbd478d016c15fede62e4`

La branche/ref `audit/selen-global-cleanup` contient également l'ensemble des 27 fichiers retrouvés.

## Vérification du lien avec l'historique distant

Les 27 timestamps audités correspondent à la liste des versions distantes absentes localement signalées par `supabase migration list` et par l'erreur `LegacyDbPushMissingLocalError` du dry-run Daily Lot 1A.

Aucune commande de réparation, de pull, de fetch de migrations ou d'application distante n'a été exécutée pendant cet audit.

## Conclusion

Toutes les migrations distantes absentes localement ont été retrouvées exactement dans l'historique Git. Aucune variante divergente n'a été détectée.

Prochaine étape possible, uniquement après nouvelle autorisation explicite : restaurer localement ces 27 fichiers depuis les blobs Git exacts listés ci-dessus, sans modifier leur contenu.
