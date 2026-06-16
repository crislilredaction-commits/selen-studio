const PRODUCTION_VITRINE_URL = "https://selen-editions.fr";

type VitrineUrlOptions = {
  allowLocalhost?: boolean;
};

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "undefined") return null;
  return trimmed.replace(/\/+$/, "");
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

export function getVitrineBaseUrl(options: VitrineUrlOptions = {}) {
  const candidates = [
    process.env.NEXT_PUBLIC_VITRINE_URL,
    process.env.NEXT_PUBLIC_CLIENT_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .map(normalizeBaseUrl)
    .filter((value): value is string => Boolean(value));

  const usableCandidate = candidates.find(
    (value) => options.allowLocalhost || !isLocalUrl(value),
  );

  if (usableCandidate) return usableCandidate;

  return options.allowLocalhost && process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : PRODUCTION_VITRINE_URL;
}

export function getVitrineClientPathForDossier(type: string, id: string) {
  if (type === "preaudit") return "/client";
  if (type === "review" || type === "audit_blanc") return "/client/audit-blanc";
  return `/client/dossier/${id}`;
}

export function getVitrineClientUrl(
  type: string,
  id: string,
  options: VitrineUrlOptions = {},
) {
  return `${getVitrineBaseUrl(options)}${getVitrineClientPathForDossier(
    type,
    id,
  )}`;
}
