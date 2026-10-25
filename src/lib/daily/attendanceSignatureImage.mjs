// Reconnaissance minimale des formats réellement pris en charge par jsPDF.
// Ne pas se fier au nom du fichier ou au MIME fourni par le navigateur.
/** @param {Uint8Array} bytes @returns {"PNG" | "JPEG" | null} */
export function detectAttendanceSignatureFormat(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a) return "PNG";
  if (bytes.length >= 3 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPEG";
  return null;
}
