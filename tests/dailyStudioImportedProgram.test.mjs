import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dailyPrivateFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const require = createRequire(import.meta.url);
function elements(node, result = []) {
  if (Array.isArray(node)) { for (const child of node) elements(child, result); }
  else if (node && typeof node === "object" && node.props) { result.push(node); elements(node.props.children, result); }
  return result;
}
function visibleText(node) {
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? visibleText(node.props.children) : "";
}
function editor(f) {
  const invalidations = [];
  const shared = isolatedTsModule("src/components/daily/DailyFormationReview.tsx", {
    ...f.modules,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: "a" },
    "next/cache": { revalidatePath: path => invalidations.push(path) },
    "next/navigation": { redirect: path => { throw new Error(`REDIRECT ${path}`); } },
    "@/lib/server/dailyOrganisationScope": f.scope,
  });
  return { shared, invalidations };
}
function completedForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ formation_id: ids.formation, title: "Programme saisi", global_objective: "Objectif complet", learning_objectives: "Objectif 1\nObjectif 2", duration_hours: "14", duration_days: "2", detailed_program: "Module 1 puis module 2, exercices et mise en pratique." })) form.set(key, value);
  return form;
}
async function actionFixture() {
  const f = dailyPrivateFixture(); f.flags.allowWrites = true;
  Object.assign(f.formation, { status: "draft", creation_mode: "program_import", public_registration_token: "stable-existing-token", prerequisite_mode: "required", prerequisite_requirements: [{ id: "proof-1", label: "Diplôme requis", description: "Copie lisible" }] });
  const program = f.rows.daily_documents.find(row => row.id === ids.program);
  program.storage_path = `daily/${ids.of}/onboarding/program.pdf`;
  f.files.set(program.storage_path, f.files.get(f.source.storage_path));
  const h = editor(f);
  const tree = await h.shared.default({ formationId: ids.formation });
  const buttons = elements(tree).filter(item => item.type === "button" && item.props.formAction);
  assert.equal(buttons.length, 2);
  return { f, ...h, tree, save: buttons[0].props.formAction, validate: buttons[1].props.formAction };
}

test("avant la première session, l'agent ouvre l'original privé et les vrais prérequis de l'OF", async () => {
  const { tree } = await actionFixture();
  const links = elements(tree).filter(item => item.props.href).map(item => item.props.href);
  assert.ok(links.includes(`/agent/api/daily/formations/${ids.formation}/source-document?kind=program`));
  assert.ok(links.includes(`/agent/api/daily/formations/${ids.formation}/source-document?kind=positioning`));
  assert.match(visibleText(tree), /Diplôme requis/); assert.match(visibleText(tree), /Copie lisible/);
  assert.ok(!links.some(link => String(link).startsWith("https://www.selen-editions.fr/api/client")));
  assert.ok(!links.some(link => String(link).includes("storage")));
});

test("une sauvegarde puis validation sans session utilise la formation canonique et garde le lien stable", async () => {
  const { f, save, validate, invalidations } = await actionFixture();
  const form = completedForm(); form.set("organisation_id", ids.otherOf); form.set("public_registration_token", "forged");
  await assert.rejects(save(form), /REDIRECT .*saved=draft/);
  assert.equal(f.formation.status, "draft"); assert.equal(f.rpcs.length, 0);
  await assert.rejects(validate(form), /REDIRECT .*saved=validated/);
  assert.equal(f.formation.status, "validated");
  assert.equal(f.formation.title, "Programme saisi");
  assert.equal(f.formation.public_registration_token, "stable-existing-token");
  assert.equal(f.formation.organisation_id, ids.of);
  assert.equal(f.rpcs.length, 1); assert.equal(f.rpcs[0].args.p_formation_id, ids.formation);
  assert.equal(f.formation.spontaneous_registration_task_status, "to_attach");
  assert.ok(invalidations.includes("/agent/daily")); assert.ok(invalidations.includes("/agent"));
  assert.ok(invalidations.includes(`/agent/daily/organisations/${ids.of}`));
  const writes = JSON.stringify(f.writes);
  assert.doesNotMatch(writes, /forged|public_registration_token|positioning_questionnaire_document_url/);
});

test("un contenu détaillé vide bloque la validation avant toute écriture", async () => {
  const { f, validate } = await actionFixture(); const form = completedForm(); form.delete("detailed_program");
  await assert.rejects(validate(form), /contenu détaillé/); assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
});

