import { createClient } from "@/lib/supabase/server";
import type { ArticleRow } from "@/lib/articleConfig";

const publishedSelect =
  "id, title, slug, category, excerpt, content, cover_url, cover_alt, status, featured, published_at, scheduled_at, created_at, updated_at, created_by, updated_by, reading_time_minutes, seo_title, seo_description";

function publishedQuery(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase
    .from("articles")
    .select(publishedSelect)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString());
}

// TODO Vitrine : le depot selen-vitrine devra lire uniquement les articles publies.
// Source cible : Supabase articles where status = 'published' and published_at <= now().
export async function getPublishedArticles() {
  const supabase = await createClient();
  const { data, error } = await publishedQuery(supabase).order(
    "published_at",
    { ascending: false },
  );

  if (error) throw error;
  return (data ?? []) as ArticleRow[];
}

export async function getPublishedArticleBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await publishedQuery(supabase).eq("slug", slug).maybeSingle();

  if (error) throw error;
  return data as ArticleRow | null;
}

export async function getFeaturedArticles() {
  const supabase = await createClient();
  const { data, error } = await publishedQuery(supabase)
    .eq("featured", true)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ArticleRow[];
}

export async function getArticleCategories() {
  const articles = await getPublishedArticles();
  return Array.from(new Set(articles.map((article) => article.category))).sort(
    (a, b) => a.localeCompare(b, "fr"),
  );
}
