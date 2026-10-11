import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("la liste propose Payee a cote du depot et rafraichit apres sauvegarde", async () => {
  const page = await source("src/app/agent/gestion/factures/page.tsx");
  const actions = await source("src/app/agent/gestion/factures/InvoiceListActions.tsx");
  assert.match(page, /updatedAt=\{invoice\.updated_at\}/);
  assert.match(actions, /action: "mark_paid"/);
  assert.match(actions, /type="checkbox"/);
  assert.match(actions, /<span>Payee<\/span>/);
  assert.match(actions, /setPaid\(true\)/);
  assert.match(actions, /router\.refresh\(\)/);
  assert.match(actions, /expectedUpdatedAt: updatedAt/);
});

test("le paiement exige une facture numerotee et protege les ecritures concurrentes", async () => {
  const route = await source("src/app/agent/api/gestion/invoices/route.ts");
  assert.match(route, /\["generated", "deposited"\]\.includes\(existing\.status\)/);
  assert.match(route, /!existing\.invoice_number/);
  assert.match(route, /!existing\.pdf_url/);
  assert.match(route, /expectedUpdatedAt !== existing\.updated_at/);
  assert.match(route, /\.eq\("updated_at", expectedUpdatedAt\)/);
  assert.match(route, /status: "paid"/);
  assert.match(route, /paid_at: now/);
  assert.match(route, /idempotent: true/);
});

test("seuls les brouillons jamais numerotes restent supprimables", async () => {
  const route = await source("src/app/agent/api/gestion/invoices/route.ts");
  const form = await source("src/app/agent/gestion/factures/InvoiceForm.tsx");
  assert.match(route, /existing\.status !== "draft"/);
  assert.match(route, /existing\.invoice_number !== null/);
  assert.match(route, /existing\.sequence_number !== null/);
  assert.match(form, /invoice\.status === "draft"/);
});

test("le compteur expose son etat reel et ne s ajuste qu en presence d un ecart", async () => {
  const lib = await source("src/lib/server/lilInvoices.ts");
  const page = await source("src/app/agent/gestion/factures/parametres/page.tsx");
  const form = await source("src/app/agent/gestion/factures/parametres/SettingsForm.tsx");
  assert.match(lib, /getLilInvoiceSequenceState/);
  assert.match(lib, /maxAssignedSequence \+ 1/);
  assert.match(lib, /canCloseTrailingGap: lastNumber > maxAssignedSequence/);
  assert.match(page, /getLilInvoiceSequenceState\(\)/);
  assert.match(form, /sequenceState\.canCloseTrailingGap/);
  assert.match(form, /expectedCurrentNextNumber: sequenceState\.nextNumber/);
  assert.match(form, /Ajuster le prochain numero/);
  assert.match(form, /aucune facture emise ne porte le numero demande/);
});

test("l ajustement SQL est verrouille, sans trou, sans reutilisation et audite", async () => {
  const migration = await source(
    "supabase/migrations/20261011100747_lil_invoice_paid_and_safe_sequence_adjustment.sql",
  );
  assert.match(migration, /lil_invoice_sequence_adjustments/);
  assert.match(migration, /for update/);
  assert.match(migration, /p_expected_current_next_number <> v_previous_last_number \+ 1/);
  assert.match(migration, /p_next_number <= v_max_assigned_sequence/);
  assert.match(migration, /p_next_number > v_previous_last_number \+ 1/);
  assert.match(migration, /insert into public\.lil_invoice_sequence_adjustments/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /set search_path = ''/);
});

test("l API du compteur exige Lil, motif, confirmation et appel RPC", async () => {
  const route = await source("src/app/agent/api/gestion/invoices/sequence/route.ts");
  assert.match(route, /requireLilOwner\(\)/);
  assert.match(route, /body\.confirmed !== true/);
  assert.match(route, /reason\.length < 8/);
  assert.match(route, /adjust_lil_next_invoice_number/);
  assert.match(route, /p_expected_current_next_number/);
  assert.match(route, /p_actor_email: auth\.email/);
});
