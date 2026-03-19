/**
 * pdfExtract.ts — Selen Studio
 * Serveur uniquement. pdfjs-dist v3, legacy build CJS, worker désactivé.
 */
import "server-only";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// Désactiver le worker browser — obligatoire en Node
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

export async function extractPdfTextFromBuffer(
  buffer: Buffer,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableWorker: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf: any = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageStr = (content.items as any[])
      .map((item) => item.str ?? "")
      .join(" ");
    pageTexts.push(pageStr);
  }

  return pageTexts.join("\n");
}