for (const [name, change] of [
  ["original programme d'un autre OF", f => f.rows.daily_documents.find(row => row.id === ids.program).organisation_id = ids.otherOf],
  ["questionnaire périmé", f => f.source.is_current = false],
  ["URL externe à la place de l'original", f => f.formation.detailed_program_document_url = "https://untrusted.example.test/file.pdf"],
]) {
  test(`${name} : aucune validation ni écriture`, async () => {
    const { f, validate } = await actionFixture(); change(f);
    await assert.rejects(validate(completedForm()), /Document source privé introuvable/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
  });
}

for (const [name, change] of [
  ["agent réaffecté depuis l'ouverture", f => f.rows.daily_organisation_assignments[0].agent_profile_id = "agent-b"],
  ["compte inactif depuis l'ouverture", f => f.rows.agent_profiles[0].is_active = false],
  ["OF désabonné depuis l'ouverture", f => f.rows.daily_subscriptions[0].status = "cancelled"],
]) {
  test(`${name} : l'action revérifie les droits`, async () => {
    const { f, validate } = await actionFixture(); change(f);
    await assert.rejects(validate(completedForm()), /Programme introuvable/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
  });
}

test("l'action refuse une session forgée d'un autre OF même si la formation est autorisée", async () => {
  const { f, validate } = await actionFixture();
  f.rows.daily_sessions.push({ id: ids.session, organisation_id: ids.otherOf, formation_id: ids.formation, status: "active" });
  const form = completedForm(); form.set("session_id", ids.session);
  await assert.rejects(validate(form), /ne correspond pas à cette session/); assert.equal(f.writes.length, 0);
});

test("l'édition concurrente est détectée au lieu d'écraser les nouvelles données", async () => {
  const { f, save } = await actionFixture(); f.formation.updated_at = "2026-10-02T08:00:00Z";
  f.flags.beforeUpdate = () => { f.formation.updated_at = "2026-10-02T09:00:00Z"; f.formation.title = "Modification concurrente"; };
  await assert.rejects(save(completedForm()), /Le programme a changé/);
  assert.equal(f.formation.title, "Modification concurrente"); assert.equal(f.rpcs.length, 0);
});

test("la validation doit être confirmée par le statut réel après la RPC", async () => {
  const { f, validate } = await actionFixture(); f.flags.validateStatus = false;
  await assert.rejects(validate(completedForm()), /n’a pas confirmé le statut validé/);
  assert.equal(f.formation.status, "draft"); assert.equal(f.formation.spontaneous_registration_task_status, undefined);
});

test("la même revue reste accessible depuis une session du bon OF", async () => {
  const f = dailyPrivateFixture(); f.formation.status = "review";
  f.rows.daily_sessions.push({ id: ids.session, organisation_id: ids.of, formation_id: ids.formation, status: "active", internal_reference: "Session exemple" });
  const tree = await editor(f).shared.default({ sessionId: ids.session });
  assert.match(visibleText(tree), /Session exemple/);
  assert.ok(elements(tree).some(item => item.props.href === `/agent/daily/session-dossiers/${ids.session}/full`));
});

test("l'agent hors périmètre ne reçoit pas les champs ni le document programme", async () => {
  const f = dailyPrivateFixture(); f.auth.value.email = "agent-b@example.test";
  const tree = await editor(f).shared.default({ formationId: ids.formation });
  assert.equal(visibleText(tree), "Programme introuvable."); assert.equal(f.downloads.length, 0);
});

test("le téléchargement programme revérifie le périmètre et ne redirige pas vers Storage", async () => {
  const f = dailyPrivateFixture(); const response = await f.getSource();
  assert.equal(response.status, 200); assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  f.auth.value.email = "agent-b@example.test"; f.downloads.length = 0;
  assert.equal((await f.getSource()).status, 404); assert.equal(f.downloads.length, 0);
});

for (const [kind, label] of [["program", "programme importé"], ["positioning", "questionnaire propre OF"]]) {
  for (const [state, mutate, expected] of [
    ["absent du stockage", (f, doc) => f.files.delete(doc.storage_path), /Téléchargement indisponible/],
    ["altéré dans le stockage", (f, doc) => f.files.set(doc.storage_path, Buffer.from("%PDF-fichier-altéré")), /ne correspond plus à sa preuve/],
  ]) {
    test(`${label} ${state} : la validation reste ouverte sans écriture ni RPC`, async () => {
      const { f, validate } = await actionFixture();
      const doc = kind === "program" ? f.rows.daily_documents.find(row => row.id === ids.program) : f.source;
      mutate(f, doc);
      await assert.rejects(validate(completedForm()), expected);
      assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
      assert.equal(f.formation.status, "draft");
      assert.ok(f.downloads.includes(doc.storage_path));
    });
  }
}

test("la validation vérifie les deux fichiers privés même avec des SHA-256 en majuscules", async () => {
  const { f, validate } = await actionFixture();
  const program = f.rows.daily_documents.find(row => row.id === ids.program);
  program.sha256 = program.sha256.toUpperCase();
  f.source.sha256 = f.source.sha256.toUpperCase();
  await assert.rejects(validate(completedForm()), /REDIRECT .*saved=validated/);
  assert.deepEqual(f.downloads, [program.storage_path, f.source.storage_path]);
  assert.equal(f.formation.status, "validated"); assert.equal(f.rpcs.length, 1);
});
