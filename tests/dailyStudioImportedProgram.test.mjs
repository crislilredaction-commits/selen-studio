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
    "@/lib/dailyFormationCreationPolicy": isolatedTsModule("src/lib/dailyFormationCreationPolicy.ts"),
    "@/components/daily/DailyFormationReviewTabs": { default: "div" },
    "@/components/daily/DailyQuestionnairePreview": isolatedTsModule("src/components/daily/DailyQuestionnairePreview.tsx", { "react/jsx-runtime": require("react/jsx-runtime") }),
  });
  return { shared, invalidations };
}
const INITIAL_REVISION = "2026-10-03T08:00:00+00:00";
function completedForm(revision = INITIAL_REVISION) {
  const form = new FormData();
  form.set("formation_updated_at", revision ?? "");
  for (const [key, value] of Object.entries({ formation_id: ids.formation, title: "Programme saisi", global_objective: "Objectif complet", learning_objectives: "Objectif 1\nObjectif 2", duration_hours: "14", duration_days: "2", detailed_program: "Module 1 puis module 2, exercices et mise en pratique.", modality: "presentiel", target_audience: "Public professionnel", access_delays: "Deux semaines", price: "1200 euros TTC", pedagogical_resources: "Support et exercices", evaluation_methods: "Mise en situation", contact_phone: "0100000000", contact_email: "contact@example.test" })) form.set(key, value);
  return form;
}
async function actionFixture() {
  const f = dailyPrivateFixture(); f.flags.allowWrites = true;
  Object.assign(f.formation, { status: "draft", updated_at: INITIAL_REVISION, creation_mode: "program_import", public_registration_token: "stable-existing-token", prerequisite_mode: "required", prerequisite_requirements: [{ id: "proof-1", label: "Diplôme requis", description: "Copie lisible" }] });
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

for (const session of [false, true]) {
  test(`le programme original reste téléchargeable dans le dossier ${session ? "session" : "formation"} après validation`, async () => {
    const f = dailyPrivateFixture(); Object.assign(f.formation, { status: "validated", creation_mode: "program_import", updated_at: INITIAL_REVISION });
    if (session) f.rows.daily_sessions.push({ id: ids.session, organisation_id: ids.of, formation_id: ids.formation, status: "active" });
    const tree = await editor(f).shared.default(session ? { sessionId: ids.session } : { formationId: ids.formation });
    const all = elements(tree);
    const links = all.filter(item => item.props.href).map(item => item.props.href);
    assert.ok(links.includes(`/agent/api/daily/formations/${ids.formation}/source-document?kind=program`));
    assert.equal(all.filter(item => item.type === "button" && item.props.formAction).length, 1);
    assert.match(visibleText(tree), /Enregistrer les questionnaires/);
    assert.ok(all.filter(item => item.props.name && item.props.type !== "hidden" && item.props.type !== "file").every(item => item.props.disabled === true));
    assert.ok(!links.some(link => String(link).includes("storage")));
  });
}

test("une sauvegarde puis validation sans session utilise la formation canonique et garde le lien stable", async () => {
  const { f, save, validate, invalidations } = await actionFixture();
  const form = completedForm(); form.set("organisation_id", ids.otherOf); form.set("public_registration_token", "forged");
  await assert.rejects(save(form), /REDIRECT .*saved=draft/);
  assert.equal(f.formation.status, "draft"); assert.equal(f.rpcs.length, 0);
  form.set("formation_updated_at", f.formation.updated_at);
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

test("un positionnement propre OF sans original bloque la validation avant toute écriture", async () => {
  const { f, validate } = await actionFixture();
  f.formation.positioning_questionnaire_document_url = null;
  await assert.rejects(validate(completedForm()), /questionnaire|document|original/i);
  assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
  assert.notEqual(f.formation.status, "validated");
});

for (const [label, change] of [
  ["programme modifié", row => { row.title = "Contenu non relu"; row.updated_at = "2030-01-01T00:00:00Z"; }],
  ["formation archivée", row => { row.status = "archived"; }],
  ["formation déplacée vers un autre OF", row => { row.organisation_id = ids.otherOf; }],
]) {
  test(`${label} après sauvegarde : aucun contenu concurrent n’est validé`, async () => {
    const { f, validate } = await actionFixture();
    const originalRpc = f.admin.rpc.bind(f.admin);
    f.admin.rpc = async (name, args) => {
      change(f.formation);
      if (name === "daily_validate_formation_review" &&
        (f.formation.organisation_id !== args.p_organisation_id ||
          f.formation.updated_at !== args.p_expected_updated_at ||
          f.formation.status !== args.p_expected_status)) {
        return { data: null, error: { code: "P0001", message: "Formation modifiée" } };
      }
      return originalRpc(name, args);
    };
    await assert.rejects(validate(completedForm()), /programme a changé|Programme introuvable/i);
    assert.notEqual(f.formation.status, "validated");
    assert.equal(f.formation.spontaneous_registration_task_status, undefined);
  });
}

test("réaffectation après sauvegarde : la validation exige encore l’assignation courante", async () => {
  const { f, validate } = await actionFixture();
  const from = f.admin.from.bind(f.admin);
  f.admin.from = table => {
    const query = from(table);
    if (table === "daily_formations") {
      const update = query.update.bind(query);
      query.update = patch => {
        f.rows.daily_organisation_assignments[0].agent_profile_id = "agent-b";
        return update(patch);
      };
    }
    return query;
  };
  await assert.rejects(validate(completedForm()), /Programme introuvable/);
  assert.equal(f.rpcs.length, 0);
  assert.notEqual(f.formation.status, "validated");
});

test("la validation utilise la révision retournée par PostgreSQL, même si un trigger remplace l’horodatage envoyé", async () => {
  const { f, validate } = await actionFixture();
  const databaseRevision = "2030-02-01T09:30:00.123456+00:00";
  const from = f.admin.from.bind(f.admin);
  f.admin.from = table => {
    const query = from(table);
    if (table === "daily_formations") {
      let saving = false;
      const update = query.update.bind(query), then = query.then.bind(query);
      query.update = patch => { saving = true; return update(patch); };
      query.then = (resolve, reject) => then(response => {
        if (saving && response.data) {
          f.formation.updated_at = databaseRevision;
          response.data.updated_at = databaseRevision;
        }
        return resolve(response);
      }, reject);
    }
    return query;
  };
  await assert.rejects(validate(completedForm()), /REDIRECT .*saved=validated/);
  assert.notEqual(f.writes[0].patch.updated_at, databaseRevision);
  assert.equal(f.rpcs[0].args.p_expected_updated_at, databaseRevision);
  assert.equal(f.rpcs[0].args.p_organisation_id, ids.of);
  assert.equal(f.rpcs[0].args.p_expected_status, "draft");
  assert.equal(f.writes.length, 1, "le marqueur de tâche est écrit dans la transaction de validation");
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
  await assert.rejects(save(completedForm(f.formation.updated_at)), /Le programme a changé/);
  assert.equal(f.formation.title, "Modification concurrente"); assert.equal(f.rpcs.length, 0);
});

for (const actionName of ["save", "validate"]) {
  test(`${actionName} : un ancien écran refuse d'écraser une modification déjà enregistrée`, async () => {
    const { f, [actionName]: action } = await actionFixture();
    const oldForm = completedForm();
    Object.assign(f.formation, { updated_at: "2026-10-03T08:05:00+00:00", title: "Programme corrigé par l’OF", detailed_program: "Nouveau contenu confirmé par l’OF" });
    await assert.rejects(action(oldForm), /Le programme a changé/);
    assert.equal(f.formation.title, "Programme corrigé par l’OF");
    assert.equal(f.formation.detailed_program, "Nouveau contenu confirmé par l’OF");
    assert.equal(f.formation.status, "draft");
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
  });
  test(`${actionName} : une version omise impose de réouvrir le dossier avant toute écriture`, async () => {
    const { f, [actionName]: action } = await actionFixture(); const form = completedForm();
    form.delete("formation_updated_at");
    await assert.rejects(action(form), /Le programme a changé/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
  });
  test(`${actionName} : une version vide ne désactive pas le contrôle de concurrence`, async () => {
    const { f, [actionName]: action } = await actionFixture(); const form = completedForm("");
    await assert.rejects(action(form), /Le programme a changé/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
  });
}

for (const session of [false, true]) {
  test(`la revue ${session ? "session" : "formation"} transmet la version réellement ouverte`, async () => {
    const f = dailyPrivateFixture(); Object.assign(f.formation, { status: "draft", updated_at: INITIAL_REVISION });
    if (session) f.rows.daily_sessions.push({ id: ids.session, organisation_id: ids.of, formation_id: ids.formation, status: "active" });
    const tree = await editor(f).shared.default(session ? { sessionId: ids.session } : { formationId: ids.formation });
    const revision = elements(tree).find(item => item.props.name === "formation_updated_at");
    assert.equal(revision?.props.type, "hidden"); assert.equal(revision.props.value, INITIAL_REVISION);
  });
}


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

for (const [mode, fields] of [
  ["program_import", ["contact_phone", "contact_email"]],
  ["selen_form", ["target_audience", "access_delays", "price", "pedagogical_resources", "evaluation_methods", "contact_phone", "contact_email"]],
]) {
  for (const field of fields) {
    test(`${mode} : un champ Daily requis effacé (${field}) bloque la validation`, async () => {
      const { f, validate } = await actionFixture(); f.formation.creation_mode = mode;
      const form = completedForm(); form.set(field, "  ");
      await assert.rejects(validate(form), /avant de valider/);
      assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
      assert.equal(f.downloads.length, 0); assert.equal(f.formation.status, "draft");
    });
  }
}

for (const invalidModality of ["", "remote", "Présentiel"]) {
  test(`modalité forgée ${invalidModality} : refus avant écriture`, async () => {
    const { f, validate } = await actionFixture(); const form = completedForm(); form.set("modality", invalidModality);
    await assert.rejects(validate(form), /Modalité de formation invalide/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
  });
}

test("un brouillon conserve l'enregistrement progressif sans lancer la validation", async () => {
  const { f, save } = await actionFixture(); const form = completedForm();
  for (const field of ["contact_phone", "contact_email", "detailed_program"]) form.delete(field);
  await assert.rejects(save(form), /REDIRECT .*saved=draft/);
  assert.equal(f.formation.status, "draft"); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
});

test("un programme Selen complet se valide avec ses coordonnées et son contenu", async () => {
  const { f, validate } = await actionFixture(); f.formation.creation_mode = "selen_form";
  await assert.rejects(validate(completedForm()), /REDIRECT .*saved=validated/);
  assert.equal(f.formation.status, "validated"); assert.equal(f.formation.contact_email, "contact@example.test");
  assert.equal(f.rpcs.length, 1);
});

for (const mode of ["program_import", "selen_form"]) {
  test(`${mode} : le formulaire distingue les exigences de validation et l'enregistrement du brouillon`, async () => {
    const f = dailyPrivateFixture(); Object.assign(f.formation, { status: "draft", creation_mode: mode });
    const tree = await editor(f).shared.default({ formationId: ids.formation });
    const all = elements(tree);
    const fields = new Map(all.filter(item => item.props.name).map(item => [item.props.name, item.props]));
    assert.equal(fields.get("contact_phone").required, true); assert.equal(fields.get("contact_email").required, true);
    assert.equal(fields.get("detailed_program").required, true);
    for (const field of ["target_audience", "access_delays", "price", "pedagogical_resources", "evaluation_methods"]) {
      assert.equal(Boolean(fields.get(field).required), mode === "selen_form");
    }
    const buttons = all.filter(item => item.type === "button" && item.props.formAction);
    assert.equal(buttons[0].props.formNoValidate, true);
    assert.equal(Boolean(buttons[1].props.formNoValidate), false);
  });
}

test("une formation historique retrouve la validation et son même lien après import obligatoire de l’original", async () => {
  const { f, validate } = await actionFixture();
  f.formation.creation_mode = null; f.formation.positioning_questionnaire_document_url = null;
  await assert.rejects(validate(completedForm()), /Document source privé introuvable/);
  assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
  assert.equal(f.formation.public_registration_token, "stable-existing-token");
  f.formation.positioning_questionnaire_document_url = `/api/client/daily/uploads?id=${ids.original}`;
  await assert.rejects(validate(completedForm()), /REDIRECT .*saved=validated/);
  assert.equal(f.formation.status, "validated"); assert.equal(f.formation.public_registration_token, "stable-existing-token");
  assert.equal(f.formation.id, ids.formation); assert.equal(f.rows.daily_formations.length, 1);
  assert.equal(f.formation.positioning_questionnaire_document_url, `/api/client/daily/uploads?id=${ids.original}`);
  assert.ok(f.downloads.includes(f.source.storage_path));
});

test("le dossier historique ne prétend pas qu'un document propre OF a été choisi", async () => {
  const f = dailyPrivateFixture(); f.formation.status = "draft"; f.formation.positioning_questionnaire_document_url = null;
  const tree = await editor(f).shared.default({ formationId: ids.formation });
  assert.match(visibleText(tree), /Importe le questionnaire original de l’OF avant de valider/);
  assert.doesNotMatch(visibleText(tree), /réimportation obligatoire/);
  assert.ok(!elements(tree).some(item => String(item.props.href).includes("kind=positioning")));
});

for (const [name, change] of [
  ["questionnaire configuré sans fiche document", f => f.rows.daily_documents = f.rows.daily_documents.filter(doc => doc.id !== ids.original)],
  ["questionnaire configuré avec une URL externe", f => f.formation.positioning_questionnaire_document_url = "https://outside.example.test/questionnaire.pdf"],
]) {
  test(`${name} : la compatibilité historique ne contourne pas le contrôle privé`, async () => {
    const { f, validate } = await actionFixture(); change(f);
    await assert.rejects(validate(completedForm()), /Document source privé introuvable/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
    assert.ok(!f.downloads.includes(f.source.storage_path));
  });
}
