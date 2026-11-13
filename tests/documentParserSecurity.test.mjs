import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

function loadDocumentText(readWorkbook) {
  return isolatedTsModule(
    "src/lib/documentText.ts",
    {
      mammoth: { default: { extractRawText: async () => ({ value: "" }) } },
      "node:buffer": { Blob },
      "read-excel-file/node": { default: readWorkbook },
      "./pdfExtract": { extractPdfTextFromBuffer: async () => "PDF text" },
    },
    { Buffer, console },
  );
}

test("XLSX extraction reads every sheet without the vulnerable SheetJS package", async () => {
  let calls = 0;
  const documentText = loadDocumentText(async (input) => {
    calls += 1;
    assert.ok(input instanceof Blob);
    return [
      { sheet: "Participants", data: [["Nom", "Score"], ["Alice", 5]] },
      { sheet: "Notes", data: [["Valeur"], [true]] },
    ];
  });

  const extracted = await documentText.extractTextFromBuffer(
    Buffer.from("fixture"),
    "resultats.xlsx",
  );

  assert.equal(
    extracted,
    "Nom Score\nAlice 5\n\nValeur\ntrue",
  );
  assert.equal(calls, 1);
});

test("legacy XLS is rejected before any spreadsheet parser runs", async () => {
  let calls = 0;
  const documentText = loadDocumentText(async () => {
    calls += 1;
    return [];
  });

  assert.equal(
    await documentText.extractTextFromBuffer(Buffer.from("fixture"), "ancien.xls"),
    "",
  );
  assert.equal(calls, 0);
});

test("production parser versions stay on the remediated implementations", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const pdfSource = readFileSync("src/lib/pdfExtract.ts", "utf8");

  assert.equal(packageJson.dependencies.next, "16.4.6");
  assert.equal(packageJson.dependencies["pdfjs-dist"], "6.5.438");
  assert.equal(packageJson.dependencies["read-excel-file"], "9.3.15");
  assert.equal(packageJson.dependencies.xlsx, undefined);
  assert.match(pdfSource, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.doesNotMatch(pdfSource, /legacy\/build\/pdf\.js/);
});
