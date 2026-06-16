import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractTextFromBuffer,
  normalizeExtractedText,
} from "@/lib/documentText";

const MIN_USEFUL_TEXT_LENGTH = 20;

export type ExtractableDocument = {
  id: string;
  name: string | null;
  storage_path: string | null;
  extracted_text?: string | null;
};

export type DocumentTextResult = {
  text: string;
  source: "database" | "storage" | "none";
  error: string | null;
};

function hasUsefulText(text?: string | null) {
  return (text ?? "").trim().length >= MIN_USEFUL_TEXT_LENGTH;
}

function getExtension(filename?: string | null) {
  const parts = filename?.toLowerCase().split(".") ?? [];
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function getEmptyExtractionReason(document: ExtractableDocument) {
  const ext = getExtension(document.name);

  if (ext === "doc") {
    return "Format .doc binaire non supporte ou document vide. Merci de fournir un DOCX, PDF ou un .doc HTML genere par Selen.";
  }

  if (ext === "pages") {
    return "Format .pages non supporte. Merci de fournir un DOCX ou PDF lisible.";
  }

  if (!ext) {
    return "Format du document inconnu.";
  }

  return `Aucun texte exploitable n'a pu etre extrait du fichier .${ext}.`;
}

export async function getOrExtractDocumentText(
  supabase: SupabaseClient,
  document: ExtractableDocument | undefined,
): Promise<DocumentTextResult> {
  if (!document) {
    return {
      text: "",
      source: "none",
      error: "Document introuvable.",
    };
  }

  const existingText = normalizeExtractedText(document.extracted_text ?? "");

  if (hasUsefulText(existingText)) {
    return {
      text: existingText,
      source: "database",
      error: null,
    };
  }

  if (!document.storage_path) {
    return {
      text: "",
      source: "none",
      error: "Document sans chemin Storage.",
    };
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .download(document.storage_path);

  if (error || !data) {
    return {
      text: "",
      source: "storage",
      error: error?.message ?? "Telechargement Storage impossible.",
    };
  }

  try {
    const buffer = Buffer.from(await data.arrayBuffer());
    const text = normalizeExtractedText(
      await extractTextFromBuffer(buffer, document.name ?? "document"),
    );

    if (hasUsefulText(text)) {
      await supabase
        .from("documents")
        .update({ extracted_text: text })
        .eq("id", document.id);

      return {
        text,
        source: "storage",
        error: null,
      };
    }

    return {
      text: "",
      source: "storage",
      error: getEmptyExtractionReason(document),
    };
  } catch (error) {
    return {
      text: "",
      source: "storage",
      error: error instanceof Error ? error.message : "Extraction impossible.",
    };
  }
}
