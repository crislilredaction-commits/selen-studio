import ArticleFormPage from "@/components/articles/ArticleFormPage";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArticleFormPage articleId={id} />;
}
