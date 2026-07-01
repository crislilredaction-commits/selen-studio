/**
 * documentText.ts — Selen Studio
 *
 * Extraction de texte côté serveur Next.js App Router.
 * PDF  → pdfExtract.ts (pdfjs-dist v3)
 * DOCX → mammoth
 * XLSX → xlsx
 */

import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractPdfTextFromBuffer } from "./pdfExtract";

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function getExtension(filename?: string | null): string {
  if (!filename) return "";
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function stripControlChars(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[^\S\r\n\t]+/g, " ");
}

function looksLikeHtml(buffer: Buffer) {
  const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 2048));
  return /<!doctype html|<html[\s>]|<body[\s>]|xmlns:w="urn:schemas-microsoft-com:office:word"/i.test(
    preview,
  );
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&ucirc;/gi, "û");
}

function extractTextFromHtmlBuffer(buffer: Buffer) {
  const html = buffer.toString("utf8");
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|section|article)\s*>/gi, "\n")
    .replace(/<\s*li[\s>]/gi, "\n- <li>");

  const withoutTags = withBreaks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");

  return normalizeExtractedText(decodeHtmlEntities(withoutTags));
}

// ---------------------------------------------------------------------------
// Extracteur principal
// ---------------------------------------------------------------------------

export async function extractTextFromBuffer(
  buffer: Buffer,
  filename?: string | null,
): Promise<string> {
  const ext = getExtension(filename);

  if (ext === "pdf") {
    try {
      const raw = await extractPdfTextFromBuffer(buffer);
      const normalized = normalizeExtractedText(raw);
      console.log(`PDF OK [${filename}] — ${normalized.length} chars`);
      return normalized;
    } catch (error) {
      console.error("PDF extract failed:", filename, error);
      throw error;
    }
  }

  if (ext === "docx" || ext === "doc") {
    if (looksLikeHtml(buffer)) {
      return extractTextFromHtmlBuffer(buffer);
    }

    try {
      const result = await mammoth.extractRawText({ buffer });
      return normalizeExtractedText(result.value ?? "");
    } catch (error) {
      console.error("DOCX/DOC extract failed:", filename, error);
      return "";
    }
  }

  if (ext === "xlsx" || ext === "xls") {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const allSheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_csv(sheet);
      });
      return normalizeExtractedText(allSheets.join("\n\n"));
    } catch (error) {
      console.error("XLSX extract failed:", filename, error);
      return "";
    }
  }

  if (ext === "txt" || ext === "csv") {
    try {
      return normalizeExtractedText(buffer.toString("utf8"));
    } catch (error) {
      console.error("TXT/CSV extract failed:", filename, error);
      return "";
    }
  }

  if (ext === "pages") {
    console.warn("Format .pages non supporté :", filename);
    return "";
  }

  console.warn("Extension non reconnue :", ext, filename);
  return "";
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export function normalizeExtractedText(text: string): string {
  if (!text) return "";

  return stripControlChars(text)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function normalizeWhitespace(text: string): string {
  return stripControlChars(text).replace(/\s+/g, " ").trim();
}

export function normalizeSingleLine(text: string): string {
  return normalizeWhitespace(text);
}

// ---------------------------------------------------------------------------
// extractEmail
// ---------------------------------------------------------------------------

export function extractEmail(text: string): string {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? "";
}

// ---------------------------------------------------------------------------
// extractSiret
// Gère les formats avec espaces : "507 889 913 00053" → "50788991300053"
// ---------------------------------------------------------------------------

export function extractSiret(text: string): string {
  // Normalise le format espacé 3-3-3-5 avant tout
  const normalized = text.replace(
    /\b(\d{3})\s(\d{3})\s(\d{3})\s(\d{5})\b/g,
    "$1$2$3$4",
  );

  for (const source of [normalized, text.replace(/\s/g, "")]) {
    const match = source.match(/\b(\d{14})\b/);
    if (match?.[1]) return match[1];
  }

  return "";
}

// ---------------------------------------------------------------------------
// extractPostalCode
// Exclut les séquences faisant partie d'un SIRET (14 chiffres).
// Valide le département (01–95, 97x, 98x).
// ---------------------------------------------------------------------------

export function extractPostalCode(text: string): string {
  // Retire les SIRET pour éviter que "00053" soit pris comme CP
  const withoutSiret = text
    .replace(/\b(\d{3})\s(\d{3})\s(\d{3})\s(\d{5})\b/g, "")
    .replace(/\b\d{14}\b/g, "");

  const cpRegex = /\b(0[1-9]|[1-8]\d|9[0-5]|97[1-6]|98[4-9])\d{3}\b/g;
  const matches = [...withoutSiret.matchAll(cpRegex)];

  if (matches.length === 0) return "";

  // Priorité aux CP proches d'un mot-clé d'adresse
  const addressKeywords = /adresse|siège|domicile|code\s*postal|résidence/i;
  for (const match of matches) {
    const context = withoutSiret.slice(
      Math.max(0, match.index! - 80),
      match.index! + 10,
    );
    if (addressKeywords.test(context)) return match[0];
  }

  return matches[0][0];
}

// ---------------------------------------------------------------------------
// extractCity
// ---------------------------------------------------------------------------

export function extractCity(text: string, postalCode?: string): string {
  if (!postalCode || postalCode.length < 5) return "";

  const escaped = postalCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `${escaped}\\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ'\\-]{1,}(?:\\s[A-ZÀ-Ÿa-zà-ÿ'\\-]{1,}){0,3})`,
    ),
    new RegExp(
      `adresse[^\\n]{0,80}${escaped}\\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ'\\-]{1,}(?:\\s[A-ZÀ-Ÿa-zà-ÿ'\\-]{1,}){0,3})`,
      "i",
    ),
    new RegExp(
      `si[eè]ge[^\\n]{0,80}${escaped}\\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ'\\-]{1,}(?:\\s[A-ZÀ-Ÿa-zà-ÿ'\\-]{1,}){0,3})`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const city = normalizeWhitespace(match[1])
        .replace(/\bfrance\b/gi, "")
        .replace(/\bcedex\s*\d*/gi, "")
        .trim();
      if (city.length >= 2 && city.length <= 40 && !/\d/.test(city)) {
        return city;
      }
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// getRegionFromPostalCode
// ---------------------------------------------------------------------------

export function getRegionFromPostalCode(codePostal?: string | null): string {
  if (!codePostal || codePostal.length < 2) return "";

  const dept = codePostal.slice(0, 2);

  const regionMap: Record<string, string> = {
    "01": "Auvergne-Rhône-Alpes",
    "02": "Hauts-de-France",
    "03": "Auvergne-Rhône-Alpes",
    "04": "Provence-Alpes-Côte d'Azur",
    "05": "Provence-Alpes-Côte d'Azur",
    "06": "Provence-Alpes-Côte d'Azur",
    "07": "Auvergne-Rhône-Alpes",
    "08": "Grand Est",
    "09": "Occitanie",
    "10": "Grand Est",
    "11": "Occitanie",
    "12": "Occitanie",
    "13": "Provence-Alpes-Côte d'Azur",
    "14": "Normandie",
    "15": "Auvergne-Rhône-Alpes",
    "16": "Nouvelle-Aquitaine",
    "17": "Nouvelle-Aquitaine",
    "18": "Centre-Val de Loire",
    "19": "Nouvelle-Aquitaine",
    "21": "Bourgogne-Franche-Comté",
    "22": "Bretagne",
    "23": "Nouvelle-Aquitaine",
    "24": "Nouvelle-Aquitaine",
    "25": "Bourgogne-Franche-Comté",
    "26": "Auvergne-Rhône-Alpes",
    "27": "Normandie",
    "28": "Centre-Val de Loire",
    "29": "Bretagne",
    "30": "Occitanie",
    "31": "Occitanie",
    "32": "Occitanie",
    "33": "Nouvelle-Aquitaine",
    "34": "Occitanie",
    "35": "Bretagne",
    "36": "Centre-Val de Loire",
    "37": "Centre-Val de Loire",
    "38": "Auvergne-Rhône-Alpes",
    "39": "Bourgogne-Franche-Comté",
    "40": "Nouvelle-Aquitaine",
    "41": "Centre-Val de Loire",
    "42": "Auvergne-Rhône-Alpes",
    "43": "Auvergne-Rhône-Alpes",
    "44": "Pays de la Loire",
    "45": "Centre-Val de Loire",
    "46": "Occitanie",
    "47": "Nouvelle-Aquitaine",
    "48": "Occitanie",
    "49": "Pays de la Loire",
    "50": "Normandie",
    "51": "Grand Est",
    "52": "Grand Est",
    "53": "Pays de la Loire",
    "54": "Grand Est",
    "55": "Grand Est",
    "56": "Bretagne",
    "57": "Grand Est",
    "58": "Bourgogne-Franche-Comté",
    "59": "Hauts-de-France",
    "60": "Hauts-de-France",
    "61": "Normandie",
    "62": "Hauts-de-France",
    "63": "Auvergne-Rhône-Alpes",
    "64": "Nouvelle-Aquitaine",
    "65": "Occitanie",
    "66": "Occitanie",
    "67": "Grand Est",
    "68": "Grand Est",
    "69": "Auvergne-Rhône-Alpes",
    "70": "Bourgogne-Franche-Comté",
    "71": "Bourgogne-Franche-Comté",
    "72": "Pays de la Loire",
    "73": "Auvergne-Rhône-Alpes",
    "74": "Auvergne-Rhône-Alpes",
    "75": "Île-de-France",
    "76": "Normandie",
    "77": "Île-de-France",
    "78": "Île-de-France",
    "79": "Nouvelle-Aquitaine",
    "80": "Hauts-de-France",
    "81": "Occitanie",
    "82": "Occitanie",
    "83": "Provence-Alpes-Côte d'Azur",
    "84": "Provence-Alpes-Côte d'Azur",
    "85": "Pays de la Loire",
    "86": "Nouvelle-Aquitaine",
    "87": "Nouvelle-Aquitaine",
    "88": "Grand Est",
    "89": "Bourgogne-Franche-Comté",
    "90": "Bourgogne-Franche-Comté",
    "91": "Île-de-France",
    "92": "Île-de-France",
    "93": "Île-de-France",
    "94": "Île-de-France",
    "95": "Île-de-France",
  };

  return regionMap[dept] ?? "";
}

// ---------------------------------------------------------------------------
// extractTrainerNameFromCv
//
// Cherche "Prénom NOM" dans les 20 premières lignes du CV.
//
// Règle clé : on scanne chaque ligne à la recherche du premier segment
// "Prénom NOM" valide, même si la ligne continue après (ex: "Pascale BARTHAUX
// PROFIL PROFESSIONNEL..."). On s'arrête dès qu'on trouve le premier mot
// tout-majuscules après un prénom en casse mixte.
//
// Cette fonction NE doit PAS être appelée sur le programme de formation.
// Le fallback programme est géré dans route.ts.
// ---------------------------------------------------------------------------

export function extractTrainerNameFromCv(text: string): {
  formateur_nom: string;
  formateur_prenom: string;
} {
  const empty = { formateur_prenom: "", formateur_nom: "" };

  const sectionKeywords = [
    "curriculum",
    "vitae",
    "formatrice",
    "expérience",
    "compétence",
    "profil",
    "coordonnée",
    "contact",
    "téléphone",
    "email",
    "adresse",
    "formation",
    "diplôme",
    "certificat",
    "linkedin",
    "objectif",
    "langues",
    "professionnel",
    "référence",
  ];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (sectionKeywords.some((kw) => lower.includes(kw))) continue;
    if (/\d/.test(line)) continue;
    if (line.length < 3) continue;

    // -----------------------------------------------------------------------
    // Scan token par token :
    // On cherche la séquence [mot_mixte] [MOT_MAJUSCULE(S)]
    // et on s'arrête dès qu'on a trouvé cette paire, même si la ligne continue.
    //
    // Exemple : "Pascale BARTHAUX PROFIL PROFESSIONNEL"
    //   token 0 : "Pascale"   → casse mixte ✓  → candidat prénom
    //   token 1 : "BARTHAUX"  → tout majuscules ✓ → nom trouvé, stop
    //
    // Exemple : "BARTHAUX Pascale"
    //   token 0 : "BARTHAUX"  → tout majuscules → candidat nom inversé
    //   token 1 : "Pascale"   → casse mixte → prénom trouvé, stop
    // -----------------------------------------------------------------------

    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;

    // Pattern A : Prénom(s) puis NOM(S)
    // On accumule les mots en casse mixte jusqu'au premier tout-majuscules
    let prenomWords: string[] = [];
    let nomWords: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      const isMixed =
        /^[A-ZÀ-Ÿ][a-zà-ÿ]/.test(tok) && // commence par majuscule
        tok.length >= 2 &&
        !/[^A-ZÀ-Ÿa-zà-ÿ\-']/.test(tok); // lettres et tirets seulement

      const isAllUpper =
        tok === tok.toUpperCase() && /^[A-ZÀ-Ÿ\-']{2,}$/.test(tok); // tout majuscules, min 2 chars

      if (prenomWords.length === 0 && isMixed) {
        prenomWords.push(tok);
        continue;
      }

      if (prenomWords.length > 0 && isMixed) {
        // Peut être un deuxième prénom (ex: "Jean-Pierre" ou "Marie Anne")
        prenomWords.push(tok);
        continue;
      }

      if (prenomWords.length > 0 && isAllUpper) {
        // Collecte les mots du nom (peut y en avoir plusieurs : "MARTIN DUPONT")
        nomWords.push(tok);
        // Continue pour attraper les noms composés
        for (let j = i + 1; j < tokens.length; j++) {
          const next = tokens[j];
          const nextIsAllUpper =
            next === next.toUpperCase() && /^[A-ZÀ-Ÿ\-']{2,}$/.test(next);
          if (nextIsAllUpper) {
            nomWords.push(next);
          } else {
            break; // mot pas en majuscules → fin du nom
          }
        }
        break;
      }

      // Si on tombe sur un mot qui ne matche ni prénom ni nom → reset
      if (prenomWords.length > 0 && !isMixed && !isAllUpper) {
        prenomWords = [];
        nomWords = [];
      }
    }

    if (prenomWords.length > 0 && nomWords.length > 0) {
      return {
        formateur_prenom: prenomWords.join(" "),
        formateur_nom: nomWords.join(" "),
      };
    }

    // Pattern B : NOM(S) puis Prénom(s) — ex: "BARTHAUX Pascale"
    let nomWordsB: string[] = [];
    let prenomWordsB: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      const isMixed =
        /^[A-ZÀ-Ÿ][a-zà-ÿ]/.test(tok) &&
        tok.length >= 2 &&
        !/[^A-ZÀ-Ÿa-zà-ÿ\-']/.test(tok);

      const isAllUpper =
        tok === tok.toUpperCase() && /^[A-ZÀ-Ÿ\-']{2,}$/.test(tok);

      if (nomWordsB.length === 0 && isAllUpper) {
        nomWordsB.push(tok);
        continue;
      }

      if (nomWordsB.length > 0 && isAllUpper) {
        nomWordsB.push(tok);
        continue;
      }

      if (nomWordsB.length > 0 && isMixed) {
        prenomWordsB.push(tok);
        for (let j = i + 1; j < tokens.length; j++) {
          const next = tokens[j];
          const nextIsMixed =
            /^[A-ZÀ-Ÿ][a-zà-ÿ]/.test(next) &&
            next.length >= 2 &&
            !/[^A-ZÀ-Ÿa-zà-ÿ\-']/.test(next);
          if (nextIsMixed) prenomWordsB.push(next);
          else break;
        }
        break;
      }

      if (nomWordsB.length > 0 && !isAllUpper && !isMixed) break;
    }

    if (nomWordsB.length > 0 && prenomWordsB.length > 0) {
      return {
        formateur_prenom: prenomWordsB.join(" "),
        formateur_nom: nomWordsB.join(" "),
      };
    }
  }

  return empty;
}

// ---------------------------------------------------------------------------
// extractTrainerNameFromProgramme
//
// Fallback utilisé UNIQUEMENT si le CV n'a pas fourni de nom.
// Cherche des patterns explicites : "Nom du formateur : ...", "Intervenant : ..."
// ---------------------------------------------------------------------------

export function extractTrainerNameFromProgramme(text: string): {
  formateur_nom: string;
  formateur_prenom: string;
} {
  const empty = { formateur_prenom: "", formateur_nom: "" };

  // Patterns explicites dans un programme de formation
  const labelPatterns = [
    /nom\s+du\s+formateur\s*[:\-–]\s*(.+)/i,
    /formateur\s+principal\s*[:\-–]\s*(.+)/i,
    /formateur\s*[:\-–]\s*(.+)/i,
    /formatrice\s*[:\-–]\s*(.+)/i,
    /intervenant\s*[:\-–]\s*(.+)/i,
    /animateur\s*[:\-–]\s*(.+)/i,
    /pr[eé]nom\s+et\s+nom\s*[:\-–]\s*(.+)/i,
    /nom\s+et\s+pr[eé]nom\s*[:\-–]\s*(.+)/i,
  ];

  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const raw = normalizeWhitespace(match[1]).trim();
    if (!raw || raw.length < 3) continue;

    // Tente de séparer prénom et nom depuis la valeur extraite
    // Ex: "Vandenbulcke Amelie" ou "Amelie Vandenbulcke" ou "MARTIN Jean"
    const parts = raw.split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0];
      const rest = parts.slice(1).join(" ");

      // "NOM Prénom"
      if (first === first.toUpperCase() && /^[A-ZÀ-Ÿ][a-zà-ÿ]/.test(rest)) {
        return { formateur_prenom: rest, formateur_nom: first };
      }

      // "Prénom NOM"
      if (/^[A-ZÀ-Ÿ][a-zà-ÿ]/.test(first) && rest === rest.toUpperCase()) {
        return { formateur_prenom: first, formateur_nom: rest };
      }

      // Casse indéterminée : premier mot = prénom, reste = nom
      const prenom =
        first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
      const nom = rest.toUpperCase();
      return { formateur_prenom: prenom, formateur_nom: nom };
    }
  }

  return empty;
}

// ---------------------------------------------------------------------------
// extractDuration
// ---------------------------------------------------------------------------

export function extractDuration(text: string): string {
  const patterns = [
    /dur[ée]e\s*(?:de\s*(?:la\s*)?formation)?\s*[:\-–]?\s*(\d+\s*h(?:eures?)?)/i,
    /dur[ée]e\s*(?:de\s*(?:la\s*)?formation)?\s*[:\-–]?\s*(\d+\s*jours?)/i,
    /\b(\d+)\s*heures?\b/i,
    /\b(\d+)\s*h\b/i,
    /\b(\d+)\s*jours?\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1] && /[hj]/i.test(match[1])) {
        return normalizeWhitespace(match[1]);
      }
      const full = match[0].replace(/.*?(\d+\s*(?:heures?|h|jours?))/i, "$1");
      return normalizeWhitespace(full);
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// extractTrainingTitle
// ---------------------------------------------------------------------------

export function extractTrainingTitle(text: string): string {
  const genericTitles = [
    "programme de la formation",
    "programme de formation",
    "programme",
    "intitulé de la formation",
    "intitulé",
    "titre de la formation",
    "formation",
  ];

  const sectionBlacklist = [
    "durée",
    "duree",
    "objectif",
    "public visé",
    "public vise",
    "pré-requis",
    "prérequis",
    "pre-requis",
    "modalité",
    "modalite",
    "intervenant",
    "méthode",
    "moyen pédagogique",
    "programme",
    "tarif",
    "coût",
    "lieu",
    "date",
    "horaire",
    "évaluation",
  ];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Stratégie 1 : "Intitulé : ..." sur une ligne
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const inlineMatch = lines[i].match(
      /(?:intitul[eé]|titre)\s*(?:de\s*(?:la\s*)?formation)?\s*[:\-–]\s*(.+)/i,
    );
    if (inlineMatch?.[1]) {
      const title = inlineMatch[1].trim();
      if (title.length >= 5) return title;
    }

    // Stratégie 2 : ligne générique → titre est la ligne suivante
    const lower = lines[i].toLowerCase();
    if (
      genericTitles.some((g) => lower === g || lower.startsWith(g + " ")) &&
      lines[i + 1]
    ) {
      const next = lines[i + 1].trim();
      const nextLower = next.toLowerCase();
      if (
        next.length >= 5 &&
        next.length <= 150 &&
        !genericTitles.some((g) => nextLower.startsWith(g)) &&
        !sectionBlacklist.some((w) => nextLower.startsWith(w)) &&
        !/^\d+$/.test(next)
      ) {
        return next;
      }
    }
  }

  // Stratégie 3 : première ligne non générique
  for (const line of lines.slice(0, 25)) {
    const lower = line.toLowerCase();
    if (
      line.length >= 8 &&
      line.length <= 150 &&
      !genericTitles.some((g) => lower === g || lower.startsWith(g + " ")) &&
      !sectionBlacklist.some(
        (w) =>
          lower === w ||
          lower.startsWith(w + " ") ||
          lower.startsWith(w + " :"),
      ) &&
      !/^\d+$/.test(line)
    ) {
      return line;
    }
  }

  return "";
}
