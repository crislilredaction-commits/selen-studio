import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const docId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ofId = "11111111-1111-4111-8111-111111111111";
const openedAt = "2026-10-03T12:00:00.000Z";
const changedAt = "2026-10-03T12:01:00.000Z";

function fixture() {
  const document = { id: docId, organisation_id: ofId, document_type: "convocation", logical_name: "Convocation", version: 1, status: "to_check", is_current: true, updated_at: openedAt, metadata: { preserved: "Original" } };
  const rows = { daily_documents: [document], organisations: [{ id: ofId, name: "OF exemple", email: "of@example.test" }] };
  const writes = []; const emails = []; const publicationCalls = [];
  const flags = { beforeUpdate: null, auth: { ok: true, email: "agent@example.test", status: 200 }, scope: [ofId], updateError: null, emailResult: { sent: true, resendId: "test-provider-id" } };
  const admin = { from(table) {
    assert.ok(Object.hasOwn(rows, table), table);
    const filters = []; let patch = null; let single = false;
    const query = {
      select() { return query; }, order() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      update(value) { patch = value; return query; },
      then(resolve, reject) {
        if (patch && flags.beforeUpdate) { flags.beforeUpdate(); flags.beforeUpdate = null; }
        const matches = rows[table].filter(row => filters.every(f => f(row)));
        if (patch && flags.updateError) return Promise.resolve({ data: null, error: flags.updateError }).then(resolve, reject);
        if (patch) for (const row of matches) { Object.assign(row, structuredClone(patch), { updated_at: changedAt }); writes.push({ id: row.id, patch: structuredClone(patch) }); }
        const data = matches.map(row => structuredClone(row));
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
      },
    }; return query;
  } };
  const publication = isolatedTsModule("src/lib/server/dailyDocumentPublication.ts", {
    "@/lib/server/clientNotificationSilence": { sendClientEmailWithSilence: async input => { emails.push(input); return flags.emailResult; } },
    "@/lib/server/selenEmailLayout": { renderSelenEmailFromText: () => ({ html: "<p>Test</p>", text: "Test" }) },
    "@/lib/vitrineLinks": { getVitrineBaseUrl: () => "https://daily.example.test" },
  });
  const route = isolatedTsModule("src/app/agent/api/daily/pretraining-documents/route.ts", {
    "node:crypto": { createHash, randomUUID: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "agent-user" } } }) } }) },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => admin },
    "@/lib/server/dailyOrganisationScope": { getDailyOrganisationIdsForAgent: async () => flags.scope },
    "@/app/agent/api/support/_utils": { requireSupportAgent: async () => flags.auth },
    "@/lib/server/dailyDocumentPublication": { publishDailyDocumentAndNotify: async input => { publicationCalls.push(input); return publication.publishDailyDocumentAndNotify(input); } },
  });
  const patch = (action, extras = {}) => route.PATCH(new Request("https://studio.example.test/review", { method: "PATCH", body: JSON.stringify({ id: docId, action, note: "À revoir", expected_updated_at: openedAt, ...extras }) }));
  return { document, rows, writes, emails, publicationCalls, flags, patch, route };
}

test("la revue valide ou demande une correction sur la version ouverte, sans email", async () => {
  for (const action of ["validate", "request_correction"]) {
    const f = fixture(); const response = await f.patch(action);
    assert.equal(response.status, 200);
    assert.equal(f.document.status, action === "validate" ? "validated" : "correction_requested");
    assert.equal(f.document.metadata.preserved, "Original"); assert.equal(f.document.metadata.reviewed_by_email, "agent@example.test");
    assert.equal(f.writes.length, 1); assert.equal(f.emails.length, 0);
  }
});

test("un écran périmé ne peut ni valider, ni corriger, ni publier", async () => {
  for (const action of ["validate", "request_correction", "publish"]) {
    const f = fixture(); f.document.updated_at = changedAt; f.document.status = action === "publish" ? "validated" : "to_check";
    const response = await f.patch(action);
    assert.equal(response.status, 409); assert.equal(f.writes.length, 0); assert.equal(f.emails.length, 0); assert.equal(f.publicationCalls.length, 0);
  }
});

