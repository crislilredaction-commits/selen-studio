import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/server/studioClientFollowups.ts", import.meta.url), "utf8");
const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const businessTime = await readFile(new URL("../src/lib/franceBusinessTime.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260909125000_daily_signature_client_reminders.sql", import.meta.url), "utf8");

test("les relances automatiques J+3 et J+6 restent cachées de Studio",()=>{assert.match(source,/SIGNATURE_J3_STAGE="automatic_email_j3"/);assert.match(source,/SIGNATURE_J6_STAGE="automatic_email_j6"/);assert.match(source,/\[SIGNATURE_J3_STAGE,SIGNATURE_J6_STAGE\]\.includes\(followupStage\(row\)\)\)return\[\]/)});
test("aucune relance client n'apparaît dans le Pilotage avant son échéance",()=>{assert.match(source,/if\(!isDue\(row\.due_at\)\)return\[\]/);assert.match(source,/function isDue\(value:string\|null\)/)});
test("J+9 devient l'appel et l'urgence avant démarrage est reconnue",()=>{assert.match(source,/SIGNATURE_J9_STAGE="phone_call_j9"/);assert.match(source,/SIGNATURE_URGENT_STAGE="agent_urgent_before_start"/);assert.match(source,/if\(!isDue\(row\.due_at\)\)return\[\]/)});
test("les 24 h ouvrées de J+6 et J+9 partent de leur échéance",()=>{assert.match(source,/\[SIGNATURE_J6_STAGE,SIGNATURE_J9_STAGE\]\.includes\(followupStage\(row\)\)\)return row\.due_at/);assert.match(source,/AGENT_SHARED_AFTER_BUSINESS_HOURS=24/);assert.match(source,/isOverdueAfterBusinessHours/)});
test("la règle équipe passe à 24 h ouvrées sans réassignation",()=>{assert.match(tasks,/AGENT_SHARED_AFTER_BUSINESS_HOURS = 24/);assert.doesNotMatch(page,/24 h ouvrées · équipe/);assert.match(source,/assigned_agent_profile_id/);assert.match(source,/staff\.id===agentId\|\|overdueShared/)});
test("le calcul ouvré exclut week-ends et jours fériés français",()=>{assert.match(businessTime,/weekday === "Sat" \|\| parts\.weekday === "Sun"/);assert.match(businessTime,/frenchPublicHolidayKeys/);assert.match(businessTime,/07-14/)});
test("le schéma partagé autorise le rappel signature et sa clôture sans suppression",()=>{assert.match(migration,/daily_signature_pending_72h/);assert.match(migration,/'resolved'/);assert.doesNotMatch(migration,/drop table|delete from|truncate/i)});
test("une cible Studio explicite portée par la relance est prioritaire et reste interne à Studio",()=>{assert.match(source,/metadata\?\.action_href\|\|row\.metadata\?\.target_href\|\|row\.metadata\?\.studio_href/);assert.match(source,/href\.startsWith\("\/agent\/"\)\?href:null/);assert.match(source,/if\(exactHref\)return exactHref/)});
test("les relances Daily ouvrent l'action métier exacte quand session_id est connu",()=>{assert.match(source,/metadata\?\.session_id/);assert.match(source,/type\.includes\("satisfaction"\).*session-dossiers\/\$\{encoded\}\/satisfaction/s);assert.match(source,/type\.includes\("registration"\)\|\|type\.includes\("inscription"\).*daily\/sessions\/\$\{encoded\}/s);assert.match(source,/type\.includes\("attendance"\)\|\|type\.includes\("emarg"\)\|\|type\.includes\("signature"\).*session-dossiers\/\$\{encoded\}\/attendance/s);assert.match(source,/type\.includes\("document"\)\|\|type\.includes\("piece"\).*session-dossiers\/\$\{encoded\}\/documents/s);assert.match(source,/session-dossiers\/\$\{encoded\}\/full/);assert.match(source,/href:followupHref\(row,isDaily\)/)});
test("une relance non Daily conserve son dossier historique",()=>{assert.match(source,/row\.dossier_id\?`\/agent\/dossiers\/\$\{row\.dossier_id\}`:"\/agent\/relances"/)});
