/**
 * pdfExtract.ts — Selen Studio
 * Serveur uniquement. pdfjs-dist v6, legacy build ESM.
 */
import "server-only";

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

export async function extractPdfTextFromBuffer(
  buffer: Buffer,
): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageItems = (content.items as PdfTextItem[])
        .map((item) => ({
          text: item.str ?? "",
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
        }))
        .filter((item) => item.text.trim().length > 0)
        .sort((a, b) => {
          const rowDelta = Math.round(b.y) - Math.round(a.y);
          return Math.abs(rowDelta) > 2 ? rowDelta : a.x - b.x;
        });
      const lines: string[] = [];
      let currentLine: string[] = [];
      let currentY: number | null = null;

      pageItems.forEach((item) => {
        if (currentY === null || Math.abs(item.y - currentY) <= 2) {
          currentLine.push(item.text);
          currentY = currentY ?? item.y;
          return;
        }

        lines.push(currentLine.join(" "));
        currentLine = [item.text];
        currentY = item.y;
      });

      if (currentLine.length) {
        lines.push(currentLine.join(" "));
      }

      const pageStr = lines.join("\n");
      pageTexts.push(pageStr);
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = pageTexts.join("\n").trim();
  if (!text) {
    throw new Error(
      "Aucun texte PDF extractible. Le document semble scanne et necessite un OCR ou une saisie manuelle.",
    );
  }

  return text;
}