test("une version ouverte absente ou vide est refusée avant toute action", async () => {
  for (const expected_updated_at of [undefined, "", "  "]) {
    const f = fixture(); const response = await f.patch("validate", { expected_updated_at });
    assert.equal(response.status, 400); assert.equal(f.writes.length, 0); assert.equal(f.emails.length, 0);
  }
});

test("un changement entre lecture et écriture ne réouvre aucun état terminé ou ancienne version", async () => {
  for (const change of [
    { status: "published" }, { status: "signed" }, { status: "archived" },
    { is_current: false }, { updated_at: changedAt }, { version: 2 },
  ]) {
    const f = fixture(); f.flags.beforeUpdate = () => Object.assign(f.document, change);
    const response = await f.patch("request_correction");
    assert.equal(response.status, 409, JSON.stringify(change)); assert.equal(f.writes.length, 0);
    for (const [key, value] of Object.entries(change)) assert.equal(f.document[key], value);
  }
});

test("la reprise de publication restitue la vraie absence de nouvel envoi", async () => {
  const f = fixture(); f.document.status = "validated";
  f.document.metadata.publication_notification_sent_at = openedAt;
  f.document.metadata.publication_notification_resend_id = "previous-provider-id";
  const response = await f.patch("publish"); const result = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(result.notification, { sent: false, deduplicated: true });
  assert.equal(f.emails.length, 0); assert.equal(f.document.status, "published");
  assert.equal(result.document.metadata.publication_notification_resend_id, "previous-provider-id");
});

test("un nouvel envoi confirmé conserve son identifiant et sa preuve avant publication", async () => {
  const f = fixture(); f.document.status = "validated";
  const response = await f.patch("publish"); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.notification.sent, true);
  assert.equal(result.notification.resendId, "test-provider-id"); assert.equal(f.emails.length, 1);
  assert.equal(result.document.metadata.publication_notification_resend_id, "test-provider-id");
  assert.equal(f.writes[0].patch.status, undefined); assert.equal(f.writes[1].patch.status, "published");
});

test("une erreur email ou un document hors périmètre n’est jamais un succès", async () => {
  const f = fixture(); f.document.status = "validated"; f.flags.emailResult = { sent: false, paused: true };
  assert.equal((await f.patch("publish")).status, 409); assert.equal(f.document.status, "validated"); assert.equal(f.writes.length, 0);
  for (const deny of [f => { f.flags.scope = []; }, f => { f.document.organisation_id = "other-of"; }, f => { f.document.is_current = false; }]) {
    const f = fixture(); deny(f); assert.equal((await f.patch("validate")).status, 404); assert.equal(f.writes.length, 0); assert.equal(f.emails.length, 0);
  }
  const denied = fixture(); denied.flags.auth = { ok: false, error: "Connexion requise", status: 401 };
  assert.equal((await denied.patch("validate")).status, 401); assert.equal(denied.writes.length, 0);
});

const require = createRequire(import.meta.url); const jsx = require("react/jsx-runtime");
function walk(node, result = []) {
  if (Array.isArray(node)) for (const child of node) walk(child, result);
  else if (node?.props) { result.push(node); walk(node.props.children, result); }
  return result;
}
function uiFixture() {
  const states = []; const refs = []; let stateIndex = 0; let refIndex = 0; let effectsEnabled = true;
  const effects = []; const requests = [];
  const document = { id: docId, organisation_id: ofId, document_type: "convocation", logical_name: "Convocation", version: 1, status: "validated", updated_at: openedAt, metadata: {} };
  const flags = { response: { document, notification: { sent: false, deduplicated: true } }, responseStatus: 200, onPatch: null, fail: false, prompt: "Note", pending: null };
  const page = isolatedTsModule("src/app/agent/daily/pretraining-documents/page.tsx", {
    "react/jsx-runtime": jsx,
    react: {
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef(initial) { const i = refIndex++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i]; },
      useCallback: callback => callback, useMemo: callback => callback(), useEffect: callback => { if (effectsEnabled) effects.push(callback); },
    },
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
  }, {
    Error,
    fetch: async (_url, options) => {
      if (!options?.method) return Response.json({ documents: [document] });
      requests.push(JSON.parse(options.body));
      if (flags.pending) await flags.pending;
      if (flags.fail) throw Error("Réseau indisponible");
      if (flags.onPatch) flags.onPatch();
      return Response.json(flags.response, { status: flags.responseStatus });
    },
    window: { prompt: () => flags.prompt, confirm: () => true },
  });
  const render = () => { stateIndex = 0; refIndex = 0; return page.default(); };
  const mount = async () => { render(); effectsEnabled = false; for (const effect of effects) await effect(); await new Promise(resolve => setImmediate(resolve)); return render(); };
  return { document, flags, requests, render, mount };
}
function button(tree, label) { const found = walk(tree).find(node => node.type === "button" && node.props.children === label); assert.ok(found, label); return found; }
function visibleText(tree) { return require("react-dom/server").renderToStaticMarkup(tree); }

