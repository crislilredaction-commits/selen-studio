import { jsPDF } from "jspdf";

export type ReviewResourceSection = {
  title: string;
  content?: string;
  items?: string[];
};

export type ReviewResourceContent = {
  title: string;
  description: string;
  sections: ReviewResourceSection[];
};

type PdfCursor = {
  y: number;
};

const PAGE = {
  width: 210,
  height: 297,
  margin: 16,
  bottom: 276,
};

function addWrappedText(
  doc: jsPDF,
  text: string,
  cursor: PdfCursor,
  options?: { fontSize?: number; lineHeight?: number; indent?: number },
) {
  const fontSize = options?.fontSize ?? 10;
  const lineHeight = options?.lineHeight ?? 5.2;
  const indent = options?.indent ?? 0;
  const maxWidth = PAGE.width - PAGE.margin * 2 - indent;
  const lines = doc.splitTextToSize(text, maxWidth) as string[];

  doc.setFontSize(fontSize);
  lines.forEach((line) => {
    ensureSpace(doc, cursor, lineHeight + 2);
    doc.text(line, PAGE.margin + indent, cursor.y);
    cursor.y += lineHeight;
  });
}

function ensureSpace(doc: jsPDF, cursor: PdfCursor, neededHeight: number) {
  if (cursor.y + neededHeight <= PAGE.bottom) return;
  doc.addPage();
  cursor.y = PAGE.margin;
}

function addFooter(doc: jsPDF, title: string) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 90, 65);
    doc.text(`Selen Studio - ${title} - Page ${page}/${pageCount}`, 16, 288);
  }
}

export function downloadReviewResourcePdf(
  resource: ReviewResourceContent,
  fileName: string,
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
  const cursor = { y: 18 };

  doc.setTextColor(62, 42, 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  addWrappedText(doc, resource.title, cursor, {
    fontSize: 18,
    lineHeight: 8,
  });

  cursor.y += 2;
  doc.setDrawColor(196, 169, 106);
  doc.line(PAGE.margin, cursor.y, PAGE.width - PAGE.margin, cursor.y);
  cursor.y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(75, 58, 42);
  addWrappedText(doc, resource.description, cursor, {
    fontSize: 10,
    lineHeight: 5.4,
  });

  cursor.y += 5;

  resource.sections.forEach((section, index) => {
    ensureSpace(doc, cursor, 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(62, 42, 31);
    addWrappedText(doc, `${index + 1}. ${section.title}`, cursor, {
      fontSize: 12,
      lineHeight: 6.2,
    });

    cursor.y += 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(75, 58, 42);

    if (section.content) {
      addWrappedText(doc, section.content, cursor, {
        fontSize: 9.5,
        lineHeight: 5.1,
      });
      cursor.y += 1.5;
    }

    section.items?.forEach((item) => {
      addWrappedText(doc, `• ${item}`, cursor, {
        fontSize: 9.5,
        lineHeight: 5.1,
        indent: 3,
      });
    });

    cursor.y += 4;
  });

  addFooter(doc, resource.title);
  doc.save(fileName);
}
