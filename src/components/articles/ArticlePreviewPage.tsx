"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import SelenBadge from "@/components/ui/SelenBadge";
import {
  formatArticleDate,
  getArticleStatusLabel,
  type ArticleRow,
} from "@/lib/articleConfig";
import { createClient } from "@/lib/supabase/client";
import { articleCss, articleStyles as s } from "./ArticleStyles";

export default function ArticlePreviewPage({ articleId }: { articleId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user?.email) {
        setError("Connectez-vous pour previsualiser cet article.");
        setLoading(false);
        return;
      }

      const { data, error: articleError } = await supabase
        .from("articles")
        .select("*")
        .eq("id", articleId)
        .maybeSingle();

      if (articleError || !data) {
        setError(articleError?.message ?? "Article introuvable.");
        setLoading(false);
        return;
      }

      setArticle(data as ArticleRow);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  return (
    <main style={{ ...s.page, maxWidth: 940 }}>
      <style>{articleCss}</style>

      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Apercu Studio</p>
          <h1 style={s.title}>Previsualiser</h1>
          <p style={s.subtitle}>
            Relire avant publication sans basculer dans le depot vitrine.
          </p>
        </div>

        <div style={s.actions}>
          <Link href="/agent/articles" style={s.linkButton}>
            Articles
          </Link>
          <Link href={`/agent/articles/${articleId}/edit`} style={s.linkButton}>
            Modifier
          </Link>
        </div>
      </header>

      {error && <div style={{ ...s.notice, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <section style={s.card}>
          <p style={s.muted}>Chargement...</p>
        </section>
      ) : article ? (
        <article style={{ ...s.card, padding: 26 }}>
          <div style={{ ...s.actions, marginBottom: 18 }}>
            <SelenBadge variant="type">{article.category}</SelenBadge>
            <SelenBadge variant="status" dot>
              {getArticleStatusLabel(article.status)}
            </SelenBadge>
            {article.featured && <SelenBadge variant="warn">A la une</SelenBadge>}
          </div>

          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 34,
              lineHeight: 1.15,
              margin: "0 0 12px",
              color: "var(--selen-text)",
            }}
          >
            {article.title}
          </h2>

          {article.excerpt && (
            <p
              style={{
                color: "var(--selen-text2)",
                lineHeight: 1.7,
                fontSize: 16,
                marginBottom: 18,
              }}
            >
              {article.excerpt}
            </p>
          )}

          <div style={{ ...s.muted, marginBottom: 22 }}>
            Publication : {formatArticleDate(article.published_at)} ·
            Programmation : {formatArticleDate(article.scheduled_at)}
            {article.reading_time_minutes
              ? ` · ${article.reading_time_minutes} min`
              : ""}
          </div>

          {article.cover_url && (
            <Image
              src={article.cover_url}
              alt={article.cover_alt ?? ""}
              width={1200}
              height={640}
              unoptimized
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                maxHeight: 360,
                objectFit: "cover",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--selen-border)",
                marginBottom: 24,
                background: "var(--selen-bg3)",
              }}
            />
          )}

          <div
            style={{
              whiteSpace: "pre-wrap",
              color: "var(--selen-text)",
              fontSize: 15,
              lineHeight: 1.8,
            }}
          >
            {article.content || "Aucun contenu pour le moment."}
          </div>
        </article>
      ) : null}
    </main>
  );
}