test("l’écran distingue une notification reprise d’un nouvel email confirmé", async () => {
  for (const [notification, expected] of [
    [{ sent: false, deduplicated: true }, "aucun nouvel email"],
    [{ sent: true, resendId: "test-provider-id" }, "Email transmis"],
    [{ sent: false }, "Aucun nouvel envoi"],
  ]) {
    const f = uiFixture(); f.flags.response.notification = notification;
    const tree = await f.mount(); await button(tree, "Publier et notifier").props.onClick();
    assert.ok(visibleText(f.render()).includes(expected), expected);
    assert.equal(f.requests[0].expected_updated_at, openedAt);
  }
});

test("l’écran bloque le double clic et récupère après une erreur réseau", async () => {
  const f = uiFixture(); let release; f.flags.pending = new Promise(resolve => { release = resolve; });
  const tree = await f.mount(); const publish = button(tree, "Publier et notifier");
  const pending = publish.props.onClick(); await publish.props.onClick();
  assert.equal(f.requests.length, 1); assert.equal(button(f.render(), "Publier et notifier").props.disabled, true);
  f.flags.fail = true; release(); await pending;
  assert.ok(visibleText(f.render()).includes("Réseau indisponible"));
  assert.equal(button(f.render(), "Publier et notifier").props.disabled, false);
  f.flags.fail = false; await button(f.render(), "Publier et notifier").props.onClick();
  assert.equal(f.requests.length, 2); assert.ok(visibleText(f.render()).includes("aucun nouvel email"));
});

test("un conflit recharge l’état courant et conserve le message de relecture", async () => {
  const f = uiFixture(); f.document.status = "to_check";
  f.flags.responseStatus = 409; f.flags.response = { error: "Relisez la pièce avant de réessayer." };
  f.flags.onPatch = () => { f.document.status = "published"; f.document.updated_at = changedAt; };
  const tree = await f.mount(); await button(tree, "Valider").props.onClick();
  const after = f.render(); assert.ok(visibleText(after).includes("Relisez la pièce"));
  assert.ok(!walk(after).some(node => node.type === "button" && ["Valider", "Publier et notifier", "Demander une correction"].includes(node.props.children)));
});

test("annuler la demande de correction ne modifie pas le dossier", async () => {
  const f = uiFixture(); f.document.status = "to_check"; f.flags.prompt = null;
  const tree = await f.mount(); await button(tree, "Demander une correction").props.onClick();
  assert.equal(f.requests.length, 0);
});

test("la preuve d’envoi enregistrée reste visible après rechargement, sans inventer une réception", async () => {
  const f = uiFixture(); f.document.status = "published";
  f.document.metadata = { publication_notification_sent_at: openedAt, publication_notification_resend_id: "previous-provider-id" };
  await f.mount(); button(f.render(), "Tous").props.onClick();
  const html = visibleText(f.render());
  assert.ok(html.includes("Email transmis au service d’envoi le")); assert.ok(html.includes("previous-provider-id"));
  assert.ok(html.includes("14:00:00")); assert.ok(!html.includes("reçu par")); assert.equal(f.requests.length, 0);
});
