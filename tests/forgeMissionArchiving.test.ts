import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la liste active exclut les missions archivées", async () => {
  const source = await read("src/lib/forge/data-access.ts");
  assert.match(source, /\.is\("archived_at", null\)/);
  assert.match(source, /fetch\("\/agent\/api\/forge\/archives"/);
});

test("une configuration Supabase Preview absente produit un diagnostic explicite", async () => {
  const client = await read("src/lib/supabase/client.ts");
  const workspace = await read("src/components/forge/CodyWorkspace.tsx");
  assert.match(client, /La configuration Supabase publique est absente de ce déploiement/);
  assert.match(workspace, /Détail technique/);
  assert.match(workspace, /loadError instanceof Error \? loadError\.message/);
});

test("l’API Archives exige un administrateur et valide les entrées", async () => {
  const source = await read("src/app/agent/api/forge/archives/route.ts");
  assert.match(source, /await requireStudioAdmin\(\)/g);
  assert.match(source, /uuidPattern\.test\(missionId\)/);
  assert.match(source, /\["archive", "restore"\]/);
  assert.match(source, /forge_set_mission_archived/);
});

test("l’archivage conserve le statut final et la restauration ne relance rien", async () => {
  const migration = await read("supabase/migrations/20260730170000_add_forge_mission_archiving.sql");
  assert.match(migration, /set archived_at = now\(\), archived_by = actor_id/);
  assert.match(migration, /set archived_at = null, archived_by = null/);
  assert.match(migration, /resulting_status, decided_by[\s\S]*mission_status,[\s\S]*mission_status/);
  assert.doesNotMatch(migration, /new_status := 'archived'/);
});

test("seuls les statuts finaux cohérents sont archivables", async () => {
  const migration = await read("supabase/migrations/20260730170000_add_forge_mission_archiving.sql");
  assert.match(migration, /mission_status not in \('validated', 'failed', 'abandoned'\)/);
  assert.match(migration, /old\.status not in \('validated', 'failed', 'abandoned'\)/);
});

test("la vue Archives expose recherche, filtres, rapport et restauration", async () => {
  const source = await read("src/components/forge/ForgeMissionArchives.tsx");
  assert.match(source, /type="search"/);
  assert.match(source, /Statut final/);
  assert.match(source, /Compagnon/);
  assert.match(source, /type="month"/);
  assert.match(source, /Ouvrir le rapport/);
  assert.match(source, /Restaurer/);
});
