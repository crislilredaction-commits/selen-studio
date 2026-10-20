import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";
const route = readFileSync("src/app/agent/api/quick-email/route.ts", "utf8");
const ui = readFileSync("src/components/agent/StudioQuickEmail.tsx", "utf8");
const layout = readFileSync("src/app/agent/layout.tsx", "utf8");
const upload = readFileSync("src/app/agent/api/quick-email/attachments/route.ts", "utf8");
const email = readFileSync("src/lib/server/selenEmailLayout.ts", "utf8");
const download = readFileSync("src/app/agent/daily/communications/document/route.ts", "utf8");
test("l'éditeur est disponible dans tout l'espace agent", () => { assert.match(layout, /StudioQuickEmail/); assert.match(ui, /position: "fixed"/); assert.match(ui, /role="dialog"/); });
test("l'envoi est autorisé, historisé et respecte le silence client", () => { assert.match(route, /requireSupportAgent/); assert.match(route, /daily_communications/); assert.match(route, /sendClientEmailWithSilence/); assert.match(route, /status: "queued"/); assert.match(route, /status: sent \? "sent" : "failed"/); });
test("les pièces sont téléversées directement dans le stockage privé", () => { assert.match(ui, /uploadToSignedUrl/); assert.match(upload, /requireSupportAgent/); assert.match(upload, /createSignedUploadUrl/); assert.match(upload, /communications\/pending/); assert.match(upload, /upsert: false/); });
test("les limites sont visibles et appliquées avant l'envoi", () => { assert.match(ui, /validateStudioEmailAttachmentFiles/); assert.match(ui, /Jusqu’à 5 fichiers/); assert.match(ui, /accept="\.pdf/); });
test("l'envoi Resend reçoit les pièces et l'historique conserve leurs versions exactes", () => { assert.match(route, /daily_communication_documents/); assert.match(route, /email_attachment/); assert.match(route, /sha256/); assert.match(route, /attachments/); assert.match(email, /attachments/); });
test("le téléchargement d'historique conserve le nom et l'extension archivés", () => {
  const logicalName = download.indexOf("snapshot.logical_name");
  const storageName = download.indexOf('snapshot.storage_path.split("/").pop()');
  assert.ok(logicalName >= 0 && storageName > logicalName);
});
test("la validation refuse les formats dangereux, doublons et dépassements", () => {
  const { validateStudioEmailAttachmentFiles, readStudioEmailAttachmentRefs } = isolatedTsModule("src/lib/studioEmailAttachments.ts");
  assert.equal(validateStudioEmailAttachmentFiles([{ name: "preuve.pdf", type: "application/pdf", size: 1024 }]), null);
  assert.match(validateStudioEmailAttachmentFiles([{ name: "virus.exe", type: "application/octet-stream", size: 1024 }]), /Formats acceptés/);
  assert.match(validateStudioEmailAttachmentFiles([{ name: "virus.exe", type: "application/pdf", size: 1024 }]), /Formats acceptés/);
  assert.match(validateStudioEmailAttachmentFiles([
    { name: "preuve.pdf", type: "application/pdf", size: 1024 },
    { name: "PREUVE.PDF", type: "application/pdf", size: 1024 },
  ]), /même nom/);
  assert.match(validateStudioEmailAttachmentFiles([
    { name: "a.pdf", type: "application/pdf", size: 10 * 1024 * 1024 },
    { name: "b.pdf", type: "application/pdf", size: 10 * 1024 * 1024 },
    { name: "c.pdf", type: "application/pdf", size: 1 },
  ]), /20 Mo/);
  const valid = { path: "daily/of-a/communications/pending/agent-a/file-a", name: "preuve.pdf", mimeType: "application/pdf", sizeBytes: 1024 };
  assert.equal(readStudioEmailAttachmentRefs([valid], "of-a", "agent-a").length, 1);
  assert.equal(readStudioEmailAttachmentRefs([{ ...valid, path: "daily/of-b/communications/pending/agent-a/file-a" }], "of-a", "agent-a"), null);
  assert.equal(readStudioEmailAttachmentRefs([valid, { ...valid, name: "autre.pdf" }], "of-a", "agent-a"), null);
});
