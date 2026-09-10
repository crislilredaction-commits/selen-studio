import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx",import.meta.url),"utf8");

test("Studio lit le statut canonique de positionnement depuis les inscriptions",()=>{assert.match(page,/daily_session_enrolments/);assert.match(page,/positioning_status/);assert.match(page,/completedPositionings/)});
test("les inscriptions abandonnées ne participent pas au suivi de positionnement",()=>{assert.match(page,/\["declined","cancelled","abandoned"\]/)});
test("le Dossier complet montre qui a réalisé ou non son positionnement",()=>{assert.match(page,/Positionnements \(\{completedPositionings\}\/\{enrolments\.length\}\)/);assert.match(page,/Réalisé/);assert.match(page,/À faire/);assert.match(page,/Positionnements réalisés/)});
test("Studio n'expose pas les réponses détaillées du positionnement",()=>{assert.doesNotMatch(page,/daily_positioning_responses/);assert.doesNotMatch(page,/question_snapshot/);assert.doesNotMatch(page,/answers jsonb/)});
