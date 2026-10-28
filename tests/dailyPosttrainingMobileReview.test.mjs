import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const page=readFileSync(new URL("../src/app/agent/daily/posttraining-documents/page.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/app/agent/daily/posttraining-documents/posttraining-mobile.module.css",import.meta.url),"utf8");
test("documents de fin : revue et filtres adaptés au téléphone",()=>{
  for(const name of ["page","filters","filterRow","filterLabel","filterControl","filterButtons","documentCard","documentHeader","documentInfo","actions","correctionForm","correctionInput","correctionActions"]){
    assert.ok(page.includes("styles."+name),name);
  }
  assert.ok(css.includes("@media (max-width:820px)"));
  assert.ok(css.includes("@media (max-width:520px)"));
  assert.ok(css.includes(".correctionInput:focus-visible"));
  assert.ok(css.includes("min-height:44px"));
});
test("documents de fin : correction accessible, motif obligatoire, sans prompt",()=>{
  assert.ok(!page.includes("window.prompt("));
  assert.ok(page.includes("aria-expanded={correctionId===doc.id}"));
  assert.ok(page.includes("maxLength={2000} required value={correctionNote}"));
  assert.ok(page.includes('review(doc,"request_correction",correctionNote)'));
  assert.ok(page.includes("if(!note)"));
  assert.ok(page.includes("disabled={!opened || busy || !correctionNote.trim()}"));
});
test("documents de fin : ouverture, droits et concurrence préservés",()=>{
  for(const guard of ["Accept:","expected_updated_at:doc.updated_at","expected_status:doc.status","expected_version:doc.version","r.status===409","if(actionPending.current || openingId) return","filterPosttrainingDocuments(scopedDocuments","window.confirm("]){
    assert.ok(page.includes(guard),guard);
  }
  assert.ok(page.includes("disabled={!opened || Boolean(pendingId) || Boolean(openingId)}"));
});
