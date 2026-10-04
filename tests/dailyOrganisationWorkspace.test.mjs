import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { dailyPrivateFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const require = createRequire(import.meta.url);
function elements(node, result = []) {
  if (Array.isArray(node)) for (const child of node) elements(child, result);
  else if (node?.props) { result.push(node); elements(node.props.children, result); }
  return result;
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? text(node.props.children) : "";
}
function fixture() {
  const f = dailyPrivateFixture();
  const documents = isolatedTsModule("src/lib/server/dailyStudioOrganisationDocuments.ts", {
    "node:crypto": { createHash }, "@/lib/server/dailyOrganisationScope": f.scope,
    "@/lib/server/dailyStudioFormationSources": f.sources,
  });
  const module = { "@/lib/server/dailyStudioOrganisationDocuments": documents };
  const route = isolatedTsModule("src/app/agent/api/daily/documents/[id]/route.ts", { ...f.modules, ...module });
  const workspace = isolatedTsModule("src/components/daily/DailyOrganisationWorkspace.tsx", {
    ...f.modules, ...module, "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: "a" }, "@/components/ui/SelenCard": { default: "article", SelenCardTitle: "h2" },
    "@/components/ui/SelenBadge": { default: "span" },
  });
  return { ...f, documents, workspace, get: (id = ids.program) => route.GET(new Request("https://studio.example.test/document"), { params: Promise.resolve({ id }) }) };
}

for (const status of ["draft", "review", "correction_requested", "validated"]) {
  test(`sans session ni tâche, un programme ${status} est accessible depuis l'OF`, async () => {
    const f = fixture(); f.formation.status = status;
    const tree = await f.workspace.default({ organisationId: ids.of, email: f.auth.value.email, kind: "programs" });
    const link = elements(tree).find(item => item.props.href === `/agent/daily/formations/${ids.formation}`);
    assert.ok(link); assert.match(text(link), status === "validated" ? /Consulter/ : /Modifier et valider/);
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
  });
}

test("la liste montre les fichiers privés courants, même déjà vérifiés, sans URL publique", async () => {
  const f = fixture(); f.source.status = "validated";
  f.rows.daily_documents.push({ ...f.source, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", is_current: false, metadata: { original_filename: "Ancienne pièce.pdf" } });
  f.rows.daily_documents.push({ ...f.source, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status: "archived", metadata: { original_filename: "Archive.pdf" } });
  const tree = await f.workspace.default({ organisationId: ids.of, email: f.auth.value.email, kind: "documents" });
  assert.match(text(tree), /Questionnaire.pdf/); assert.match(text(tree), /Programme.pdf/);
  assert.doesNotMatch(text(tree), /Ancienne pièce|Archive.pdf/);
  const links = elements(tree).filter(item => item.props.href).map(item => item.props.href);
  assert.ok(links.includes(`/agent/api/daily/documents/${ids.program}`));
  assert.ok(links.every(link => link.startsWith("/agent/"))); assert.equal(f.downloads.length, 0);
});

test("la pagination ne masque pas les programmes au-delà de la première page", async () => {
  const f = fixture();
  for (let i = 0; i < 120; i++) f.rows.daily_formations.push({ ...f.formation, id: `program-${i}`, title: `Programme ${i}` });
  const rows = await f.documents.loadDailyOrganisationWorkspace(f.admin, f.auth.value.email, ids.of, "programs");
  assert.equal(rows.length, 121); assert.ok(rows.some(row => row.title === "Programme 119"));
});

test("le bouton document télécharge le fichier réel avec preuve et sans cache", async () => {
  const f = fixture(); const response = await f.get();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-disposition"), /Programme.pdf/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.files.get(f.source.storage_path));
  assert.equal(f.downloads.length, 1); assert.equal(f.writes.length, 0);
});

for (const [name, change] of [
  ["non authentifié", f => f.auth.value = { ok: false, status: 401, error: "Accès refusé" }],
  ["agent réaffecté", f => f.rows.daily_organisation_assignments[0].agent_profile_id = "agent-b"],
  ["agent inactif", f => f.rows.agent_profiles[0].is_active = false],
  ["OF désabonné", f => f.rows.daily_subscriptions[0].status = "cancelled"],
  ["document d'un autre OF", f => f.rows.daily_documents.find(row => row.id === ids.program).organisation_id = ids.otherOf],
  ["fichier d'un autre OF", f => f.rows.daily_documents.find(row => row.id === ids.program).storage_path = `daily/${ids.otherOf}/original.pdf`],
  ["bucket externe", f => f.rows.daily_documents.find(row => row.id === ids.program).bucket = "public"],
  ["ancienne version", f => f.rows.daily_documents.find(row => row.id === ids.program).is_current = false],
  ["document archivé", f => f.rows.daily_documents.find(row => row.id === ids.program).status = "archived"],
  ["chemin traversant", f => f.rows.daily_documents.find(row => row.id === ids.program).storage_path = `daily/${ids.of}/../other/file.pdf`],
]) test(`${name} : le téléchargement revérifie le périmètre sans ouvrir le fichier`, async () => {
  const f = fixture(); change(f); const response = await f.get();
  assert.ok([401, 404].includes(response.status)); assert.equal(f.downloads.length, 0); assert.equal(f.writes.length, 0);
});

test("un fichier dont le contenu a changé bloque la consultation", async () => {
  const f = fixture(); f.files.set(f.source.storage_path, Buffer.from("altered"));
  assert.equal((await f.get()).status, 409);
});

test("une pièce privée historique sans empreinte reste lisible sans écriture de preuve", async () => {
  const f = fixture(); f.rows.daily_documents.find(row => row.id === ids.program).sha256 = null;
  assert.equal((await f.get()).status, 200); assert.equal(f.writes.length, 0);
});

test("la liste refuse l'OF hors assignation avant toute lecture des programmes ou documents", async () => {
  const f = fixture();
  for (const kind of ["programs", "documents"]) await assert.rejects(f.documents.loadDailyOrganisationWorkspace(f.admin, f.auth.value.email, ids.otherOf, kind), /hors de ton périmètre/);
  assert.ok(f.reads.every(read => !["daily_formations", "daily_documents"].includes(read.table)));
});

test("l'admin actif consulte aussi les pièces d'un OF actif non assigné", async () => {
  const f = fixture(); f.auth.value.email = "admin@example.test"; f.rows.daily_organisation_assignments = [];
  assert.equal((await f.get()).status, 200);
});
