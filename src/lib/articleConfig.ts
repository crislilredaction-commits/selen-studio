export const ARTICLE_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "archived",
] as const;

export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_CATEGORIES = [
  "Gestion quotidienne",
  "Qualiopi",
  "Vision Selen",
  "Audit",
  "Veille",
  "Outils Selen",
] as const;

export type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  content: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  status: ArticleStatus;
  featured: boolean;
  published_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  reading_time_minutes: number | null;
  seo_title: string | null;
  seo_description: string | null;
};

export function getArticleStatusLabel(status: ArticleStatus | string) {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "scheduled":
      return "Planifie";
    case "published":
      return "Publie";
    case "archived":
      return "Archive";
    default:
      return status;
  }
}

export function slugifyArticleTitle(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function formatArticleDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}
