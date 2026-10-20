export const STUDIO_EMAIL_ATTACHMENT_BUCKET = "documents";
export const STUDIO_EMAIL_ATTACHMENT_MAX_FILES = 5;
export const STUDIO_EMAIL_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const STUDIO_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export const STUDIO_EMAIL_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export type StudioEmailAttachmentRef = {
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

export function readStudioEmailAttachmentRefs(
  value: unknown,
  organisationId: string,
  userId: string,
) {
  if (!Array.isArray(value) || value.length > STUDIO_EMAIL_ATTACHMENT_MAX_FILES) return null;
  const names = new Set<string>();
  const paths = new Set<string>();
  let total = 0;
  const prefix = `daily/${organisationId}/communications/pending/${userId}/`;
  const attachments: StudioEmailAttachmentRef[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const path = typeof item.path === "string" ? item.path : "";
    const name = safeStudioEmailAttachmentName(typeof item.name === "string" ? item.name : "");
    const mimeType = typeof item.mimeType === "string" ? item.mimeType : "";
    const sizeBytes = Number(item.sizeBytes);
    const key = name.toLocaleLowerCase("fr-FR");
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/") || paths.has(path)
      || !name || names.has(key) || !isStudioEmailAttachmentTypeAllowed(name, mimeType)
      || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > STUDIO_EMAIL_ATTACHMENT_MAX_FILE_BYTES) return null;
    names.add(key);
    paths.add(path);
    total += sizeBytes;
    attachments.push({ path, name, mimeType, sizeBytes });
  }
  return total <= STUDIO_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES ? attachments : null;
}

const MIME_BY_EXTENSION: Record<string, Set<string>> = {
  pdf: new Set(["application/pdf"]), jpg: new Set(["image/jpeg"]), jpeg: new Set(["image/jpeg"]), png: new Set(["image/png"]),
  txt: new Set(["text/plain"]), csv: new Set(["text/csv"]), doc: new Set(["application/msword"]),
  docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  xls: new Set(["application/vnd.ms-excel"]), xlsx: new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
};

export function safeStudioEmailAttachmentName(name: string) {
  return name.trim().replace(/[\u0000-\u001f\u007f/\\]/g, "-").replace(/\s+/g, " ").slice(0, 180);
}

export function isStudioEmailAttachmentTypeAllowed(name: string, mimeType: string) {
  const extension = safeStudioEmailAttachmentName(name).split(".").at(-1)?.toLowerCase() ?? "";
  return STUDIO_EMAIL_ATTACHMENT_MIME_TYPES.has(mimeType) && Boolean(MIME_BY_EXTENSION[extension]?.has(mimeType));
}

export function validateStudioEmailAttachmentFiles(files: Pick<File, "name" | "type" | "size">[]) {
  if (files.length > STUDIO_EMAIL_ATTACHMENT_MAX_FILES) return `Ajoute au maximum ${STUDIO_EMAIL_ATTACHMENT_MAX_FILES} pièces jointes.`;
  const names = new Set<string>();
  let total = 0;
  for (const file of files) {
    const name = safeStudioEmailAttachmentName(file.name);
    if (!name || !file.size || file.size > STUDIO_EMAIL_ATTACHMENT_MAX_FILE_BYTES || !isStudioEmailAttachmentTypeAllowed(name, file.type)) {
      return "Formats acceptés : PDF, images JPG/PNG, Word, Excel, CSV et texte (10 Mo maximum par fichier).";
    }
    const key = name.toLocaleLowerCase("fr-FR");
    if (names.has(key)) return "Deux pièces jointes ne peuvent pas porter le même nom.";
    names.add(key);
    total += file.size;
  }
  if (total > STUDIO_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) return "L’ensemble des pièces jointes ne doit pas dépasser 20 Mo.";
  return null;
}
