import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/agent/daily/session-dossiers/[id]/closure/page.tsx", import.meta.url),
  "utf8",
);

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Section introuvable : ${startMarker}`);
  return source.slice(start, end);
}

test("les trois actions de clôture vérifient le périmètre avant leur RPC service-role", () => {
  const actions = [
    ["closeDossier", "archiveDossier", "daily_close_session_dossier"],
    ["archiveDossier", "reopenDossier", "daily_archive_session_dossier"],
    ["reopenDossier", "SessionClosurePage", "daily_reopen_session_dossier"],
  ];
  for (const [name, next, rpc] of actions) {
    const action = section(`async function ${name}(`, name === "reopenDossier" ? "export default async function " + next : "async function " + next);
    assert.match(action, /await requireSupportAgent\(\)/);
    assert.match(action, /await requireScopedClosureSession\(sessionId, auth\.email, admin\)/);
    assert.ok(action.indexOf("await requireScopedClosureSession") < action.indexOf(`admin.rpc("${rpc}"`), `${name} doit vérifier le périmètre avant la mutation`);
  }
});

test("la vérification refuse les sessions inconnues, les erreurs de lecture et les organisations hors affectation", () => {
  const guard = section("async function requireScopedClosureSession(", "function revalidateDossier(");
  assert.match(guard, /\.from\("daily_sessions"\)/);
  assert.match(guard, /if \(error\) throw new Error/);
  assert.match(guard, /!session\?\.organisation_id/);
  assert.match(guard, /isDailyOrganisationInAgentScope\(agentEmail, session\.organisation_id\)/);
  assert.match(guard, /throw new Error\("Accès refusé à cette session\."\)/);
});

test("la page vérifie l'affectation avant de lire les pièces de clôture", () => {
  const page = source.slice(source.indexOf("export default async function SessionClosurePage"));
  assert.match(page, /await requireSupportAgent\(\)/);
  const scope = page.indexOf("await isDailyOrganisationInAgentScope(auth.email, session.organisation_id)");
  const dossier = page.indexOf('admin.from("daily_session_dossiers")');
  const checklist = page.indexOf('admin.from("daily_session_checklist_items")');
  assert.ok(scope >= 0 && dossier > scope && checklist > scope, "Aucune lecture métier avant le contrôle de périmètre");
  assert.match(page, /\.eq\("session_id", id\)\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(page, /if \(dossierError \|\| itemsError\) throw new Error/);
});
