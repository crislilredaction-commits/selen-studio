import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dailyPrivateFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const require = createRequire(import.meta.url); const jsx = require("react/jsx-runtime");
const openedAt = "2026-10-03T12:00:00+00:00"; const changedAt = "2026-10-03T12:01:00+00:00";
function walk(node, result = []) {
  if (Array.isArray(node)) for (const child of node) walk(child, result);
  else if (node?.props) { result.push(node); walk(node.props.children, result); }
  return result;
}
function fixture() {
  const f = dailyPrivateFixture(); f.flags.allowWrites = true;
  Object.assign(f.formation, { positioning_mode: "selen", prerequisite_mode: "none" });
  Object.assign(f.request, { updated_at: openedAt, positioning_answers: {}, agent_analysis_summary: { observations: "Notes conservées" } });
  const emails = []; const invalidations = [];
  const modules = {
    ...f.modules, "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "next/cache": { revalidatePath: path => invalidations.push(path) },
    "next/navigation": { notFound: () => { throw Error("Not found"); } },
    "@/lib/server/clientNotificationSilence": { sendClientEmailWithSilence: async input => { emails.push(input); return { sent: true }; } },
    "@/lib/server/dailyStudioCandidature": f.candidatures,
    "@/lib/server/dailyStudioFormationSources": f.sources,
    "@/lib/server/dailyOrganisationScope": f.scope,
  };
  const page = isolatedTsModule("src/app/agent/daily/candidatures/[id]/page.tsx", modules);
  const list = isolatedTsModule("src/app/agent/daily/candidatures/page.tsx", modules);
  const render = () => page.default({ params: Promise.resolve({ id: ids.request }) });
  const form = (revision = openedAt) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ id: ids.request, candidature_updated_at: revision ?? "", motivation_summary: "Motivation analysée", positioning_summary: "Niveau analysé", needs_summary: "Besoins analysés", observations: "Nouvelle note" })) data.set(key, value);
    return data;
  };
  const action = async () => {
    const tree = await render(); const element = walk(tree).find(node => node.type === "form");
    assert.equal(typeof element?.props.action, "function"); return element.props.action;
  };
  return { f, emails, invalidations, form, action, render, list };
}

test("une analyse courante est enregistrée puis notifiée sans accepter la candidature", async () => {
  const h = fixture(); const action = await h.action(); await action(h.form());
  assert.equal(h.f.request.decision_status, "ready_for_of"); assert.equal(h.f.writes.length, 1);
  assert.equal(h.f.request.agent_analysis_summary.observations, "Nouvelle note");
  assert.equal(h.emails.length, 1); assert.ok(h.invalidations.includes("/agent/daily/candidatures"));
});

test("le formulaire porte l’horodatage de l’analyse réellement ouverte", async () => {
  const h = fixture(); const tree = await h.render();
  const hidden = walk(tree).find(node => node.type === "input" && node.props.name === "candidature_updated_at");
  assert.equal(hidden?.props.value, openedAt);
});

test("une analyse modifiée depuis l’ouverture ne perd pas ses nouvelles notes", async () => {
  const h = fixture(); const action = await h.action();
  h.f.request.updated_at = changedAt; h.f.request.agent_analysis_summary = { observations: "Autre agent" };
  await assert.rejects(action(h.form()), /changé|recharg/i);
  assert.equal(h.f.request.agent_analysis_summary.observations, "Autre agent"); assert.equal(h.f.writes.length, 0);
  assert.equal(h.emails.length, 0); assert.equal(h.invalidations.length, 0);
});

test("une version ouverte absente ou vide ne transmet aucune synthèse", async () => {
  for (const revision of [null, "", "  "]) {
    const h = fixture(); const action = await h.action(); await assert.rejects(action(h.form(revision)), /version|recharg/i);
    assert.equal(h.f.writes.length, 0); assert.equal(h.emails.length, 0);
  }
});

test("une acceptation ou un refus simultané ne provoque plus d’email de décision attendue", async () => {
  for (const status of ["accepted", "refused"]) {
    const h = fixture(); const action = await h.action();
    h.f.flags.beforeUpdate = () => { h.f.request.decision_status = status; h.f.request.updated_at = changedAt; };
    await assert.rejects(action(h.form()), /changé|décision|recharg/i);
    assert.equal(h.f.request.decision_status, status); assert.equal(h.f.request.agent_analysis_summary.observations, "Notes conservées");
    assert.ok(h.f.writes.every(write => write.ids.length === 0)); assert.equal(h.emails.length, 0); assert.equal(h.invalidations.length, 0);
  }
});

test("un second agent modifiant l’analyse entre lecture et écriture conserve sa synthèse", async () => {
  const h = fixture(); const action = await h.action();
  h.f.flags.beforeUpdate = () => { h.f.request.updated_at = changedAt; h.f.request.agent_analysis_summary = { observations: "Synthèse récente" }; };
  await assert.rejects(action(h.form()), /changé|recharg/i);
  assert.equal(h.f.request.agent_analysis_summary.observations, "Synthèse récente");
  assert.ok(h.f.writes.every(write => write.ids.length === 0)); assert.equal(h.emails.length, 0);
});

test("les candidatures décidées quittent la liste active et restent en lecture seule", async () => {
  for (const status of ["accepted", "refused"]) {
    const h = fixture(); h.f.request.decision_status = status;
    const tree = await h.render(); const elements = walk(tree);
    assert.ok(elements.filter(node => node.type === "textarea").every(node => node.props.disabled));
    assert.ok(!elements.some(node => node.type === "button"));
    const html = require("react-dom/server").renderToStaticMarkup(await h.list.default());
    assert.ok(!html.includes(`/agent/daily/candidatures/${ids.request}`));
    assert.ok(html.includes("Aucune candidature")); assert.equal(h.emails.length, 0); assert.equal(h.f.writes.length, 0);
  }
});

test("la sauvegarde revérifie l’affectation et les prérequis humains", async () => {
  for (const deny of [
    f => { f.rows.daily_organisation_assignments[0].agent_profile_id = "agent-b"; },
    f => { f.rows.agent_profiles[0].is_active = false; },
    f => { f.formation.prerequisite_mode = "required"; f.rows.daily_prerequisite_evidence.push({ registration_request_id: ids.request, status: "to_check" }); },
  ]) {
    const h = fixture(); const action = await h.action(); deny(h.f);
    await assert.rejects(action(h.form()), /introuvable|vérifiés/i);
    assert.equal(h.f.writes.length, 0); assert.equal(h.emails.length, 0);
  }
});
