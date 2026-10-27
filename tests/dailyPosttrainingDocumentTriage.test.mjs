import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterPosttrainingDocuments, posttrainingDocumentMetrics,
  normalizePosttrainingQuery, normalizePosttrainingType, normalizePosttrainingView,
} from "../src/lib/daily/posttrainingDocumentTriage.mjs";

const documents = [
  {id:"a",status:"published",document_type:"attendance_summary",organisations:{name:"École Aube"},updated_at:"2026-10-25T10:00:00Z"},
  {id:"b",status:"validated",document_type:"completion_certificate",organisations:{name:"Centre A"},metadata:{learner_name:"Élodie"},updated_at:"2026-10-26T10:00:00Z"},
  {id:"c",status:"correction_requested",document_type:"attendance_summary",organisations:{name:"Centre B"},metadata:{session_reference:"SESSION-42"},updated_at:"2026-10-24T10:00:00Z"},
  {id:"d",status:"to_check",document_type:"completion_certificate",organisations:{name:"Centre C"},updated_at:"2026-10-27T10:00:00Z"},
];

test("documents de fin : les corrections et contrôles passent avant les pièces validées",()=>{
  assert.deepEqual(filterPosttrainingDocuments(documents).map(d=>d.id),["c","d","b"]);
  assert.deepEqual(filterPosttrainingDocuments(documents,{view:"all"}).map(d=>d.id),["c","d","b","a"]);
  assert.deepEqual(documents.map(d=>d.id),["a","b","c","d"]);
});

test("documents de fin : recherche accent-insensible et filtre type sans accès aux métadonnées sensibles",()=>{
  assert.deepEqual(filterPosttrainingDocuments(documents,{query:"ELODIE"}).map(d=>d.id),["b"]);
  assert.deepEqual(filterPosttrainingDocuments(documents,{query:"session-42",type:"attendance_summary"}).map(d=>d.id),["c"]);
  assert.deepEqual(filterPosttrainingDocuments(documents,{query:"ecole",view:"all"}).map(d=>d.id),["a"]);
  const sensitive=[{id:"secret",status:"to_check",document_type:"attendance_summary",metadata:{token:"confidentiel",sha256:"confidentiel"}}];
  assert.deepEqual(filterPosttrainingDocuments(sensitive,{query:"confidentiel"}),[]);
});

test("documents de fin : vues, compteurs et paramètres inconnus restent bornés",()=>{
  assert.deepEqual(posttrainingDocumentMetrics(documents),{total:4,attention:3,corrections:1,ready:1});
  assert.deepEqual(filterPosttrainingDocuments(documents,{view:"corrections"}).map(d=>d.id),["c"]);
  assert.deepEqual(filterPosttrainingDocuments(documents,{view:"ready"}).map(d=>d.id),["b"]);
  assert.equal(normalizePosttrainingQuery(" x ".repeat(90)).length,80);
  assert.equal(normalizePosttrainingView("inconnue"),"attention");
  assert.equal(normalizePosttrainingType("inconnu"),"all");
});

test("documents de fin : garde anti-double action et motif obligatoire sans mutation métier automatique",()=>{
  const page=readFileSync(new URL("../src/app/agent/daily/posttraining-documents/page.tsx",import.meta.url),"utf8");
  assert.match(page,/actionPending\.current=true/);
  assert.match(page,/if\(actionPending\.current \|\| openingId\) return/);
  assert.match(page,/actionPending\.current=false/);
  assert.match(page,/if\(!note\)/);
  assert.match(page,/disabled=\{!opened \|\| Boolean\(pendingId\) \|\| Boolean\(openingId\)\}/);
  assert.match(page,/expected_updated_at:doc\.updated_at/);
  assert.match(page,/expected_version:doc\.version/);
  assert.match(page,/r\.status===409/);
  assert.match(page,/filterPosttrainingDocuments\(documents/);
  assert.doesNotMatch(page,/\.from\(["']daily_documents["']\)\.(?:insert|update|delete)/);
});

test("documents de fin : l'API conserve le bornage agent et la revue de la version exacte",()=>{
  const api=readFileSync(new URL("../src/app/agent/api/daily/posttraining-documents/route.ts",import.meta.url),"utf8");
  assert.match(api,/getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(api,/\.in\("organisation_id",organisationIds\)/);
  assert.match(api,/\.eq\("is_current",true\)/);
  assert.match(api,/current\.updated_at!==expectedUpdatedAt/);
  assert.match(api,/openedSha!==current\.sha256/);
});

test("documents de fin : filtrage canonique par organisme et compteurs bornés",()=>{
  const rows=[
    {id:"a",organisation_id:"of-a",status:"validated",document_type:"attendance_summary",organisations:{name:"Même nom"}},
    {id:"b",organisation_id:"of-b",status:"correction_requested",document_type:"attendance_summary",organisations:{name:"Même nom"}},
    {id:"c",organisation_id:"of-a",status:"published",document_type:"completion_certificate",organisations:{name:"Même nom"}},
  ];
  const scoped=filterPosttrainingDocuments(rows,{organisationId:"of-a",view:"all"});
  assert.deepEqual(scoped.map(row=>row.id),["a","c"]);
  assert.deepEqual(posttrainingDocumentMetrics(scoped),{total:2,attention:1,corrections:0,ready:1});
  assert.deepEqual(filterPosttrainingDocuments(rows,{organisationId:"of-b"}).map(row=>row.id),["b"]);
  assert.deepEqual(filterPosttrainingDocuments(rows,{organisationId:"unknown",view:"all"}),[]);
});

test("documents de fin : sélecteur limité aux organismes fournis par l'API",()=>{
  const page=readFileSync(new URL("../src/app/agent/daily/posttraining-documents/page.tsx",import.meta.url),"utf8");
  assert.match(page,/documents\.map\(doc=>\[/);
  assert.match(page,/organisationOptions\.map\(org=>/);
  assert.match(page,/value=\{organisationFilter\}/);
  assert.match(page,/posttrainingDocumentMetrics\(scopedDocuments\)/);
  assert.match(page,/setOrganisationFilter/);
});
