import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publication = readFileSync(new URL("../src/lib/server/dailyDocumentPublication.ts", import.meta.url), "utf8");
const preRoute = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
const postRoute = readFileSync(new URL("../src/app/agent/api/daily/posttraining-documents/route.ts", import.meta.url), "utf8");
const prePage = readFileSync(new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url), "utf8");
const postPage = readFileSync(new URL("../src/app/agent/daily/posttraining-documents/page.tsx", import.meta.url), "utf8");

test("la publication est réservée aux documents déjà validés", () => {
  assert.match(publication, /document\.status !== "validated"/);
  assert.match(publication, /Seul un document validé peut être publié/);
  for (const route of [preRoute, postRoute]) {
    assert.match(route, /"publish"/);
    assert.match(route, /publishDailyDocumentAndNotify/);
  }
});

test("la publication utilise le canal email client Daily et respecte le mode silencieux", () => {
  assert.match(publication, /sendClientEmailWithSilence/);
  assert.match(publication, /organisationId: document\.organisation_id/);
  assert.match(publication, /if \(!notification\.sent\)/);
});

test("l'email ouvre directement le document publié dans l'espace Daily", () => {
  assert.match(publication, /new URLSearchParams\(\{ document: documentId \}\)/);
  assert.match(publication, /client\/daily\/documents\?\$\{query\.toString\(\)\}/);
  assert.match(publication, /ctaLabel: "Ouvrir le document"/);
  assert.match(publication, /ctaUrl: clientDocumentsUrl/);
});

test("la publication trace document version valideur destinataire et espace cible", () => {
  assert.match(publication, /publication_document_id: document\.id/);
  assert.match(publication, /publication_document_version: document\.version \?\? null/);
  assert.match(publication, /published_by_email: publishedByEmail \?\? null/);
  assert.match(publication, /publication_recipient_email: recipient/);
  assert.match(publication, /publication_target: DAILY_CLIENT_DOCUMENTS_TARGET/);
  assert.match(publication, /publication_target_url: clientDocumentsUrl/);
  assert.match(publication, /published_at: publishedAt/);
});

test("le document n'est marqué publié qu'après un email envoyé", () => {
  const sendPosition = publication.indexOf("sendClientEmailWithSilence");
  const sentGuardPosition = publication.indexOf("if (!notification.sent)");
  const publishPosition = publication.indexOf('status: "published"');
  assert.ok(sendPosition >= 0 && sentGuardPosition > sendPosition && publishPosition > sentGuardPosition);
  assert.match(publication, /publication_notification_sent_at/);
});

test("Studio expose explicitement l'action Publier et notifier après validation", () => {
  for (const page of [prePage, postPage]) {
    assert.match(page, /doc\.status==="validated"/);
    assert.match(page, /Publier et notifier/);
    assert.match(page, /action:\s*"validate"\|"request_correction"\|"publish"/);
  }
});
